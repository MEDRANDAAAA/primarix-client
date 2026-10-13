const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  dialog,
  Notification,
  systemPreferences,
  Tray,
  Menu,
  screen,
} = require('electron');
const { unzipSync } = require('fflate');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Auth } = require('msmc');
const { Runtime, cloneGameProfile, parseResourcePacks, updateResourcePackOptions } = require('./runtime.cjs');
const { atomicWrite: atomic, readTail } = require('./files.cjs');
const { importResourcePack, listInstalledResourcePacks } = require('./resourcepacks.cjs');
const { assertForgeMod } = require('./mod-archive.cjs');
const { searchResourcePacks, getResourcePackDetails, downloadResourcePack } = require('./resourcepack-catalog.cjs');
const updater = require('./updater.cjs');
const { Community, cosmeticUrl, isCapeTexture } = require('./community.cjs');
const { DiscordPresence } = require('./discord.cjs');
const { VoiceGateway } = require('./voice.cjs');
const { syncGameAccent } = require('./game-theme.cjs');
const { DEFAULTS, validateSettings, offlineAccount } = require('./settings.cjs');
const {
  applyCommand: applyGameProfileCommand,
  instanceSettings: gameInstanceSettings,
  readInstanceProfile,
  snapshot: gameProfilesSnapshot,
  writeInstanceProfile,
} = require('./game-profiles.cjs');
const { isAllowedLauncherView } = require('./launcher-views.cjs');
app.setName('Primarix Client');
// Call audio must play when a friend joins while the launcher is in the background.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const root = process.env.ANTAGON_TEST_ROOT || path.join(app.getPath('appData'), 'Primarix Client');
app.setPath('userData', root);
function startupTrace(message) {
  if (!process.env.ANTAGON_TEST_ROOT) return;
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.appendFileSync(path.join(root, 'electron-startup-debug.log'), message + '\n');
  } catch {}
}
startupTrace('main loaded');
const ui = path.resolve(__dirname, '../ui/index.html');
const assets = path.resolve(__dirname, '../assets');
let win,
  tray,
  quitting = false,
  settings,
  account = null,
  accounts = [],
  sessionAccount = null,
  busy = false,
  runtime;
