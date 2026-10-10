const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const { download } = require('../electron/runtime.cjs');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const deps = path.join(build, 'deps');
const classes = path.join(build, 'classes');
const stubs = path.join(build, 'stubs');
const source = path.join(root, 'mod-src');
const output = path.join(root, 'assets/client-core.bin');
const DEPENDENCIES = [
  [
    'https://maven.minecraftforge.net/net/minecraftforge/forge/1.8.9-11.15.1.2318-1.8.9/forge-1.8.9-11.15.1.2318-1.8.9-universal.jar',
    'beda619c465af293e63952dd573c137c17c0a4cd',
  ],
  [
    'https://libraries.minecraft.net/org/lwjgl/lwjgl/lwjgl/2.9.4-nightly-20150209/lwjgl-2.9.4-nightly-20150209.jar',
    '697517568c68e78ae0b4544145af031c81082dfe',
  ],
  [
    'https://libraries.minecraft.net/com/google/guava/guava/17.0/guava-17.0.jar',
    '9c6ef172e8de35fd8d4d8783e4821e57cdef7445',
  ],
  [
    'https://libraries.minecraft.net/net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar',
    '111e7bea9c968cdb3d06ef4632bf7ff0824d0f36',
  ],
  [
    'https://libraries.minecraft.net/org/ow2/asm/asm-all/5.0.3/asm-all-5.0.3.jar',
    '4333508b8dd8ee72aa4e39afa713b3a74579b773',
  ],
];
const MOD_INFO = [
  {
    modid: 'antagonhud',
    name: 'Primarix Client',
    version: '0.1.11',
    mcversion: '1.8.9',
    description: 'Cliente PvP con HUD configurable para Primarix Client.',
    authorList: ['Annth'],
    clientSideOnly: true,
  },
  {
    modid: 'annthmodcd',
    name: 'AnnthModCD',
    version: '1.1.63',
    mcversion: '1.8.9',
    description: 'Módulo original de recargas, AutoH, Abs, herramientas y HUD.',
    authorList: ['Annth'],
    clientSideOnly: true,
  },
];
const tool = (name) => (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name);
const run = (name, args) => execFileSync(tool(name), args, { stdio: 'inherit' });
const javaFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? javaFiles(file) : entry.name.endsWith('.java') ? [file] : [];
  });
