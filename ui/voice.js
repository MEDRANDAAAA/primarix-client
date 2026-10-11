const MAX_PEERS = 14;
const MAX_MESSAGES = 80;

export function createVoiceRooms({ api, toast, onChange }) {
  const state = {
    status: 'disconnected',
    serverUrl: '',
    nickname: '',
    selfId: '',
    rooms: [],
    room: null,
    members: [],
    messages: { general: [], room: [] },
    channel: 'general',
    muted: true,
    deafened: false,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };
  const peers = new Map();
  const audioRoot = document.createElement('div');
  audioRoot.hidden = true;
  document.body.append(audioRoot);
  let microphone = null;
  let connectedServer = false;
  let removing = false;

  function changed() {
    onChange(snapshot());
  }

  function snapshot() {
    return {
      ...state,
      rooms: state.rooms.slice(),
      members: state.members.slice(),
      messages: {
        general: state.messages.general.slice(),
        room: state.messages.room.slice(),
      },
    };
  }

  function notifyState() {
    return api.voice.setState(state.muted, state.deafened).catch((error) => toast(error.message));
  }

  function signal(to, kind, payload) {
    return api.voice.signal(to, kind, payload).catch((error) => {
      if (state.room) toast(error.message);
    });
  }

  function removePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    peer.pc.close();
    for (const element of peer.audio) element.remove();
  }

  function endMedia() {
    removing = true;
    for (const id of peers.keys()) removePeer(id);
    audioRoot.replaceChildren();
    for (const track of microphone?.getTracks() || []) track.stop();
    microphone = null;
    removing = false;
  }

  async function microphoneAccess() {
    if (!navigator.mediaDevices?.getUserMedia) throw Error('Este entorno no ofrece acceso al micrófono.');
    if (!(await api.call.microphone()))
      throw Error('Permite el uso del micrófono para Primarix en la configuración del sistema.');
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw Error('No se pudo acceder al micrófono. Revisa el permiso de Primarix en Windows.');
    }
  }

  function enqueuePeer(peer, operation) {
    peer.queue = peer.queue.then(operation).catch((error) => {
      if (state.room && peers.get(peer.id) === peer) toast(error.message);
    });
  }

  async function ensurePeer(member) {
    if (!state.selfId || !member?.id || member.id === state.selfId || peers.has(member.id)) return;
    if (peers.size >= MAX_PEERS) return;
    const pc = new RTCPeerConnection({ iceServers: state.iceServers });
    const peer = {
      id: member.id,
      name: member.nickname,
      pc,
      pending: [],
      audio: [],
      offering: false,
      polite: state.selfId.localeCompare(member.id) > 0,
      initialOfferer: state.selfId.localeCompare(member.id) < 0,
      negotiated: false,
      ignoreOffer: false,
      queue: Promise.resolve(),
    };
    peers.set(member.id, peer);
    for (const track of microphone?.getAudioTracks() || []) pc.addTrack(track, microphone);
    pc.onnegotiationneeded = () =>
      enqueuePeer(peer, async () => {
        if (!peer.negotiated && !peer.initialOfferer) return;
        if (pc.signalingState !== 'stable') return;
        peer.offering = true;
        try {
          await pc.setLocalDescription(await pc.createOffer());
          await signal(member.id, 'offer', { sdp: pc.localDescription.toJSON() });
        } finally {
          peer.offering = false;
        }
      });
    pc.onicecandidate = (event) => {
      if (event.candidate) signal(member.id, 'ice', { candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.controls = false;
      audio.muted = state.deafened;
      audio.srcObject = new MediaStream([event.track]);
      audio.dataset.voicePeer = member.id;
      peer.audio.push(audio);
      audioRoot.append(audio);
      audio.play().catch(() => {});
      event.track.addEventListener('ended', () => audio.remove(), { once: true });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && !removing) {
        toast(`No se pudo establecer audio con ${member.nickname}. Puede hacer falta configurar un servidor TURN.`);
        removePeer(member.id);
      }
    };
  }

  function reconcilePeers() {
    if (!state.room || state.status !== 'room') return;
    const active = new Set(state.members.map((member) => member.id));
    for (const id of peers.keys()) if (!active.has(id)) removePeer(id);
    for (const member of state.members) ensurePeer(member).catch((error) => toast(error.message));
  }

  async function flushCandidates(peer) {
    for (const candidate of peer.pending.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        // A stale candidate can arrive while a peer is leaving.
      }
    }
  }

  function receiveSignal(event) {
    if (!state.room || event.roomId !== state.room.id || event.from === state.selfId) return;
    let peer = peers.get(event.from);
    if (!peer) {
      const member = state.members.find((item) => item.id === event.from);
      if (!member) return;
      ensurePeer(member).catch((error) => toast(error.message));
      peer = peers.get(event.from);
      if (!peer) return;
    }
    enqueuePeer(peer, async () => {
      if (event.kind === 'ice') {
        if (peer.pc.remoteDescription) {
          try {
            await peer.pc.addIceCandidate(event.payload.candidate);
          } catch {
            if (!peer.ignoreOffer) throw Error('No se pudo aplicar un candidato de conexión ICE.');
          }
        } else peer.pending.push(event.payload.candidate);
        return;
      }
      if (event.kind === 'offer') {
        const collision = peer.offering || peer.pc.signalingState !== 'stable';
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        if (collision && peer.pc.signalingState !== 'stable') await peer.pc.setLocalDescription({ type: 'rollback' });
        await peer.pc.setRemoteDescription(event.payload.sdp);
        await flushCandidates(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await signal(event.from, 'answer', { sdp: peer.pc.localDescription.toJSON() });
        peer.negotiated = true;
      } else if (event.kind === 'answer' && peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(event.payload.sdp);
        await flushCandidates(peer);
        peer.negotiated = true;
      }
    });
  }

  function addMessage(message) {
    const channel = message.channel === 'room' ? 'room' : 'general';
    if (channel === 'room' && message.roomId !== state.room?.id) return;
    const messages = state.messages[channel];
    if (messages.some((item) => item.id === message.id)) return;
    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
    changed();
  }

  function eventReceived(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'connected') {
      if (state.room && state.selfId && state.selfId !== event.id) {
        endMedia();
        state.room = null;
        state.members = [];
      }
      connectedServer = true;
      state.status = 'lobby';
      state.selfId = event.id;
      state.nickname = event.nickname;
      if (Array.isArray(event.iceServers) && event.iceServers.length) state.iceServers = event.iceServers;
      api.voice
        .rooms()
        .then((rooms) => {
          state.rooms = rooms;
          changed();
        })
        .catch((error) => toast(error.message));
      changed();
    } else if (event.type === 'transport' && event.status === 'error' && connectedServer) {
      toast(`Conexión de voz interrumpida: ${event.error}`);
    } else if (event.type === 'disconnected') {
      connectedServer = false;
      endMedia();
      state.status = 'disconnected';
      state.room = null;
      state.members = [];
      state.selfId = '';
      changed();
    } else if (event.type === 'idle') {
      connectedServer = false;
      endMedia();
      state.status = 'disconnected';
      state.room = null;
      state.members = [];
      state.selfId = '';
      toast('El servidor cerró el lobby porque no hay salas activas. Se reconectará al crear o entrar a una sala.');
      changed();
    } else if (event.type === 'rooms') {
      state.rooms = Array.isArray(event.rooms) ? event.rooms : [];
      changed();
    } else if (event.type === 'room' && event.room?.id === state.room?.id) {
      state.room = event.room;
      state.members = event.room.members || [];
      const self = state.members.find((member) => member.id === state.selfId);
      if (self) {
        state.muted = self.muted;
        state.deafened = self.deafened;
      }
      reconcilePeers();
      changed();
    } else if (event.type === 'chat') addMessage(event);
    else if (event.type === 'signal') receiveSignal(event);
  }

  const unsubscribe = api.voice.onEvent(eventReceived);

  async function connect(serverUrl) {
    state.status = 'connecting';
    state.serverUrl = serverUrl.trim();
    changed();
    try {
      const result = await api.voice.connect(state.serverUrl);
      state.serverUrl = result.serverUrl;
      connectedServer = true;
      state.status = 'lobby';
      changed();
      state.rooms = await api.voice.rooms();
      changed();
      return result;
    } catch (error) {
      state.status = 'disconnected';
      connectedServer = false;
      changed();
      throw error;
    }
  }

  async function startRoom(result) {
    state.room = result.room;
    state.members = result.room.members || [];
    state.selfId = result.selfId;
    state.iceServers = result.iceServers?.length ? result.iceServers : state.iceServers;
    state.status = 'room';
    state.muted = false;
    state.deafened = false;
    try {
      microphone = await microphoneAccess();
    } catch (error) {
      state.muted = true;
      toast(error.message + ' Puedes quedarte en la sala y escuchar.');
    }
    reconcilePeers();
    await notifyState();
    changed();
  }

  async function ensureConnected() {
    if (connectedServer) return;
    if (!state.serverUrl) throw Error('Escribe la dirección del servidor de voz.');
    await connect(state.serverUrl);
  }

  async function createRoom(input) {
    await ensureConnected();
    const result = await api.voice.createRoom(input);
    await startRoom(result);
    return result;
  }

  async function joinRoom(roomId, password = '') {
    await ensureConnected();
    const result = await api.voice.joinRoom(roomId, password);
    await startRoom(result);
    return result;
  }

  async function leaveRoom() {
    if (state.room) await api.voice.leaveRoom();
    endMedia();
    state.room = null;
    state.members = [];
    state.status = connectedServer ? 'lobby' : 'disconnected';
    state.muted = true;
    state.deafened = false;
    changed();
  }

  async function disconnect() {
    try {
      if (state.room) await api.voice.leaveRoom();
    } finally {
      endMedia();
      await api.voice.disconnect();
      connectedServer = false;
      state.status = 'disconnected';
      state.room = null;
      state.members = [];
      state.selfId = '';
      state.muted = true;
      state.deafened = false;
      changed();
    }
  }

  async function sendChat(channel, body) {
    const value = body.trim();
    if (!value) return;
    await api.voice.sendChat(channel, value);
  }

  async function toggleMute() {
    if (!state.room) return;
    if (!microphone && state.muted) {
      microphone = await microphoneAccess();
      state.muted = false;
      reconcilePeers();
    } else {
      state.muted = !state.muted;
      for (const track of microphone?.getAudioTracks() || []) track.enabled = !state.muted;
    }
    await notifyState();
    changed();
  }

  async function toggleDeafen() {
    if (!state.room) return;
    state.deafened = !state.deafened;
    for (const audio of audioRoot.querySelectorAll('audio')) audio.muted = state.deafened;
    await notifyState();
    changed();
  }

  function setChannel(channel) {
    if (channel === 'general' || channel === 'room') {
      state.channel = channel;
      changed();
    }
  }

  window.addEventListener('beforeunload', () => {
    endMedia();
    unsubscribe();
    api.voice.disconnect().catch(() => {});
  });

  return {
    snapshot,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendChat,
    toggleMute,
    toggleDeafen,
    setChannel,
    refresh: async () => {
      await ensureConnected();
      state.rooms = await api.voice.rooms();
      changed();
    },
  };
}
