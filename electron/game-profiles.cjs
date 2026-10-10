const { validateSettings } = require('./settings.cjs');

const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;

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
        message: `${nickname} ya estaba guardado; quedó seleccionado.`,
      };
    if (current.quickNicknames.length >= 8) throw Error('Ya guardaste el máximo de 8 nicks.');
    return {
      settings: {
        ...current,
        nickname,
        mode: 'offline',
        quickNicknames: [...current.quickNicknames, nickname],
      },
      message: `${nickname} quedó seleccionado para tu próxima conexión Offline.`,
    };
  }

  if (command === 'select') {
    if (nickname !== current.nickname && !current.quickNicknames.includes(nickname))
      throw Error('Ese nick no está guardado.');
    return {
      settings: { ...current, nickname, mode: 'offline' },
      message: `${nickname} quedó seleccionado para tu próxima conexión Offline.`,
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

module.exports = { applyCommand, snapshot };
