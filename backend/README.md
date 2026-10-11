# Primarix Voice Server

This is a separate Node.js service; it is not bundled into the Electron installer and must be running at an address the launcher can reach. It keeps rooms and chat in memory, so restarting the service clears them.

## Deploy free on Render

The repository includes a root-level `render.yaml` blueprint for this service. Push the project to a GitHub repository, create a new Blueprint on Render, and select that repository. Render reads the blueprint and creates the `primarix-voice` web service on its Free plan. After the first deployment, copy the service's `https://...onrender.com` URL into the launcher's Voice Chat server field.

The Free plan is suitable for testing: Render can spin the service down after 15 minutes without inbound traffic, and the first connection after that can take about a minute while it starts. The service has no persistent room storage, so rooms and messages are not retained during a restart or spin-down. The service can also use STUN by default; restrictive networks may need a separately configured TURN server.

## Run locally

From this directory, install dependencies once and start the server:

```sh
npm install
npm start
```

The local launcher can connect to `http://localhost:3080`. For a server reachable outside the local machine, configure a reverse proxy with HTTPS and point the launcher's Voice Chat page at that HTTPS URL. The launcher also accepts `PRIMARIX_VOICE_URL` as its initial server address.

When no room has members, the server waits 60 seconds, notifies clients and disconnects the idle lobby sockets. Clients reconnect when someone refreshes the room list or creates/joins a room. Active rooms keep the signaling WebSocket alive, so Render's free-plan inactivity timer does not start during a call. When the final room empties, Render's own free-plan spin-down window still applies (up to 15 minutes without inbound traffic); the service cannot force Render to shut down instantly.

You can tune the lobby grace period with the `VOICE_IDLE_TIMEOUT_MS` environment variable (milliseconds; defaults to `60000`). For WebRTC audio, STUN is enabled by default. Networks behind restrictive NATs may require TURN; configure it on the service using `VOICE_ICE_SERVERS` as a JSON array of ICE server objects, for example:

```sh
VOICE_ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"user","credential":"secret"}]' npm start
```

## Important limitations

The service does not authenticate Minecraft or Microsoft accounts. A nickname is only a label supplied by the client and can be impersonated. Do not treat it as proof of identity or expose the service publicly without adding authentication, abuse controls, and operational monitoring. Rooms are volatile and are removed when empty.

Run the backend tests from this directory with `npm test`, or run the complete launcher test suite from the project root with `npm test`.
