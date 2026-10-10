const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./files.cjs');

function syncGameAccent(gameDir, color) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) throw Error('El color de acento no es válido.');

  const configFile = path.join(gameDir, 'config', 'antagon-hud.properties');
  let existing = '';
  try {
    existing = fs.readFileSync(configFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!/^\s*ui\.accent\s*=/.test(line)) return line;
    found = true;
    return `ui.accent=${color.toLowerCase()}`;
  });
  while (next.length && next[next.length - 1] === '') next.pop();
  if (!found) next.push(`ui.accent=${color.toLowerCase()}`);

  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  atomicWrite(configFile, `${next.join(newline)}${newline}`);
}

module.exports = { syncGameAccent };
