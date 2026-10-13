const { validateSettings } = require('./settings.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./files.cjs');

const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
const PROFILE_FILE = 'antagon-profile.json';
const LAST_GAME_PROFILE_FILE = 'last-game-profile.json';
const GAME_PROCESS_FILE = 'antagon-game-process.json';
const INSTANCE_DIRECTORY = /^\d+-[a-f0-9]{8}$/;

function instanceSettings(settings, profile) {
  const clean = validateSettings(settings);
  if (!NICKNAME.test(profile?.nickname || '') || !['offline', 'microsoft'].includes(profile?.mode)) return clean;
  return { ...clean, nickname: profile.nickname, mode: profile.mode };
}

function readInstanceProfile(gameDir) {
  try {
    const profile = JSON.parse(fs.readFileSync(path.join(gameDir, PROFILE_FILE), 'utf8'));
    if (!NICKNAME.test(profile?.nickname || '') || !['offline', 'microsoft'].includes(profile.mode))
      throw Error('El perfil de esta instancia de Minecraft no es válido.');
    return { nickname: profile.nickname, mode: profile.mode };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function writeInstanceProfile(gameDir, settings) {
  const clean = validateSettings(settings);
  const target = path.join(gameDir, PROFILE_FILE);
  atomicWrite(target, JSON.stringify({ nickname: clean.nickname, mode: clean.mode }));
}

function lastGameDirectory(root) {
  const stateFile = path.join(root, LAST_GAME_PROFILE_FILE);
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state?.directory === 'minecraft') return path.join(root, 'minecraft');
    const match = /^instances\/([^/]+)$/.exec(state?.directory || '');
    if (match && INSTANCE_DIRECTORY.test(match[1])) {
      const gameDir = path.join(root, 'instances', match[1]);
      if (fs.existsSync(path.join(gameDir, 'options.txt'))) return gameDir;
      return path.join(root, 'minecraft');
    }
    throw Error('El perfil de juego guardado no es válido.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const profiles = [path.join(root, 'minecraft')];
  const instancesDirectory = path.join(root, 'instances');
  if (fs.existsSync(instancesDirectory)) {
    profiles.push(
      ...fs
        .readdirSync(instancesDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && INSTANCE_DIRECTORY.test(entry.name))
        .map((entry) => path.join(instancesDirectory, entry.name)),
    );
  }
  return (
    profiles
      .filter((gameDir) => fs.existsSync(path.join(gameDir, 'options.txt')))
      .map((gameDir) => ({
        gameDir,
        modifiedAt: fs.statSync(path.join(gameDir, 'options.txt')).mtimeMs,
      }))
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.gameDir || path.join(root, 'minecraft')
  );
}

function rememberLastGameDirectory(root, gameDir) {
  const relative = path.relative(path.resolve(root), path.resolve(gameDir)).replace(/\\/g, '/');
  if (relative !== 'minecraft' && !/^instances\/\d+-[a-f0-9]{8}$/.test(relative))
    throw Error('No se puede guardar una carpeta de juego fuera del perfil Primarix.');
  atomicWrite(path.join(root, LAST_GAME_PROFILE_FILE), JSON.stringify({ directory: relative }));
}

function gameProfileIsRunning(gameDir) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(path.join(gameDir, GAME_PROCESS_FILE), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!Number.isSafeInteger(record?.pid) || record.pid <= 0)
    throw Error('El registro del proceso de Minecraft no es válido.');
  try {
    process.kill(record.pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function rememberGameProcess(gameDir, pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('El proceso de Minecraft no es válido.');
  atomicWrite(path.join(gameDir, GAME_PROCESS_FILE), JSON.stringify({ pid }));
}

function forgetGameProcess(gameDir, pid) {
  const processFile = path.join(gameDir, GAME_PROCESS_FILE);
  try {
    const record = JSON.parse(fs.readFileSync(processFile, 'utf8'));
    if (record?.pid === pid) fs.unlinkSync(processFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function snapshot(settings, message = '', premiumNicknames = []) {
  const clean = validateSettings(settings);
  const lines = [clean.nickname, clean.mode, ...clean.quickNicknames];
  const premiumNames = Array.isArray(premiumNicknames) ? premiumNicknames : [premiumNicknames];
  for (const name of new Set(premiumNames.filter((value) => NICKNAME.test(value || ''))))
    lines.push(`@premium:${name}`);
  if (message)
    lines.push(
      `!${String(message)
        .replace(/[\r\n]/g, ' ')
        .slice(0, 120)}`,
    );
  lines.push('');
  return lines.join('\n');
}

function applyCommand(settings, command, nickname) {
  const current = validateSettings(settings);
  if (!NICKNAME.test(nickname || '')) throw Error('Usa un nick de 3 a 16 letras, números o _.');

  if (command === 'add') {
    if (current.quickNicknames.includes(nickname))
      return {
        settings: { ...current, nickname, mode: 'offline' },
        message: `${nickname} seleccionado. Sal al menú principal y vuelve a entrar; la partida actual no cambia.`,
      };
    return {
      settings: {
        ...current,
        nickname,
        mode: 'offline',
        quickNicknames: [...current.quickNicknames, nickname],
      },
      message: `${nickname} seleccionado. Sal al menú principal y vuelve a entrar; la partida actual no cambia.`,
    };
  }

  if (command === 'select') {
    if (nickname !== current.nickname && !current.quickNicknames.includes(nickname))
      throw Error('Ese nick no está guardado.');
    return {
      settings: { ...current, nickname, mode: 'offline' },
      message: `${nickname} seleccionado. Sal al menú principal y vuelve a entrar; la partida actual no cambia.`,
    };
  }

  if (command === 'premium-select' || command === 'premium-remove') {
    if (!currentNickname(nickname)) throw Error('La cuenta Microsoft no es válida.');
    return { settings: current, message: `${nickname} seleccionado.` };
  }

  if (command === 'remove') {
    if (nickname !== current.nickname && !current.quickNicknames.includes(nickname))
      throw Error('Ese nick no está guardado.');
    const quickNicknames = current.quickNicknames.filter((item) => item !== nickname);
    const selected = current.nickname === nickname ? quickNicknames[0] || 'Player' : current.nickname;
    return {
      settings: {
        ...current,
        nickname: selected,
        mode: current.nickname === nickname ? 'offline' : current.mode,
        quickNicknames,
      },
      message:
        current.nickname === nickname
          ? `${nickname} se eliminó; ${selected} quedó seleccionado.`
          : `${nickname} se eliminó.`,
    };
  }

  throw Error('Acción de cuenta desconocida.');
}

function currentNickname(nickname) {
  return NICKNAME.test(nickname || '');
}

module.exports = {
  applyCommand,
  forgetGameProcess,
  gameProfileIsRunning,
  instanceSettings,
  lastGameDirectory,
  readInstanceProfile,
  rememberGameProcess,
  rememberLastGameDirectory,
  snapshot,
  writeInstanceProfile,
};
