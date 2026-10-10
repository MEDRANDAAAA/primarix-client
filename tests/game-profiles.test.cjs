const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../electron/settings.cjs');
const { applyCommand, snapshot } = require('../electron/game-profiles.cjs');

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

test('in-game nick commands reject invalid, unknown and excess names', () => {
  assert.throws(() => applyCommand(DEFAULTS, 'add', 'no espacios'), /3 a 16/);
  assert.throws(() => applyCommand(DEFAULTS, 'select', 'NotSaved'), /no está guardado/);
  assert.throws(
    () =>
      applyCommand(
        {
          ...DEFAULTS,
          quickNicknames: ['NickOne', 'NickTwo', 'NickTre', 'NickFor', 'NickFiv', 'NickSix', 'NickSev', 'NickEig'],
        },
        'add',
        'NickNine',
      ),
    /máximo de 8/,
  );
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
