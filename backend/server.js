'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const MAX_ROOM_MEMBERS = 15;
const MAX_MESSAGE_LENGTH = 500;
const MAX_SIGNAL_BYTES = 128 * 1024;
const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
const ROOM_ID = /^[0-9a-f-]{36}$/i;
const SIGNAL_KINDS = new Set(['offer', 'answer', 'ice']);

function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    public: room.public,
    maxMembers: room.maxMembers,
    members: [...room.members.values()].map(({ id, nickname, muted, deafened }) => ({
      id,
      nickname,
      muted,
      deafened,
    })),
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    members: room.members.size,
    maxMembers: room.maxMembers,
  };
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function createVoiceServer({
  port = Number(process.env.PORT) || 3080,
  host = process.env.HOST || '0.0.0.0',
  idleTimeoutMs = Number(process.env.VOICE_IDLE_TIMEOUT_MS) || 60_000,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_request, response) => response.json({ ok: true }));

  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: MAX_SIGNAL_BYTES,
    cors: { origin: process.env.VOICE_CORS_ORIGIN || '*' },
  });
  const rooms = new Map();
  const buckets = new WeakMap();
  let idleTimer = null;
  const iceServers = (() => {
    try {
      const configured = JSON.parse(process.env.VOICE_ICE_SERVERS || '[]');
      if (Array.isArray(configured) && configured.length) return configured.slice(0, 8);
    } catch {
      console.error('[voice] VOICE_ICE_SERVERS debe ser JSON válido; se usará el STUN público.');
    }
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  })();

  function publicRooms() {
    return [...rooms.values()]
      .filter((room) => room.public)
      .map(publicRoom)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function listRooms() {
    return publicRooms();
  }

  function hasOccupiedRooms() {
    return [...rooms.values()].some((room) => room.members.size > 0);
  }

  function scheduleIdleDisconnect() {
    if (idleTimer || hasOccupiedRooms() || !io.engine?.clientsCount) return;
    idleTimer = setTimeout(
      () => {
        idleTimer = null;
        if (hasOccupiedRooms() || !io.engine?.clientsCount) return;
        io.emit('voice:event', { type: 'idle' });
        io.disconnectSockets(true);
      },
      Math.max(0, idleTimeoutMs),
    );
    idleTimer.unref?.();
  }

  function cancelIdleDisconnect() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function emitRoom(room) {
    io.to(room.id).emit('voice:event', { type: 'room', room: roomSnapshot(room) });
    io.emit('voice:event', { type: 'rooms', rooms: publicRooms() });
  }

  function rateLimit(socket, action, limit, interval) {
    const now = Date.now();
    let actions = buckets.get(socket);
    if (!actions) {
      actions = new Map();
      buckets.set(socket, actions);
    }
    const current = actions.get(action);
    if (!current || now - current.startedAt >= interval) {
      actions.set(action, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= limit) throw Error('Enviaste demasiadas solicitudes. Espera un momento.');
    current.count++;
  }

  function memberRoom(socket) {
    const roomId = socket.data.roomId;
    const room = roomId && rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) throw Error('Primero debes unirte a una sala.');
    return room;
  }

  function deliver(socket, type, payload) {
    socket.emit('voice:event', { type, ...payload });
  }

  function acknowledge(socket, event, handler) {
    socket.on(event, async (input, reply) => {
      const ack = typeof reply === 'function' ? reply : () => {};
      try {
        rateLimit(socket, event, event === 'voice:signal' ? 120 : 30, 10_000);
        ack({ ok: true, value: await handler(input || {}) });
      } catch (error) {
        ack({ ok: false, error: error.message || 'No se pudo completar la solicitud.' });
      }
    });
  }

  function leaveRoom(socket, notify = true) {
    const room = socket.data.roomId && rooms.get(socket.data.roomId);
    if (!room || !room.members.has(socket.id)) {
      socket.data.roomId = null;
      return null;
    }
    room.members.delete(socket.id);
    socket.leave(room.id);
    socket.data.roomId = null;
    if (room.members.size === 0) rooms.delete(room.id);
    else if (notify) emitRoom(room);
    io.emit('voice:event', { type: 'rooms', rooms: publicRooms() });
    scheduleIdleDisconnect();
    return room.id;
  }

  io.use((socket, next) => {
    const nickname = String(socket.handshake.auth?.nickname || '').trim();
    if (!NICKNAME.test(nickname)) return next(Error('El nick debe tener entre 3 y 16 letras, números o _.'));
    socket.data.nickname = nickname;
    socket.data.roomId = null;
    next();
  });

  io.on('connection', (socket) => {
    scheduleIdleDisconnect();
    deliver(socket, 'connected', { id: socket.id, nickname: socket.data.nickname, iceServers });
    deliver(socket, 'rooms', { rooms: publicRooms() });

    acknowledge(socket, 'voice:rooms', () => listRooms());

    acknowledge(socket, 'voice:create', (input) => {
      const name = String(input.name || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name))
        throw Error('El nombre de sala debe tener entre 2 y 32 caracteres.');
      const isPublic = input.public !== false;
      const password = String(input.password || '');
      if (!isPublic && (password.length < 4 || password.length > 64))
        throw Error('La contraseña de una sala privada debe tener entre 4 y 64 caracteres.');
      const maxMembers = Math.max(
        2,
        Math.min(MAX_ROOM_MEMBERS, Math.floor(Number(input.maxMembers) || MAX_ROOM_MEMBERS)),
      );
      const salt = crypto.randomBytes(16);
      const room = {
        id: crypto.randomUUID(),
        name,
        public: isPublic,
        maxMembers,
        members: new Map(),
        salt,
        password: isPublic ? null : passwordHash(password, salt),
      };
      leaveRoom(socket);
      rooms.set(room.id, room);
      join(socket, room);
      io.emit('voice:event', { type: 'rooms', rooms: publicRooms() });
      return { room: roomSnapshot(room), selfId: socket.id, iceServers };
    });

    acknowledge(socket, 'voice:join', (input) => {
      const id = String(input.roomId || '');
      if (!ROOM_ID.test(id)) throw Error('La sala no existe.');
      const room = rooms.get(id);
      if (!room) throw Error('La sala ya no está disponible.');
      const password = String(input.password || '');
      if (!room.public) {
        const supplied = passwordHash(password, room.salt);
        if (supplied.length !== room.password.length || !crypto.timingSafeEqual(supplied, room.password))
          throw Error('La contraseña de la sala es incorrecta.');
      }
      if (!room.members.has(socket.id) && room.members.size >= room.maxMembers) throw Error('La sala está llena.');
      if (
        [...room.members.values()].some(
          (member) => member.id !== socket.id && member.nickname.toLowerCase() === socket.data.nickname.toLowerCase(),
        )
      )
        throw Error('Ya hay alguien con ese nick en la sala.');
      leaveRoom(socket);
      join(socket, room);
      return { room: roomSnapshot(room), selfId: socket.id, iceServers };
    });

    function join(client, room) {
      cancelIdleDisconnect();
      client.data.roomId = room.id;
      client.join(room.id);
      room.members.set(client.id, {
        id: client.id,
        nickname: client.data.nickname,
        muted: false,
        deafened: false,
      });
      emitRoom(room);
    }

    acknowledge(socket, 'voice:leave', () => ({ roomId: leaveRoom(socket) }));

    acknowledge(socket, 'voice:chat', (input) => {
      const channel = input.channel === 'room' ? 'room' : input.channel === 'general' ? 'general' : '';
      const body = String(input.body || '').trim();
      if (!channel) throw Error('Canal de chat inválido.');
      if (!body || body.length > MAX_MESSAGE_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body))
        throw Error(`El mensaje debe tener entre 1 y ${MAX_MESSAGE_LENGTH} caracteres.`);
      rateLimit(socket, `chat:${channel}`, 8, 10_000);
      const room = channel === 'room' ? memberRoom(socket) : null;
      const message = {
        type: 'chat',
        channel,
        roomId: room?.id || null,
        id: crypto.randomUUID(),
        senderId: socket.id,
        nickname: socket.data.nickname,
        body,
        timestamp: Date.now(),
      };
      if (room) io.to(room.id).emit('voice:event', message);
      else io.emit('voice:event', message);
      return { sent: true };
    });

    acknowledge(socket, 'voice:state', (input) => {
      const room = memberRoom(socket);
      const member = room.members.get(socket.id);
      member.muted = input.muted === true;
      member.deafened = input.deafened === true;
      emitRoom(room);
      return { muted: member.muted, deafened: member.deafened };
    });

    acknowledge(socket, 'voice:signal', (input) => {
      const room = memberRoom(socket);
      const targetId = String(input.to || '');
      const kind = String(input.kind || '');
      if (!room.members.has(targetId) || targetId === socket.id) throw Error('Ese miembro ya no está en la sala.');
      if (!SIGNAL_KINDS.has(kind)) throw Error('Tipo de señal de voz inválido.');
      let bytes;
      try {
        bytes = Buffer.byteLength(JSON.stringify(input.payload ?? {}), 'utf8');
      } catch {
        throw Error('La señal de voz no es válida.');
      }
      if (bytes > MAX_SIGNAL_BYTES) throw Error('La señal de voz supera el tamaño permitido.');
      io.to(targetId).emit('voice:event', {
        type: 'signal',
        roomId: room.id,
        from: socket.id,
        kind,
        payload: input.payload ?? {},
      });
      return { sent: true };
    });

    socket.on('disconnect', () => leaveRoom(socket));
  });

  return {
    app,
    io,
    rooms,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearTimeout(idleTimer);
        io.close(() => resolve());
      }),
  };
}

if (require.main === module) {
  const voice = createVoiceServer();
  voice.listen().then(
    ({ port, address }) => console.log(`[voice] escuchando en http://${address}:${port}`),
    (error) => {
      console.error('[voice] no se pudo iniciar:', error);
      process.exitCode = 1;
    },
  );
}

module.exports = { createVoiceServer, MAX_ROOM_MEMBERS };
