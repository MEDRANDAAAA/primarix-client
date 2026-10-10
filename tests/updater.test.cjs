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

test('Windows installations select the unversioned NSIS installer instead of the portable executable', () => {
  const release = {
    tag_name: 'v0.1.39',
    assets: [asset('Primarix-Client-Portable-0.1.39.exe'), asset('Primarix-Client-Setup.exe')],
  };
  assert.equal(updater.releaseAsset(release, 'win32', '0.1.38', 'installed').assetName, 'Primarix-Client-Setup.exe');
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
  assert.match(updater.windowsInstallerSwap, /El proceso auxiliar de actualización inició correctamente/);
  assert.match(
    updater.windowsInstallerSwap,
    /Start-Process -FilePath \$Installer -ArgumentList \$InstallerArguments -Wait/,
  );
  assert.match(updater.windowsInstallerSwap, /La versión instalada no coincide/);
  assert.match(updater.windowsInstallerSwap, /Start-Process -FilePath \$Target/);
  assert.match(updater.windowsInstallerSwap, /\[System\.IO\.File\]::WriteAllText\(\$ReadyFile, 'ready'\)/);
});

test('Windows NSIS updater waits for its installer and reports success', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows NSIS updater integration test.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-nsis-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, 'install-update.ps1');
  const marker = path.join(root, 'installer-ran.txt');
  const readyFile = path.join(root, 'updater-ready');
  const logFile = path.join(root, 'updater.log');
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
      '-ReadyFile',
      readyFile,
      '-LogFile',
      logFile,
      '-NoRestart',
    ],
    {
      stdio: 'pipe',
      timeout: 30_000,
      env: { ...process.env, APPDATA: root, PRIMARIX_TEST_MARKER: marker },
    },
  );

  assert.match(fs.readFileSync(marker, 'utf8'), /installed/);
  assert.equal(fs.readFileSync(readyFile, 'utf8'), 'ready');
  assert.match(fs.readFileSync(logFile, 'utf8'), /El proceso auxiliar de actualización inició correctamente/);
  assert.match(fs.readFileSync(path.join(logDirectory, 'updater.log'), 'utf8'), /Actualización instalada/);
});

test('Windows updater starts PowerShell through WScript and waits for its ready signal', async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows updater launcher integration test.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-updater-launcher-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'paths with spaces');
  fs.mkdirSync(directory);
  const script = path.join(directory, 'updater script.ps1');
  const readyFile = path.join(directory, 'updater ready');
  const doneFile = path.join(directory, 'updater done');
  const logFile = path.join(directory, 'updater log');
  const target = path.join(directory, 'Primarix Client.exe');
  fs.writeFileSync(
    script,
    '\uFEFFparam([string]$ReadyFile,[string]$DoneFile,[string]$LogFile,[string]$Target)\n' +
      'Set-Content -LiteralPath $LogFile -Value $Target\n' +
      "[System.IO.File]::WriteAllText($ReadyFile, 'ready')\n" +
      'Start-Sleep -Milliseconds 500\n' +
      "[System.IO.File]::WriteAllText($DoneFile, 'completed')\n",
    'utf8',
  );

  const updaterPath = path.join(__dirname, '..', 'electron', 'updater.cjs');
  execFileSync(
    process.execPath,
    [
      '-e',
      `const updater = require(${JSON.stringify(updaterPath)}); updater.launchWindowsUpdater(JSON.parse(process.argv[1]), process.argv[2], process.argv[3]).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });`,
      JSON.stringify([
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-ReadyFile',
        readyFile,
        '-DoneFile',
        doneFile,
        '-LogFile',
        logFile,
        '-Target',
        target,
      ]),
      readyFile,
      logFile,
    ],
    { stdio: 'pipe', timeout: 30_000 },
  );

  assert.equal(fs.readFileSync(readyFile, 'utf8'), 'ready');
  assert.equal(fs.readFileSync(logFile, 'utf8').trim(), target);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(doneFile) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(fs.readFileSync(doneFile, 'utf8'), 'completed');
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
