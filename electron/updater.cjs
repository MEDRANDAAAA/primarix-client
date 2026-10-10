const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const runFile = require('node:util').promisify(execFile);
const { writeDownload } = require('./files.cjs');
const { extract } = require('./runtime.cjs');

const REPO = process.env.PRIMARIX_RELEASE_REPO || 'MEDRANDAAAA/primarix-client';
const HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

const MAC_SWAP = `while kill -0 "$1" 2>/dev/null; do sleep 0.3; done
rm -rf "$2.old"
if mv "$2" "$2.old" && mv "$3" "$2"; then rm -rf "$2.old"; else [ -d "$2" ] || mv "$2.old" "$2"; fi
open "$2"
`;

const WINDOWS_SWAP = `@echo off
set "PID=%~1"
set "SOURCE=%~2"
set "TARGET=%~3"
set "EXECUTABLE=%~4"
set /a n=0
:wait
set /a n+=1
if %n% gtr 600 exit /b 1
tasklist /FI "PID eq %PID%" /NH 2>nul | find "%PID%" >nul && goto sleep
goto swap
:sleep
ping -n 2 127.0.0.1 >nul
goto wait
:swap
robocopy "%SOURCE%" "%TARGET%" /E /R:3 /W:1 /NP /NFL /NDL >nul
if errorlevel 8 exit /b 1
start "" "%EXECUTABLE%"
`;

const WINDOWS_PORTABLE_SWAP = `param([int]$ProcessId, [string]$Source, [string]$Target, [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$temporary = "$Target.update"
$backup = "$Target.previous.$([guid]::NewGuid().ToString('N'))"
$logFile = "$Target.update.log"
function Write-UpdateLog([string]$Message) {
  Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}
try {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process -and -not $process.WaitForExit(300000)) { throw 'Primarix no se cerró a tiempo.' }
  Copy-Item -LiteralPath $Source -Destination $temporary -Force
  $deadline = [DateTime]::UtcNow.AddMinutes(2)
  while ($true) {
    try {
      $file = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $file.Dispose()
      break
    } catch [System.IO.IOException] {
      if ([DateTime]::UtcNow -ge $deadline) { throw 'El ejecutable portable sigue en uso; se canceló el reemplazo.' }
      Start-Sleep -Milliseconds 500
    }
  }
  Move-Item -LiteralPath $Target -Destination $backup -Force
  try {
    Move-Item -LiteralPath $temporary -Destination $Target -Force
  } catch {
    Move-Item -LiteralPath $backup -Destination $Target -Force
    throw
  }
  if (-not $NoRestart) { Start-Process -FilePath $Target }
  Remove-Item -LiteralPath $backup -Force
  Write-UpdateLog 'Actualización instalada y Primarix reiniciado.'
} catch {
  Write-UpdateLog "Error al actualizar: $($_.Exception.Message)"
  if (Test-Path -LiteralPath $backup) {
    Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $backup -Destination $Target -Force
  }
  if (-not $NoRestart -and (Test-Path -LiteralPath $Target)) {
    try { Start-Process -FilePath $Target } catch { Write-UpdateLog "No se pudo reabrir la versión anterior: $($_.Exception.Message)" }
  }
  exit 1
} finally {
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
}
`;

const ASSET_NAMES = {
  win32: ['Primarix-Client-Portable-{version}.exe', 'Antagon-Client-Windows.zip', 'Primarix-Launcher-Windows.zip'],
  darwin: ['Antagon-Client-macOS.zip', 'Primarix-Launcher-macOS.zip'],
};

function validVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || '').replace(/^v/, ''));
}

function newer(latest, current) {
  if (!validVersion(latest) || !validVersion(current)) return false;
  const a = latest.replace(/^v/, '').split('.').map(Number);
  const b = current.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

function releaseAsset(release, platform, current) {
  if (!newer(release.tag_name, current)) return null;
  const version = release.tag_name.replace(/^v/, '');
  const names = (ASSET_NAMES[platform] || []).map((name) => name.replace('{version}', version));
  const asset = names.map((name) => release.assets?.find((item) => item.name === name)).find(Boolean);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) return null;
  return {
    version,
    assetName: asset.name,
    format: asset.name.endsWith('.exe') ? 'portable-exe' : 'archive',
    url: asset.browser_download_url,
    sha256: asset.digest.slice(7),
    size: asset.size,
  };
}

async function check(current, platform = process.platform) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(1e4),
  });
  if (!res.ok) throw Error('GitHub indisponível.');
  const release = await res.json();
  return releaseAsset(release, platform, current);
}

async function download(update, file, progress) {
  const res = await fetch(update.url, { signal: AbortSignal.timeout(6e5) });
  if (!res.ok || !HOSTS.has(new URL(res.url).hostname)) throw Error('Não foi possível baixar a atualização.');
  await writeDownload(res, file, {
    algorithm: 'sha256',
    expected: update.sha256,
    progress: (bytes) => progress(Math.min(100, Math.round((bytes / update.size) * 100))),
  });
}

function launchDetached(command, args, options) {
  const child = spawn(command, args, options);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function install(update, progress) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'antagon-update-'));
  const archive = path.join(dir, update.assetName);
  const unpacked = path.join(dir, 'new');
  await download(update, archive, progress);
  const script = path.join(dir, process.platform === 'win32' ? 'swap.cmd' : 'swap.sh');

  if (process.platform === 'win32' && update.format === 'portable-exe') {
    const target = process.env.PORTABLE_EXECUTABLE_FILE;
    if (!target || !fs.existsSync(target))
      throw Error('No se encontró el .exe portable que debe actualizarse. Abre Primarix desde su archivo original.');
    const portableSwap = path.join(dir, 'swap.ps1');
    await fsp.writeFile(portableSwap, `\uFEFF${WINDOWS_PORTABLE_SWAP}`, 'utf8');
    const args = [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      portableSwap,
      '-ProcessId',
      String(process.pid),
      '-Source',
      archive,
      '-Target',
      target,
    ];
    await launchDetached('powershell.exe', args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  } else if (process.platform === 'win32') {
    await fsp.mkdir(unpacked);
    await extract(archive, unpacked);
    const fresh = findWindowsApp(unpacked);
    if (!fresh) throw Error('Actualización inválida: no contiene Primarix Client.exe.');
    await fsp.writeFile(script, WINDOWS_SWAP.replaceAll('\n', '\r\n'));
    const args = [script, String(process.pid), path.dirname(fresh), path.dirname(process.execPath), process.execPath];
    await launchDetached(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `"${args.map((a) => `"${a}"`).join(' ')}"`],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    );
  } else {
    await fsp.mkdir(unpacked);
    await runFile('/usr/bin/ditto', ['-x', '-k', archive, unpacked]);
    const fresh = path.join(unpacked, 'Antagon Client.app');
    if (!fs.existsSync(fresh)) throw Error('Actualización inválida.');
    await fsp.writeFile(script, MAC_SWAP);
    const bundle = path.resolve(process.execPath, '../../..');
    spawn('/bin/bash', [script, String(process.pid), bundle, fresh], { detached: true, stdio: 'ignore' }).unref();
  }
}

function findWindowsApp(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isFile() && ['primarix client.exe', 'antagon client.exe'].includes(entry.name.toLowerCase())) return file;
    if (entry.isDirectory()) {
      const found = findWindowsApp(file);
      if (found) return found;
    }
  }
  return null;
}

module.exports = {
  check,
  install,
  newer,
  releaseAsset,
  findWindowsApp,
  windowsPortableSwap: WINDOWS_PORTABLE_SWAP,
  repository: REPO,
  configured: !!REPO,
};