const gameInstances = new Map();
const voiceGateway = new VoiceGateway((event) => {
  if (win && !win.isDestroyed()) win.webContents.send('voice:event', event);
}, process.env.PRIMARIX_VOICE_URL || '');
const baseGameDir = path.join(root, 'minecraft');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });
}
let state = { phase: 'idle', message: 'Listo', percent: 0, activeInstances: 0 };
function loadSettings() {
  try {
    return validateSettings(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')));
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function saveSettings(next) {
  const validated = validateSettings(next);
  const profileSelectionChanged =
    settings && (validated.nickname !== settings.nickname || validated.mode !== settings.mode);
  const previousNickname = settings?.mode === 'microsoft' && account ? account.name : settings?.nickname;
  const nextNickname = validated.mode === 'microsoft' && account ? account.name : validated.nickname;
  if (previousNickname && nextNickname !== previousNickname) voiceGateway.close();
  if (settings && validated.accentColor !== settings.accentColor)
    for (const gameDir of gameDirectories()) syncGameAccent(gameDir, validated.accentColor);
  atomic(path.join(root, 'settings.json'), JSON.stringify(validated, null, 2));
  settings = validated;
  if (profileSelectionChanged && !gameInstances.get('main')?.runtime.child) writeInstanceProfile(baseGameDir, settings);
  discord.configure(settings);
  gameActivity();
  if (isGameRunning()) publishGameProfiles();
  return settings;
}
const modsDir = path.join(root, 'minecraft/mods');
const resourcepacksDir = path.join(root, 'minecraft/resourcepacks');
function publishGameProfiles(message = '', targetGameDir = null) {
  for (const gameDir of targetGameDir ? [targetGameDir] : gameDirectories())
    atomic(
      path.join(gameDir, 'antagon-accounts.txt'),
      gameProfilesSnapshot(
        gameInstanceSettings(settings, readInstanceProfile(gameDir)),
        message,
        accounts.map((saved) => saved.name),
      ),
    );
}
const clientModPath = path.join(assets, 'client-core.bin');
let clientModDigest;
function optifine() {
  try {
    return fs.readdirSync(modsDir).find((f) => /^optifine.*\.jar$/i.test(f)) || null;
  } catch {
    return null;
  }
}
function protectedMod(fileName) {
  return (
    /^antagon-hud-.*\.jar$/i.test(fileName) ||
    /^optifine.*\.jar$/i.test(fileName) ||
    /^client-core\.jar$/i.test(fileName)
  );
}
function isClientMod(filePath) {
  if (/^(?:antagon-hud-.*|client-core)\.jar(?:\.disabled)?$/i.test(path.basename(filePath))) return true;
  try {
    if (!clientModDigest)
      clientModDigest = crypto.createHash('sha256').update(fs.readFileSync(clientModPath)).digest('hex');
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') === clientModDigest;
  } catch {
    return false;
  }
}
function listMods() {
  fs.mkdirSync(modsDir, { recursive: true });
  return fs
    .readdirSync(modsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.jar(?:\.disabled)?$/i.test(entry.name) && !isClientMod(path.join(modsDir, entry.name)),
    )
    .map((entry) => {
      const disabled = entry.name.toLowerCase().endsWith('.jar.disabled');
      const jarName = disabled ? entry.name.slice(0, -'.disabled'.length) : entry.name;
      const core = /^antagon-hud-\d+\.\d+\.\d+\.jar$/i.test(jarName);
      const optifineMod = /^optifine.*\.jar$/i.test(jarName);
      return {
        fileName: entry.name,
        name: core ? 'Primarix Client' : optifineMod ? 'OptiFine' : jarName.replace(/\.jar$/i, ''),
        enabled: !disabled,
        protected: core || optifineMod,
        bytes: fs.statSync(path.join(modsDir, entry.name)).size,
      };
    })
    .sort((left, right) => Number(right.protected) - Number(left.protected) || left.name.localeCompare(right.name));
}
function toggleMod(fileName) {
  if (busy || isGameRunning()) throw Error('Cierra Minecraft antes de cambiar mods.');
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) throw Error('Nombre de mod no válido.');
  const disabled = fileName.toLowerCase().endsWith('.jar.disabled');
  const jarName = disabled ? fileName.slice(0, -'.disabled'.length) : fileName;
  if (!/\.jar$/i.test(jarName) || protectedMod(jarName) || isClientMod(path.join(modsDir, fileName)))
    throw Error('Este mod se administra desde Primarix y no se puede desactivar aquí.');
  const source = path.join(modsDir, fileName);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw Error('No se encontró el mod.');
  const targetName = disabled ? jarName : fileName + '.disabled';
  const target = path.join(modsDir, targetName);
  if (fs.existsSync(target)) throw Error('Ya existe un archivo con ese nombre.');
  fs.renameSync(source, target);
  return listMods();
}
async function installOptifine() {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Escolha o OptiFine 1.8.9',
    defaultPath: app.getPath('downloads'),
    properties: ['openFile'],
    filters: [{ name: 'OptiFine', extensions: ['jar'] }],
  });
  if (pick.canceled || !pick.filePaths[0]) return optifine();
  const file = pick.filePaths[0];
  const names = [];
  try {
    unzipSync(fs.readFileSync(file), {
      filter: (e) => {
        names.push(e.name);
        return false;
      },
    });
  } catch {
    throw Error('Ese archivo no es un .jar válido.');
  }
  if (!names.some((n) => n.startsWith('optifine/')) || !/1\.8\.9/.test(path.basename(file)))
    throw Error('Elige OptiFine para Minecraft 1.8.9 (OptiFine_1.8.9_HD_U_M5.jar).');
  fs.mkdirSync(modsDir, { recursive: true });
  for (const old of fs.readdirSync(modsDir)) if (/^optifine.*\.jar$/i.test(old)) fs.unlinkSync(path.join(modsDir, old));
  fs.copyFileSync(file, path.join(modsDir, path.basename(file)));
  return optifine();
}
function wallpaper() {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const f = path.join(root, 'wallpaper.' + ext);
    if (fs.existsSync(f))
      return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + fs.readFileSync(f).toString('base64');
  }
  return null;
}
function clearWallpaper() {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) fs.rmSync(path.join(root, 'wallpaper.' + ext), { force: true });
}
function emit(update) {
  for (const [id, instance] of gameInstances) if (!instance.runtime.child) gameInstances.delete(id);
  runtime = [...gameInstances.values()].reverse().find((instance) => instance.runtime.child)?.runtime || baseRuntime;
  const activeInstances = new Set([...gameInstances.values()].map((instance) => instance.gameDir)).size;
  const next = { ...update, activeInstances };
  if (update.phase === 'idle' && activeInstances) {
    next.phase = 'running';
    next.message = `${activeInstances} ${activeInstances === 1 ? 'instancia abierta' : 'instancias abiertas'}`;
  }
  state = { ...state, ...next };
  if (win && !win.isDestroyed()) win.webContents.send('game:state', state);
}
function isGameRunning() {
  return gameInstances.size > 0 || Boolean(runtime?.child);
}
function gameDirectories() {
  return [...new Set([baseGameDir, ...[...gameInstances.values()].map((instance) => instance.gameDir)])];
}
function runningGameDirectories() {
  return [...gameInstances.values()].filter((instance) => instance.runtime.child).map((instance) => instance.gameDir);
}
const baseRuntime = new Runtime(root, assets, emit);
runtime = baseRuntime;
const discord = new DiscordPresence((event) => {
  if (win && !win.isDestroyed()) win.webContents.send('discord:state', event);
});
const startedAt = Date.now();
let activityReading = false;
let community;
let communityReady, connectCommunity;
let cosmeticsReading = false;
let gameActionReading = false;
// Friend notifications: diffed in the main process so they reach the launcher, the game and the OS.
const notifier = { me: null, people: null, busy: false, timer: null, seq: 0 };
function notify(kind, person, text) {
  const notice = { kind, name: person?.name || 'Jogador', uuid: person?.mcUuid || null, text };
  const visible = win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
  if (isGameRunning()) {
    const id = `${Date.now()}${String(notifier.seq++ % 1e4).padStart(4, '0')}`;
    for (const gameDir of gameDirectories())
      atomic(path.join(gameDir, `antagon-notify-${id}.txt`), [kind, notice.name, text].map(clean).join('\t'));
  } else if (!visible && kind !== 'message' && Notification.isSupported())
    new Notification({ title: notice.name, body: text, silent: false }).show();
  if (kind !== 'message' && win && !win.isDestroyed()) win.webContents.send('community:notify', notice);
}
async function checkNotifications() {
  if (notifier.busy || !community?.me) return;
  notifier.busy = true;
  try {
    if (notifier.me !== community.me.id) notifier.people = null;
    notifier.me = community.me.id;
    const next = await community.state();
    const previous = notifier.people;
    notifier.people = next;
    if (!previous) return;
    const friends = new Map(previous.friends.map((person) => [person.id, person]));
    const incoming = new Set(previous.incoming.map((person) => person.id));
    const outgoing = new Set(previous.outgoing.map((person) => person.id));
    for (const friend of next.friends) {
      const before = friends.get(friend.id);
      if (!before && outgoing.has(friend.id)) notify('accepted', friend, 'aceitou seu pedido de amizade');
      else if (before && friend.online && !before.online) notify('online', friend, 'está online');
    }
    for (const person of next.incoming) if (!incoming.has(person.id)) notify('request', person, 'quer ser seu amigo');
  } catch {
  } finally {
    notifier.busy = false;
  }
}
function communityEvent(event) {
  if (win && !win.isDestroyed()) win.webContents.send('community:event', event);
  if (event.type === 'presence' || event.type === 'friendships') {
    clearTimeout(notifier.timer);
    notifier.timer = setTimeout(checkNotifications, 1500);
  }
  if (event.type === 'call' && event.payload?.kind === 'invite') {
    const host = notifier.people?.friends.find((friend) => friend.id === event.payload.sender);
    if (host) notify('call', host, 'está te chamando para uma call');
  }
  if (event.type === 'message' && event.payload?.recipient === community?.me?.id) {
    const sender = notifier.people?.friends.find((friend) => friend.id === event.payload.sender);
    if (sender) notify('message', sender, String(event.payload.body || '').slice(0, 120));
  }
  if (
    event.type === 'message' &&
    gameUi.chat &&
    [event.payload?.sender, event.payload?.recipient].includes(gameUi.chat)
  )
    gameUi.messages.push(event.payload);
  gameUi.dirty = true;
}
const gameUi = {
  chat: null,
  messages: [],
  people: null,
  store: null,
  call: null,
  notice: '',
  dirty: true,
  busy: false,
  peopleAt: 0,
};
const clean = (text) =>
  String(text ?? '').replace(/[\\\t\r\n]/g, (c) => ({ '\\': '\\\\', '\t': '\\t', '\r': '', '\n': '\\n' })[c]);
