const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { unzipSync, zipSync } = require('fflate');
const { DEFAULTS } = require('../electron/settings.cjs');
const { createVoiceServer } = require('../backend/server.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  const profile = await fs.mkdtemp(path.join(root, 'build/ui-test-'));
  const electronUserData = path.join(profile, 'electron-user-data');
  await fs.writeFile(
    path.join(profile, 'settings.json'),
    JSON.stringify({ ...DEFAULTS, background: 'ascii', discordPresence: false }),
  );
  const modsDirectory = path.join(profile, 'minecraft/mods');
  await fs.mkdir(modsDirectory, { recursive: true });
  await fs.writeFile(path.join(modsDirectory, 'ExampleMod.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await fs.writeFile(path.join(modsDirectory, 'client-core.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const voiceServer = createVoiceServer({ port: 0, host: '127.0.0.1' });
  const voiceAddress = await voiceServer.listen();
  let app;
  try {
    app = await electron.launch({
      ...(process.env.ANTAGON_EXECUTABLE
        ? {
            executablePath: process.env.ANTAGON_EXECUTABLE,
            args: [
              `--user-data-dir=${electronUserData}`,
              '--use-fake-device-for-media-stream',
              '--use-fake-ui-for-media-stream',
            ],
          }
        : {
            args: [
              `--user-data-dir=${electronUserData}`,
              '--use-fake-device-for-media-stream',
              '--use-fake-ui-for-media-stream',
              root,
            ],
          }),
      env: {
        ...process.env,
        ANTAGON_TEST_ROOT: profile,
        PRIMARIX_VOICE_URL: `http://127.0.0.1:${voiceAddress.port}`,
      },
    });
  } catch (error) {
    await voiceServer.close();
    throw error;
  }
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const restored = await app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.hide();
      app.emit('second-instance', {}, [], process.cwd());
      return window.isVisible();
    });
    assert.equal(restored, true);
    await page.waitForFunction(() => document.querySelector('#version').textContent.length > 0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('game:open-view', 'accounts'),
    );
    assert.equal(await page.locator('#account-dialog').evaluate((dialog) => dialog.open), false);
    assert.equal(await page.locator('#background-switch').count(), 0);
    assert.equal(await page.locator('#ascii').count(), 0);
    assert.equal(await page.locator('[data-view="store"]').count(), 0);
    assert.equal(await page.locator('#view-store').count(), 0);
    assert.equal(await page.locator('#store-inventory').count(), 0);
    assert.equal(await page.evaluate(() => document.body.dataset.background), 'scene');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'true');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('game:open-view', 'friends'),
    );
    await page.waitForFunction(() => document.querySelector('#view-friends').classList.contains('active'));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('game:open-view', 'settings'),
    );
    await page.waitForFunction(() => document.querySelector('#view-settings').classList.contains('active'));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('game:open-view', 'voice'),
    );
    await page.waitForFunction(() => document.querySelector('#view-voice').classList.contains('active'));
    await page.click('[data-view="voice"]');
    await page.waitForFunction(() => document.querySelector('#view-voice').classList.contains('active'));
    assert.equal(await page.locator('#voice-connect-form').isVisible(), true);
    assert.equal(await page.locator('#voice-room-list').count(), 1);
    await page.click('#voice-connect');
    await page.waitForFunction(() => !document.querySelector('#voice-lobby').hidden);
    await page.fill('#voice-room-name', 'Prueba desde Electron');
    await page.click('#voice-create-form button[type="submit"]');
    await page.waitForFunction(
      () =>
        !document.querySelector('#voice-room-view').hidden &&
        document.querySelector('#voice-room-title').textContent === 'Prueba desde Electron',
    );
    await page.waitForFunction(() => document.querySelector('#voice-mute').textContent === 'Mutear micrófono');
    await page.click('#voice-mute');
    await page.waitForFunction(() => document.querySelector('#voice-mute').textContent === 'Activar micrófono');
    await page.click('#voice-mute');
    await page.waitForFunction(() => document.querySelector('#voice-mute').textContent === 'Mutear micrófono');
    await page.click('#voice-deafen');
    await page.waitForFunction(() => document.querySelector('#voice-deafen').textContent === 'Activar audio');
    await page.click('#voice-deafen');
    await page.fill('#voice-chat-input', 'Mensaje de prueba');
    await page.click('#voice-chat-form button[type="submit"]');
    await page.waitForFunction(() =>
      document.querySelector('#voice-messages').textContent.includes('Mensaje de prueba'),
    );
    await page.click('#voice-leave');
    await page.waitForFunction(() => !document.querySelector('#voice-lobby').hidden);
    await page.click('#voice-lobby-disconnect');
    await page.waitForFunction(() => !document.querySelector('#voice-connection').hidden);
    await page.click('[data-view="play"]');
    await page.click('[data-view="mods"]');
    await page.waitForFunction(() => document.querySelectorAll('#mods-list .mod-row').length === 1);
    assert.equal(await page.locator('#mods-path').textContent(), 'Mods externos del perfil Primarix');
    assert.equal(
      await page
        .locator('#mods-path')
        .textContent()
        .then((text) => text.includes(profile)),
      false,
    );
    assert.equal(
      await page
        .locator('#mods-list')
        .textContent()
        .then((text) => text.includes('Primarix Client')),
      false,
    );
    const exampleMod = page.locator('#mods-list .mod-row').filter({ hasText: 'ExampleMod' });
    assert.equal(
      await page
        .locator('#mods-list')
        .textContent()
        .then((text) => text.includes('Primarix Client')),
      false,
    );
    assert.match(await page.locator('.mods-disclosure').textContent(), /no es\s+posible garantizar/);
    await exampleMod.locator('[data-mod-toggle]').click();
    await page.waitForFunction(() => document.querySelector('#mods-list').textContent.includes('Desactivado'));
    await fs.access(path.join(modsDirectory, 'ExampleMod.jar.disabled'));
    await exampleMod.locator('[data-mod-toggle]').click();
    await page.waitForFunction(() => document.querySelector('#mods-list').textContent.includes('Activo'));
    await fs.access(path.join(modsDirectory, 'ExampleMod.jar'));
    assert.equal(await page.locator('#open-game').count(), 0);
    await assert.rejects(
      page.evaluate(() => window.antagon.openFolder('game')),
      /archivos internos/,
    );
    await assert.rejects(
      page.evaluate(() => window.antagon.openFolder('mods')),
      /archivos internos/,
    );
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('resourcepacks:search');
      ipcMain.removeHandler('resourcepacks:details');
      ipcMain.handle('resourcepacks:search', () => ({
        ok: true,
        value: {
          total: 1,
          offset: 0,
          limit: 100,
          maxResults: 10000,
          hits: [
            {
              id: 'sample-pack',
              slug: 'sample-pack',
              title: 'Sample Pack',
              description: 'Pack compatible de prueba',
              downloads: 1234,
              categories: ['16x', 'pvp'],
              icon: '',
              license: 'CC-BY-4.0',
              projectUrl: 'https://modrinth.com/resourcepack/sample-pack',
            },
          ],
        },
      }));
      ipcMain.handle('resourcepacks:details', () => ({
        ok: true,
        value: {
          id: 'sample-pack',
          title: 'Sample Pack',
          description: 'Pack compatible de prueba',
          body: 'Descripción completa del proyecto.',
          downloads: 1234,
          followers: 42,
          license: 'CC-BY-4.0',
          categories: ['16x', 'pvp'],
          icon: '',
          versions: ['1.8.9'],
          latestVersion: '1.2.0',
          gallery: [
            {
              url: 'https://cdn.modrinth.com/data/sample/images/screenshot.png',
              title: 'Captura en juego',
              description: 'Vista del paquete',
            },
          ],
          projectUrl: 'https://modrinth.com/resourcepack/sample-pack',
        },
      }));
    });
    await page.click('[data-view="resourcepacks"]');
    await page.waitForSelector('#resourcepacks-catalog .resourcepack-card');
    await page.click('#resourcepacks-catalog .resourcepack-card-footer a');
    await page.waitForFunction(() => !document.querySelector('#resourcepack-details-content').hidden);
    assert.equal(await page.locator('#resourcepack-details-title').textContent(), 'Sample Pack');
    assert.match(await page.locator('#resourcepack-details-meta').textContent(), /CC-BY-4\.0/);
    assert.equal(await page.locator('#resourcepack-details-gallery img').count(), 1);
    assert.equal(await page.locator('#resourcepack-details-gallery img').getAttribute('alt'), 'Captura en juego');
    assert.match(await page.locator('#resourcepack-details-body').textContent(), /Descripción completa/);
    await page.click('#resourcepack-details-dialog [data-close]');
    const resourcePackFile = path.join(profile, 'Sample.zip');
    await fs.writeFile(
      resourcePackFile,
      zipSync({ 'pack.mcmeta': Buffer.from('{"pack":{"pack_format":1,"description":"Pack de prueba"}}') }),
    );
    await page.locator('#resourcepacks-input').setInputFiles(resourcePackFile);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(document.querySelector('#resourcepacks-input').files[0]);
      document
        .querySelector('#resourcepacks-drop')
        .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await page.click('#resourcepacks-import');
    const resourcepacksDirectory = path.join(profile, 'minecraft/resourcepacks');
    await page.waitForFunction(() =>
      document.querySelector('#resourcepacks-list').textContent.includes('Pack de prueba'),
    );
    assert.equal(await page.locator('#resourcepacks-path').textContent(), resourcepacksDirectory);
    const installedPack = path.join(resourcepacksDirectory, 'Sample.zip');
    const installedFiles = unzipSync(await fs.readFile(installedPack));
    assert.ok(installedFiles['pack.mcmeta']);
    await page.click('#resourcepacks-open-folder');
    await page.waitForSelector('#resourcepacks-installed-list .resourcepacks-installed-card');
    assert.match(await page.locator('#resourcepacks-installed-list').textContent(), /Pack de prueba/);
    assert.match(await page.locator('#resourcepacks-installed-list').textContent(), /Sample\.zip/);
    assert.match(await page.locator('#resourcepacks-installed-status').textContent(), /1 paquete/);
    await page.click('#resourcepacks-installed-dialog [data-close]');
    await page.click('[data-view="play"]');
    await page.screenshot({ path: path.join(root, 'docs/launcher.png') });
    assert.equal(await page.evaluate(() => document.body.dataset.background), 'scene');
    await page.click('[data-view="settings"]');
    await page.waitForFunction(() => document.getElementById('map').dataset.animating === 'false');
    await page.locator('#fullscreen').check();
    await page.evaluate(() => {
      const memory = document.querySelector('#memory');
      memory.value = '5';
      memory.dispatchEvent(new Event('change'));
      const pack = document.querySelector('#pack-toggle');
      pack.checked = false;
      pack.dispatchEvent(new Event('change'));
      const accent = document.querySelector('#accent-color');
      accent.value = '#3182ce';
      accent.dispatchEvent(new Event('input'));
      accent.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(async () => {
      const { settings } = await window.antagon.init();
      return (
        settings.memory === 5 && settings.pack === false && settings.fullscreen && settings.accentColor === '#3182ce'
      );
    });
    await page.screenshot({ path: path.join(root, 'docs/settings.png') });
    await page.click('[data-view="play"]');
    assert.equal(
      await page
        .locator('#launch')
        .evaluate((button) => getComputedStyle(button).getPropertyValue('--accent-foreground').trim()),
      '#24141b',
    );
    await page.evaluate(() => {
      const input = document.querySelector('#accent-color');
      input.value = '#102030';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(
      await page.locator('#launch').evaluate((button) => getComputedStyle(button).color),
      'rgb(255, 248, 242)',
    );
    await page.evaluate(() => {
      const input = document.querySelector('#accent-color');
      input.value = '#3182ce';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () =>
        document.querySelector('#view-play').classList.contains('active') &&
        getComputedStyle(document.querySelector('#launch')).backgroundColor === 'rgb(49, 130, 206)',
    );
    assert.equal(await page.locator('#launch').evaluate((button) => getComputedStyle(button).color), 'rgb(36, 20, 27)');
    assert.notEqual(await page.locator('#launch').evaluate((button) => getComputedStyle(button).boxShadow), 'none');
    await page.locator('#launch').hover();
    await page.waitForTimeout(180);
    assert.equal(
      await page.locator('#launch').evaluate((button) => getComputedStyle(button).transform),
      'matrix(1, 0, 0, 1, 0, 1)',
    );
    assert.notEqual(
      await page.locator('#launch').evaluate((button) => getComputedStyle(button).backgroundColor),
      'rgb(49, 130, 206)',
    );
    const hoverShadow = await page.locator('#launch').evaluate((button) => getComputedStyle(button).boxShadow);
    await page.mouse.down();
    await page.waitForTimeout(180);
    assert.equal(
      await page.locator('#launch').evaluate((button) => getComputedStyle(button).transform),
      'matrix(1, 0, 0, 1, 0, 3)',
    );
    assert.notEqual(
      await page.locator('#launch').evaluate((button) => getComputedStyle(button).boxShadow),
      hoverShadow,
    );
    await page.mouse.move(10, 70);
    await page.mouse.up();
    await page.click('[data-view="mods"]');
    await page.waitForFunction(
      () =>
        document.querySelector('#view-mods').classList.contains('active') &&
        getComputedStyle(document.querySelector('#mods-import')).backgroundColor === 'rgb(49, 130, 206)',
    );
    assert.equal(
      await page.locator('#mods-import').evaluate((button) => getComputedStyle(button).backgroundColor),
      'rgb(49, 130, 206)',
    );
    await page.waitForSelector('#mods-list [data-mod-toggle="ExampleMod.jar"]');
    const secondaryButton = page.locator('#mods-list [data-mod-toggle="ExampleMod.jar"]');
    assert.notEqual(
      await secondaryButton.evaluate((button) => getComputedStyle(button).backgroundColor),
      'rgb(49, 130, 206)',
    );
    assert.equal(await secondaryButton.evaluate((button) => getComputedStyle(button).color), 'rgb(255, 245, 232)');
    assert.notEqual(await secondaryButton.evaluate((button) => getComputedStyle(button).boxShadow), 'none');
    await secondaryButton.hover();
    assert.notEqual(
      await secondaryButton.evaluate((button) => getComputedStyle(button).backgroundColor),
      'rgb(49, 130, 206)',
    );
    await page.click('[data-view="settings"]');
    await page.click('#profile-open');
    await page.fill('#nickname', 'a');
    await page.click('#save-nick');
    assert.match(await page.locator('#account-error').textContent(), /3 a 16/);
    await page.fill('#nickname', 'Antagon_Test');
    await page.click('#save-nick');
    await page.waitForFunction(() => document.querySelector('#profile-name').textContent === 'Antagon_Test');
    await page.click('#profile-open');
    await page.click('#save-quick-nickname');
    await page.fill('#nickname', 'PvP_Alt');
    await page.click('#save-quick-nickname');
    await page.waitForFunction(async () => {
      const { settings } = await window.antagon.init();
      return settings.quickNicknames.join(',') === 'Antagon_Test,PvP_Alt';
    });
    await page.click('[data-quick-nickname="PvP_Alt"]');
    await page.waitForFunction(() => document.querySelector('#profile-name').textContent === 'PvP_Alt');
    assert.equal(await page.locator('#profile-mode').textContent(), 'Offline');
    await page.click('#profile-open');
    await page.click('[data-quick-nickname="Antagon_Test"]');
    await page.waitForFunction(() => document.querySelector('#profile-name').textContent === 'Antagon_Test');
    await page.click('[data-view="play"]');
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'true');
    await page.evaluate(() => {
      document.body.dataset.phase = 'running';
    });
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'false');
    await page.evaluate(() => {
      document.body.dataset.phase = 'idle';
    });
    await page.waitForFunction(() => document.querySelector('#map').dataset.animating === 'true');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
    await page.waitForFunction(() => window.innerWidth <= 800 && window.innerHeight <= 600);
    const narrowLayout = await page.evaluate(() => ({
      width: window.innerWidth,
      pageWidth: document.documentElement.clientWidth,
      headerWidth: document.querySelector('.topbar').clientWidth,
      headerScrollWidth: document.querySelector('.topbar').scrollWidth,
    }));
    assert.equal(narrowLayout.width, narrowLayout.pageWidth);
    assert.ok(narrowLayout.headerScrollWidth <= narrowLayout.headerWidth);
    await page.click('[data-view="settings"]');
    await page.locator('#discord-presence').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#discord-presence').isChecked(), false);
    assert.equal(await page.locator('#discord-state').textContent(), 'Desactivado');
    const state = await page.evaluate(() => window.antagon.init());
    assert.equal(state.settings.nickname, 'Antagon_Test');
    assert.equal(state.settings.memory, 5);
    assert.equal(state.settings.background, 'scene');
    assert.equal(state.settings.pack, false);
    assert.equal(state.settings.accentColor, '#3182ce');
    await app.evaluate(({ ipcMain }) => {
      for (const channel of ['community:state', 'admin:access', 'admin:find', 'admin:catalog', 'admin:createCape'])
        ipcMain.removeHandler(channel);
      const me = {
        id: '670ffb62-9dfc-4276-8a22-8f51b90691bb',
        name: 'Voxesz',
        mcUuid: '670ffb629dfc42768a228f51b90691bb',
      };
      ipcMain.handle('community:state', () => ({ ok: true, value: { me, friends: [], incoming: [], outgoing: [] } }));
      ipcMain.handle('admin:access', () => ({ ok: true, value: { isAdmin: true, isOwner: true, isBanned: false } }));
      ipcMain.handle('admin:find', () => ({
        ok: true,
        value: {
          user_id: me.id,
          name: me.name,
          mc_uuid: me.mcUuid,
          is_admin: true,
          is_owner: true,
          is_banned: false,
          ban_reason: null,
          coins: 0,
          items: [],
        },
      }));
      const catalog = [
        { id: 'antagon_cape', name: 'Capa Antagon', kind: 'cape', price: 100, active: true, custom: false, owners: 3 },
        {
          id: 'antagon_logo_cape',
          name: 'Capa Logo Antagon',
          kind: 'cape',
          price: 100,
          active: false,
          custom: false,
          owners: 1,
        },
        { id: 'antagon_crown', name: 'Coroa Antagon', kind: 'hat', price: 250, active: true, custom: false, owners: 0 },
        {
          id: 'custom_0123456789abcdef',
          name: 'Capa Teste',
          kind: 'cape',
          price: 0,
          active: false,
          custom: true,
          owners: 1,
          mine: true,
        },
      ];
      ipcMain.handle('admin:catalog', () => ({ ok: true, value: catalog }));
      ipcMain.handle('admin:createCape', (_event, cape) => {
        globalThis.createdCape = { ...cape, png: Buffer.from(cape.png) };
        return { ok: true, value: 'custom_0123456789abcdef' };
      });
    });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#admin-tab').hidden);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('game:open-view', 'admin'),
    );
    await page.waitForFunction(() => document.querySelector('#view-admin').classList.contains('active'));
    await page.click('[data-view="admin"]');
    await page.fill('#admin-name', 'Voxesz');
    await page.click('#admin-search button');
    assert.equal(await page.locator('#admin-target-name').textContent(), 'Voxesz');
    await page.screenshot({ path: path.join(root, 'build/admin-preview.png') });

    await page.click('[data-admin-tab="catalog"]');
    await page.waitForFunction(() => document.querySelectorAll('#admin-catalog .catalog-row').length === 4);
    assert.equal(await page.locator('[data-catalog-action="delete"]').count(), 1);
    assert.equal(await page.locator('[data-catalog-action="take"][data-mine="1"]').count(), 1);
    assert.match(await page.locator('#admin-catalog').textContent(), /Fuera de la tienda/);
    await page.waitForFunction(() => [...document.querySelectorAll('#admin-catalog img')].every((i) => i.complete));
    await page.screenshot({ path: path.join(root, 'build/admin-catalog.png') });
    await page.click('[data-admin-tab="editor"]');
    await page.fill('#cape-name', 'Capa de prueba');
    await page.fill('#cape-text', 'PRIMARIX');
    await page.setInputFiles('#cape-image', path.join(root, 'assets/antagon-coin.png'));
    await page.waitForFunction(() => !document.querySelector('#cape-image-clear').hidden);
    await page.click('[data-destination="player"]');
    assert.equal(await page.locator('#cape-target').isVisible(), true);
    await page.fill('#cape-target', 'Amigo');
    await page.screenshot({ path: path.join(root, 'build/cape-editor.png') });
    await page.click('#cape-create');
    await page.waitForFunction(() => /Capa creada/.test(document.querySelector('#toast').textContent));
    const created = await app.evaluate(
      () =>
        globalThis.createdCape && {
          ...globalThis.createdCape,
          png: [globalThis.createdCape.png.readUInt32BE(16), globalThis.createdCape.png.readUInt32BE(20)],
        },
    );
    assert.deepEqual(created, {
      name: 'Capa de prueba',
      price: 100,
      destination: 'player',
      target: 'Amigo',
      png: [1024, 512],
    });

    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('community:notify', {
        kind: 'accepted',
        name: 'AmigoTeste',
        uuid: null,
        text: 'aceitou seu pedido de amizade',
      }),
    );
    await page.waitForSelector('#notices .notice');
    assert.match(await page.locator('#notices').textContent(), /AmigoTeste aceitou seu pedido de amizade/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, 'build/notice-preview.png') });
    await app.evaluate(({ ipcMain }) => {
      let logins = 0;
      ipcMain.removeHandler('account:login');
      ipcMain.handle('account:login', () => ({
        ok: true,
        value: ++logins === 1 ? { name: 'CuentaUno', id: 'uuid-1' } : { name: 'CuentaDos', id: 'uuid-2' },
      }));
    });
    await page.click('#profile-open');
    await page.click('[data-account-mode="microsoft"]');
    await page.click('#login-microsoft');
    await page.waitForFunction(() => document.querySelector('#connected-account').textContent === 'CuentaUno');
    assert.equal(await page.locator('#login-microsoft').textContent(), 'Cambiar cuenta Microsoft');
    await page.click('#profile-open');
    await page.click('[data-account-mode="microsoft"]');
    await page.click('#login-microsoft');
    await page.waitForFunction(() => document.querySelector('#connected-account').textContent === 'CuentaDos');
    assert.equal(await page.locator('#profile-name').textContent(), 'CuentaDos');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(
      'UI OK: salas y chat de voz, tienda, admin, navegación, movimiento reducido, nicks rápidos, cuenta Microsoft y Discord.',
    );
  } finally {
    await app.close();
    await voiceServer.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
