const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const updater = require('../electron/updater.cjs');

const digest = 'sha256:' + 'a'.repeat(64);
const asset = (name) => ({ name, digest, size: 1024, browser_download_url: `https://github.com/example/${name}` });

test('release version comparison rejects malformed tags and detects newer versions', () => {
  assert.equal(updater.newer('v0.1.39', '0.1.38'), true);
  assert.equal(updater.newer('0.1.38', '0.1.38'), false);
  assert.equal(updater.newer('release-next', '0.1.38'), false);
  assert.equal(updater.newer('0.1.39', 'unknown'), false);
});

test('Windows updates select the versioned portable executable and require a SHA-256 digest', () => {
  const release = {
    tag_name: 'v0.1.39',
    assets: [asset('Primarix-Client-Portable-0.1.39.exe')],
  };
  assert.deepEqual(updater.releaseAsset(release, 'win32', '0.1.38'), {
    version: '0.1.39',
    assetName: 'Primarix-Client-Portable-0.1.39.exe',
    format: 'portable-exe',
    url: 'https://github.com/example/Primarix-Client-Portable-0.1.39.exe',
    sha256: 'a'.repeat(64),
    size: 1024,
  });
  assert.equal(
    updater.releaseAsset({ ...release, assets: [{ ...release.assets[0], digest: null }] }, 'win32', '0.1.38'),
    null,
  );
});

test('release assets keep legacy Windows and macOS package support', () => {
  assert.equal(
    updater.releaseAsset({ tag_name: '0.1.39', assets: [asset('Antagon-Client-Windows.zip')] }, 'win32', '0.1.38')
      .format,
    'archive',
  );
  assert.equal(
    updater.releaseAsset({ tag_name: '0.1.39', assets: [asset('Antagon-Client-macOS.zip')] }, 'darwin', '0.1.38')
      .assetName,
    'Antagon-Client-macOS.zip',
  );
});

test('legacy Windows ZIPs can contain either launcher executable name', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-updater-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'old', 'Antagon Client.exe');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, '');
  assert.equal(updater.findWindowsApp(root), legacy);
});

test('known public release repository is configured by default', () => {
  assert.equal(updater.configured, true);
  assert.equal(updater.repository, 'MEDRANDAAAA/primarix-client');
});
