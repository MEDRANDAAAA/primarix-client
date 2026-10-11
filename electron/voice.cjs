'use strict';

const { io } = require('socket.io-client');

const EVENTS = {
  rooms: 'voice:rooms',
  create: 'voice:create',
  join: 'voice:join',
  leave: 'voice:leave',
  chat: 'voice:chat',
  state: 'voice:state',
  signal: 'voice:signal',
};

function validateServerUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw Error('Escribe la dirección del servidor de voz.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !loopback))
    throw Error('El servidor remoto debe usar HTTPS; HTTP solo se permite en localhost.');
  if (url.username || url.password || url.search || url.hash)
    throw Error('La dirección no puede incluir credenciales, parámetros ni fragmentos.');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

class VoiceGateway {
  constructor(emit, defaultUrl = '') {
    this.emit = emit;
    this.defaultUrl = defaultUrl;
    this.socket = null;
    this.nickname = null;
    this.serverUrl = null;
  }

  connected() {
    return Boolean(this.socket?.connected);
  }

  async connect(serverUrl, nickname) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(String(nickname || '')))
      throw Error('Selecciona un nick válido antes de conectar al chat de voz.');
    const url = validateServerUrl(serverUrl || this.defaultUrl);
    if (this.connected() && this.serverUrl === url && this.nickname === nickname)
      return { connected: true, nickname, serverUrl: url };
    this.close();
    const socket = io(url, {
      autoConnect: false,
      auth: { nickname },
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10_000,
      transports: ['websocket'],
    });
    this.socket = socket;
    this.nickname = nickname;
    this.serverUrl = url;
    socket.on('voice:event', (event) => {
      this.emit(event);
      if (event?.type === 'idle' && this.socket === socket) this.close();
    });
    socket.on('disconnect', (reason) => this.emit({ type: 'disconnected', reason }));
    socket.on('connect', () => this.emit({ type: 'transport', status: 'connected' }));
    socket.on('connect_error', (error) => {
      this.emit({ type: 'transport', status: 'error', error: error.message });
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(Error('El servidor de voz tardó demasiado en responder.')), 12_000);
      const finish = (error) => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onConnect = () => finish();
      const onError = (error) => finish(Error(`No se pudo conectar al servidor de voz: ${error.message}`));
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
      socket.connect();
    }).catch((error) => {
      if (this.socket === socket) this.close();
      throw error;
    });
    return { connected: true, nickname, serverUrl: url };
  }

  async request(event, payload = {}) {
    const socket = this.socket;
    if (!socket?.connected) throw Error('Conéctate a un servidor de voz primero.');
    return new Promise((resolve, reject) => {
      socket.timeout(10_000).emit(event, payload, (error, result) => {
        if (error) return reject(Error('El servidor de voz no respondió.'));
        if (!result?.ok) return reject(Error(result?.error || 'El servidor rechazó la solicitud.'));
        resolve(result.value);
      });
    });
  }

  listRooms() {
    return this.request(EVENTS.rooms);
  }

  createRoom(room) {
    return this.request(EVENTS.create, room);
  }

  joinRoom(roomId, password) {
    return this.request(EVENTS.join, { roomId, password });
  }

  leaveRoom() {
    return this.request(EVENTS.leave);
  }

  sendChat(channel, body) {
    return this.request(EVENTS.chat, { channel, body });
  }

  setState(muted, deafened) {
    return this.request(EVENTS.state, { muted, deafened });
  }

  signal(to, kind, payload) {
    return this.request(EVENTS.signal, { to, kind, payload });
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.nickname = null;
    this.serverUrl = null;
    if (socket) socket.disconnect();
  }
}

module.exports = { VoiceGateway, validateServerUrl };
