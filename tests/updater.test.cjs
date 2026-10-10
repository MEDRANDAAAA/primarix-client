const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
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

test('Windows installations select the versioned NSIS installer instead of the portable executable', () => {
  const release = {
    tag_name: 'v0.1.39',
    assets: [asset('Primarix-Client-Portable-0.1.39.exe'), asset('Primarix-Client-Setup-0.1.39.exe')],
  };
  assert.equal(
    updater.releaseAsset(release, 'win32', '0.1.38', 'installed').assetName,
    'Primarix-Client-Setup-0.1.39.exe',
  );
  assert.equal(
    updater.releaseAsset(release, 'win32', '0.1.38', 'portable').assetName,
    'Primarix-Client-Portable-0.1.39.exe',
  );
  assert.equal(
    updater.releaseAsset({ ...release, assets: [release.assets[1]] }, 'win32', '0.1.38', 'installed').format,
    'nsis-installer',
  );
});

test('NSIS updater waits for the running launcher and verifies the installed version before restart', () => {
  assert.match(updater.windowsInstallerSwap, /WaitForExit\(300000\)/);
  assert.match(
    updater.windowsInstallerSwap,
    /Start-Process -FilePath \$Installer -ArgumentList \$InstallerArguments -Wait/,
  );
  assert.match(updater.windowsInstallerSwap, /La versión instalada no coincide/);
  assert.match(updater.windowsInstallerSwap, /Start-Process -FilePath \$Target/);
});

test('Windows NSIS updater waits for its installer and reports success', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows NSIS updater integration test.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-nsis-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, 'install-update.ps1');
  const marker = path.join(root, 'installer-ran.txt');
  const logDirectory = path.join(root, 'Primarix Client', 'logs');
  fs.writeFileSync(script, `\uFEFF${updater.windowsInstallerSwap}`, 'utf8');

  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-ProcessId',
      '2147483647',
      '-Installer',
      process.env.ComSpec || 'cmd.exe',
      '-InstallerArguments',
      '/d /c echo installed > "%PRIMARIX_TEST_MARKER%"',
      '-Target',
      process.execPath,
      '-Version',
      '',
      '-NoRestart',
    ],
    {
      stdio: 'pipe',
      timeout: 30_000,
      env: { ...process.env, APPDATA: root, PRIMARIX_TEST_MARKER: marker },
    },
  );

  assert.match(fs.readFileSync(marker, 'utf8'), /installed/);
  assert.match(fs.readFileSync(path.join(logDirectory, 'updater.log'), 'utf8'), /Actualización instalada/);
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

test('Windows portable swap waits for the portable host and file access before replacing the executable', async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows portable updater integration test.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-portable-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, 'swap.ps1');
  const lockScript = path.join(root, 'hold-lock.ps1');
  const source = path.join(root, 'new portable.exe');
  const target = path.join(root, 'Primarix Client.exe');
  const logDirectory = path.join(root, 'Primarix Client', 'logs');
  fs.writeFileSync(script, `\uFEFF${updater.windowsPortableSwap}`, 'utf8');
  fs.writeFileSync(
    lockScript,
    `\uFEFFparam([string]$Target)\n$file = [System.IO.File]::Open($Target, 'Open', 'ReadWrite', 'None')\nStart-Sleep -Seconds 2\n$file.Dispose()\n`,
    'utf8',
  );
  fs.writeFileSync(source, 'updated executable');
  fs.writeFileSync(target, 'old executable');
  const locker = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', lockScript, '-Target', target],
    { stdio: 'ignore', windowsHide: true },
  );
  await new Promise((resolve, reject) => {
    locker.once('error', reject);
    locker.once('spawn', resolve);
  });
  const started = Date.now();

  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-ProcessId',
      '2147483647',
      '-ParentProcessId',
      String(locker.pid),
      '-Source',
      source,
      '-Target',
      target,
      '-Version',
      '',
      '-NoRestart',
    ],
    { stdio: 'pipe', timeout: 30_000, env: { ...process.env, APPDATA: root } },
  );
  await new Promise((resolve, reject) => {
    locker.once('error', reject);
    locker.once('exit', resolve);
  });

  assert.ok(Date.now() - started >= 1_000, 'the updater should wait while the portable executable is locked');
  assert.equal(fs.readFileSync(target, 'utf8'), 'updated executable');
  assert.match(fs.readFileSync(path.join(logDirectory, 'updater.log'), 'utf8'), /Actualización instalada/);
  assert.equal(fs.existsSync(`${target}.update`), false);
});
