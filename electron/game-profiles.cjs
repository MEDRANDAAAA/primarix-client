const { validateSettings } = require('./settings.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./files.cjs');

const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
const PROFILE_FILE = 'antagon-profile.json';

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

module.exports = { applyCommand, instanceSettings, readInstanceProfile, snapshot, writeInstanceProfile };
