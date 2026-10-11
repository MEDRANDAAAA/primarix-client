const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedLauncherView } = require('../electron/launcher-views.cjs');

test('game menu requests can open the launcher voice view', () => {
  assert.equal(isAllowedLauncherView('voice'), true);
  assert.equal(isAllowedLauncherView('settings'), true);
  assert.equal(isAllowedLauncherView('friends'), true);
  assert.equal(isAllowedLauncherView('admin'), true);
  assert.equal(isAllowedLauncherView('accounts'), false);
  assert.equal(isAllowedLauncherView('../voice'), false);
});
