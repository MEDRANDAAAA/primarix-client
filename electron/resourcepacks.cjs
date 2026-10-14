const fs = require('node:fs');
const path = require('node:path');
const yauzl = require('yauzl');
const { zipSync } = require('fflate');

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PACK_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_ENTRIES = 10000;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function invalid(message) {
  const error = Error(message);
  error.code = 'INVALID_RESOURCE_PACK';
  return error;
}

function safeEntryName(name) {
  if (
    !name ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name) ||
    /[\u0000-\u001f]/.test(name)
  )
    throw invalid('El ZIP contiene una ruta no válida.');
  const parts = name.split('/');
  if (parts.some((part, index) => part === '..' || part === '.' || (!part && index !== parts.length - 1)))
    throw invalid('El ZIP contiene una ruta que sale de su carpeta.');
  if (parts.some((part) => part.includes(':'))) throw invalid('El ZIP contiene una ruta no válida para Windows.');
  return name.endsWith('/') ? name.slice(0, -1) : name;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readEntries(archive) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archive,
      { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (openError, zipfile) => {
        if (openError) return reject(openError);
        const entries = new Map();
        const names = new Set();
        let count = 0;
        let totalBytes = 0;
        let settled = false;
        const fail = (error) => {
          if (settled) return;
          settled = true;
          zipfile.close();
          reject(error);
        };
        zipfile.on('error', fail);
        zipfile.on('end', () => {
          if (settled) return;
          settled = true;
          resolve(entries);
        });
        zipfile.on('entry', (entry) => {
          (async () => {
            if (++count > MAX_ENTRIES) throw invalid('El ZIP contiene demasiados archivos (máximo 10 000).');
            const name = safeEntryName(entry.fileName);
            const mode = entry.externalFileAttributes >>> 16;
            if ((mode & 0o170000) === 0o120000) throw invalid('El ZIP contiene un enlace simbólico y no se importó.');
            const key = name.toLocaleLowerCase('en-US');
            if (names.has(key)) throw invalid('El ZIP contiene nombres de archivo duplicados.');
            names.add(key);
            if (entry.fileName.endsWith('/')) return;
            if (entry.uncompressedSize > MAX_FILE_BYTES) throw invalid('Un archivo del ZIP supera el límite de 64 MB.');
            totalBytes += entry.uncompressedSize;
            if (totalBytes > MAX_TOTAL_BYTES) throw invalid('El contenido del ZIP supera el límite de 256 MB.');
            const chunks = [];
            let bytes = 0;
            const stream = await new Promise((streamResolve, streamReject) =>
              zipfile.openReadStream(entry, (error, readable) =>
                error ? streamReject(error) : streamResolve(readable),
              ),
            );
            for await (const chunk of stream) {
              bytes += chunk.length;
              if (bytes > MAX_FILE_BYTES || bytes > entry.uncompressedSize)
                throw invalid('El ZIP contiene un archivo con tamaño declarado incorrecto.');
              chunks.push(chunk);
            }
            if (bytes !== entry.uncompressedSize) throw invalid('El ZIP está incompleto o tiene tamaños incorrectos.');
            const data = Buffer.concat(chunks, bytes);
            if (crc32(data) !== entry.crc32 >>> 0)
              throw invalid('El ZIP está corrupto: falló la verificación de integridad.');
            entries.set(name, data);
          })()
            .then(() => zipfile.readEntry())
            .catch(fail);
        });
        zipfile.readEntry();
      },
    );
  });
}

function outputName(source) {
  const raw = path.parse(path.basename(source)).name;
  const safe = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);
  return safe || 'Paquete de recursos';
}

function uniqueTarget(directory, name) {
  let index = 1;
  while (true) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const target = path.join(directory, `${name}${suffix}.zip`);
    try {
      return { target, descriptor: fs.openSync(target, 'wx', 0o600) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      index++;
    }
  }
}

function parsePackMetadata(data) {
  return JSON.parse(data.toString('utf8').replace(/^\uFEFF/, ''));
}

