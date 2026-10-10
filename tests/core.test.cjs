const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipSync } = require('fflate');
const { validateSettings, offlineAccount } = require('../electron/settings.cjs');
const {
  allowed,
  checkURL,
  extractNatives,
  mavenPath,
  redact,
  extract,
  parseResourcePacks,
  updateResourcePackOptions,
  cloneGameProfile,
} = require('../electron/runtime.cjs');
test('Minecraft instances extract native libraries into separate game directories', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-instance-natives-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'assets');
  const firstArchive = path.join(directory, 'first-natives.jar');
  const secondArchive = path.join(directory, 'second-natives.jar');
  const firstDir = path.join(directory, 'instances', 'first');
  const secondDir = path.join(directory, 'instances', 'second');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(firstArchive, zipSync({ 'natives/OpenAL64.dll': Buffer.from('first') }));
  fs.writeFileSync(secondArchive, zipSync({ 'natives/OpenAL64.dll': Buffer.from('second') }));

  await Promise.all([
    extractNatives([firstArchive], path.join(firstDir, 'natives'), assets, 'windows'),
    extractNatives([secondArchive], path.join(secondDir, 'natives'), assets, 'windows'),
  ]);

  assert.equal(fs.readFileSync(path.join(firstDir, 'natives', 'OpenAL64.dll'), 'utf8'), 'first');
  assert.equal(fs.readFileSync(path.join(secondDir, 'natives', 'OpenAL64.dll'), 'utf8'), 'second');
  assert.equal(fs.existsSync(path.join(directory, 'natives')), false);
});
test('offline UUID matches Minecraft name based UUID', () => {
  assert.equal(offlineAccount('Notch').id, 'b50ad385829d3141a2167e7d7539ba7f');
  assert.equal(offlineAccount('Notch').accessToken, '0');
  assert.equal(offlineAccount('Notch').offline, true);
});
test('invalid names cannot become command arguments', () => {
  for (const n of ['abc def', '../../abc', 'ab', 'abcdefghijklmnopq', '--accessToken'])
    assert.throws(() => offlineAccount(n));
});
test('settings accept known fields and clamp game limits', () => {
  const x = validateSettings({
    memory: 80,
    nickname: 'abc;pwd',
    javaPath: '/tmp/bad',
    fullscreen: 'yes',
    background: 'ascii',
  });
  assert.equal(x.memory, 8);
  assert.equal(x.nickname, 'Player');
  assert.equal(x.javaPath, void 0);
  assert.equal(x.fullscreen, false);
  assert.equal(x.background, 'scene');
  assert.equal(x.activeResourcePacks, null);
  assert.deepEqual(validateSettings({ activeResourcePacks: ['vanilla', 3, 'Custom.zip'] }).activeResourcePacks, [
    'vanilla',
    'Custom.zip',
  ]);
});
test('legacy default accent adopts the logo palette while custom colors persist', () => {
  assert.equal(validateSettings({ accentColor: '#E34AB5' }).accentColor, '#f49caf');
  assert.equal(validateSettings({ accentColor: '#3182ce' }).accentColor, '#3182ce');
});
test('quick offline nicknames are validated, unique and limited', () => {
  const names = validateSettings({
    quickNicknames: ['PvP_One', 'PvP_One', 'bad name', 'PvP_Two', '3'],
  }).quickNicknames;
  assert.deepEqual(names, ['PvP_One', 'PvP_Two']);
  assert.equal(
    validateSettings({
      quickNicknames: [
        'Player1',
        'Player2',
        'Player3',
        'Player4',
        'Player5',
        'Player6',
        'Player7',
        'Player8',
        'Player9',
      ],
    }).quickNicknames.length,
    8,
  );
});
test('selected resource packs persist and preserve the Primarix pack setting', () => {
  const current = 'lang:es_ES\nresourcePacks:["vanilla","Custom.zip"]\nfullscreen:false\n';
  assert.deepEqual(parseResourcePacks(current), ['vanilla', 'Custom.zip']);
  const preserved = updateResourcePackOptions(current, { activeResourcePacks: null, pack: true });
  assert.deepEqual(parseResourcePacks(preserved), [
    'vanilla',
    'Custom.zip',
    'Antagon Pack 8x.zip',
    'file/Primarix Glass',
  ]);
  const selected = updateResourcePackOptions(preserved, {
    activeResourcePacks: ['vanilla', 'Other.zip'],
    pack: false,
  });
  assert.deepEqual(parseResourcePacks(selected), ['vanilla', 'Custom.zip', 'file/Primarix Glass']);
  assert.match(selected, /fullscreen:false/);
  const restored = updateResourcePackOptions('fullscreen:false\n', {
    activeResourcePacks: ['vanilla', 'Other.zip'],
    pack: false,
  });
  assert.deepEqual(parseResourcePacks(restored), ['vanilla', 'Other.zip', 'file/Primarix Glass']);
  const deduplicated = updateResourcePackOptions(
    'resourcePacks:["file/Primarix Glass","vanilla","file/Primarix Glass"]\n',
    { pack: false },
  );
  assert.deepEqual(parseResourcePacks(deduplicated), ['vanilla', 'file/Primarix Glass']);
});
test('additional game profiles copy preferences and mods without sharing worlds or control files', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-instance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'main');
  const destination = path.join(directory, 'instance');
  fs.mkdirSync(path.join(source, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(source, 'resourcepacks'), { recursive: true });
  fs.mkdirSync(path.join(source, 'saves', 'World'), { recursive: true });
  fs.writeFileSync(path.join(source, 'options.txt'), 'resourcePacks:["vanilla"]\n');
  fs.writeFileSync(path.join(source, 'mods', 'extra.jar'), 'mod');
  fs.writeFileSync(path.join(source, 'resourcepacks', 'Custom.zip'), 'pack');
  fs.writeFileSync(path.join(source, 'saves', 'World', 'level.dat'), 'world');
  fs.writeFileSync(path.join(source, 'antagon-ui-cmd-1.txt'), 'transient');

  await cloneGameProfile(source, destination);
  assert.equal(fs.readFileSync(path.join(destination, 'options.txt'), 'utf8'), 'resourcePacks:["vanilla"]\n');
  assert.equal(fs.readFileSync(path.join(destination, 'mods', 'extra.jar'), 'utf8'), 'mod');
  assert.equal(fs.readFileSync(path.join(destination, 'resourcepacks', 'Custom.zip'), 'utf8'), 'pack');
  assert.equal(fs.existsSync(path.join(destination, 'saves')), false);
  assert.equal(fs.existsSync(path.join(destination, 'antagon-ui-cmd-1.txt')), false);
});
test('library rules honor allow and deny on macOS', () => {
  assert.equal(allowed({}, 'osx'), true);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'windows' } }] }, 'osx'), false);
  assert.equal(allowed({ rules: [{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }] }, 'osx'), false);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'osx' } }] }, 'osx'), true);
});
test('only official HTTPS download origins are permitted', () => {
  assert.equal(checkURL('https://libraries.minecraft.net/a.jar'), 'https://libraries.minecraft.net/a.jar');
  for (const u of [
    'http://libraries.minecraft.net/a.jar',
    'https://evil.test/a.jar',
    'file:///etc/passwd',
    'https://libraries.minecraft.net.evil.test/a',
  ])
    assert.throws(() => checkURL(u));
});
test('tokens are removed from logs', () => {
  const secret = 'sensitive.token.123';
  assert.equal(redact('foo ' + secret, { accessToken: secret }), 'foo [TOKEN]');
  assert.equal(redact('--accessToken abc --uuid xyz', {}), '--accessToken [TOKEN] --uuid xyz');
});
test('Maven coordinates become expected library path', () => {
  assert.equal(mavenPath('org.ow2.asm:asm-all:5.0.3'), 'org/ow2/asm/asm-all/5.0.3/asm-all-5.0.3.jar');
});
test('library rules follow the target platform', () => {
  const macOnly = { rules: [{ action: 'allow', os: { name: 'osx' } }] };
  const notMac = { rules: [{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }] };
  assert.equal(allowed(macOnly, 'osx'), true);
  assert.equal(allowed(macOnly, 'windows'), false);
  assert.equal(allowed(notMac, 'windows'), true);
  assert.equal(allowed(notMac, 'osx'), false);
});
test('zip extraction writes files and rejects paths outside the target', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const { zipSync } = require('fflate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antagon-'));
  const good = path.join(dir, 'good.zip');
  fs.writeFileSync(good, zipSync({ 'jre/bin/java.exe': new Uint8Array([1, 2]) }));
  await extract(good, path.join(dir, 'out'));
  assert.deepEqual([...fs.readFileSync(path.join(dir, 'out/jre/bin/java.exe'))], [1, 2]);
  const evil = path.join(dir, 'evil.zip');
  fs.writeFileSync(evil, zipSync({ '../escape.txt': new Uint8Array([1]) }));
  await assert.rejects(extract(evil, path.join(dir, 'out2')));
  assert.equal(fs.existsSync(path.join(dir, 'escape.txt')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('updates only move to newer versions', () => {
  const { newer } = require('../electron/updater.cjs');
  assert.equal(newer('v0.1.2', '0.1.1'), true);
  assert.equal(newer('v0.2.0', '0.1.9'), true);
  assert.equal(newer('v1.0.0', '0.9.9'), true);
  assert.equal(newer('v0.1.1', '0.1.1'), false);
  assert.equal(newer('v0.1.0', '0.1.1'), false);
  assert.equal(newer('v0.10.0', '0.9.0'), true);
});
