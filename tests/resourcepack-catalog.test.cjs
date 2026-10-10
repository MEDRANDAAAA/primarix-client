const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipSync, unzipSync } = require('fflate');
const {
  downloadResourcePack,
  getResourcePackDetails,
  searchResourcePacks,
  PAGE_SIZE,
  MAX_RESULTS,
  MAX_OFFSET,
} = require('../electron/resourcepack-catalog.cjs');

function mockFetch(t, handler) {
  const original = global.fetch;
  global.fetch = handler;
  t.after(() => {
    global.fetch = original;
  });
}

function compatibleVersion(url = 'https://cdn.modrinth.com/data/project/version/pack.zip', bytes = Buffer.from('zip')) {
  return [
    {
      id: 'version',
      version_number: '1.0.0',
      game_versions: ['1.8.9'],
      files: [
        {
          filename: 'pack.zip',
          url,
          primary: true,
          size: bytes.length,
          hashes: { sha1: crypto.createHash('sha1').update(bytes).digest('hex') },
        },
      ],
    },
  ];
}

test('search filters to 1.8.9 resource packs and sanitizes catalog fields', async (t) => {
  mockFetch(t, async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /PrimarixLauncher/);
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/v2/search');
    assert.equal(Number(parsed.searchParams.get('limit')), PAGE_SIZE);
    assert.deepEqual(JSON.parse(parsed.searchParams.get('facets')), [
      ['project_type:resourcepack'],
      ['versions:1.8.9'],
    ]);
    return Response.json({
      total_hits: 1,
      hits: [
        {
          project_id: 'abc123',
          slug: 'sample-pack',
          title: 'Sample Pack',
          description: 'Compatible pack',
          downloads: 42,
          license: 'CC-BY-4.0',
          categories: ['16x', 'pvp'],
          icon_url: 'https://cdn.modrinth.com/data/abc/icon.png',
        },
      ],
    });
  });
  const result = await searchResourcePacks({ query: ' PvP ', sort: 'downloads', offset: 24 });
  assert.equal(result.total, 1);
  assert.equal(result.offset, 24);
  assert.equal(result.limit, PAGE_SIZE);
  assert.equal(result.maxResults, MAX_RESULTS);
  assert.equal(result.hits[0].title, 'Sample Pack');
  assert.equal(result.hits[0].icon, 'https://cdn.modrinth.com/data/abc/icon.png');
  assert.equal(result.hits[0].projectUrl, 'https://modrinth.com/resourcepack/sample-pack');
});

test('catalog pages include 100 packs and remain capped at the first 10,000 results', async (t) => {
  mockFetch(t, async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('limit'), '100');
    assert.equal(parsed.searchParams.get('offset'), String(MAX_OFFSET));
    return Response.json({ total_hits: 12000, hits: [] });
  });
  const result = await searchResourcePacks({ offset: 12000 });
  assert.equal(PAGE_SIZE, 100);
  assert.equal(MAX_RESULTS, 10000);
  assert.equal(result.offset, MAX_OFFSET);
  assert.equal(result.maxResults, 10000);
});

test('loads project details and safe gallery images for compatible resource packs', async (t) => {
  mockFetch(t, async (url) => {
    if (String(url).endsWith('/project/abc123'))
      return Response.json({
        project_type: 'resourcepack',
        title: 'Sample Pack',
        slug: 'sample-pack',
        description: 'A compatible pack',
        body: 'Detailed project description',
        downloads: 42,
        followers: 7,
        license: { name: 'CC-BY-4.0' },
        categories: ['16x', 'pvp'],
        gallery: [
          {
            url: 'https://cdn.modrinth.com/data/abc/images/screenshot.png',
            title: 'In game',
            description: 'Shown in Minecraft',
          },
          { url: 'https://evil.example/screenshot.png', title: 'Untrusted image' },
        ],
      });
    assert.equal(String(url), 'https://api.modrinth.com/v2/project/abc123/version');
    return Response.json([
      { version_number: '1.2.0', game_versions: ['1.8.9', '1.12.2'] },
      { version_number: '1.1.0', game_versions: ['1.8.9'] },
    ]);
  });
  const result = await getResourcePackDetails('abc123');
  assert.equal(result.title, 'Sample Pack');
  assert.equal(result.license, 'CC-BY-4.0');
  assert.deepEqual(result.versions, ['1.8.9']);
  assert.equal(result.latestVersion, '1.2.0');
  assert.equal(result.gallery.length, 1);
  assert.equal(result.gallery[0].url, 'https://cdn.modrinth.com/data/abc/images/screenshot.png');
  assert.equal(result.projectUrl, 'https://modrinth.com/resourcepack/sample-pack');
});