const originalModSource = path.join(source, 'studio', 'com', 'rpgclient');
const studioFiles = javaFiles(path.join(source, 'studio')).filter(
  (file) => !file.startsWith(originalModSource + path.sep),
);
function findJava8() {
  const roots = [
    process.env.JAVA8_HOME,
    process.env.JAVA_HOME_8,
    process.env.JAVA_HOME,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Zulu'),
    path.join(os.homedir(), '.jdks'),
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    if (fs.existsSync(path.join(root, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'))) {
      candidates.push(root);
      continue;
    }
    if (fs.existsSync(root)) {
      for (const name of fs.readdirSync(root)) {
        if (/^(?:jdk(?:-1)?8|jdk1\.8|jdk-8|zulu-8)/i.test(name)) candidates.push(path.join(root, name));
      }
    }
  }
  for (const candidate of candidates) {
    const javac = path.join(candidate, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac');
    if (!fs.existsSync(javac)) continue;
    const version = spawnSync(javac, ['-version'], { encoding: 'utf8' });
    if (/1\.8|version 8/i.test(`${version.stdout || ''}${version.stderr || ''}`)) return candidate;
  }
  throw Error('Para integrar AnnthModCD hace falta un JDK 8. Define JAVA8_HOME con la ruta del JDK 8.');
}
function findGradle() {
  const binary = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
  const candidates = [
    process.env.GRADLE_HOME && path.join(process.env.GRADLE_HOME, 'bin', binary),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Gradle', 'gradle-2.14.1', 'bin', 'gradle.bat'),
    ...String(process.env.PATH || '')
      .split(path.delimiter)
      .map((directory) => path.join(directory, binary)),
  ].filter(Boolean);
  const gradle = candidates.find((candidate) => fs.existsSync(candidate));
  if (!gradle) throw Error('Para reobfuscar AnnthModCD hace falta Gradle 2.14.1. Define GRADLE_HOME con su carpeta.');
  return gradle;
}
function buildOriginalMod() {
  const projectDir = path.join(build, 'annthmodcd-forge');
  fs.rmSync(projectDir, { recursive: true, force: true });
  const javaSource = path.join(projectDir, 'src', 'main', 'java', 'com', 'rpgclient');
  fs.mkdirSync(javaSource, { recursive: true });
  fs.cpSync(originalModSource, javaSource, { recursive: true });
  fs.cpSync(path.join(source, 'forge-build'), projectDir, { recursive: true });
  const gradle = findGradle();
  const javaHome = findJava8();
  const gradleEnv = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: path.join(javaHome, 'bin') + path.delimiter + process.env.PATH,
  };
  const args = ['--no-daemon', 'reobfJar'];
  if (process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(gradle)) {
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${gradle}" ${args.join(' ')}"`], {
      cwd: projectDir,
      env: gradleEnv,
      stdio: 'inherit',
      windowsVerbatimArguments: true,
    });
  } else {
    execFileSync(gradle, args, { cwd: projectDir, env: gradleEnv, stdio: 'inherit' });
  }
  const archive = path.join(projectDir, 'build', 'libs', 'AnnthModCD-1.1.63.jar');
  if (!fs.existsSync(archive)) throw Error('ForgeGradle no generó el JAR original AnnthModCD 1.1.63.');
  const entries = unzipSync(fs.readFileSync(archive));
  let copied = 0;
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith('com/rpgclient/') || !name.endsWith('.class')) continue;
    const target = path.join(classes, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    copied++;
  }
  if (copied < 30 || !fs.existsSync(path.join(classes, 'com', 'rpgclient', 'CooldownMain.class')))
    throw Error('El JAR original AnnthModCD no contiene todas sus clases reobfuscadas.');
  console.log(`AnnthModCD 1.1.63 integrated from original source (${copied} classes).`);
}
async function main() {
  const classpath = [];
  for (const [url, sha1] of DEPENDENCIES) {
    const file = path.join(deps, path.basename(url));
    await download(url, file, sha1);
    classpath.push(file);
  }
  for (const dir of [classes, stubs]) fs.rmSync(dir, { recursive: true, force: true });
  run('javac', [
    '--release',
    '8',
    '-Xlint:-options',
    '-encoding',
    'UTF-8',
    '-d',
    stubs,
    ...javaFiles(path.join(source, 'stubs')),
  ]);
  run('javac', [
    '--release',
    '8',
    '-Xlint:-options',
    '-encoding',
    'UTF-8',
    '-cp',
    [...classpath, stubs].join(path.delimiter),
    '-d',
    classes,
    ...studioFiles,
  ]);
  buildOriginalMod();
  const resources = path.join(classes, 'assets/antagon');
  fs.mkdirSync(resources, { recursive: true });
  fs.cpSync(path.join(source, 'resources'), classes, { recursive: true });
  const gifExtractor = path.join(build, 'gif-extractor');
  fs.rmSync(gifExtractor, { recursive: true, force: true });
  fs.mkdirSync(gifExtractor, { recursive: true });
  run('javac', [
    '--release',
    '8',
    '-encoding',
    'UTF-8',
    '-d',
    gifExtractor,
    path.join(__dirname, 'GifFrameExtractor.java'),
  ]);
  run('java', [
    '-cp',
    gifExtractor,
    'GifFrameExtractor',
    path.join(root, 'assets/menu-background.gif'),
    path.join(resources, 'menu-frames'),
  ]);
  console.log('Animated Minecraft menu GIF extracted into Forge textures.');
  const splashLogo = path.join(classes, 'assets/antagonhud/textures/gui/title/primarix.png');
  fs.mkdirSync(path.dirname(splashLogo), { recursive: true });
  fs.copyFileSync(path.join(root, 'assets/splash-primarix.png'), splashLogo);
  fs.copyFileSync(
    path.join(root, 'assets/primarix-mark.png'),
    path.join(classes, 'assets/antagonhud/textures/gui/title/primarix-mark.png'),
  );
  fs.copyFileSync(path.join(root, 'assets/PixelifySans.ttf'), path.join(resources, 'PixelifySans.ttf'));
  fs.copyFileSync(path.join(root, 'assets/PixelifySans-LICENSE.txt'), path.join(resources, 'FONT-LICENSE.txt'));
  fs.writeFileSync(path.join(classes, 'mcmod.info'), JSON.stringify(MOD_INFO));
  const manifest = path.join(build, 'MANIFEST.MF');
  fs.writeFileSync(manifest, 'FMLCorePlugin: studio.antagon.core.AntagonCore\nFMLCorePluginContainsFMLMod: true\n');
  run('jar', ['cfm', output, manifest, '-C', classes, '.']);
  fs.rmSync(path.join(root, 'assets/antagon-hud-0.1.7.jar'), { force: true });
  console.log('Primarix Client built:', path.relative(root, output));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