const UUID = /^[0-9a-f-]{36}$/;
async function gameUiCommand(line) {
  const [action, a = '', b = ''] = line.split('\t');
  const body = b.replace(/\\(\\|t|n)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'));
  if (action === 'chat' && UUID.test(a)) {
    gameUi.chat = a;
    gameUi.messages = await community.messages(a);
  } else if (action === 'send' && UUID.test(a)) await community.send(a, body);
  else if (action === 'accept' && UUID.test(a)) await community.accept(a);
  else if (action === 'remove' && UUID.test(a)) await community.remove(a);
  else if (action === 'add') gameUi.notice = await community.add(a.trim());
  else if (action === 'store') gameUi.store = await community.store();
  else if (action === 'buy') gameUi.store = await community.purchase(a);
  else if (action === 'equip') {
    const item = gameUi.store?.catalog.find((entry) => entry.id === a);
    if (item) gameUi.store = await community.equip(item.id, item.kind);
  } else if (action === 'unequip' && ['cape', 'hat'].includes(a)) gameUi.store = await community.equip(null, a);
  else if (action === 'coins') await shell.openExternal(await community.checkout(a));
  else if (/^call(-accept|-decline|-mute|-leave)?$/.test(action) && win && !win.isDestroyed())
    win.webContents.send('call:command', { action, id: UUID.test(a) ? a : null });
  else if (action === 'admin')
    return Promise.all(
      runningGameDirectories().map((game) => fs.promises.writeFile(path.join(game, 'antagon-ui-request.txt'), 'admin')),
    );
  gameUi.peopleAt = 0;
}
async function gameUiSync() {
  if (gameUi.busy || !isGameRunning()) return;
  gameUi.busy = true;
  const games = runningGameDirectories();
  try {
    for (const game of games) {
      const commands = (await fs.promises.readdir(game)).filter((f) => /^antagon-ui-cmd-\d+\.txt$/.test(f)).sort();
      for (const file of commands) {
        const line = (await fs.promises.readFile(path.join(game, file), 'utf8')).trim();
        await fs.promises.rm(path.join(game, file), { force: true });
        if (!community?.me) continue;
        try {
          await gameUiCommand(line.slice(0, 1200));
        } catch (error) {
          gameUi.notice = error.message;
        }
        gameUi.dirty = true;
      }
    }
    if (community?.me && (gameUi.dirty || Date.now() - gameUi.peopleAt > 15e3)) {
      gameUi.people = await community.state();
      gameUi.peopleAt = Date.now();
    }
    gameUi.dirty = false;
    const people = gameUi.people;
    const lines = [`updated=${Date.now()}`, `online=${community?.me ? 1 : 0}`];
    if (community?.me && people) {
      lines.push(`me=${clean(community.me.name)}`, `notice=${clean(gameUi.notice)}`);
      for (const f of people.friends)
        lines.push(`friend=${[f.id, f.name, f.online ? 1 : 0, f.activity, f.server || '', 0].map(clean).join('\t')}`);
      for (const p of people.incoming) lines.push(`incoming=${clean(p.id)}\t${clean(p.name)}`);
      for (const p of people.outgoing) lines.push(`outgoing=${clean(p.id)}\t${clean(p.name)}`);
      if (gameUi.chat) {
        lines.push(`chat=${gameUi.chat}`);
        for (const m of gameUi.messages.slice(-40)) {
          const time = new Date(m.created_at).toTimeString().slice(0, 5);
          lines.push(`msg=${m.sender === community.me.id ? 1 : 0}\t${time}\t${clean(m.body)}`);
        }
      }
      const call = gameUi.call;
      if (call?.status) {
        lines.push(`call=${[call.status, call.muted ? 1 : 0, call.hostName || ''].map(clean).join('\t')}`);
        for (const person of call.people || []) lines.push(`callpeer=${clean(person.id)}\t${clean(person.name)}`);
      }
      if (gameUi.store) {
        const { balance, catalog, owned, equipped } = gameUi.store;
        lines.push(`balance=${balance}`);
        for (const item of catalog) {
          if (item.custom) await cosmeticImage(item.id).catch(() => {});
          const flags = [owned.includes(item.id), equipped?.[item.kind] === item.id, item.active].map(Number);
          lines.push(`item=${[item.id, item.name, item.price, ...flags, item.kind].map(clean).join('\t')}`);
        }
      }
    }
    for (const game of games) atomic(path.join(game, 'antagon-ui-state.txt'), lines.join('\n') + '\n');
  } catch {
  } finally {
    gameUi.busy = false;
  }
}
async function gameActivity() {
  if (activityReading) return;
  activityReading = true;
  try {
    let activity = isGameRunning() ? 'menu' : 'launcher',
      server = null;
    if (isGameRunning()) {
      const status = await fs.promises
        .readFile(path.join(runtime.game, 'antagon-status.txt'), 'utf8')
        .catch(() => 'menu');
      const parts = status.trim().split(' ');
      if (['menu', 'singleplayer', 'server', 'playing'].includes(parts[0])) {
        activity = parts[0];
        server = parts[1] || null;
      }
    }
    discord.setActivity({ activity, server, shareServer: settings.shareServer, startedAt });
    if (community?.me)
      await community.setActivity(activity === 'server' && !settings.shareServer ? 'playing' : activity, server);
  } catch {
  } finally {
    activityReading = false;
  }
}
const COSMETIC_ID = /^[a-z0-9_]{1,40}$/;
/** Custom capes live in Supabase Storage; the game reads them from antagon-capes/<id>.png. */
async function cosmeticImage(id) {
  const file = path.join(baseGameDir, 'antagon-capes', `${id}.png`);
  if (!fs.existsSync(file)) {
    const res = await fetch(cosmeticUrl(id), { signal: AbortSignal.timeout(2e4) });
    const png = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !isCapeTexture(png)) throw Error('Textura inválida.');
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    atomic(file, png);
  }
  const png = await fs.promises.readFile(file);
  for (const game of runningGameDirectories()) {
    if (game === baseGameDir) continue;
    await fs.promises.mkdir(path.join(game, 'antagon-capes'), { recursive: true });
    atomic(path.join(game, 'antagon-capes', `${id}.png`), png);
  }
}
async function gameCosmetics() {
  if (cosmeticsReading || !isGameRunning() || !community?.me) return;
  cosmeticsReading = true;
  try {
    const rosters = await Promise.all(
      runningGameDirectories().map((game) =>
        fs.promises.readFile(path.join(game, 'antagon-players.txt'), 'utf8').catch(() => ''),
      ),
    );
    const roster = [...new Set(rosters.flatMap((value) => value.split(/\s+/).filter(Boolean)))];
    const rows = await community.visibleCosmetics(roster);
    const lines = [];
    for (const row of rows) {
      if (!row.active_client || !/^[0-9a-f]{32}$/.test(row.mc_uuid)) continue;
      const tokens = ['client'];
      if (COSMETIC_ID.test(row.cape || '')) {
        const ready =
          !row.cape.startsWith('custom_') ||
          (await cosmeticImage(row.cape).then(
            () => true,
            () => false,
          ));
        if (ready) tokens.push(`cape:${row.cape}`);
      }
      if (COSMETIC_ID.test(row.hat || '')) tokens.push(`hat:${row.hat}`);
      if (row.is_admin) tokens.push('admin');
      lines.push(`${row.mc_uuid}=${tokens.join(',')}`);
    }
    for (const game of runningGameDirectories())
      atomic(path.join(game, 'antagon-cosmetics.properties'), lines.join('\n') + '\n');
  } catch {
    // Retain the previous snapshot during a temporary network failure.
  } finally {
    cosmeticsReading = false;
  }
}
async function gameAction() {
  if (gameActionReading || !isGameRunning()) return;
  gameActionReading = true;
  try {
    for (const game of runningGameDirectories()) {
      const profileFile = path.join(game, 'antagon-profile-request.txt');
      try {
        const [prefix, command, nickname] = (await fs.promises.readFile(profileFile, 'utf8')).trim().split('\t');
        await fs.promises.unlink(profileFile);
        if (prefix !== 'profile') throw Error('Solicitud de cuenta inválida.');
        try {
          let message;
          if (command === 'premium') {
            const premium = await login(true);
            const selectedSettings = {
              ...gameInstanceSettings(settings, readInstanceProfile(game)),
              nickname: premium.name,
              mode: 'microsoft',
            };
            writeInstanceProfile(game, selectedSettings);
            message = `Cuenta Premium ${premium.name} guardada. El nick visible cambia ahora; el servidor mantiene la cuenta con la que entraste.`;
          } else if (command === 'premium-select') {
            const selected = accounts.find((saved) => saved.name === nickname);
            if (!selected) throw Error('Esa cuenta Microsoft ya no está guardada.');
            account = selected;
            sessionAccount = null;
            await microsoftSession();
            const selectedSettings = {
              ...gameInstanceSettings(settings, readInstanceProfile(game)),
              nickname: account.name,
              mode: 'microsoft',
            };
            writeInstanceProfile(game, selectedSettings);
            message = `Cuenta Premium ${account.name} seleccionada. El nick visible cambia ahora; el servidor mantiene la cuenta con la que entraste.`;
          } else if (command === 'premium-remove') {
            const index = accounts.findIndex((saved) => saved.name === nickname);
            if (index < 0) throw Error('Esa cuenta Microsoft ya no está guardada.');
            accounts.splice(index, 1);
            if (account?.name === nickname) {
              account = accounts[0] || null;
              sessionAccount = null;
              if (!account) saveSettings({ ...settings, mode: 'offline' });
              else saveSettings({ ...settings, nickname: account.name, mode: 'microsoft' });
            }
            saveAccountRegistry();
            const selectedSettings = gameInstanceSettings(settings, readInstanceProfile(game));
            if (selectedSettings.mode === 'microsoft' && selectedSettings.nickname === nickname)
              writeInstanceProfile(game, { ...selectedSettings, mode: 'offline' });
            message = `${nickname} se quitó de las cuentas guardadas.`;
          } else {
            const result = applyGameProfileCommand(
              gameInstanceSettings(settings, readInstanceProfile(game)),
              command,
              nickname,
            );
            saveSettings({ ...settings, quickNicknames: result.settings.quickNicknames });
            writeInstanceProfile(game, result.settings);
            message = `${result.settings.nickname} seleccionado. Sal al menú principal y vuelve a entrar; la partida actual no cambia.`;
          }
          publishGameProfiles(message, game);
          if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
            win.webContents.send('settings:updated', settings);
        } catch (error) {
          publishGameProfiles(error.message, game);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const file = path.join(game, 'antagon-ui-request.txt');
      try {
        const view = (await fs.promises.readFile(file, 'utf8')).trim();
        await fs.promises.unlink(file);
        if (!isAllowedLauncherView(view)) continue;
        if (view === 'admin' && !(await community?.access())?.isAdmin) continue;
        if (!win || win.isDestroyed()) continue;
        if (win.isMinimized()) win.restore();
        win.show();
        if (process.platform === 'darwin') app.focus({ steal: true });
        win.focus();
        win.webContents.send('game:open-view', view);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[ANTAGON] Menu shortcut:', error.message);
  } finally {
    gameActionReading = false;
  }
}
let refreshingAccount;
function microsoftSession() {
  if (!refreshingAccount)
    refreshingAccount = refreshMicrosoftSession().finally(() => {
      refreshingAccount = null;
    });
  return refreshingAccount;
}
async function refreshMicrosoftSession() {
  if (!account) throw Error('Inicia sesión con Microsoft primero.');
  try {
    const xbox = await new Auth('select_account').refresh(account.refresh);
    const mc = await xbox.getMinecraft();
    if (mc.isDemo()) throw Error('Esta cuenta está en modo demo.');
    persistAccount(mc, xbox);
    return sessionAccount;
  } catch {
    throw Error('Tu sesión expiró. Inicia sesión de nuevo con Microsoft.');
  }
}
function persistResourcePackSelection(gameDir) {
  try {
    const optionText = fs.readFileSync(path.join(gameDir, 'options.txt'), 'utf8');
    const activeResourcePacks = parseResourcePacks(optionText);
    saveSettings({ ...settings, activeResourcePacks });
    if (gameDir !== baseGameDir && !gameInstances.get('main')?.runtime.child) {
      const baseOptions = path.join(baseGameDir, 'options.txt');
      if (fs.existsSync(baseOptions))
        atomic(
          baseOptions,
          updateResourcePackOptions(fs.readFileSync(baseOptions, 'utf8'), {
            ...settings,
            activeResourcePacks,
          }),
        );
    }
    if (win && !win.isDestroyed()) win.webContents.send('settings:updated', settings);
  } catch (error) {
    if (error.code !== 'ENOENT')
      console.error('[PRIMARIX] No se pudo guardar la selección de paquetes:', error.message);
  }
}
async function startGame(server, target = null) {
  if (busy) throw Error('Espera a que termine de prepararse la instancia actual.');
  busy = true;
  try {
    emit({
      phase: 'preparing',
      message: isGameRunning() ? 'Preparando otra instancia' : 'Preparando Minecraft',
      percent: 0,
    });
    let gameDir = target?.gameDir || baseGameDir;
    let gameRuntime = target?.runtime || baseRuntime;
    if (!target && isGameRunning()) {
      const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      gameDir = path.join(root, 'instances', id);
      await cloneGameProfile(runtime.game, gameDir);
      gameRuntime = new Runtime(root, assets, emit, gameDir);
    }
    let instanceProfile = readInstanceProfile(gameDir);
    if (!instanceProfile) {
      writeInstanceProfile(gameDir, settings);
      instanceProfile = readInstanceProfile(gameDir);
    }
    const gameSettings = gameInstanceSettings(settings, instanceProfile);
    if (gameSettings.mode === 'microsoft') {
      const selectedAccount = accounts.find((saved) => saved.name === gameSettings.nickname);
      if (!selectedAccount) throw Error('La cuenta Microsoft de esta instancia ya no está guardada.');
      if (account?.id !== selectedAccount.id) {
        account = selectedAccount;
        sessionAccount = null;
      }
    }
    let active;
    if (gameSettings.mode === 'offline') active = offlineAccount(gameSettings.nickname);
    else {
      emit({ phase: 'preparing', message: 'Autenticando tu cuenta', percent: 0 });
      active = await microsoftSession();
    }
    await communityReady;
    let access = { isAdmin: false };
    if (gameSettings.mode === 'microsoft') {
      if (!community?.configured) throw Error('La comunidad de Primarix no está configurada.');
      if (community.me?.mcUuid !== active.id) {
        if (community.me) await community.signOut();
        await community.signIn(active.accessToken);
      }
      if (!community?.me) throw Error('No se pudo verificar tu cuenta de Primarix.');
      access = await community.requireActive();
    }
    atomic(
      path.join(gameDir, 'antagon-accounts.txt'),
      gameProfilesSnapshot(
        gameSettings,
        '',
        accounts.map((saved) => saved.name),
      ),
    );
    const result = await gameRuntime.launch(gameSettings, active, { server, admin: access.isAdmin });
    const id = gameDir === baseGameDir ? 'main' : path.basename(gameDir);
    gameInstances.set(id, { id, gameDir, runtime: gameRuntime });
    runtime = gameRuntime;
    gameRuntime.child?.once('close', () => {
      persistResourcePackSelection(gameDir);
      setTimeout(gameActivity, 500);
    });
    gameCosmetics();
    if (win && !win.isDestroyed()) win.hide();
    return result;
  } catch (e) {
    emit({ phase: 'error', message: e.message });
    throw e;
  } finally {
    busy = false;
  }
}
function showLauncher() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();
}
function accountInfo() {
  return account
    ? {
        name: account.name,
        id: account.id,
        accounts: accounts.map(({ name, id }) => ({ name, id })),
      }
    : null;
}
function saveAccountRegistry() {
  if (!safeStorage.isEncryptionAvailable()) return;
  const record = { activeId: account?.id || '', accounts };
  atomic(path.join(root, 'accounts.enc'), safeStorage.encryptString(JSON.stringify(record)));
  if (account) atomic(path.join(root, 'account.enc'), safeStorage.encryptString(JSON.stringify(account)));
  else fs.rmSync(path.join(root, 'account.enc'), { force: true });
}
function loadAccount() {
  if (!safeStorage.isEncryptionAvailable()) return;
  try {
    const stored = JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(root, 'accounts.enc'))));
    accounts = Array.isArray(stored.accounts)
      ? stored.accounts.filter(
          (saved) =>
            typeof saved?.name === 'string' &&
            /^[A-Za-z0-9_]{3,16}$/.test(saved.name) &&
            typeof saved.id === 'string' &&
            typeof saved.refresh === 'string' &&
            saved.refresh.length > 0,
        )
      : [];
    account = accounts.find((saved) => saved.id === stored.activeId) || accounts[0] || null;
  } catch {
    try {
      const legacy = JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(root, 'account.enc'))));
      if (
        typeof legacy?.name === 'string' &&
        /^[A-Za-z0-9_]{3,16}$/.test(legacy.name) &&
        typeof legacy.id === 'string' &&
        typeof legacy.refresh === 'string'
      ) {
        accounts = [legacy];
        account = legacy;
      } else {
        accounts = [];
        account = null;
      }
    } catch {
      accounts = [];
      account = null;
    }
  }
}
function persistAccount(mc, xbox) {
  const previousVoiceNickname = settings?.mode === 'microsoft' && account ? account.name : settings?.nickname;
  account = { name: mc.profile.name, id: mc.profile.id, refresh: xbox.save() };
  const nextVoiceNickname = settings?.mode === 'microsoft' && account ? account.name : settings?.nickname;
  if (previousVoiceNickname && nextVoiceNickname !== previousVoiceNickname) voiceGateway.close();
  const existing = accounts.findIndex((saved) => saved.id === account.id);
  if (existing >= 0) accounts[existing] = account;
  else accounts.push(account);
  sessionAccount = { name: account.name, id: account.id, accessToken: mc.mcToken, type: 'msa' };
  saveAccountRegistry();
  return accountInfo();
}
async function login(fromGame = false) {
  const auth = new Auth('select_account');
  const nonce = crypto.randomBytes(24).toString('hex');
  const popup = new BrowserWindow({
    width: 520,
    height: 740,
    ...(fromGame ? {} : { parent: win, modal: true }),
    center: true,
    alwaysOnTop: fromGame,
    title: 'Iniciar sesión con Microsoft — Primarix Client',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'antagon-auth-' + nonce,
    },
  });
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const code = await new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        popup.close();
        reject(Error('O login expirou. Tente novamente.'));
      }
    }, 3e5);
    const navigate = (event, url) => {
      const u = new URL(url);
      if (u.origin === 'https://login.live.com' && u.pathname === '/oauth20_desktop.srf') {
        event.preventDefault();
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (u.searchParams.get('state') !== nonce || !u.searchParams.get('code'))
          reject(Error('No se completó el inicio de sesión.'));
        else resolve(u.searchParams.get('code'));
        popup.close();
      }
    };
    popup.webContents.on('will-redirect', navigate);
    popup.webContents.on('will-navigate', navigate);
    popup.on('closed', () => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        reject(Error('Login cancelado.'));
      }
    });
    popup.loadURL(auth.createLink() + '&state=' + nonce).catch(() => {});
  });
  const xbox = await auth.login(code);
  const mc = await xbox.getMinecraft();
  if (mc.isDemo() || !mc.profile?.id) throw Error('Esta cuenta no tiene un perfil activo de Minecraft Java.');
  return persistAccount(mc, xbox);
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender.id !== win.webContents.id || event.senderFrame.url !== pathToFileURL(ui).href)
      throw Error('Ventana no autorizada.');
    try {
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return {
        ok: false,
        error: typeof error.message === 'string' ? error.message : 'Não foi possível concluir a operação.',
      };
    }
  });
}
app
  .whenReady()
  .then(() => {
    if (!hasSingleInstanceLock) return;
    startupTrace('whenReady entered');
    console.log('[PRIMARIX DEBUG] ready callback');
    settings = loadSettings();
    startupTrace('settings loaded');
    loadAccount();
    startupTrace('account loaded');
    console.log('[PRIMARIX DEBUG] creating launcher window');
    const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
    const minWidth = Math.min(760, workWidth);
    const minHeight = Math.min(560, workHeight);
    win = new BrowserWindow({
      width: Math.max(minWidth, Math.min(1120, workWidth - 40)),
      height: Math.max(minHeight, Math.min(760, workHeight - 40)),
      minWidth,
      minHeight,
      backgroundColor: '#151515',
      title: 'Primarix Client',
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 17 } }
        : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#191919', symbolColor: '#f0eee8', height: 56 } }),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.on('close', (event) => {
      startupTrace('window close event');
      if (!quitting) {
        event.preventDefault();
        win.hide();
      }
    });
    win.on('closed', () => startupTrace('window closed event'));
    app.on('before-quit', () => startupTrace('before-quit event'));
    app.on('window-all-closed', () => startupTrace('window-all-closed event'));
    tray = new Tray(path.join(assets, 'icon.png'));
    tray.setToolTip('Primarix Client');
    const showLauncher = () => {
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    };
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Mostrar Launcher', click: showLauncher },
        { type: 'separator' },
        { label: 'Cerrar', click: () => app.quit() },
      ]),
    );
    tray.on('double-click', showLauncher);
    startupTrace('window constructed');
    console.log('[PRIMARIX DEBUG] launcher window created');
    win.setMenu(null);
    win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      callback(
        webContents === win.webContents &&
          permission === 'media' &&
          details?.mediaTypes?.includes('audio') &&
          !details.mediaTypes.includes('video'),
      );
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => {
      if (url !== pathToFileURL(ui).href) e.preventDefault();
    });
    handle('app:init', () => ({
      settings,
      account: accountInfo(),
      communityConfigured: community?.configured || false,
      cosmeticStorageUrl: community?.storageUrl || '',
      state,
      version: app.getVersion(),
      voiceServerUrl: process.env.PRIMARIX_VOICE_URL || 'https://primarix-voice.onrender.com',
      installed: fs.existsSync(path.join(root, 'installation.json')),
      optifine: optifine(),
      wallpaper: wallpaper(),
    }));
    handle('settings:save', (value) => saveSettings(value));
    handle('account:login', async () => {
      try {
        return await login();
      } catch (e) {
        if (e.message?.includes('cancelado') || e.message?.includes('expirou') || e.message?.includes('perfil ativo'))
          throw e;
        throw Error(
          'Microsoft no completó la autenticación. Inténtalo de nuevo y comprueba que la cuenta tenga Minecraft Java.',
        );
      }
    });
    handle('account:logout', async () => {
      await communityReady;
      if (community.me) await community.signOut();
      voiceGateway.close();
      if (account) accounts = accounts.filter((saved) => saved.id !== account.id);
      account = accounts[0] || null;
      sessionAccount = null;
      saveAccountRegistry();
      saveSettings({
        ...settings,
        nickname: account?.name || settings.nickname,
        mode: account ? 'microsoft' : 'offline',
      });
      publishGameProfiles();
      return { account: accountInfo(), settings };
    });
    handle('game:launch', () => startGame());
    community = new Community(root, safeStorage, communityEvent);
    connectCommunity = async () => {
      if (!community.configured) return null;
      if (settings.mode !== 'microsoft' || !account) return community.me;
      if (community.me?.mcUuid === account.id) return community.me;
      if (community.me) await community.signOut();
      return community.signIn((await microsoftSession()).accessToken);
    };
    communityReady = community
      .restore()
      .catch(() => null)
      .then((me) => me || connectCommunity().catch(() => null))
      .then((me) => (checkNotifications(), me));
    setInterval(gameActivity, 5e3).unref();
    setInterval(gameCosmetics, 15e3).unref();
    setInterval(gameAction, 250).unref();
    setInterval(gameUiSync, 500).unref();
    setInterval(checkNotifications, 20e3).unref();
    discord.configure(settings);
    gameActivity();
    handle('discord:state', () => discord.state());
    const needCommunity = () => {
      if (!community.configured) throw Error('La comunidad de Primarix no está configurada.');
      if (!community.me) throw Error('Inicia sesión en la comunidad primero.');
    };
    handle('community:state', async () => (await communityReady, community.state()));
    handle('community:login', async () => {
      if (!community.configured)
        throw Error('Configura PRIMARIX_SUPABASE_URL y PRIMARIX_SUPABASE_KEY para activar la comunidad.');
      if (settings.mode !== 'microsoft' || !account)
        throw Error('La comunidad usa tu cuenta Microsoft. Inicia sesión desde tu perfil.');
      return connectCommunity();
    });
    handle('community:logout', () => community.signOut());
    handle('community:add', (name) => (needCommunity(), community.add(String(name || '').trim())));
    handle('community:accept', (id) => (needCommunity(), community.accept(String(id))));
    handle('community:remove', (id) => (needCommunity(), community.remove(String(id))));
    handle('community:messages', (id) => (needCommunity(), community.messages(String(id))));
    handle('community:send', (id, body) => (needCommunity(), community.send(String(id), body)));
    handle('community:join', (server) => startGame(String(server || '')));
    handle('voice:connect', (url) => {
      const nickname = settings.mode === 'microsoft' && account?.name ? account.name : settings.nickname;
      return voiceGateway.connect(String(url || ''), nickname);
    });
    handle('voice:disconnect', () => {
      voiceGateway.close();
      return true;
    });
    handle('voice:rooms', () => voiceGateway.listRooms());
    handle('voice:create', (room) => voiceGateway.createRoom(room || {}));
    handle('voice:join', (id, password) => voiceGateway.joinRoom(String(id || ''), String(password || '')));
    handle('voice:leave', () => voiceGateway.leaveRoom());
    handle('voice:chat', (channel, body) => voiceGateway.sendChat(String(channel || ''), String(body || '')));
    handle('voice:state', (muted, deafened) => voiceGateway.setState(muted === true, deafened === true));
    handle('voice:signal', (to, kind, payload) =>
      voiceGateway.signal(String(to || ''), String(kind || ''), payload || {}),
    );
    handle('store:state', () => (needCommunity(), community.store()));
    handle('store:purchase', (item) => (needCommunity(), community.purchase(String(item || ''))));
    handle(
      'store:equip',
      (item, kind) => (
        needCommunity(),
        community.equip(item === null ? null : String(item || ''), String(kind || 'cape'))
      ),
    );
    handle('store:checkout', async (pack) => {
      needCommunity();
      const url = await community.checkout(String(pack || ''));
      await shell.openExternal(url);
      return true;
    });
    handle(
      'call:signal',
      (to, callId, kind, payload) => (
        needCommunity(),
        community.callSignal(String(to || ''), String(callId || ''), String(kind || ''), payload || {})
      ),
    );
    handle('call:ice', () => (needCommunity(), community.iceServers()));
    handle('call:microphone', () =>
      process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true,
    );
    handle('call:report', (state) => {
      gameUi.call = state && typeof state === 'object' ? state : null;
      gameUi.dirty = true;
    });
    handle('admin:access', () => (needCommunity(), community.access()));
    handle('admin:catalog', () => (needCommunity(), community.adminCatalog()));
    handle('admin:take', (item, take) => (needCommunity(), community.adminTake(String(item || ''), take)));
    handle('admin:delete', (item) => (needCommunity(), community.adminDelete(String(item || ''))));
    handle(
      'admin:setActive',
      (item, active) => (needCommunity(), community.adminSetActive(String(item || ''), active)),
    );
    handle('admin:createCape', (cape) => {
      needCommunity();
      const png = cape?.png instanceof Uint8Array ? Buffer.from(cape.png) : null;
      return community.adminCreateCape({ ...cape, png });
    });
    handle('admin:find', (name) => (needCommunity(), community.adminFind(String(name || '').trim())));
    handle(
      'admin:change',
      (action, id, value) => (needCommunity(), community.adminChange(String(action || ''), String(id || ''), value)),
    );
    handle('optifine:install', () => {
      if (busy || isGameRunning()) throw Error('Cierra el juego antes de cambiar OptiFine.');
      return installOptifine();
    });
    handle('optifine:remove', () => {
      if (busy || isGameRunning()) throw Error('Cierra el juego antes de cambiar OptiFine.');
      const f = optifine();
      if (f) fs.unlinkSync(path.join(modsDir, f));
      return null;
    });
    handle('optifine:site', () => shell.openExternal('https://optifine.net/downloads'));
    handle('wallpaper:pick', async () => {
      const pick = await dialog.showOpenDialog(win, {
        title: 'Elige el fondo',
        defaultPath: app.getPath('pictures'),
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (pick.canceled || !pick.filePaths[0]) return void 0;
      const ext = path.extname(pick.filePaths[0]).slice(1).toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw Error('Usa una imagen PNG, JPG o WEBP.');
      if (fs.statSync(pick.filePaths[0]).size > 25e6) throw Error('La imagen es demasiado grande (máximo 25 MB).');
      clearWallpaper();
      fs.copyFileSync(pick.filePaths[0], path.join(root, 'wallpaper.' + ext));
      return wallpaper();
    });
    handle('wallpaper:reset', () => {
      clearWallpaper();
      return null;
    });
    let update = null;
    handle('update:check', async () => {
      if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
      if (!updater.configured) return { status: 'unconfigured', current: app.getVersion() };
      try {
        update = await updater.check(app.getVersion());
      } catch {
        return { status: 'offline', current: app.getVersion() };
      }
      return update
        ? { status: 'available', version: update.version, current: app.getVersion() }
        : { status: 'latest', current: app.getVersion() };
    });
    handle('update:install', async () => {
      if (!update) throw Error('No hay actualizaciones disponibles.');
      if (busy || isGameRunning()) throw Error('Cierra el juego antes de actualizar.');
      busy = true;
      try {
        await updater.install(update, (percent) =>
          emit({ phase: 'updating', message: `Descargando la versión ${update.version}`, percent }),
        );
        emit({ phase: 'updating', message: 'Reiniciando', percent: 100 });
        app.quit();
      } catch (error) {
        emit({ phase: 'error', message: error.message });
        throw error;
      } finally {
        busy = false;
      }
    });
    handle('mods:list', () => ({ mods: listMods() }));
    handle('mods:toggle', (fileName) => toggleMod(fileName));
    handle('mods:add', async () => {
      if (busy || isGameRunning()) throw Error('Cierra Minecraft antes de instalar mods.');
      const pick = await dialog.showOpenDialog(win, {
        title: 'Importar mods para Minecraft 1.8.9',
        defaultPath: app.getPath('downloads'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Mods de Minecraft', extensions: ['jar'] }],
      });
      if (pick.canceled || !pick.filePaths.length) return { mods: listMods(), added: 0 };
      fs.mkdirSync(modsDir, { recursive: true });
      for (const source of pick.filePaths) {
        const fileName = path.basename(source);
        if (!/\.jar$/i.test(fileName) || protectedMod(fileName) || isClientMod(source))
          throw Error('Selecciona un mod .jar externo; el mod base de Primarix no se puede importar aquí.');
        if (fs.statSync(source).size > 150 * 1024 * 1024) throw Error('El mod supera el límite de 150 MB.');
        const descriptor = fs.openSync(source, 'r');
        try {
          const signature = Buffer.alloc(2);
          if (fs.readSync(descriptor, signature, 0, 2, 0) !== 2 || signature.toString('ascii') !== 'PK')
            throw Error(`${fileName} no parece ser un archivo JAR válido.`);
        } finally {
          fs.closeSync(descriptor);
        }
        assertForgeMod(fileName, fs.readFileSync(source));
      }
      let added = 0;
      for (const source of pick.filePaths) {
        const parsed = path.parse(path.basename(source));
        let candidate = parsed.base,
          suffix = 2;
        while (
          fs.existsSync(path.join(modsDir, candidate)) ||
          fs.existsSync(path.join(modsDir, candidate + '.disabled'))
        )
          candidate = `${parsed.name} (${suffix++})${parsed.ext}`;
        fs.copyFileSync(source, path.join(modsDir, candidate), fs.constants.COPYFILE_EXCL);
        added++;
      }
      return { mods: listMods(), added };
    });
    handle('resourcepacks:import', async (sources) => {
      if (busy || isGameRunning()) throw Error('Cierra Minecraft antes de importar paquetes de recursos.');
      if (
        !Array.isArray(sources) ||
        sources.length < 1 ||
        sources.length > 10 ||
        sources.some((file) => typeof file !== 'string')
      )
        throw Error('Selecciona entre 1 y 10 archivos ZIP o RAR.');
      const imported = [];
      const errors = [];
      for (const source of sources) {
        try {
          imported.push(await importResourcePack(source, resourcepacksDir));
        } catch (error) {
          errors.push(`${path.basename(source)}: ${error.message}`);
        }
      }
      if (!imported.length) throw Error(errors.join('\n'));
      return { directory: resourcepacksDir, imported, errors };
    });
    handle('resourcepacks:list', () => listInstalledResourcePacks(resourcepacksDir));
    handle('resourcepacks:search', (options) => searchResourcePacks(options));
    handle('resourcepacks:details', (projectId) => getResourcePackDetails(projectId));
    handle('resourcepacks:install', async (projectId) => {
      if (busy || isGameRunning()) throw Error('Cierra Minecraft antes de instalar paquetes de recursos.');
      const installed = await downloadResourcePack(projectId, resourcepacksDir);
      return { directory: resourcepacksDir, installed };
    });
    handle('resourcepacks:open-project', async (value) => {
      let url;
      try {
        url = new URL(String(value));
      } catch {
        throw Error('El enlace del proyecto no es válido.');
      }
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'modrinth.com' ||
        !/^\/resourcepack\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      )
        throw Error('Solo se pueden abrir páginas de paquetes en Modrinth.');
      await shell.openExternal(url.href);
      return true;
    });
    handle('app:folder', (kind) => {
      if (kind === 'mods' || kind === 'game')
        throw Error('La carpeta del perfil contiene archivos internos y no se abre desde Primarix.');
      const folders = {
        resourcepacks: resourcepacksDir,
        screenshots: path.join(runtime.game, 'screenshots'),
      };
      const folder = folders[kind];
      if (!folder) throw Error('Esta carpeta no se puede abrir desde Primarix.');
      fs.mkdirSync(folder, { recursive: true });
      return shell.openPath(folder);
    });
    handle('app:logs', async () => {
      const file = runtime.logFile;
      if (!fs.existsSync(file)) return 'Todavía no se ha iniciado ninguna partida.';
      return readTail(file);
    });
    handle('window:minimize', () => win.minimize());
    win.loadFile(ui);
    win.webContents.once('did-fail-load', (_event, code, description, url) =>
      startupTrace(`load failed ${code} ${description} ${url}`),
    );
    win.webContents.once('did-finish-load', () => startupTrace('load finished'));
  })
  .catch((error) => {
    startupTrace('startup rejected ' + (error.stack || error.message));
    console.error('[PRIMARIX DEBUG] ready callback rejected');
    console.error('[PRIMARIX] Startup failed:', error);
    app.quit();
  });
let leaving = false;
app.on('before-quit', (event) => {
  quitting = true;
  discord.stop();
  voiceGateway.close();
  community?.stop();
  if (leaving || !community?.me) return;
  event.preventDefault();
  leaving = true;
  Promise.race([community.setActivity('offline'), new Promise((r) => setTimeout(r, 2e3))]).finally(() => app.quit());
});
