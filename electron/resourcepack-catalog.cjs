const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { importResourcePack } = require('./resourcepacks.cjs');

const API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'PrimarixLauncher/0.1.25 (Minecraft 1.8.9 resource pack catalog)';
const PAGE_SIZE = 100;
const MAX_RESULTS = 10000;
const MAX_OFFSET = MAX_RESULTS - PAGE_SIZE;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

function apiError(message) {
  return Error(message);
}

async function json(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw apiError(`Modrinth respondió ${response.status}.`);
  return response.json();
}

async function searchResourcePacks(options = {}) {
  const query = options?.query ?? '';
  const offset = options?.offset ?? 0;
  const sort = options?.sort ?? 'downloads';
  const cleanQuery = String(query).trim().slice(0, 100);
  const safeOffset = Number.isInteger(offset) ? Math.max(0, Math.min(offset, MAX_OFFSET)) : 0;
  const indexes = new Set(['relevance', 'downloads', 'follows', 'newest_updated', 'newest_published']);
  const params = new URLSearchParams({
    facets: JSON.stringify([['project_type:resourcepack'], ['versions:1.8.9']]),
    index: indexes.has(sort) ? sort : 'downloads',
    limit: String(PAGE_SIZE),
    offset: String(safeOffset),
  });
  if (cleanQuery) params.set('query', cleanQuery);
  const result = await json(`${API}/search?${params}`);
  if (!Array.isArray(result.hits)) throw apiError('El catálogo devolvió una respuesta inválida.');
  return {
    hits: result.hits
      .map((hit) => ({
        id: String(hit.project_id || ''),
        slug: String(hit.slug || ''),
        title: String(hit.title || 'Paquete sin nombre').slice(0, 120),
        description: String(hit.description || '').slice(0, 360),
        downloads: Number.isFinite(hit.downloads) ? hit.downloads : 0,
        categories: Array.isArray(hit.categories)
          ? hit.categories.filter((item) => typeof item === 'string').slice(0, 8)
          : [],
        icon: safeImageUrl(hit.icon_url),
        license: String(hit.license || 'Licencia no indicada')
          .replace('LicenseRef-All-Rights-Reserved', 'Todos los derechos reservados')
          .slice(0, 80),
        projectUrl: `https://modrinth.com/resourcepack/${encodeURIComponent(String(hit.slug || hit.project_id || ''))}`,
      }))
      .filter((hit) => /^[A-Za-z0-9_-]{1,64}$/.test(hit.id)),
    total: Number.isFinite(result.total_hits) ? result.total_hits : 0,
    offset: safeOffset,
    limit: PAGE_SIZE,
    maxResults: MAX_RESULTS,
  };
}

async function getResourcePackDetails(projectId) {
  const id = String(projectId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw apiError('Paquete inválido.');
  const project = await json(`${API}/project/${encodeURIComponent(id)}`);
  if (project.project_type !== 'resourcepack') throw apiError('El proyecto seleccionado no es un paquete de recursos.');
  const versions = await json(`${API}/project/${encodeURIComponent(id)}/version`);
  if (!Array.isArray(versions)) throw apiError('No se pudieron consultar las versiones del paquete.');
  const compatibleVersions = versions.filter(
    (version) => Array.isArray(version.game_versions) && version.game_versions.includes('1.8.9'),
  );
  if (!compatibleVersions.length)
    throw apiError('Este paquete ya no tiene una versión compatible con Minecraft 1.8.9.');
  return {
    id,
    title: String(project.title || 'Paquete sin nombre').slice(0, 120),
    description: String(project.description || '').slice(0, 1200),
    body: String(project.body || '').slice(0, 12000),
    downloads: Number.isFinite(project.downloads) ? project.downloads : 0,
    followers: Number.isFinite(project.followers) ? project.followers : 0,
    license: String(project.license?.name || 'Licencia no indicada').slice(0, 120),
    categories: Array.isArray(project.categories)
      ? project.categories.filter((item) => typeof item === 'string').slice(0, 12)
      : [],
    icon: safeImageUrl(project.icon_url),
    versions: ['1.8.9'],
    latestVersion: String(compatibleVersions[0].version_number || compatibleVersions[0].name || '').slice(0, 80),
    gallery: Array.isArray(project.gallery)
      ? project.gallery
          .map((image) => ({
            url: safeImageUrl(image?.url),
            title: String(image?.title || '').slice(0, 120),
            description: String(image?.description || '').slice(0, 360),
          }))
          .filter((image) => image.url)
          .slice(0, 12)
      : [],
    projectUrl: `https://modrinth.com/resourcepack/${encodeURIComponent(String(project.slug || id))}`,
  };
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'cdn.modrinth.com' ? url.href : '';
  } catch {
    return '';
  }
}

