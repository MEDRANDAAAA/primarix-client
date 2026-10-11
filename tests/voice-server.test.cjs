'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { io } = require('socket.io-client');
const { createVoiceServer } = require('../backend/server.js');

let voice;
let url;
const clients = new Set();

before(async () => {
  voice = createVoiceServer({ port: 0, host: '127.0.0.1' });
  const address = await voice.listen();
  url = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  for (const client of clients) client.disconnect();
  await voice.close();
});

function connect(nickname, target = url) {
  return new Promise((resolve, reject) => {
    const client = io(target, { autoConnect: false, auth: { nickname }, transports: ['websocket'] });
    clients.add(client);
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
    client.connect();
  });
}

function request(client, event, input = {}) {
  return new Promise((resolve, reject) => {
    client.timeout(3000).emit(event, input, (timeout, result) => {
      if (timeout) return reject(timeout);
      if (!result?.ok) return reject(Error(result?.error || 'Request rejected.'));
      resolve(result.value);
    });
  });
}

function nextEvent(client, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('voice:event', listener);
      reject(Error('Timed out waiting for voice event.'));
    }, 3000);
    const listener = (event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      client.off('voice:event', listener);
      resolve(event);
    };
    client.on('voice:event', listener);
  });
}

test('public/private rooms, voice state, chat, signaling, and capacity', async () => {
  const alice = await connect('Alice_1');
  const bob = await connect('Bob_22');
  const carol = await connect('Carol3');

  const publicResult = await request(alice, 'voice:create', {
    name: 'Partida pública',
    public: true,
    maxMembers: 2,
  });
  const publicRoom = publicResult.room;
  assert.equal(publicRoom.members.length, 1);
  assert.equal(publicRoom.members[0].nickname, 'Alice_1');
  assert.deepEqual(await request(carol, 'voice:rooms'), [
    { id: publicRoom.id, name: 'Partida pública', members: 1, maxMembers: 2 },
  ]);

  const bobInRoom = nextEvent(alice, (event) => event.type === 'room' && event.room.id === publicRoom.id);
  const joined = await request(bob, 'voice:join', { roomId: publicRoom.id });
  assert.equal(joined.room.members.length, 2);
  await bobInRoom;
  await assert.rejects(request(carol, 'voice:join', { roomId: publicRoom.id }), /sala está llena/);

  const stateUpdate = nextEvent(alice, (event) => event.type === 'room' && event.room.members.length === 2);
  await request(bob, 'voice:state', { muted: true, deafened: false });
  assert.equal((await stateUpdate).room.members.find((member) => member.id === joined.selfId).muted, true);

  const generalMessage = nextEvent(carol, (event) => event.type === 'chat' && event.channel === 'general');
  await request(alice, 'voice:chat', { channel: 'general', body: 'Hola a todos' });
  assert.equal((await generalMessage).body, 'Hola a todos');

  const roomMessage = nextEvent(bob, (event) => event.type === 'chat' && event.channel === 'room');
  await request(alice, 'voice:chat', { channel: 'room', body: 'Nos vemos en la sala' });
  assert.equal((await roomMessage).body, 'Nos vemos en la sala');

  const incomingSignal = nextEvent(bob, (event) => event.type === 'signal' && event.kind === 'offer');
  await request(alice, 'voice:signal', {
    to: joined.selfId,
    kind: 'offer',
    payload: { sdp: { type: 'offer', sdp: 'test-sdp' } },
  });
  assert.equal((await incomingSignal).from, publicResult.selfId);

  const privateResult = await request(alice, 'voice:create', {
    name: 'Sala privada',
    public: false,
    password: 'clave-segura',
    maxMembers: 5,
  });
  const listedRooms = await request(carol, 'voice:rooms');
  assert.equal(
    listedRooms.some((room) => room.name === 'Sala privada'),
    false,
  );
  assert.equal(listedRooms.find((room) => room.id === publicRoom.id).members, 1);
  await assert.rejects(
    request(carol, 'voice:join', { roomId: privateResult.room.id, password: 'incorrecta' }),
    /contraseña.*incorrecta/,
  );
  const privateJoin = await request(carol, 'voice:join', {
    roomId: privateResult.room.id,
    password: 'clave-segura',
  });
  assert.equal(privateJoin.room.members.length, 2);
});

test('rejects invalid nicknames and signal types', async () => {
  await assert.rejects(connect('Invalid nickname!'), /nick debe tener/);
  const alice = await connect('ValidNick');
  const bob = await connect('ValidPeer');
  const room = await request(alice, 'voice:create', { name: 'Signals', public: true });
  const joined = await request(bob, 'voice:join', { roomId: room.room.id });
  await assert.rejects(
    request(alice, 'voice:signal', { to: joined.selfId, kind: 'candidate', payload: {} }),
    /Tipo de señal.*inválido/,
  );
  assert.ok(room.room.id);
});

test('keeps the server active while rooms are occupied and disconnects idle lobby clients', async () => {
  const idleVoice = createVoiceServer({ port: 0, host: '127.0.0.1', idleTimeoutMs: 100 });
  const address = await idleVoice.listen();
  const idleUrl = `http://127.0.0.1:${address.port}`;
  const alice = await connect('IdleAlice', idleUrl);
  const lobby = await connect('IdleLobby', idleUrl);
  try {
    const room = await request(alice, 'voice:create', { name: 'Keep alive', public: true });
    const lobbyIdleEvent = nextEvent(lobby, (event) => event.type === 'idle');
    const lobbyDisconnected = new Promise((resolve) => lobby.once('disconnect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(alice.connected, true, 'an occupied room must cancel the idle shutdown');

    const idleEvent = nextEvent(alice, (event) => event.type === 'idle');
    const disconnected = new Promise((resolve) => alice.once('disconnect', resolve));
    await request(alice, 'voice:leave');
    assert.equal((await idleEvent).type, 'idle');
    assert.equal(await disconnected, 'io server disconnect');
    assert.equal((await lobbyIdleEvent).type, 'idle');
    assert.equal(await lobbyDisconnected, 'io server disconnect');
    assert.equal(room.room.members.length, 1);
  } finally {
    alice.disconnect();
    lobby.disconnect();
    await idleVoice.close();
  }
});