test('rejects invalid project ids and projects without a compatible resource-pack version', async (t) => {
  mockFetch(t, async (url) => {
    if (String(url).endsWith('/project/abc123'))
      return Response.json({ project_type: 'mod', title: 'Not a resource pack' });
    throw new Error('unexpected request');
  });
  await assert.rejects(getResourcePackDetails('bad/id'), /Paquete inválido/);
  await assert.rejects(getResourcePackDetails('abc123'), /no es un paquete de recursos/);

  mockFetch(t, async (url) => {
    if (String(url).endsWith('/project/abc123'))
      return Response.json({ project_type: 'resourcepack', title: 'Old Pack' });
    return Response.json([{ version_number: '1.0', game_versions: ['1.20.1'] }]);
  });
  await assert.rejects(getResourcePackDetails('abc123'), /Minecraft 1\.8\.9/);
});

test('downloads a compatible official ZIP, verifies its hash and imports it locally', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-resourcepack-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'resourcepacks');
  const archiveBytes = Buffer.from(
    zipSync({
      'pack.mcmeta': Buffer.from(JSON.stringify({ pack: { pack_format: 1, description: 'Catalog Pack' } })),
      'assets/minecraft/test.txt': Buffer.from('ok'),
    }),
  );
  let requests = 0;
  mockFetch(t, async (url, options) => {
    requests++;
    assert.equal(options.redirect, 'error');
    if (String(url).startsWith('https://api.modrinth.com/'))
      return Response.json(compatibleVersion('https://cdn.modrinth.com/data/project/version/pack.zip', archiveBytes));
    assert.equal(new URL(url).hostname, 'cdn.modrinth.com');
    return new Response(archiveBytes, { headers: { 'content-length': String(archiveBytes.length) } });
  });
  const result = await downloadResourcePack('abc123', destination);
  assert.equal(requests, 2);
  assert.equal(result.name, 'Catalog Pack');
  assert.equal(result.version, '1.0.0');
  const files = unzipSync(fs.readFileSync(result.path));
  assert.ok(files['pack.mcmeta']);
  assert.equal(Buffer.from(files['assets/minecraft/test.txt']).toString(), 'ok');
});

test('rejects non-Modrinth download URLs and versions without Minecraft 1.8.9', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-resourcepack-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  mockFetch(t, async (url) => {
    if (String(url).startsWith('https://api.modrinth.com/'))
      return Response.json(compatibleVersion('https://evil.example/pack.zip'));
    throw new Error('unexpected download');
  });
  await assert.rejects(downloadResourcePack('abc123', path.join(root, 'packs')), /CDN oficial de Modrinth/);

  mockFetch(t, async () => Response.json([{ ...compatibleVersion()[0], game_versions: ['1.20.1'] }]));
  await assert.rejects(downloadResourcePack('abc123', path.join(root, 'packs')), /Minecraft 1\.8\.9/);
  assert.equal(fs.existsSync(path.join(root, 'packs')), false);
});

test('rejects corrupted downloaded packs and hash mismatches without installing them', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primarix-resourcepack-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  mockFetch(t, async (url) => {
    if (String(url).startsWith('https://api.modrinth.com/'))
      return Response.json(compatibleVersion('https://cdn.modrinth.com/data/project/version/pack.zip'));
    return new Response(Buffer.from('bad'));
  });
  await assert.rejects(downloadResourcePack('abc123', path.join(root, 'packs')), /integridad SHA-1/);
  assert.equal(fs.existsSync(path.join(root, 'packs')), false);
});