async function downloadResourcePack(projectId, destination) {
  const id = String(projectId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw apiError('Paquete inválido.');
  const versions = await json(`${API}/project/${encodeURIComponent(id)}/version`);
  if (!Array.isArray(versions)) throw apiError('No se pudieron consultar las versiones del paquete.');
  const version = versions.find((item) => Array.isArray(item.game_versions) && item.game_versions.includes('1.8.9'));
  if (!version) throw apiError('Este paquete ya no tiene una versión compatible con Minecraft 1.8.9.');
  const files = Array.isArray(version.files) ? version.files : [];
  const file =
    files.find((candidate) => candidate.primary && /\.zip$/i.test(candidate.filename)) ||
    files.find((candidate) => /\.zip$/i.test(candidate.filename));
  if (!file || typeof file.url !== 'string') throw apiError('La versión compatible no incluye un archivo ZIP.');
  if (typeof file.hashes?.sha1 !== 'string' || !/^[a-f0-9]{40}$/i.test(file.hashes.sha1))
    throw apiError('Modrinth no proporcionó una verificación de integridad válida.');
  const url = new URL(file.url);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com')
    throw apiError('La descarga no proviene del CDN oficial de Modrinth.');
  if (Number.isFinite(file.size) && file.size > MAX_DOWNLOAD_BYTES)
    throw apiError('El paquete supera el límite de descarga de 100 MB.');

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw apiError(`No se pudo descargar el paquete (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES)
    throw apiError('El paquete supera el límite de descarga de 100 MB.');
  if (!response.body) throw apiError('La descarga llegó vacía.');
  const chunks = [];
  let size = 0;
  const hash = crypto.createHash('sha1');
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD_BYTES) throw apiError('El paquete supera el límite de descarga de 100 MB.');
    chunks.push(chunk);
    hash.update(chunk);
  }
  const bytes = Buffer.concat(chunks, size);
  if (!size) throw apiError('La descarga llegó vacía.');
  if (Number.isFinite(file.size) && size !== file.size)
    throw apiError('El tamaño de la descarga no coincide con los metadatos del catálogo.');
  const expectedHash = file.hashes?.sha1;
  if (hash.digest('hex').toLowerCase() !== expectedHash.toLowerCase())
    throw apiError('Falló la verificación de integridad SHA-1 del paquete.');

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'primarix-pack-'));
  const filename = path
    .basename(file.filename || 'resource-pack.zip')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .slice(0, 120);
  const archive = path.join(temporaryDirectory, filename.toLowerCase().endsWith('.zip') ? filename : `${filename}.zip`);
  try {
    await fs.writeFile(archive, bytes, { flag: 'wx', mode: 0o600 });
    const installed = await importResourcePack(archive, destination);
    return {
      ...installed,
      version: String(version.version_number || version.name || '').slice(0, 80),
      projectUrl: `https://modrinth.com/resourcepack/${encodeURIComponent(id)}`,
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  searchResourcePacks,
  getResourcePackDetails,
  downloadResourcePack,
  PAGE_SIZE,
  MAX_RESULTS,
  MAX_OFFSET,
};