async function importResourcePack(source, destination) {
  const extension = path.extname(source).toLowerCase();
  if (extension === '.rar')
    throw Error('Minecraft 1.8.9 no admite archivos RAR. Extrae el RAR y crea un ZIP con pack.mcmeta en la raíz.');
  if (extension !== '.zip') throw Error('Selecciona un archivo ZIP de paquete de recursos.');
  const stat = fs.lstatSync(source);
  if (!stat.isFile()) throw Error('El archivo seleccionado no es un archivo normal.');
  if (stat.size === 0 || stat.size > MAX_ARCHIVE_BYTES) throw Error('El ZIP está vacío o supera el límite de 100 MB.');

  let entries;
  try {
    entries = await readEntries(source);
  } catch (error) {
    if (error.code === 'INVALID_RESOURCE_PACK') throw error;
    if (/invalid relative path|invalid filename|invalid file name/i.test(error.message))
      throw Error('El ZIP contiene una ruta que sale de su carpeta o no es válida.');
    throw Error('No se pudo leer el ZIP: puede estar corrupto o incompleto.');
  }

  const metadataFiles = [...entries.keys()].filter((name) => path.posix.basename(name) === 'pack.mcmeta');
  if (metadataFiles.length !== 1)
    throw Error('El ZIP debe contener un único pack.mcmeta, en la raíz o dentro de una carpeta.');
  const metadataPath = metadataFiles[0];
  let metadata;
  try {
    metadata = parsePackMetadata(entries.get(metadataPath));
  } catch {
    throw Error('El archivo pack.mcmeta no contiene JSON válido.');
  }
  if (!metadata?.pack || metadata.pack.pack_format !== 1)
    throw Error('El paquete no es compatible con Minecraft 1.8.9: pack.mcmeta debe declarar pack_format 1.');

  const root = path.posix.dirname(metadataPath);
  const prefix = root === '.' ? '' : root + '/';
  const normalized = {};
  for (const [name, data] of entries) {
    if (prefix && !name.startsWith(prefix)) continue;
    const relative = prefix ? name.slice(prefix.length) : name;
    if (relative) normalized[relative] = data;
  }
  if (!normalized['pack.mcmeta']) throw Error('No se pudo colocar pack.mcmeta en la raíz del paquete.');

  const archive = zipSync(normalized, { level: 6 });
  fs.mkdirSync(destination, { recursive: true });
  const { target, descriptor } = uniqueTarget(destination, outputName(source));
  try {
    fs.writeFileSync(descriptor, archive);
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  } finally {
    fs.closeSync(descriptor);
  }
  const description = metadata.pack.description;
  const name =
    typeof description === 'string' && description.trim() ? description.trim().slice(0, 120) : outputName(source);
  return { name, fileName: path.basename(target), path: target, directory: destination };
}

function readPackEntry(zipfile, entry, maxBytes) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          stream.destroy(invalid('Los metadatos o la imagen del paquete superan el límite permitido.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const data = Buffer.concat(chunks, size);
        if (size !== entry.uncompressedSize || crc32(data) !== entry.crc32 >>> 0)
          return reject(invalid('El ZIP está corrupto: falló la verificación de integridad.'));
        resolve(data);
      });
    });
  });
}

async function readInstalledPack(source) {
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_ARCHIVE_BYTES)
    throw invalid('El archivo está vacío o supera el límite de 100 MB.');
  return new Promise((resolve, reject) => {
    yauzl.open(
      source,
      { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (openError, zipfile) => {
        if (openError) return reject(openError);
        let settled = false;
        let metadata = null;
        let icon = null;
        const fail = (error) => {
          if (settled) return;
          settled = true;
          zipfile.close();
          reject(error);
        };
        zipfile.on('error', fail);
        zipfile.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ metadata, icon });
        });
        zipfile.on('entry', (entry) => {
          const maxBytes = entry.fileName === 'pack.mcmeta' ? MAX_METADATA_BYTES : MAX_PACK_IMAGE_BYTES;
          const wanted = entry.fileName === 'pack.mcmeta' || entry.fileName === 'pack.png';
          if (!wanted || entry.fileName.endsWith('/')) {
            zipfile.readEntry();
            return;
          }
          if (entry.uncompressedSize > maxBytes) {
            fail(invalid('Los metadatos o la imagen del paquete superan el límite permitido.'));
            return;
          }
          const mode = entry.externalFileAttributes >>> 16;
          if ((mode & 0o170000) === 0o120000) {
            fail(invalid('El ZIP contiene un enlace simbólico.'));
            return;
          }
          readPackEntry(zipfile, entry, maxBytes)
            .then((data) => {
              if (entry.fileName === 'pack.mcmeta') metadata = data;
              else icon = data;
              zipfile.readEntry();
            })
            .catch(fail);
        });
        zipfile.readEntry();
      },
    );
  });
}

function packDescription(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(packDescription).join('');
  if (value && typeof value === 'object')
    return `${typeof value.text === 'string' ? value.text : ''}${packDescription(value.extra || [])}`;
  return '';
}

async function listInstalledResourcePacks(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const packs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue;
    const source = path.join(directory, entry.name);
    const stat = fs.lstatSync(source);
    const pack = {
      fileName: entry.name,
      name: path.parse(entry.name).name,
      description: '',
      bytes: stat.size,
      icon: '',
      valid: false,
      error: '',
    };
    try {
      const { metadata: metadataBytes, icon } = await readInstalledPack(source);
      if (!metadataBytes) throw invalid('Falta pack.mcmeta en la raíz del ZIP.');
      const metadata = parsePackMetadata(metadataBytes);
      if (!metadata?.pack || metadata.pack.pack_format !== 1)
        throw invalid('No es compatible con Minecraft 1.8.9 (pack_format 1).');
      pack.name = packDescription(metadata.pack.description).trim().slice(0, 120) || pack.name;
      pack.description =
        pack.name === path.parse(entry.name).name
          ? ''
          : packDescription(metadata.pack.description).trim().slice(0, 360);
      pack.icon = icon ? `data:image/png;base64,${icon.toString('base64')}` : '';
      pack.valid = true;
    } catch (error) {
      pack.error = error.message || 'No se pudo leer este paquete.';
    }
    packs.push(pack);
  }
  return packs.sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { importResourcePack, listInstalledResourcePacks };
