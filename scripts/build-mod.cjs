const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { unzipSync, zipSync } = require('fflate');
const { download } = require('../electron/runtime.cjs');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const deps = path.join(build, 'deps');
const classes = path.join(build, 'classes');
const stubs = path.join(build, 'stubs');
const source = path.join(root, 'mod-src');
const baseCore = path.join(root, 'assets/client-core-0.1.70-base.bin');
const modJar = path.join(root, 'assets/AnnthModCD-1.1.64.jar');
const output = path.join(root, 'assets/client-core.bin');
const BASE_SHA256 = '3ac6bc83106577b78d62080902383c52e282cd712370780173a1b202fcae3544';
const MOD_SHA256 = '55b2600ba2dcd27be63b3cb1891f4615879f0e4ee3ed698c14539ce4a9e0da92';
const MOD_CLASS_COUNT = 38;
const HUD_COMPAT_CLASS = 'com/rpgclient/cooldown/GuiCooldownInventory.class';
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
const java = (name) => (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name);
const javaFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javaFiles(file) : entry.name.endsWith('.java') ? [file] : [];
  });
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const isModClass = (name) => name.startsWith('com/rpgclient/') && name.endsWith('.class');
const isStudioClass = (name) => name.startsWith('studio/antagon/') && name.endsWith('.class');

async function main() {
  const classpath = [];
  for (const [url, sha1] of DEPENDENCIES) {
    const file = path.join(deps, path.basename(url));
    await download(url, file, sha1);
    classpath.push(file);
  }

  for (const directory of [classes, stubs]) fs.rmSync(directory, { recursive: true, force: true });
  execFileSync(
    java('javac'),
    [
      '--release',
      '8',
      '-Xlint:-options',
      '-encoding',
      'UTF-8',
      '-d',
      stubs,
      ...javaFiles(path.join(source, 'stubs')),
    ],
    { stdio: 'inherit' },
  );
  const originalModSource = path.join(source, 'studio/com/rpgclient');
  const studioFiles = javaFiles(path.join(source, 'studio')).filter(
    (file) => !file.startsWith(originalModSource + path.sep),
  );
  studioFiles.push(
    path.join(originalModSource, 'cooldown/CooldownVisuals.java'),
    path.join(originalModSource, 'cooldown/HudBounds.java'),
  );
  execFileSync(
    java('javac'),
    [
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
    ],
    { stdio: 'inherit' },
  );

  if (hash(baseCore) !== BASE_SHA256) throw Error('El core base v0.1.70 no coincide con el SHA-256 fijado.');
  if (hash(modJar) !== MOD_SHA256) throw Error('El JAR AnnthModCD 1.1.64 no coincide con el SHA-256 fijado.');

  const baseEntries = unzipSync(fs.readFileSync(baseCore));
  const modEntries = unzipSync(fs.readFileSync(modJar));
  const modClasses = Object.keys(modEntries).filter(isModClass);
  const studioClasses = Object.keys(baseEntries).filter(isStudioClass);
  if (modClasses.length !== MOD_CLASS_COUNT)
    throw Error(`Se esperaban ${MOD_CLASS_COUNT} clases de AnnthModCD 1.1.64; se encontraron ${modClasses.length}.`);
  if (studioClasses.length !== 23) throw Error(`El core base no contiene las 23 clases Primarix esperadas (${studioClasses.length}).`);

  const modInfo = JSON.parse(Buffer.from(baseEntries['mcmod.info']).toString('utf8'));
  const mod = modInfo.find((entry) => entry.modid === 'annthmodcd');
  if (!mod || mod.version !== '1.1.63') throw Error('El core base no contiene AnnthModCD 1.1.63 como se esperaba.');
  mod.version = '1.1.64';

  if (!baseEntries[HUD_COMPAT_CLASS] || !modEntries[HUD_COMPAT_CLASS])
    throw Error('Falta la clase HUD de compatibilidad requerida para conservar el ajuste de pantalla.');
  const outputEntries = { ...baseEntries, 'mcmod.info': Buffer.from(JSON.stringify(modInfo)) };
  for (const name of modClasses) {
    if (name !== HUD_COMPAT_CLASS) outputEntries[name] = modEntries[name];
  }
  for (const helper of [
    'com/rpgclient/cooldown/CooldownVisuals.class',
    'com/rpgclient/cooldown/HudBounds.class',
  ]) {
    if (!baseEntries[helper]) throw Error(`El core base no conserva la clase auxiliar Primarix ${helper}.`);
  }
  for (const required of [
    'com/rpgclient/CooldownMain.class',
    'com/rpgclient/cooldown/GuiHealEditor.class',
    'com/rpgclient/cooldown/HealProfile.class',
    'com/rpgclient/cooldown/HealManager.class',
  ]) {
    if (!modEntries[required]) throw Error(`El JAR 1.1.64 no contiene ${required}.`);
  }
  if (!Buffer.from(modEntries['com/rpgclient/CooldownMain.class']).includes(Buffer.from('1.1.64')))
    throw Error('La clase CooldownMain del JAR no declara AnnthModCD 1.1.64.');

  for (const [name, content] of Object.entries(baseEntries)) {
    if (name === 'mcmod.info' || isModClass(name)) continue;
    const integrated = outputEntries[name];
    if (!integrated || !Buffer.from(integrated).equals(Buffer.from(content)))
      throw Error(`La integración alteró un recurso o una clase fuera de com/rpgclient: ${name}`);
  }
  for (const name of studioClasses) {
    if (!Buffer.from(outputEntries[name]).equals(Buffer.from(baseEntries[name])))
      throw Error(`La integración alteró una clase Primarix: ${name}`);
  }
  if (!Buffer.from(outputEntries[HUD_COMPAT_CLASS]).equals(Buffer.from(baseEntries[HUD_COMPAT_CLASS])))
    throw Error('La integración alteró la variante del HUD que limita los paneles al tamaño de pantalla.');

  const archive = zipSync(outputEntries, { level: 6 });
  fs.writeFileSync(output, archive);
  console.log(
    `Primarix core built from pinned v0.1.70 base; AnnthModCD 1.1.64 overlay=${modClasses.length - 1}, ` +
      `HUD bounds compatibility retained, studio/antagon preserved=${studioClasses.length}, SHA-256=${hash(output)}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
