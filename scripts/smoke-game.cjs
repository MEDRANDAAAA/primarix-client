const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { once } = require('node:events');
const { Runtime, offlineAccount } = require('../electron/runtime.cjs');
const { DEFAULTS } = require('../electron/settings.cjs');
const project = path.resolve(__dirname, '..');
const root = process.env.ANTAGON_GAME_TEST_ROOT
  ? path.resolve(process.env.ANTAGON_GAME_TEST_ROOT)
  : path.join(project, 'build/game-test-profile');
const installed = path.join(
  process.platform === 'win32' ? process.env.APPDATA : path.join(os.homedir(), 'Library/Application Support'),
  'Primarix Client',
);
const screenshots = [
  'antagon-pause-buttons.png',
  'antagon-cape-test.png',
  'antagon-cape-late.png',
  'antagon-smoke.png',
  'antagon-menu.png',
  'antagon-menu-bottom.png',
  'antagon-menu-pvp.png',
  'antagon-options.png',
  'antagon-edit.png',
  'antagon-scoreboard-clean.png',
  'antagon-fullbright.png',
  'antagon-logo-cape.png',
  'antagon-hub-friends.png',
  'antagon-crown.png',
  'antagon-notice.png',
  'antagon-item-physics.png',
  'antagon-effects-compact.png',
  'antagon-inventory-font.png',
  'annthmodcd-rmenu.png',
  'annthmodcd-cd-menu.png',
  'annthmodcd-layout-editor.png',
  'annthmodcd-hud.png',
];

