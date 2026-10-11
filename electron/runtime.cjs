const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const runFile = require('node:util').promisify(execFile);
const { hashFile, writeDownload } = require('./files.cjs');
const { unzipSync } = require('fflate');
const FORGE_VERSION = '1.8.9-11.15.1.2318-1.8.9';
const FORGE_URL = `https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-universal.jar`;
const PLATFORM = process.platform === 'win32' ? 'windows' : 'osx';
const JAVA = {
  'osx-x64': {
    url: 'https://cdn.azul.com/zulu/bin/zulu8.96.0.205-ca-jre8.0.504-macosx_x64.tar.gz',
    sha256: '87c82660534472cf7cecb33cb30ec420fd8f863b12c1d5a2cef9970ed990d64f',
    directory: 'zulu8.96.0.205-ca-jre8.0.504-macosx_x64',
    executable: 'java',
  },
  osx: {
    url: 'https://cdn.azul.com/zulu/bin/zulu8.96.0.205-ca-jre8.0.504-macosx_aarch64.tar.gz',
    sha256: '2bf60d7d93268a4f37b3ec5e8b710ccab240e7217966e557939d4c39fc72a9cd',
    directory: 'zulu8.96.0.205-ca-jre8.0.504-macosx_aarch64',
    executable: 'java',
  },
  windows: {
    url: 'https://cdn.azul.com/zulu/bin/zulu8.96.0.205-ca-jre8.0.504-win_x64.zip',
    sha256: 'a4f32724c6d819c20372ac069fefa6e6c0319e1d79ba6ce4ee338d4c7e051a12',
    directory: 'zulu8.96.0.205-ca-jre8.0.504-win_x64',
    executable: 'javaw.exe',
  },
}[PLATFORM === 'osx' && process.arch !== 'arm64' ? 'osx-x64' : PLATFORM];
const NATIVE_FILE = PLATFORM === 'windows' ? /\.dll$/i : /\.(dylib|jnilib)$/;
const HOSTS = new Set([
  'piston-meta.mojang.com',
  'launchermeta.mojang.com',
  'piston-data.mojang.com',
  'launcher.mojang.com',
  'libraries.minecraft.net',
  'resources.download.minecraft.net',
  'maven.minecraftforge.net',
  'cdn.azul.com',
]);
function checkURL(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw Error('Origen de descarga no permitida.');
  return u.href;
}
async function fetchOK(url) {
  const res = await fetch(checkURL(url), { signal: AbortSignal.timeout(12e4), redirect: 'error' });
  if (!res.ok)
    throw Error(
      `Descarga no disponible: ${path.basename(new URL(url).pathname)} desde ${new URL(url).hostname} (HTTP ${res.status}).`,
    );
  return res;
}
async function valid(file, hash, algorithm = 'sha1') {
  if (!fs.existsSync(file)) return false;
  if (!hash) return true;
  const actual = await hashFile(file, algorithm);
  return !hash || (Array.isArray(hash) ? hash.includes(actual) : actual === hash);
}
async function download(url, file, hash, algorithm = 'sha1', emit = () => {}) {
  if (await valid(file, hash, algorithm)) return;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  if (hash && /^[a-f0-9]{40}$/.test(path.basename(file))) {
    const cached = path.join(os.homedir(), '.lunarclient/shared/assets/objects', hash.slice(0, 2), hash);
    if (await valid(cached, hash)) {
      await fsp.copyFile(cached, file);
      return;
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchOK(url);
      await writeDownload(res, file, {
        algorithm,
        expected: hash,
        progress: (bytes, total) => {
          if (total > 5e6) emit({ detail: path.basename(file), bytes, total });
        },
      });
      return;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}
async function extractNatives(nativeJars, natives, assets, platform = PLATFORM, arch = process.arch) {
  await fsp.mkdir(natives, { recursive: true });
  for (const file of nativeJars) {
    const entries = unzipSync(await fsp.readFile(file), {
      filter: (entry) => NATIVE_FILE.test(entry.name) && !/twitch/i.test(entry.name) && entry.originalSize < 2e7,
    });
    for (const [name, data] of Object.entries(entries))
      await fsp.writeFile(path.join(natives, path.basename(name)), data);
  }
  if (platform === 'osx' && arch === 'arm64') {
    const arm = path.join(assets, 'natives-arm64');
    for (const name of fs.readdirSync(arm))
      if (NATIVE_FILE.test(name)) await fsp.copyFile(path.join(arm, name), path.join(natives, name));
  }
}
function allowed(lib, platform = PLATFORM) {
  if (!lib.rules) return true;
  let ok = false;
  for (const rule of lib.rules) {
    let match = !rule.os || !rule.os.name || rule.os.name === platform;
    if (rule.os?.version) match = match && new RegExp(rule.os.version).test(os.release());
    if (rule.os?.arch) match = match && ['x86_64', 'amd64', 'x64'].includes(rule.os.arch);
    if (match) ok = rule.action === 'allow';
  }
  return ok;
}
async function extract(archive, destination) {
  if (!archive.endsWith('.zip')) {
    await runFile('/usr/bin/tar', ['-xzf', archive, '-C', destination], { timeout: 12e4 });
    return;
  }
  const root = path.resolve(destination) + path.sep;
  for (const [name, data] of Object.entries(unzipSync(await fsp.readFile(archive)))) {
    const target = path.resolve(destination, name);
    if (!target.startsWith(root)) throw Error('Archivo comprimido no válido.');
    if (name.endsWith('/')) continue;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
  }
}
async function installSplashBranding(game, assets) {
  const configFile = path.join(game, 'config/splash.properties');
  const logoFile = path.join(game, 'resources/assets/antagonhud/textures/gui/title/primarix-loading.jpg');
  const markFile = path.join(game, 'resources/assets/antagonhud/textures/gui/title/primarix-mark.png');
  const fontFile = path.join(game, 'resources/assets/minecraft/textures/font/ascii.png');
  const glyphFile = path.join(game, 'resources/assets/minecraft/font/glyph_sizes.bin');
  const values = {
    enabled: 'true',
    background: '0x08080B',
    font: '0xFFFFFF',
    barBackground: '0x111114',
    barBorder: '0xFFFFFF',
    bar: '0xD7D7DC',
    rotate: 'false',
    logoTexture: 'antagonhud:textures/gui/title/primarix-loading.jpg',
    resourcePackPath: 'resources',
    logoOffset: '0',
    forgeTexture: 'fml:textures/gui/forge.gif',
    fontTexture: 'textures/font/ascii.png',
  };
  await fsp.mkdir(path.dirname(configFile), { recursive: true });
  await fsp.mkdir(path.dirname(logoFile), { recursive: true });
  await fsp.mkdir(path.dirname(fontFile), { recursive: true });
  await fsp.mkdir(path.dirname(glyphFile), { recursive: true });
  await fsp.copyFile(path.join(assets, 'splash-loading.jpg'), logoFile);
  await fsp.copyFile(path.join(assets, 'primarix-mark.png'), markFile);
  await fsp.copyFile(
    path.join(assets, 'glassified/assets/minecraft/textures/font/ascii.png'),
    fontFile,
  );
  await fsp.copyFile(
    path.join(assets, 'glassified/assets/minecraft/textures/font/glyph_sizes.bin'),
    glyphFile,
  );
  let content = '';
  try {
    content = await fsp.readFile(configFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const found = new Set();
  const lines = content.split(/\r?\n/).map((line) => {
    const match = /^\s*([^#!\s][^=:\s]*)\s*[=:]/.exec(line);
    if (!match || !Object.hasOwn(values, match[1])) return line;
    found.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });
  for (const [key, value] of Object.entries(values)) if (!found.has(key)) lines.push(`${key}=${value}`);
  await fsp.writeFile(configFile, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}
async function installGlassResourcePack(game, assets) {
  const source = path.join(assets, 'glassified');
  const destination = path.join(game, 'resourcepacks', 'Primarix Glass');
  if (!fs.existsSync(path.join(source, 'pack.mcmeta')) || !fs.existsSync(path.join(source, 'assets'))) {
    throw Error('No se encontró el paquete de recursos Glass de Primarix.');
  }
  const copyPackDirectory = async (from, to) => {
    await fsp.mkdir(to, { recursive: true });
    for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
      const sourceEntry = path.join(from, entry.name);
      const destinationEntry = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyPackDirectory(sourceEntry, destinationEntry);
      } else if (entry.isFile()) {
        await fsp.copyFile(sourceEntry, destinationEntry);
      } else {
        throw Error(`El paquete de recursos Glass contiene una ruta no válida: ${entry.name}`);
      }
    }
  };
  await copyPackDirectory(source, destination);
  return destination;
}
function mavenPath(name) {
  const [group, artifact, version, classifier] = name.split(':');
  if (!group || !artifact || !version) throw Error('Biblioteca no válida.');
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? '-' + classifier : ''}.jar`;
}
async function pool(items, fn, count = 8) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(count, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}
function redact(line, account) {
  let s = String(line);
  if (account?.accessToken && account.accessToken !== '0') s = s.split(account.accessToken).join('[TOKEN]');
  return s.replace(/(--accessToken\s+)\S+/g, '$1[TOKEN]');
}
class Runtime {
  constructor(root, assets, emit = () => {}, gameDir = path.join(root, 'minecraft')) {
    this.root = root;
    this.assets = assets;
    this.emit = emit;
    this.game = gameDir;
    this.logFile =
      path.resolve(gameDir) === path.resolve(root, 'minecraft')
        ? path.join(root, 'logs/game.log')
        : path.join(gameDir, 'logs/game.log');
    this.child = null;
  }
  async prepare() {
    const stage = (message, percent) => this.emit({ phase: 'preparing', message, percent });
    await fsp.mkdir(this.game, { recursive: true });
    await installSplashBranding(this.game, this.assets);
    const optionsFile = path.join(this.game, 'options.txt');
    if (!fs.existsSync(optionsFile)) await fsp.writeFile(optionsFile, 'lang:es_ES\n');
    stage('Preparando Java 8', 3);
    const javaRoot = path.join(this.root, 'runtime');
    const find = (dir, depth = 0) => {
      if (depth > 6 || !fs.existsSync(dir)) return null;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name === JAVA.executable && path.basename(dir) === 'bin') return p;
        if (e.isDirectory()) {
          const result2 = find(p, depth + 1);
          if (result2) return result2;
        }
      }
      return null;
    };
    let java = find(path.join(javaRoot, JAVA.directory));
    if (!java) {
      await fsp.rm(javaRoot, { recursive: true, force: true });
      await fsp.mkdir(javaRoot, { recursive: true });
      const archive = path.join(javaRoot, path.basename(JAVA.url));
      await download(JAVA.url, archive, JAVA.sha256, 'sha256', this.emit);
      await extract(archive, javaRoot);
      await fsp.rm(archive, { force: true });
      java = find(path.join(javaRoot, JAVA.directory));
      if (!java) throw Error('No se encontró Java tras la instalación.');
    }
    stage('Verificando Minecraft 1.8.9', 12);
    const metadataFile = path.join(this.root, 'metadata/1.8.9.json');
    if (!fs.existsSync(metadataFile)) {
      const manifest = await (await fetchOK('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json();
      const entry = manifest.versions.find((v) => v.id === '1.8.9');
      if (!entry) throw Error('No se encontró Minecraft 1.8.9.');
      await download(entry.url, metadataFile, entry.sha1);
    }
    const meta = JSON.parse(await fsp.readFile(metadataFile));
    const loggingConfig = path.join(this.root, 'metadata', meta.logging.client.file.id);
    await download(meta.logging.client.file.url, loggingConfig, meta.logging.client.file.sha1);
    const client = path.join(this.game, 'versions/1.8.9/1.8.9.jar');
    await download(meta.downloads.client.url, client, meta.downloads.client.sha1);
    const forge = path.join(this.root, 'libraries/forge-universal.jar');
    const forgeHashFile = path.join(this.root, 'metadata/forge.sha1');
    if (!fs.existsSync(forgeHashFile)) {
      const text = await (await fetchOK(FORGE_URL + '.sha1')).text();
      if (!/^[a-f0-9]{40}/i.test(text.trim())) throw Error('Checksum de Forge no válido.');
      await fsp.writeFile(forgeHashFile, text.trim().slice(0, 40));
    }
    await download(FORGE_URL, forge, (await fsp.readFile(forgeHashFile, 'utf8')).trim());
    const forgeJson = JSON.parse(
      Buffer.from(
        unzipSync(await fsp.readFile(forge), { filter: (e) => e.name === 'version.json' })['version.json'],
      ).toString(),
    );
    const libs = new Map();
    for (const lib of [...meta.libraries, ...forgeJson.libraries])
      if (allowed(lib) && lib.clientreq !== false && !lib.name.startsWith('net.minecraftforge:forge:'))
        libs.set(lib.name.split(':').slice(0, 2).join(':'), lib);
    const classpath = [forge];
    const nativeJars = [];
    stage('Preparando bibliotecas del juego', 22);
    let libDone = 0;
    await pool(
      [...libs.values()],
      async (lib) => {
        const artifact = lib.downloads?.artifact;
        if (artifact || !lib.downloads) {
          const relative = artifact?.path || mavenPath(lib.name);
          const file = path.join(this.root, 'libraries', relative);
          const base = lib.url ? 'https://maven.minecraftforge.net/' : 'https://libraries.minecraft.net/';
          let hash = artifact?.sha1 || lib.checksums;
          if (lib.checksums && lib.url && !(await valid(file, hash))) {
            const checksumFile = file + '.sha1';
            if (!fs.existsSync(checksumFile)) {
              const res = await fetch(checkURL(base + relative + '.sha1'), {
                signal: AbortSignal.timeout(3e4),
                redirect: 'error',
              });
              const checksum = res.ok ? (await res.text()).trim().split(/\s/)[0] : '';
              if (checksum && !/^[a-f0-9]{40}$/i.test(checksum)) throw Error('Checksum de Maven no válido.');
              await fsp.mkdir(path.dirname(file), { recursive: true });
              await fsp.writeFile(checksumFile, checksum);
            }
            const checksum = (await fsp.readFile(checksumFile, 'utf8')).trim();
            if (checksum) hash = [...lib.checksums, checksum];
          }
          await download(artifact?.url || base + relative, file, hash);
          classpath.push(file);
        }
        if (lib.natives?.[PLATFORM]) {
          const key = lib.natives[PLATFORM].replace('${arch}', '64');
          const item = lib.downloads.classifiers[key];
          const file = path.join(this.root, 'libraries', item.path);
          await download(item.url, file, item.sha1);
          nativeJars.push(file);
        }
        stage('Bibliotecas ' + ++libDone + '/' + libs.size, 22 + (libDone / libs.size) * 20);
      },
      5,
    );
    const natives = path.join(this.game, 'natives');
    await extractNatives(nativeJars, natives, this.assets);
    const assetRoot = path.join(this.root, 'assets');
    const indexFile = path.join(assetRoot, 'indexes', meta.assetIndex.id + '.json');
    await download(meta.assetIndex.url, indexFile, meta.assetIndex.sha1);
    const index = JSON.parse(await fsp.readFile(indexFile));
    const objects = Object.entries(index.objects);
    let done = 0;
    stage('Descargando sonidos y recursos', 45);
    await pool(
      objects,
      async ([name, asset]) => {
        const rel = asset.hash.slice(0, 2) + '/' + asset.hash;
        const file = path.join(assetRoot, 'objects', rel);
        await download('https://resources.download.minecraft.net/' + rel, file, asset.hash);
        if (index.virtual) {
          const virtual = path.resolve(assetRoot, 'virtual', meta.assetIndex.id, name);
          if (!virtual.startsWith(path.resolve(assetRoot, 'virtual') + path.sep))
            throw Error('Ruta de recurso no válida.');
          await fsp.mkdir(path.dirname(virtual), { recursive: true });
          if (!fs.existsSync(virtual)) await fsp.copyFile(file, virtual);
        }
        if (++done % 20 === 0) stage('Recursos ' + done + '/' + objects.length, 45 + (done / objects.length) * 47);
      },
      10,
    );
    const modDir = path.join(this.game, 'mods');
    await fsp.mkdir(modDir, { recursive: true });
    for (const file of await fsp.readdir(modDir))
      if (/^antagon-hud-\d+\.\d+\.\d+\.jar$/.test(file) || file === 'client-core.jar')
        await fsp.rm(path.join(modDir, file));
    await fsp.copyFile(path.join(this.assets, 'client-core.bin'), path.join(modDir, 'client-core.jar'));
    const result = {
      java,
      client,
      forge,
      classpath: [...classpath, client],
      natives,
      assetRoot,
      assetIndex: meta.assetIndex.id,
      mainClass: forgeJson.mainClass,
      logArgument: meta.logging.client.argument.replace('${path}', path.join(this.game, 'logs/client.log')),
    };
    await fsp.writeFile(path.join(this.root, 'installation.json'), JSON.stringify(result, null, 2));
    stage('Listo para jugar', 100);
    return result;
  }
  async launch(settings, account, testOptions = {}) {
    if (this.child) throw Error('Esta instancia del juego ya está abierta.');
    const installation = await this.prepare();
    await installGlassResourcePack(this.game, this.assets);
    const pack = path.join(this.assets, 'Antagon Pack 8x.zip');
    if (settings.pack && fs.existsSync(pack)) {
      const dest = path.join(this.game, 'resourcepacks');
      await fsp.mkdir(dest, { recursive: true });
      await fsp.copyFile(pack, path.join(dest, 'Antagon Pack 8x.zip'));
    }
    const options = path.join(this.game, 'options.txt');
    if (!fs.existsSync(options))
      await fsp.writeFile(
        options,
        'guiScale:2\nmaxFps:240\nenableVsync:false\nrenderDistance:8\nfullscreen:false\nresourcePacks:[]\n',
      );
    let optionText = await fsp.readFile(options, 'utf8');
    optionText = updateResourcePackOptions(optionText, settings);
    optionText = optionText.replace(/^fullscreen:.*$/m, 'fullscreen:' + settings.fullscreen);
    for (const [k, v] of [
      ['useVbo', 'true'],
      ['fboEnable', 'true'],
    ])
      if (!new RegExp('^' + k + ':', 'm').test(optionText))
        optionText = optionText.trimEnd() + '\n' + k + ':' + v + '\n';
    if (testOptions.smoke || testOptions.wallpaper) {
      optionText = optionText.replace(/^pauseOnLostFocus:.*$/m, 'pauseOnLostFocus:false');
      if (!optionText.includes('pauseOnLostFocus:')) optionText += '\npauseOnLostFocus:false\n';
    }
    await fsp.writeFile(options, optionText);
    const args = [
      `-Xmx${settings.memory}G`,
      '-Xms512M',
      '-XX:+UseG1GC',
      '-Dlog4j2.formatMsgNoLookups=true',
      installation.logArgument,
      '-Djava.library.path=' + installation.natives,
      '-Dfml.ignoreInvalidMinecraftCertificates=false',
      '-cp',
      installation.classpath.join(path.delimiter),
      installation.mainClass,
      '--username',
      account.name,
      '--version',
      'Antagon-1.8.9',
      '--gameDir',
      this.game,
      '--assetsDir',
      installation.assetRoot,
      '--assetIndex',
      installation.assetIndex,
      '--uuid',
      account.id,
      '--accessToken',
      account.accessToken,
      '--userProperties',
      '{}',
      '--userType',
      account.type,
      '--tweakClass',
      'net.minecraftforge.fml.common.launcher.FMLTweaker',
      '--width',
      '1152',
      '--height',
      '720',
    ];
    if (PLATFORM === 'osx') args.unshift('-Xdock:name=Primarix Client');
    if (settings.fullscreen) args.push('--fullscreen');
    const server = /^([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?$/.exec(testOptions.server || '');
    if (server) args.push('--server', server[1], '--port', server[2] || '25565');
    if (testOptions.smoke) args.unshift('-Dantagon.smoke=true');
    if (testOptions.wallpaper) args.unshift('-Dantagon.wallpaper=' + testOptions.wallpaper);
    if (testOptions.width) {
      const i = args.indexOf('--width');
      args[i + 1] = String(testOptions.width);
      args[i + 3] = String(testOptions.height);
    }
    this.emit({ phase: 'launching', message: 'Abrindo Minecraft', percent: 100 });
    const logDir = path.dirname(this.logFile);
    await fsp.mkdir(logDir, { recursive: true });
    await fsp.rm(path.join(this.game, 'antagon-status.txt'), { force: true });
    await Promise.all([
      fsp.rm(path.join(this.game, 'antagon-players.txt'), { force: true }),
      fsp.rm(path.join(this.game, 'antagon-cosmetics.properties'), { force: true }),
      fsp.rm(path.join(this.game, 'antagon-ui-request.txt'), { force: true }),
    ]);
    await fsp.writeFile(
      path.join(this.game, 'antagon-session.properties'),
      'admin=' + (testOptions.admin === true ? 'true' : 'false') + '\n',
      { mode: 0o600 },
    );
    const file = await fsp.open(this.logFile, 'w', 0o600);
    const log = file.createWriteStream();
    const child = spawn(installation.java, args, {
      cwd: this.game,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    log.on('error', () => {
      child.kill();
      this.emit({ phase: 'error', message: 'No se pudo guardar el diagnóstico de la partida.' });
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => {
        const text = redact(data, account);
        log.write(text);
        if (text.includes('[PRIMARIX] HUD ready'))
          this.emit({ phase: 'running', message: 'En el juego', percent: 100 });
      });
    child.on('error', () => {
      this.child = null;
      log.end();
      this.emit({ phase: 'error', message: 'No se pudo iniciar Java.' });
    });
    child.on('close', (code) => {
      this.child = null;
      log.end();
      this.emit({
        phase: code ? 'error' : 'idle',
        message: code ? 'El juego se cerró con un error. Consulta el diagnóstico.' : 'Juego cerrado',
        exitCode: code,
      });
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    return { pid: child.pid };
  }
}
function parseResourcePacks(optionText) {
  return readResourcePacks(optionText) || [];
}
function readResourcePacks(optionText) {
  try {
    const line = optionText.match(/^resourcePacks:(.*)$/m);
    if (!line) return null;
    const packs = JSON.parse(line[1]);
    return Array.isArray(packs) ? packs.filter((pack) => typeof pack === 'string') : null;
  } catch {
    return null;
  }
}
function updateResourcePackOptions(optionText, settings) {
  const existing = readResourcePacks(optionText);
  let packs = existing || (Array.isArray(settings.activeResourcePacks) ? [...settings.activeResourcePacks] : []);
  packs = packs.filter((pack) => pack !== 'Antagon Pack 8x.zip');
  if (settings.pack) packs.push('Antagon Pack 8x.zip');
  packs = packs.filter((pack) => pack !== 'file/Primarix Glass');
  packs.push('file/Primarix Glass');
  const line = 'resourcePacks:' + JSON.stringify(packs);
  return /^resourcePacks:.*$/m.test(optionText)
    ? optionText.replace(/^resourcePacks:.*$/m, line)
    : optionText.trimEnd() + '\n' + line + '\n';
}
async function cloneGameProfile(source, destination) {
  await fsp.mkdir(destination, { recursive: true });
  for (const file of ['options.txt', 'optionsof.txt', 'servers.dat', 'servers.dat_old']) {
    const from = path.join(source, file);
    if (fs.existsSync(from)) await fsp.copyFile(from, path.join(destination, file));
  }
  for (const directory of ['mods', 'config', 'resourcepacks', 'resources', 'versions']) {
    const from = path.join(source, directory);
    if (fs.existsSync(from)) await fsp.cp(from, path.join(destination, directory), { recursive: true, force: true });
  }
}
module.exports = {
  Runtime,
  download,
  allowed,
  mavenPath,
  extract,
  extractNatives,
  installSplashBranding,
  installGlassResourcePack,
  offlineAccount: require('./settings.cjs').offlineAccount,
  redact,
  checkURL,
  parseResourcePacks,
  updateResourcePackOptions,
  cloneGameProfile,
};
