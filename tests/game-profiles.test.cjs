const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS } = require('../electron/settings.cjs');
const {
  applyCommand,
  instanceSettings,
  readInstanceProfile,
  snapshot,
  writeInstanceProfile,
} = require('../electron/game-profiles.cjs');

test('in-game nick commands create and select offline profiles', () => {
  const added = applyCommand(DEFAULTS, 'add', 'PvP_Alt');
  assert.equal(added.settings.nickname, 'PvP_Alt');
  assert.equal(added.settings.mode, 'offline');
  assert.deepEqual(added.settings.quickNicknames, ['PvP_Alt']);
  assert.match(added.message, /Sal al menú principal/);

  const selected = applyCommand(
    { ...added.settings, quickNicknames: [...added.settings.quickNicknames, 'MainNick'] },
    'select',
    'MainNick',
  );
  assert.equal(selected.settings.nickname, 'MainNick');
  assert.equal(selected.settings.mode, 'offline');
  assert.match(selected.message, /Sal al menú principal/);
});

test('in-game nick commands remove a saved profile and reset the active nick', () => {
  const result = applyCommand(
    { ...DEFAULTS, nickname: 'PvP_Alt', quickNicknames: ['PvP_Alt', 'MainNick'] },
    'remove',
    'PvP_Alt',
  );
  assert.equal(result.settings.nickname, 'MainNick');
  assert.equal(result.settings.mode, 'offline');
  assert.deepEqual(result.settings.quickNicknames, ['MainNick']);
});

test('in-game nick commands remove an active offline nickname even if it was not in quick profiles', () => {
  const result = applyCommand({ ...DEFAULTS, nickname: 'WrongNick' }, 'remove', 'WrongNick');
  assert.equal(result.settings.nickname, 'Player');
  assert.equal(result.settings.mode, 'offline');
  assert.deepEqual(result.settings.quickNicknames, []);
});

test('in-game nick commands remove an inactive offline nickname without changing the active profile', () => {
  const result = applyCommand(
    { ...DEFAULTS, nickname: 'MainNick', quickNicknames: ['MainNick', 'WrongNick'] },
    'remove',
    'WrongNick',
  );
  assert.equal(result.settings.nickname, 'MainNick');
  assert.equal(result.settings.mode, 'offline');
  assert.deepEqual(result.settings.quickNicknames, ['MainNick']);
});

test('in-game nick commands reject invalid and unknown names but allow more than eight', () => {
  assert.throws(() => applyCommand(DEFAULTS, 'add', 'no espacios'), /3 a 16/);
  assert.throws(() => applyCommand(DEFAULTS, 'select', 'NotSaved'), /no está guardado/);
  const added = applyCommand(
    {
      ...DEFAULTS,
      quickNicknames: ['NickOne', 'NickTwo', 'NickTre', 'NickFor', 'NickFiv', 'NickSix', 'NickSev', 'NickEig'],
    },
    'add',
    'NickNine',
  );
  assert.equal(added.settings.quickNicknames.length, 9);
});

test('game account snapshot includes active nickname, mode, saved names and response', () => {
  assert.equal(
    snapshot({ ...DEFAULTS, nickname: 'PvP_Alt', quickNicknames: ['MainNick', 'PvP_Alt'] }, 'Nick guardado.'),
    'PvP_Alt\noffline\nMainNick\nPvP_Alt\n!Nick guardado.\n',
  );
  assert.equal(
    snapshot({ ...DEFAULTS, nickname: 'PvP_Alt', quickNicknames: ['MainNick', 'PvP_Alt'] }, 'Nick guardado.', [
      'PremiumAlt',
      'OtherPremium',
    ]),
    'PvP_Alt\noffline\nMainNick\nPvP_Alt\n@premium:PremiumAlt\n@premium:OtherPremium\n!Nick guardado.\n',
  );
});

test('premium accounts can be selected or removed from the in-game selector', () => {
  assert.match(applyCommand(DEFAULTS, 'premium-select', 'PremiumAlt').message, /PremiumAlt/);
  assert.match(applyCommand(DEFAULTS, 'premium-remove', 'PremiumAlt').message, /PremiumAlt/);
  assert.throws(() => applyCommand(DEFAULTS, 'premium-select', 'invalid name'), /3 a 16/);
});

test('instance profile selections persist independently of launcher defaults', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-instance-profiles-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = path.join(directory, 'first');
  const second = path.join(directory, 'second');
  fs.mkdirSync(first);
  fs.mkdirSync(second);

  const firstSelection = applyCommand(DEFAULTS, 'add', 'FirstNick').settings;
  const secondSelection = applyCommand(DEFAULTS, 'add', 'SecondNick').settings;
  writeInstanceProfile(first, firstSelection);
  writeInstanceProfile(second, secondSelection);

  assert.deepEqual(readInstanceProfile(first), { nickname: 'FirstNick', mode: 'offline' });
  assert.deepEqual(readInstanceProfile(second), { nickname: 'SecondNick', mode: 'offline' });
  assert.equal(instanceSettings(DEFAULTS, readInstanceProfile(first)).nickname, 'FirstNick');
  assert.equal(instanceSettings(DEFAULTS, readInstanceProfile(second)).nickname, 'SecondNick');
  assert.equal(DEFAULTS.nickname, 'Player');
});

test('profile snapshots contain all saved nicknames after the eighth entry', () => {
  const names = Array.from({ length: 12 }, (_, index) => `Nick${String(index + 1).padStart(2, '0')}`);
  assert.equal(
    snapshot({ ...DEFAULTS, quickNicknames: names })
      .trim()
      .split('\n').length,
    14,
  );
});
