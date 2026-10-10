const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'assets', 'glassified');
const output = path.join(pack, 'assets', 'minecraft', 'textures', 'font');
const classes = path.join(root, 'build', 'glass-font');
const java = (name) => (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name);

if (!fs.existsSync(path.join(pack, 'pack.mcmeta')) || !fs.existsSync(path.join(pack, 'assets', 'minecraft'))) {
  throw Error('Falta el paquete de recursos Glass suministrado en assets/glassified.');
}
fs.copyFileSync(
  path.join(root, 'assets', 'PixelifySans-LICENSE.txt'),
  path.join(pack, 'PixelifySans-LICENSE.txt'),
);
fs.mkdirSync(classes, { recursive: true });
execFileSync(
  java('javac'),
  ['--release', '8', '-encoding', 'UTF-8', '-d', classes, path.join(__dirname, 'GlassFontAtlas.java')],
  { stdio: 'inherit' },
);
execFileSync(
  java('java'),
  ['-Djava.awt.headless=true', '-cp', classes, 'GlassFontAtlas', path.join(root, 'assets', 'PixelifySans.ttf'), output],
  { stdio: 'inherit' },
);
console.log('Glass resource pack prepared with the Pixelify Minecraft font.');
