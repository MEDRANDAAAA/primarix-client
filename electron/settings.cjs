const crypto = require('node:crypto');
const { APPLICATION_ID } = require('./discord.cjs');
const CONFIGURED_APPLICATION_ID = process.env.PRIMARIX_DISCORD_APPLICATION_ID || '';
const DEFAULTS = {
  mode: 'offline',
  nickname: 'Player',
  memory: 3,
  fullscreen: false,
  activeResourcePacks: null,
  quickNicknames: [],
  pack: true,
  shareServer: true,
  background: 'scene',
  accentColor: '#f49caf',
  discordPresence: false,
  discordApplicationId: CONFIGURED_APPLICATION_ID,
};
const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
function validateSettings(input) {
  const settings = structuredClone(DEFAULTS);
  if (input?.mode === 'microsoft') settings.mode = 'microsoft';
  if (typeof input?.nickname === 'string' && NICKNAME.test(input.nickname)) settings.nickname = input.nickname;
  if (Number.isFinite(input?.memory)) settings.memory = Math.max(2, Math.min(8, Math.round(input.memory)));
  for (const key of ['fullscreen', 'pack', 'shareServer', 'discordPresence'])
    if (typeof input?.[key] === 'boolean') settings[key] = input[key];
  if (input?.activeResourcePacks === null) settings.activeResourcePacks = null;
  else if (Array.isArray(input?.activeResourcePacks))
    settings.activeResourcePacks = [
      ...new Set(input.activeResourcePacks.filter((name) => typeof name === 'string' && name.length <= 256)),
    ].slice(0, 100);
  if (Array.isArray(input?.quickNicknames)) {
    settings.quickNicknames = [
      ...new Set(input.quickNicknames.filter((name) => typeof name === 'string' && NICKNAME.test(name))),
    ];
  }
  settings.background = 'scene';
  if (typeof input?.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.accentColor)) {
    const accentColor = input.accentColor.toLowerCase();
    settings.accentColor = accentColor === '#e34ab5' ? DEFAULTS.accentColor : input.accentColor;
  }
  if (typeof input?.discordApplicationId === 'string' && APPLICATION_ID.test(input.discordApplicationId.trim()))
    settings.discordApplicationId = input.discordApplicationId.trim();
  return settings;
}
function offlineAccount(name) {
  if (!NICKNAME.test(name)) throw Error('Usa un nick de 3 a 16 letras, números o _.');
  const bytes = crypto
    .createHash('md5')
    .update('OfflinePlayer:' + name)
    .digest();
  bytes[6] = (bytes[6] & 15) | 48;
  bytes[8] = (bytes[8] & 63) | 128;
  return { name, id: bytes.toString('hex'), accessToken: '0', type: 'legacy', offline: true };
}
module.exports = { DEFAULTS, validateSettings, offlineAccount };
