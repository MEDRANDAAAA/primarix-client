const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installSplashBranding, installGlassResourcePack } = require('../electron/runtime.cjs');

test('Forge splash uses Primarix branding and preserves unrelated settings', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'primarix-splash-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'minecraft');
  const assets = path.join(root, 'assets');
  const config = path.join(game, 'config/splash.properties');
  const logo = path.join(game, 'resources/assets/antagonhud/textures/gui/title/primarix-loading.jpg');
  const mark = path.join(game, 'resources/assets/antagonhud/textures/gui/title/primarix-mark.png');
  const font = path.join(game, 'resources/assets/minecraft/textures/font/ascii.png');
  const glyphs = path.join(game, 'resources/assets/minecraft/font/glyph_sizes.bin');
  const sourceFont = path.join(assets, 'glassified/assets/minecraft/textures/font');
  await fs.mkdir(path.dirname(config), { recursive: true });
  await fs.mkdir(assets, { recursive: true });
  await fs.mkdir(sourceFont, { recursive: true });
  await fs.writeFile(config, '# Preserve Forge comments\nmemory=true\nbackground=0xFFFFFF\n');
  await fs.writeFile(path.join(assets, 'splash-loading.jpg'), Buffer.from('primarix-loading-art'));
  await fs.writeFile(path.join(assets, 'primarix-mark.png'), Buffer.from('primarix-pixel-mark'));
  await fs.writeFile(path.join(sourceFont, 'ascii.png'), Buffer.from('pixelify-ascii'));
  await fs.writeFile(path.join(sourceFont, 'glyph_sizes.bin'), Buffer.from('pixelify-glyph-sizes'));

  await installSplashBranding(game, assets);

  const properties = await fs.readFile(config, 'utf8');
  assert.match(properties, /^# Preserve Forge comments$/m);
  assert.match(properties, /^memory=true$/m);
  assert.match(properties, /^enabled=true$/m);
  assert.match(properties, /^background=0x08080B$/m);
  assert.match(properties, /^barBackground=0x111114$/m);
  assert.match(properties, /^barBorder=0xFFFFFF$/m);
  assert.match(properties, /^bar=0xD7D7DC$/m);
  assert.match(properties, /^fontTexture=textures\/font\/ascii\.png$/m);
  assert.match(properties, /^logoTexture=antagonhud:textures\/gui\/title\/primarix-loading\.jpg$/m);
  assert.equal(await fs.readFile(logo, 'utf8'), 'primarix-loading-art');
  assert.equal(await fs.readFile(mark, 'utf8'), 'primarix-pixel-mark');
  assert.equal(await fs.readFile(font, 'utf8'), 'pixelify-ascii');
  assert.equal(await fs.readFile(glyphs, 'utf8'), 'pixelify-glyph-sizes');

  await installSplashBranding(game, assets);
  assert.equal((await fs.readFile(config, 'utf8')).match(/^logoTexture=/gm).length, 1);
});

test('Glass resource pack is installed into the Minecraft resourcepacks directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'primarix-glass-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'minecraft');
  const assets = path.join(root, 'assets');
  const source = path.join(assets, 'glassified');
  await fs.mkdir(path.join(source, 'assets/minecraft/textures/gui'), { recursive: true });
  await fs.mkdir(path.join(source, 'assets/minecraft/textures/font'), { recursive: true });
  await fs.writeFile(path.join(source, 'pack.mcmeta'), '{"pack":{"pack_format":1}}');
  await fs.writeFile(path.join(source, 'assets/minecraft/textures/gui/widgets.png'), 'glass');
  await fs.writeFile(path.join(source, 'assets/minecraft/textures/font/ascii.png'), 'pixel-font');
  await fs.writeFile(path.join(source, 'assets/minecraft/textures/font/glyph_sizes.bin'), 'pixel-metrics');

  const installed = await installGlassResourcePack(game, assets);

  assert.equal(path.basename(installed), 'Primarix Glass');
  assert.equal(await fs.readFile(path.join(installed, 'assets/minecraft/textures/gui/widgets.png'), 'utf8'), 'glass');
  assert.equal(
    await fs.readFile(path.join(installed, 'assets/minecraft/textures/font/ascii.png'), 'utf8'),
    'pixel-font',
  );
  assert.equal(
    await fs.readFile(path.join(installed, 'assets/minecraft/textures/font/glyph_sizes.bin'), 'utf8'),
    'pixel-metrics',
  );
});
