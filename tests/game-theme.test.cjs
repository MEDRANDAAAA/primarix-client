const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncGameAccent } = require('../electron/game-theme.cjs');

test('custom accent color updates the game theme without losing other settings', (t) => {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-game-theme-'));
  t.after(() => fs.rmSync(gameDir, { recursive: true, force: true }));
  const config = path.join(gameDir, 'config', 'antagon-hud.properties');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, '# HUD settings\r\nui.accent=rojo\r\nhud.scale=1.2\r\n', 'utf8');

  syncGameAccent(gameDir, '#E34AB5');

  assert.equal(
    fs.readFileSync(config, 'utf8'),
    '# HUD settings\r\nui.accent=#e34ab5\r\nhud.scale=1.2\r\n',
  );
});

test('game accent rejects malformed values', (t) => {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-game-theme-'));
  t.after(() => fs.rmSync(gameDir, { recursive: true, force: true }));
  assert.throws(() => syncGameAccent(gameDir, 'red'), /no es válido/);
});
