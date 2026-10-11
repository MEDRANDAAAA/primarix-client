'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createVoiceServer } = require('../backend/server.js');

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const server = createVoiceServer({ port: 0, host: '127.0.0.1', idleTimeoutMs: 200 });
  const address = await server.listen();
  let window;
  try {
    window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true },
    });
    await window.loadFile(path.join(__dirname, '../tests/voice/harness.html'));
    const evaluate = (script) => window.webContents.executeJavaScript(script);
    await evaluate(`
      window.voiceTest.peerConnections = [];
      const NativePeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeerConnection {
        constructor(...args) {
          super(...args);
          window.voiceTest.peerConnections.push(this);
        }
      };
      true;
    `);
    await evaluate('window.voiceTest.create("VoiceAlice")');
    await evaluate('window.voiceTest.create("VoiceBob")');
    const url = `http://127.0.0.1:${address.port}`;
    await evaluate(
      `Promise.all(window.voiceTest.controllers.map((controller) => controller.connect(${JSON.stringify(url)})))`,
    );
    const created = await evaluate(
      `window.voiceTest.controllers[0].createRoom({name:"Audio integration",public:true,maxMembers:15})`,
    );
    await evaluate(`window.voiceTest.controllers[1].joinRoom(${JSON.stringify(created.room.id)})`);

    const deadline = Date.now() + 20_000;
    let receivedAudio = 0;
    while (Date.now() < deadline) {
      receivedAudio = await evaluate('document.querySelectorAll("audio[data-voice-peer]").length');
      if (receivedAudio >= 2) break;
      await sleep(150);
    }
    if (receivedAudio < 2) {
      const diagnostics = await evaluate(`JSON.stringify({
        notices: window.voiceTest.notices,
        states: window.voiceTest.controllers.map((client) => ({
          status: client.snapshot().status,
          muted: client.snapshot().muted,
          members: client.snapshot().members.length,
        })),
        peers: window.voiceTest.peerConnections.map((peer) => ({
          signaling: peer.signalingState,
          connection: peer.connectionState,
          ice: peer.iceConnectionState,
          senders: peer.getSenders().map((sender) => sender.track?.kind || null),
          receivers: peer.getReceivers().map((receiver) => receiver.track?.kind || null),
        })),
        audio: document.querySelectorAll("audio[data-voice-peer]").length,
      }, null, 2)`);
      console.error(diagnostics);
    }
    assert.equal(receivedAudio, 2, 'both clients should receive the other peer audio track');

    await evaluate('window.voiceTest.controllers[0].toggleMute()');
    await evaluate('window.voiceTest.controllers[1].toggleDeafen()');
    const state = await evaluate('window.voiceTest.controllers.map((client) => client.snapshot())');
    assert.equal(state[0].muted, true);
    assert.equal(state[1].deafened, true);

    await evaluate('window.voiceTest.controllers[0].sendChat("room","P2P voice verified")');
    const deadlineForChat = Date.now() + 3000;
    let chatReceived = false;
    while (Date.now() < deadlineForChat) {
      chatReceived = await evaluate(
        'window.voiceTest.controllers[1].snapshot().messages.room.some((message) => message.body === "P2P voice verified")',
      );
      if (chatReceived) break;
      await sleep(50);
    }
    assert.equal(chatReceived, true, 'room chat should reach the other peer');
    await evaluate('Promise.all(window.voiceTest.controllers.map((client) => client.leaveRoom()))');
    const idleDeadline = Date.now() + 3000;
    let clientsDisconnected = false;
    while (Date.now() < idleDeadline) {
      clientsDisconnected = await evaluate(
        'window.voiceTest.controllers.every((client) => client.snapshot().status === "disconnected")',
      );
      if (clientsDisconnected) break;
      await sleep(50);
    }
    assert.equal(clientsDisconnected, true, 'the empty voice server should disconnect idle clients');
    const recreated = await evaluate(
      `window.voiceTest.controllers[0].createRoom({name:"Wake after idle",public:true,maxMembers:15})`,
    );
    assert.equal(recreated.room.name, 'Wake after idle', 'creating a room should reconnect to the sleeping service');
    console.log('Voice OK: two clients negotiated WebRTC audio, mic/deafen controls, and room chat.');
  } finally {
    window?.destroy();
    await server.close();
    app.quit();
  }
}

app
  .whenReady()
  .then(run)
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
