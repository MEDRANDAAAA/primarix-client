const { unzipSync } = require('fflate');

function assertForgeMod(fileName, archive) {
  const metadata = {};
  let oversizedMetadata = false;
  try {
    Object.assign(
      metadata,
      unzipSync(archive, {
        filter: (entry) => {
          if (!['addon.json', 'mcmod.info', 'META-INF/MANIFEST.MF'].includes(entry.name)) return false;
          if (entry.originalSize > 256 * 1024) {
            oversizedMetadata = true;
            return false;
          }
          return true;
        },
      }),
    );
  } catch {
    throw Error(`${fileName} no es un archivo JAR válido.`);
  }
  if (oversizedMetadata) throw Error(`${fileName} tiene metadatos demasiado grandes para inspeccionarlo.`);

  const addon = metadata['addon.json'];
  const manifest = metadata['META-INF/MANIFEST.MF'];
  let addonInfo = {};
  if (addon) {
    try {
      addonInfo = JSON.parse(Buffer.from(addon).toString('utf8'));
    } catch {}
  }
  const declaredClass = addonInfo.mainClass;
  let addonClass = null;
  if (
    typeof declaredClass === 'string' &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(declaredClass) &&
    !declaredClass.startsWith('net.labymod.')
  ) {
    const classPath = `${declaredClass.replaceAll('.', '/')}.class`;
    addonClass = unzipSync(archive, {
      filter: (entry) => entry.name === classPath && entry.originalSize <= 2 * 1024 * 1024,
    })[classPath];
  }
  const addonUsesLabyMod =
    typeof addonInfo.requiredVersion === 'string' ||
    declaredClass?.startsWith('net.labymod.') ||
    (addonClass && Buffer.from(addonClass).includes(Buffer.from('net/labymod/api/LabyModAddon')));
  const requiresLabyMod = manifest && /FMLCorePlugin:\s*net\.labymod\./i.test(Buffer.from(manifest).toString('utf8'));
  if (addonUsesLabyMod || requiresLabyMod) {
    const name = typeof addonInfo.name === 'string' ? addonInfo.name : fileName.replace(/\.jar$/i, '');
    throw Error(
      `${name} es un complemento de LabyMod, no un mod Forge compatible. Primarix no incluye LabyMod ni su API de complementos, así que instalarlo aquí no lo haría funcionar.`,
    );
  }
}

module.exports = { assertForgeMod };