async function main() {
  for (const directory of ['metadata', 'runtime', 'libraries', 'assets', 'minecraft/versions']) {
    const destination = path.join(root, directory);
    if (!(await fs.stat(destination).catch(() => null))) {
      const source = path.join(installed, directory);
      if (await fs.stat(source).catch(() => null)) await fs.cp(source, destination, { recursive: true });
    }
  }
  await fs.rm(path.join(root, 'minecraft/saves/Antagon-Smoke'), { recursive: true, force: true });
  await fs.rm(path.join(root, 'minecraft/screenshots'), { recursive: true, force: true });
  const cooldownHudConfig = path.join(root, 'minecraft/config/rpgclient-cooldown-hud.properties');
  await fs.mkdir(path.dirname(cooldownHudConfig), { recursive: true });
  await fs.writeFile(
    cooldownHudConfig,
    'cooldownLeft=99999\ncooldownTop=99999\narmorLeft=-99999\narmorTop=-99999\nopacity=100\n',
  );
  const withOptifine = process.env.ANTAGON_TEST_OPTIFINE === '1';
  if (withOptifine) {
    const mods = path.join(root, 'minecraft/mods');
    await fs.mkdir(mods, { recursive: true });
    const installedMods = path.join(installed, 'minecraft/mods');
    const optifine = (await fs.readdir(installedMods)).find((file) => /^OptiFine.*\.jar$/i.test(file));
    if (!optifine) throw Error('OptiFine não está instalado no perfil principal.');
    await fs.copyFile(path.join(installedMods, optifine), path.join(mods, optifine));
  }
  const runtime = new Runtime(root, path.join(project, 'assets'), (state) => {
    if (['running', 'launching', 'error', 'idle'].includes(state.phase)) console.log(state);
  });
  const size = process.env.ANTAGON_SMOKE_SMALL ? { width: 854, height: 480 } : {};
  const account = offlineAccount(process.env.ANTAGON_TEST_PLAYER || 'AntagonTest');
  await runtime.launch({ ...DEFAULTS, discordPresence: false }, account, {
    smoke: true,
    admin: process.env.ANTAGON_TEST_ADMIN === '1',
    ...size,
  });
  if (withOptifine)
    await fs.writeFile(path.join(root, 'minecraft/antagon-cosmetics.properties'), `${account.id}=antagon_cape\n`);
  const child = runtime.child;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 300000);
  try {
    const [code] = await once(child, 'close');
    const logfile = await fs.readFile(path.join(root, 'logs/game.log'), 'utf8');
    console.log(
      logfile
        .split('\n')
        .filter((line) => /ANTAGON/.test(line))
        .slice(-40)
        .join('\n'),
    );
    if (
      timedOut ||
      code !== 0 ||
      logfile.includes('[ANTAGON] HUD error') ||
      /\[ANTAGON TEST\] (?:java\.|.*Exception)/.test(logfile)
    )
      throw Error('O teste do jogo não terminou sem erros.');
    if (withOptifine && !logfile.includes('[ANTAGON] OptiFine cape bridge active'))
      throw Error('A capa Antagon não substituiu a textura da OptiFine.');
    if (withOptifine && !logfile.includes('[ANTAGON] Player render cape bridge active'))
      throw Error('A capa Antagon não foi aplicada na renderização do jogador.');
    if (!logfile.includes('[PRIMARIX] Animated GIF skyline, centered Blockbench title, and centered buttons rendered'))
      throw Error('No se dibujó el menú clásico de Primarix.');
    if (!logfile.includes('[ANTAGON] Primarix splash aspect correction patch applied'))
      throw Error('No se corrigió la proporción de la pantalla de carga Primarix.');
    if (
      !logfile.includes('[PRIMARIX] Game window branded.') ||
      logfile.includes('[PRIMARIX] Could not set game window icon:')
    )
      throw Error('No se aplicó el título y el icono de la ventana Primarix Client.');
    const gameOptions = await fs.readFile(path.join(root, 'minecraft/options.txt'), 'utf8');
    if (!gameOptions.includes('file/Primarix Glass'))
      throw Error('El paquete Glass no quedó activado en las opciones de Minecraft.');
    for (const asset of [
      'assets/minecraft/textures/gui/widgets.png',
      'assets/minecraft/textures/font/ascii.png',
      'assets/minecraft/textures/font/glyph_sizes.bin',
    ]) {
      if (!(await fs.stat(path.join(root, 'minecraft/resourcepacks/Primarix Glass', asset))).size)
        throw Error('Falta un recurso del paquete Glass: ' + asset);
    }
    if (
      !(await fs.stat(path.join(root, 'minecraft/resources/assets/antagonhud/textures/gui/title/primarix-loading.jpg')))
        .size
    )
      throw Error('No se instaló la imagen de la pantalla de carga Primarix.');
    if (
      !(await fs.stat(path.join(root, 'minecraft/resources/assets/minecraft/textures/font/ascii.png'))).size ||
      (await fs.stat(path.join(root, 'minecraft/resources/assets/minecraft/font/glyph_sizes.bin'))).size !== 256
    )
      throw Error('No se instaló la fuente Pixelify para la pantalla de carga.');
    const splashConfig = await fs.readFile(path.join(root, 'minecraft/config/splash.properties'), 'utf8');
    if (
      !splashConfig.includes('background=0x08080B') ||
      !splashConfig.includes('barBorder=0xFFFFFF') ||
      !splashConfig.includes('fontTexture=textures/font/ascii.png') ||
      !/logoTexture=antagonhud\\?:textures\/gui\/title\/primarix-loading\.jpg/.test(splashConfig)
    )
      throw Error('La pantalla de carga no usa el arte, fuente y estilo monocromático Primarix.');
    if (!logfile.includes('[ANTAGON TEST] Main menu accounts button is visible'))
      throw Error('No apareció el acceso Cuentas / Nick en el menú principal.');
    if (
      !logfile.includes(
        '[ANTAGON TEST] Inline profile selector adds offline nicks, selects/removes Premium accounts, and updates Offline session without restart',
      )
    )
      throw Error('El selector del menú no completó los flujos de cuentas Offline y Microsoft.');
    if (
      !/\[ANTAGON TEST\] Nine stacked potion effects with names, levels, and timers \d+ and 2:00\/99:99 timers ready/.test(
        logfile,
      )
    )
      throw Error('No se pudieron preparar nueve efectos apilados con nombres, niveles y temporizadores.');
    if (!logfile.includes('[ANTAGON TEST] Inventory opened for font texture-state check'))
      throw Error('No se abrió el inventario para comprobar la textura del texto.');
    if (!logfile.includes('[ANTAGON] Chat background patch applied'))
      throw Error('No se pudo instalar el ajuste de fondo transparente del chat.');
    if (!logfile.includes('[ANTAGON TEST] Chat background is transparent'))
      throw Error('No se activó el fondo transparente del chat durante la prueba.');
    if (!logfile.includes('[ANTAGON] Hat layer installed')) throw Error('A camada da coroa não foi instalada.');
    if (!logfile.includes('[AnnthModCD] Original 1.1.63 integrado; comandos y eventos registrados.'))
      throw Error('El mod original AnnthModCD no inicializó sus comandos y eventos.');
    if (!logfile.includes('[ANTAGON TEST] AnnthModCD original menu, cooldown menu, layout editor and HUD opened'))
      throw Error('No se completó la prueba de los menús originales de AnnthModCD.');
    if (!logfile.includes('[ANTAGON TEST] AnnthModCD HUD panels clamped to screen'))
      throw Error('Los paneles de cooldown/armadura no se limitaron al tamaño de pantalla.');
    if (!logfile.includes('[ANTAGON TEST] AnnthModCD cooldown registration saved'))
      throw Error('No se guardó el cooldown de prueba del mod original.');
    if (!logfile.includes('[ANTAGON TEST] Rapid item switching confirmed all 12 registered cooldowns'))
      throw Error('No se confirmaron todas las recargas al cambiar rápidamente entre objetos.');
    const cooldownData = await fs.stat(path.join(root, 'minecraft/config/rpgclient-cooldowns.dat')).catch(() => null);
    if (!cooldownData || cooldownData.size === 0) throw Error('El archivo original de cooldown quedó vacío.');
    for (const name of screenshots) {
      if (!logfile.includes('[ANTAGON TEST] Screenshot saved ' + name)) throw Error('Etapa não executada: ' + name);
      if ((await fs.stat(path.join(root, 'minecraft/screenshots', name))).size < 10000)
        throw Error('Screenshot inválido: ' + name);
    }
    console.log('Jogo OK: HUD, menu, rolagem, categorias, editor e módulos. Perfil isolado em ' + root);
  } finally {
    clearTimeout(timeout);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
