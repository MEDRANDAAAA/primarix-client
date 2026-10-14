const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unzipSync, zipSync } = require('fflate');
const { importResourcePack, listInstalledResourcePacks } = require('../electron/resourcepacks.cjs');

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-resourcepacks-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'Pack.zip');
  const destination = path.join(directory, 'resourcepacks');
  return { directory, source, destination };
}

function packFiles(prefix = '') {
  return {
    [`${prefix}pack.mcmeta`]: Buffer.from(JSON.stringify({ pack: { pack_format: 1, description: 'Mi paquete' } })),
    [`${prefix}assets/minecraft/textures/blocks/test.png`]: Buffer.from([1, 2, 3]),
  };
}

test('installs a valid ZIP in the isolated resourcepacks folder', async (t) => {
  const { source, destination } = await fixture(t);
  fs.writeFileSync(source, zipSync(packFiles()));
  const result = await importResourcePack(source, destination);
  assert.equal(result.name, 'Mi paquete');
  assert.equal(result.path, path.join(destination, 'Pack.zip'));
  const installed = unzipSync(fs.readFileSync(result.path));
  assert.ok(installed['pack.mcmeta']);
  assert.ok(installed['assets/minecraft/textures/blocks/test.png']);
});

test('imports and preserves a UTF-8 BOM resource pack', async (t) => {
  const { source, destination } = await fixture(t);
  const metadata = JSON.stringify({ pack: { pack_format: 1, description: 'Evelyn 16x' } });
  fs.writeFileSync(
    source,
    zipSync({
      ...packFiles(),
      'pack.mcmeta': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(metadata)]),
    }),
  );

  const result = await importResourcePack(source, destination);
  assert.equal(result.name, 'Evelyn 16x');
  const installed = unzipSync(fs.readFileSync(result.path));
  assert.equal(installed['pack.mcmeta'][0], 0xef);
  assert.equal(installed['pack.mcmeta'][1], 0xbb);
  assert.equal(installed['pack.mcmeta'][2], 0xbf);
  assert.equal(
    JSON.parse(
      Buffer.from(installed['pack.mcmeta'])
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    ).pack.description,
    'Evelyn 16x',
  );
  const [listed] = await listInstalledResourcePacks(destination);
  assert.equal(listed.valid, true);
  assert.equal(listed.name, 'Evelyn 16x');
});

test('lists installed packages with metadata, icon and incompatible ZIPs', async (t) => {
  const { source, destination } = await fixture(t);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(
    path.join(destination, 'Pack.zip'),
    zipSync({
      ...packFiles(),
      'pack.mcmeta': Buffer.from(
        JSON.stringify({ pack: { pack_format: 1, description: { text: 'Mi ', extra: [{ text: 'paquete' }] } } }),
      ),
      'pack.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    }),
  );
  fs.writeFileSync(path.join(destination, 'Invalid.zip'), zipSync({ 'pack.mcmeta': Buffer.from('{}') }));
  fs.writeFileSync(path.join(destination, 'not-a-pack.txt'), 'ignored');
  const packs = await listInstalledResourcePacks(destination);
  assert.equal(packs.length, 2);
  const valid = packs.find((pack) => pack.fileName === 'Pack.zip');
  assert.equal(valid.name, 'Mi paquete');
  assert.equal(valid.description, 'Mi paquete');
  assert.equal(valid.valid, true);
  assert.match(valid.icon, /^data:image\/png;base64,/);
  const invalid = packs.find((pack) => pack.fileName === 'Invalid.zip');
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /pack_format 1/);
});

test('lists an installed resource pack whose metadata starts with a UTF-8 BOM', async (t) => {
  const { destination } = await fixture(t);
  const metadata = JSON.stringify({ pack: { pack_format: 1, description: 'Evelyn 16x' } });
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(
    path.join(destination, 'Evelyn 16x.zip'),
    zipSync({
      'pack.mcmeta': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(metadata)]),
      'assets/minecraft/test.txt': Buffer.from('ok'),
    }),
  );

  const [pack] = await listInstalledResourcePacks(destination);
  assert.equal(pack.valid, true);
  assert.equal(pack.name, 'Evelyn 16x');
  assert.equal(pack.error, '');
});

test('normalizes a package nested inside a folder and never overwrites an existing ZIP', async (t) => {
  const { source, destination } = await fixture(t);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'Pack.zip'), 'keep me');
  fs.writeFileSync(source, zipSync({ ...packFiles('wrapper/'), 'outside.txt': Buffer.from('ignored') }));
  const result = await importResourcePack(source, destination);
  assert.equal(result.fileName, 'Pack (2).zip');
  assert.equal(fs.readFileSync(path.join(destination, 'Pack.zip'), 'utf8'), 'keep me');
  const installed = unzipSync(fs.readFileSync(result.path));
  assert.ok(installed['pack.mcmeta']);
  assert.ok(installed['assets/minecraft/textures/blocks/test.png']);
  assert.equal(installed['wrapper/pack.mcmeta'], undefined);
  assert.equal(installed['outside.txt'], undefined);
});

test('rejects RAR with a Minecraft 1.8.9 explanation', async (t) => {
  const { directory, destination } = await fixture(t);
  const rar = path.join(directory, 'Pack.rar');
  fs.writeFileSync(rar, 'not extracted');
  await assert.rejects(importResourcePack(rar, destination), /Minecraft 1\.8\.9 no admite archivos RAR/);
  assert.equal(fs.existsSync(destination), false);
});

test('rejects corrupt ZIP files and ZIPs without a 1.8.9 pack.mcmeta', async (t) => {
  const { source, destination } = await fixture(t);
  fs.writeFileSync(source, 'corrupt');
  await assert.rejects(importResourcePack(source, destination), /corrupto o incompleto/);
  fs.writeFileSync(source, zipSync({ 'pack.mcmeta': Buffer.from('{"pack":{"pack_format":2}}') }));
  await assert.rejects(importResourcePack(source, destination), /pack_format 1/);
  assert.equal(fs.existsSync(destination), false);
});

test('rejects path traversal and symbolic links from ZIPs', async (t) => {
  const { directory, source, destination } = await fixture(t);
  fs.writeFileSync(source, zipSync({ ...packFiles(), '../escape.txt': Buffer.from('no') }));
  await assert.rejects(importResourcePack(source, destination), /sale de su carpeta/);
  assert.equal(fs.existsSync(path.join(directory, 'escape.txt')), false);

  const symbolic = Buffer.from(zipSync({ ...packFiles(), link: Buffer.from('target') }));
  for (let offset = 0; offset <= symbolic.length - 46; offset++) {
    if (symbolic.readUInt32LE(offset) === 0x02014b50) {
      const nameLength = symbolic.readUInt16LE(offset + 28);
      const name = symbolic.toString('utf8', offset + 46, offset + 46 + nameLength);
      if (name === 'link') symbolic.writeUInt32LE(0xa1ff0000, offset + 38);
    }
  }
  fs.writeFileSync(source, symbolic);
  await assert.rejects(importResourcePack(source, destination), /enlace simbólico/);
  assert.equal(fs.existsSync(destination), false);
});
