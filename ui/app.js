import { setWallpaper } from './wallpaper.js';
import { createSettingsStore, createConversation } from './state.mjs';
import { createCalls } from './call.js';

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const api = window.antagon;
document.body.classList.add(api.platform);
let settings,
  settingsStore,
  account,
  toastTimer,
  communityConfigured = false,
  cosmeticStorageUrl = '',
  installedMods = [],
  pendingResourcePacks = [];
let adminAccess = { isAdmin: false, isOwner: false, isBanned: false },
  adminTarget = null;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4e3);
}
const calls = createCalls({
  api,
  me: () => people.me,
  nameOf: (id) => people.friends.find((friend) => friend.id === id)?.name,
  toast,
  onChange: renderCall,
});
async function persist(patch) {
  const request = settingsStore.update(patch);
  settings = settingsStore.value;
  await request;
  settings = settingsStore.value;
}

function action(selector, handler, error = (e) => toast(e.message)) {
  const button = $(selector);
  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await handler();
    } catch (e) {
      error(e);
    } finally {
      button.disabled = false;
    }
  };
}

function setting(selector, key, read) {
  $(selector).onchange = async (event) => {
    try {
      await persist({ [key]: read(event.target) });
    } catch (e) {
      toast(e.message);
    }
  };
}

function renderMods() {
  const filter = $('#mods-filter').value.trim().toLocaleLowerCase();
  const visible = installedMods.filter((mod) => `${mod.name} ${mod.fileName}`.toLocaleLowerCase().includes(filter));
  $('#mods-empty').hidden = visible.length > 0;
  $('#mods-empty').textContent = installedMods.length ? 'No hay mods que coincidan.' : 'No hay mods instalados.';
  $('#mods-import').disabled = gameRunning;
  $('#mods-list').innerHTML = visible
    .map(
      (mod) =>
        `<div class="mod-row"><div class="mod-details"><strong>${escape(mod.name)}</strong><small>${escape(mod.fileName)}${mod.protected ? ' · Gestionado por Primarix' : ''}</small></div><span class="mod-state${mod.enabled ? ' enabled' : ''}">${mod.enabled ? 'Activo' : 'Desactivado'}</span><button class="secondary" data-mod-toggle="${escape(mod.fileName)}" ${mod.protected || gameRunning ? 'disabled' : ''}>${mod.enabled ? 'Desactivar' : 'Activar'}</button></div>`,
    )
    .join('');
}

async function refreshMods() {
  try {
    const result = await api.mods.list();
    installedMods = result.mods;
    $('#mods-path').textContent = 'Mods externos del perfil Primarix';
    renderMods();
  } catch (error) {
    toast(error.message);
  }
}

$('#mods-filter').addEventListener('input', renderMods);
$('#mods-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-mod-toggle]');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    installedMods = await api.mods.toggle(button.dataset.modToggle);
    renderMods();
    toast('Cambio guardado. Reinicia Minecraft para aplicarlo.');
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});
action('#mods-import', async () => {
  const result = await api.mods.add();
  installedMods = result.mods;
  $('#mods-path').textContent = 'Mods externos del perfil Primarix';
  renderMods();
  if (result.added)
    toast(
      `${result.added} mod${result.added === 1 ? '' : 's'} importado${result.added === 1 ? '' : 's'}. Reinicia Minecraft para aplicarlo.`,
    );
});
action('#mods-refresh', refreshMods);

const resourcePackInput = $('#resourcepacks-input');
const resourcePackDrop = $('#resourcepacks-drop');
let resourcePackOffset = 0;
let resourcePackTotal = 0;
let resourcePackResultLimit = 0;
let resourcePackCatalogRequest = 0;
let resourcePackDetailsRequest = 0;
const installedCatalogPacks = new Set();
const numberFormat = new Intl.NumberFormat('es');

function catalogCard(pack) {
  const card = document.createElement('article');
  card.className = 'resourcepack-card';
  const heading = document.createElement('div');
  heading.className = 'resourcepack-card-heading';
  if (pack.icon) {
    const icon = document.createElement('img');
    icon.src = pack.icon;
    icon.alt = '';
    icon.loading = 'lazy';
    icon.referrerPolicy = 'no-referrer';
    heading.append(icon);
  } else {
    const icon = document.createElement('span');
    icon.className = 'resourcepack-placeholder';
    icon.textContent = '✦';
    heading.append(icon);
  }
  const title = document.createElement('div');
  title.className = 'resourcepack-title';
  const name = document.createElement('strong');
  name.textContent = pack.title;
  const creator = document.createElement('small');
  creator.textContent = `${numberFormat.format(pack.downloads)} descargas · ${pack.license}`;
  title.append(name, creator);
  heading.append(title);
  const description = document.createElement('p');
  description.textContent = pack.description || 'Paquete de recursos compatible con Minecraft 1.8.9.';
  const tags = document.createElement('div');
  tags.className = 'resourcepack-tags';
  for (const category of pack.categories.slice(0, 4)) {
    const tag = document.createElement('span');
    tag.textContent = category;
    tags.append(tag);
  }
  const footer = document.createElement('div');
  footer.className = 'resourcepack-card-footer';
  const source = document.createElement('a');
  source.href = '#';
  source.textContent = 'Ver proyecto';
  source.addEventListener('click', (event) => {
    event.preventDefault();
    showResourcePackDetails(pack.id);
  });
  const install = document.createElement('button');
  install.className = installedCatalogPacks.has(pack.id) ? 'secondary' : 'primary';
  install.dataset.packInstall = pack.id;
  install.textContent = installedCatalogPacks.has(pack.id) ? 'Instalado' : 'Instalar';
  install.disabled = installedCatalogPacks.has(pack.id) || gameRunning;
  install.title = gameRunning ? 'Cierra Minecraft para instalar paquetes' : '';
  footer.append(source, install);
  card.append(heading, description, tags, footer);
  return card;
}

async function showResourcePackDetails(projectId) {
  const request = ++resourcePackDetailsRequest;
  const dialog = $('#resourcepack-details-dialog');
  const content = $('#resourcepack-details-content');
  const status = $('#resourcepack-details-status');
  content.hidden = true;
  $('#resourcepack-details-title').textContent = 'Paquete de recursos';
  status.textContent = 'Cargando información y capturas…';
  dialog.showModal();
  try {
    const pack = await api.resourcepacks.details(projectId);
    if (request !== resourcePackDetailsRequest) return;
    $('#resourcepack-details-title').textContent = pack.title;
    $('#resourcepack-details-description').textContent =
      pack.description || 'Paquete de recursos compatible con Minecraft 1.8.9.';
    $('#resourcepack-details-meta').replaceChildren();
    for (const text of [
      `${numberFormat.format(pack.downloads)} descargas`,
      `${numberFormat.format(pack.followers)} seguidores`,
      `Licencia: ${pack.license}`,
      `Minecraft ${pack.versions.join(', ')}`,
      pack.latestVersion ? `Versión: ${pack.latestVersion}` : '',
    ].filter(Boolean)) {
      const item = document.createElement('span');
      item.textContent = text;
      $('#resourcepack-details-meta').append(item);
    }
    const tags = $('#resourcepack-details-tags');
    tags.replaceChildren();
    for (const category of pack.categories) {
      const tag = document.createElement('span');
      tag.textContent = category;
      tags.append(tag);
    }
    const gallery = $('#resourcepack-details-gallery');
    gallery.replaceChildren();
    for (const image of pack.gallery) {
      const figure = document.createElement('figure');
      const picture = document.createElement('img');
      picture.src = image.url;
      picture.alt = image.title || image.description || `Captura de ${pack.title}`;
      picture.loading = 'lazy';
      picture.referrerPolicy = 'no-referrer';
      figure.append(picture);
      if (image.title || image.description) {
        const caption = document.createElement('figcaption');
        caption.textContent = image.title || image.description;
        figure.append(caption);
      }
      gallery.append(figure);
    }
    if (!pack.gallery.length) {
      const empty = document.createElement('p');
      empty.className = 'resourcepack-gallery-empty';
      empty.textContent = 'Este paquete no tiene capturas publicadas.';
      gallery.append(empty);
    }
    $('#resourcepack-details-body').textContent = pack.body;
    $('#resourcepack-details-body').hidden = !pack.body;
    const projectLink = $('#resourcepack-details-link');
    projectLink.href = pack.projectUrl;
    projectLink.onclick = (event) => {
      event.preventDefault();
      api.resourcepacks.openProject(pack.projectUrl).catch((error) => toast(error.message));
    };
    content.hidden = false;
    status.textContent = `${pack.gallery.length} capturas · compatible con Minecraft 1.8.9`;
  } catch (error) {
    if (request === resourcePackDetailsRequest) status.textContent = `No se pudo cargar el proyecto: ${error.message}`;
  }
}

function renderResourcePackCatalog(hits, append) {
  const catalog = $('#resourcepacks-catalog');
  const fragment = document.createDocumentFragment();
  for (const pack of hits) fragment.append(catalogCard(pack));
  if (append) catalog.append(fragment);
  else catalog.replaceChildren(fragment);
  $('#resourcepacks-more').hidden =
    resourcePackOffset >= Math.min(resourcePackTotal, resourcePackResultLimit) || hits.length === 0;
}

async function searchResourcePackCatalog({ append = false } = {}) {
  if (gameRunning && append) return;
  const request = ++resourcePackCatalogRequest;
  const query = $('#resourcepacks-query').value.trim();
  const sort = $('#resourcepacks-sort').value;
  const offset = append ? resourcePackOffset : 0;
  const status = $('#resourcepacks-catalog-status');
  const searchButton = $('#resourcepacks-search-button');
  searchButton.disabled = true;
  $('#resourcepacks-more').disabled = true;
  status.textContent = 'Buscando paquetes compatibles…';
  if (!append) $('#resourcepacks-catalog').replaceChildren();
  try {
    const result = await api.resourcepacks.search({ query, sort, offset });
    if (request !== resourcePackCatalogRequest) return;
    resourcePackOffset = offset + result.hits.length;
    resourcePackTotal = result.total;
    resourcePackResultLimit = result.maxResults;
    renderResourcePackCatalog(result.hits, append);
    status.textContent = result.total
      ? `${numberFormat.format(result.total)} paquetes compatibles · mostrando ${numberFormat.format(resourcePackOffset)}`
      : 'No encontramos paquetes compatibles con esa búsqueda.';
  } catch (error) {
    if (request !== resourcePackCatalogRequest) return;
    resourcePackOffset = 0;
    resourcePackTotal = 0;
    resourcePackResultLimit = 0;
    $('#resourcepacks-catalog').replaceChildren();
    $('#resourcepacks-more').hidden = true;
    status.textContent = `No se pudo cargar la biblioteca: ${error.message}`;
  } finally {
    if (request === resourcePackCatalogRequest) {
      searchButton.disabled = false;
      $('#resourcepacks-more').disabled = false;
    }
  }
}

$('#resourcepacks-search').addEventListener('submit', (event) => {
  event.preventDefault();
  searchResourcePackCatalog();
});
$('#resourcepacks-more').addEventListener('click', () => searchResourcePackCatalog({ append: true }));
function renderInstalledResourcePacks(packs) {
  const list = $('#resourcepacks-installed-list');
  list.replaceChildren();
  if (!packs.length) {
    $('#resourcepacks-installed-status').textContent = 'Todavía no tienes paquetes instalados en tu perfil.';
    return;
  }
  const validCount = packs.filter((pack) => pack.valid).length;
  $('#resourcepacks-installed-status').textContent =
    `${numberFormat.format(packs.length)} paquete${packs.length === 1 ? '' : 's'} en tu perfil · ${validCount} compatible${validCount === 1 ? '' : 's'} con Minecraft 1.8.9`;
  for (const pack of packs) {
    const card = document.createElement('article');
    card.className = 'resourcepacks-installed-card';
    if (pack.icon) {
      const icon = document.createElement('img');
      icon.src = pack.icon;
      icon.alt = '';
      icon.className = 'resourcepacks-installed-icon';
      card.append(icon);
    }
    const details = document.createElement('div');
    details.className = 'resourcepacks-installed-details';
    const name = document.createElement('strong');
    name.textContent = pack.name;
    const file = document.createElement('small');
    file.textContent = `${pack.fileName} · ${(pack.bytes / (1024 * 1024)).toFixed(2)} MB`;
    details.append(name, file);
    if (pack.description) {
      const description = document.createElement('p');
      description.textContent = pack.description;
      details.append(description);
    }
    if (!pack.valid) {
      const error = document.createElement('small');
      error.className = 'resourcepacks-installed-error';
      error.textContent = pack.error;
      details.append(error);
    }
    const status = document.createElement('span');
    status.className = `resourcepacks-installed-badge${pack.valid ? ' compatible' : ''}`;
    status.textContent = pack.valid ? 'Compatible' : 'No compatible';
    card.append(details, status);
    list.append(card);
  }
}

async function refreshInstalledResourcePacks() {
  const status = $('#resourcepacks-installed-status');
  status.textContent = 'Leyendo paquetes instalados…';
  $('#resourcepacks-installed-refresh').disabled = true;
  try {
    renderInstalledResourcePacks(await api.resourcepacks.list());
  } catch (error) {
    status.textContent = `No se pudo leer la lista: ${error.message}`;
  } finally {
    $('#resourcepacks-installed-refresh').disabled = false;
  }
}

$('#resourcepacks-open-folder').addEventListener('click', async () => {
  $('#resourcepacks-installed-dialog').showModal();
  await refreshInstalledResourcePacks();
});
$('#resourcepacks-installed-refresh').addEventListener('click', refreshInstalledResourcePacks);
$('#resourcepacks-installed-folder').addEventListener('click', async () => {
  try {
    await api.openFolder('resourcepacks');
  } catch (error) {
    toast(error.message);
  }
});
$('#resourcepacks-catalog').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-pack-install]');
  if (!button || button.disabled) return;
  const projectId = button.dataset.packInstall;
  button.disabled = true;
  button.textContent = 'Descargando…';
  $('#resourcepacks-catalog-status').textContent = 'Descargando y validando el ZIP del proyecto…';
  try {
    const result = await api.resourcepacks.install(projectId);
    installedCatalogPacks.add(projectId);
    button.textContent = 'Instalado';
    button.className = 'secondary';
    $('#resourcepacks-path').textContent = result.directory;
    $('#resourcepacks-result').textContent =
      `${result.installed.name} se instaló en tu perfil. Actívalo desde Opciones > Paquetes de recursos en Minecraft.`;
    $('#resourcepacks-catalog-status').textContent = `Instalado: ${result.installed.name}`;
    toast(`${result.installed.name} se instaló. Actívalo desde el menú de Minecraft.`);
  } catch (error) {
    button.disabled = gameRunning;
    button.textContent = 'Reintentar';
    $('#resourcepacks-catalog-status').textContent = error.message;
  }
});

function selectResourcePacks(files) {
  pendingResourcePacks = [...files].slice(0, 10);
  $('#resourcepacks-selection').textContent = pendingResourcePacks.length
    ? pendingResourcePacks.map((file) => file.name).join(', ')
    : 'Ningún archivo seleccionado';
  $('#resourcepacks-import').disabled = pendingResourcePacks.length === 0;
}
resourcePackDrop.addEventListener('click', () => resourcePackInput.click());
resourcePackDrop.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    resourcePackInput.click();
  }
});
resourcePackInput.addEventListener('change', () => selectResourcePacks(resourcePackInput.files));
resourcePackDrop.addEventListener('dragover', (event) => {
  event.preventDefault();
  resourcePackDrop.classList.add('dragging');
});
resourcePackDrop.addEventListener('dragleave', () => resourcePackDrop.classList.remove('dragging'));
resourcePackDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  resourcePackDrop.classList.remove('dragging');
  selectResourcePacks(event.dataTransfer.files);
});
action('#resourcepacks-import', async () => {
  const result = await api.resourcepacks.import(pendingResourcePacks);
  pendingResourcePacks = [];
  resourcePackInput.value = '';
  selectResourcePacks([]);
  $('#resourcepacks-path').textContent = result.directory;
  $('#resourcepacks-result').textContent = `Paquete guardado en ${result.directory}`;
  const list = document.createDocumentFragment();
  for (const pack of result.imported) {
    const item = document.createElement('div');
    const name = document.createElement('strong');
    const file = document.createElement('small');
    item.className = 'resourcepack-row';
    name.textContent = pack.name;
    file.textContent = pack.fileName;
    item.append(name, file);
    list.append(item);
  }
  $('#resourcepacks-list').replaceChildren(list);
  if (result.errors.length) toast(result.errors.join(' '));
});
$$('[data-view]').forEach(
  (tab) =>
    (tab.onclick = () => {
      $$('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.view').forEach((view) => view.classList.toggle('active', view.id === 'view-' + tab.dataset.view));
      if (tab.dataset.view === 'friends' && conversation.selected) {
        unread.delete(conversation.selected);
        renderCommunity();
        renderMessages();
      }
      if (tab.dataset.view === 'mods') refreshMods();
      if (tab.dataset.view === 'admin') refreshAdminAccess();
      if (tab.dataset.view === 'resourcepacks' && !resourcePackCatalogRequest) searchResourcePackCatalog();
    }),
);
api.onOpenView((view) => {
  if (!['settings', 'friends', 'admin', 'mods', 'resourcepacks'].includes(view)) return;
  const tab = $(`[data-view="${view}"]`);
  if (tab && !tab.hidden) tab.click();
});
function renderProfile() {
  const microsoft = settings.mode === 'microsoft' && account,
    name = microsoft ? account.name : settings.nickname;
  $('#profile-name').textContent = name;
  $('#profile-mode').textContent = microsoft ? 'Microsoft' : 'Offline';
  $('#profile-admin').hidden = !adminAccess.isAdmin;
  $('#avatar').textContent = name[0].toUpperCase();
  $('#nickname').value = settings.nickname;
  $('#connected-account').textContent = account ? account.name : '';
  $('#login-microsoft').textContent = account ? 'Cambiar cuenta Microsoft' : 'Iniciar sesión con Microsoft';
  $('#logout-microsoft').hidden = !account;
}
function accountTab(mode) {
  $$('[data-account-mode]').forEach((b) => b.classList.toggle('active', b.dataset.accountMode === mode));
  $('#offline-form').hidden = mode !== 'offline';
  $('#microsoft-form').hidden = mode !== 'microsoft';
  $('#account-error').textContent = '';
}
$$('[data-account-mode]').forEach((b) => (b.onclick = () => accountTab(b.dataset.accountMode)));
$('#profile-open').onclick = () => {
  renderProfile();
  accountTab(settings.mode);
  $('#account-dialog').showModal();
};
$$('[data-close]').forEach((b) => (b.onclick = () => $('#' + b.dataset.close).close()));
action(
  '#save-nick',
  async () => {
    const nick = $('#nickname').value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      $('#account-error').textContent = 'Use 3 a 16 letras, números ou _.';
      return;
    }
    await persist({ nickname: nick, mode: 'offline' });
    renderProfile();
    $('#account-dialog').close();
    if (gameRunning) toast('Nick guardado. Cierra y vuelve a iniciar Minecraft para aplicar el cambio.');
  },
  (e) => {
    $('#account-error').textContent = e.message;
  },
);
$('#nickname').onkeydown = (e) => {
  if (e.key === 'Enter') $('#save-nick').click();
};
function renderQuickNicknames() {
  $('#quick-nicknames').innerHTML = settings.quickNicknames
    .map(
      (nickname) =>
        `<span class="quick-nickname"><button type="button" data-quick-nickname="${escape(nickname)}">${escape(nickname)}</button><button type="button" class="quick-nickname-remove" data-remove-quick-nickname="${escape(nickname)}" aria-label="Quitar ${escape(nickname)}">×</button></span>`,
    )
    .join('');
}
$('#save-quick-nickname').onclick = async () => {
  const nickname = $('#nickname').value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    $('#account-error').textContent = 'Usa de 3 a 16 letras, números o _.';
    return;
  }
  if (settings.quickNicknames.includes(nickname)) {
    toast('Ese nick ya está en accesos rápidos.');
    return;
  }
  if (settings.quickNicknames.length >= 8) {
    toast('Puedes guardar hasta 8 nicks rápidos.');
    return;
  }
  try {
    await persist({ quickNicknames: [...settings.quickNicknames, nickname] });
    renderQuickNicknames();
    toast(`Nick ${nickname} guardado para cambiar rápido.`);
  } catch (error) {
    $('#account-error').textContent = error.message;
  }
};
$('#quick-nicknames').addEventListener('click', async (event) => {
  const select = event.target.closest('[data-quick-nickname]');
  const remove = event.target.closest('[data-remove-quick-nickname]');
  try {
    if (remove) {
      await persist({
        quickNicknames: settings.quickNicknames.filter((nickname) => nickname !== remove.dataset.removeQuickNickname),
      });
      renderQuickNicknames();
      return;
    }
    if (!select) return;
    await persist({ nickname: select.dataset.quickNickname, mode: 'offline' });
    renderProfile();
    $('#account-dialog').close();
    toast(
      gameRunning
        ? `Nick ${settings.nickname} guardado. Sal al menú principal y vuelve a entrar al servidor para aplicarlo.`
        : `Ahora jugarás con el nick ${settings.nickname}.`,
    );
  } catch (error) {
    $('#account-error').textContent = error.message;
  }
});
$('#login-microsoft').onclick = async () => {
  const button = $('#login-microsoft');
  button.disabled = true;
  $('#account-error').textContent = '';
  try {
    account = await api.login();
    await persist({ mode: 'microsoft' });
    renderProfile();
    $('#account-dialog').close();
    if (gameRunning) toast('Cuenta Microsoft cambiada. Reinicia Minecraft para usarla en servidores online.');
    community
      .login()
      .catch(() => null)
      .then(refreshCommunity);
  } catch (e) {
    $('#account-error').textContent = e.message;
  } finally {
    button.disabled = false;
  }
};
action(
  '#logout-microsoft',
  async () => {
    const result = await api.logout();
    account = result.account;
    settingsStore = createSettingsStore(result.settings, api.saveSettings);
    settings = settingsStore.value;
    renderProfile();
    if (!account) resetCommunity();
  },
  (e) => {
    $('#account-error').textContent = e.message;
  },
);
function updateState(state) {
  gameRunning = state.activeInstances > 0 || ['launching', 'running'].includes(state.phase);
  document.body.dataset.phase = state.phase;
  const working = ['preparing', 'launching', 'updating'].includes(state.phase);
  const gameLocked = working || gameRunning;
  $('#launch-status').textContent =
    state.phase === 'running' && state.activeInstances > 0
      ? `${state.activeInstances} ${state.activeInstances === 1 ? 'instancia abierta' : 'instancias abiertas'}`
      : state.message;
  $('#launch').disabled = working;
  $('#launch').textContent =
    state.activeInstances > 0 && !working
      ? 'OTRA INSTANCIA'
      : state.phase === 'updating'
        ? 'ACTUALIZANDO…'
        : working
          ? 'INICIANDO…'
          : 'JUGAR';
  for (const button of $$('#optifine-install, #optifine-remove')) button.disabled = gameLocked;
  $$('#resourcepacks-catalog [data-pack-install]').forEach((button) => {
    if (!installedCatalogPacks.has(button.dataset.packInstall)) button.disabled = gameRunning;
    button.title = gameRunning ? 'Cierra Minecraft para instalar paquetes' : '';
  });
  $('#progress-track').style.display = ['preparing', 'updating'].includes(state.phase) ? 'block' : 'none';
  $('#update').disabled = gameLocked;
  $('#progress-bar').style.width = Math.max(0, Math.min(100, state.percent || 0)) + '%';
}
$('#launch').onclick = async () => {
  if (settings.mode === 'microsoft' && !account) {
    $('#profile-open').click();
    accountTab('microsoft');
    return;
  }
  try {
    $('#launch').disabled = true;
    await settingsStore.flush();
    await api.launch();
  } catch (e) {
    toast(e.message);
    $('#launch').disabled = false;
  }
};
$('#memory').oninput = (e) => ($('#memory-value').textContent = e.target.value + ' GB');
setting('#memory', 'memory', (input) => Number(input.value));
function renderAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  $('#accent-color').value = color;
}
setting('#accent-color', 'accentColor', (input) => input.value);
$('#accent-color').addEventListener('input', (event) => renderAccent(event.target.value));
setting('#fullscreen', 'fullscreen', (input) => input.checked);
setting('#pack-toggle', 'pack', (input) => input.checked);
setting('#share-server', 'shareServer', (input) => input.checked);
setting('#discord-presence', 'discordPresence', (input) => input.checked);
api.discord.onState((state) => {
  $('#discord-state').textContent = state.message;
});
function renderOptifine(file) {
  $('#optifine-state').textContent = file || 'No instalado';
  $('#optifine-install').textContent = file ? 'Cambiar' : 'Instalar';
  $('#optifine-remove').hidden = !file;
}
action('#optifine-site', async () => {
  await api.optifineSite();
  toast('Descarga OptiFine 1.8.9 (HD U M5) y después pulsa Instalar.');
});
$('#optifine-install').onclick = async () => {
  try {
    renderOptifine(await api.installOptifine());
  } catch (e) {
    toast(e.message);
  }
};
action('#optifine-remove', async () => renderOptifine(await api.removeOptifine()));
async function renderWallpaper(custom) {
  $('#wallpaper-state').textContent = custom ? 'Imagen personalizada' : 'Predeterminado';
  $('#wallpaper-reset').hidden = !custom;
  return setWallpaper(custom);
}
$('#wallpaper-pick').onclick = async () => {
  try {
    const custom = await api.pickWallpaper();
    if (custom !== void 0) await renderWallpaper(custom);
  } catch (e) {
    toast(e.message);
  }
};
action('#wallpaper-reset', async () => renderWallpaper(await api.resetWallpaper()));
let updateStatus = null;
const UPDATE_LABEL = {
  dev: () => 'Versión de desarrollo',
  latest: (u) => '✓ Actualizado · v' + u.current,
  offline: () => 'No se pudieron comprobar actualizaciones',
  unconfigured: () => 'Actualizaciones no configuradas',
  available: (u) => 'Actualizar a ' + u.version,
};
async function checkUpdate() {
  $('#update').className = 'update-status';
  $('#update').textContent = 'Buscando actualizaciones…';
  updateStatus = await api.checkUpdate().catch(() => ({ status: 'offline' }));
  $('#update').className = updateStatus.status === 'available' ? 'update' : 'update-status';
  $('#update').disabled = updateStatus.status === 'unconfigured';
  $('#update').textContent = UPDATE_LABEL[updateStatus.status](updateStatus);
}
$('#update').onclick = async () => {
  if (updateStatus?.status !== 'available') return checkUpdate();
  try {
    await api.installUpdate();
  } catch (e) {
    toast(e.message);
  }
};
function renderBackground() {
  document.body.dataset.background = 'scene';
}
for (const folder of ['resourcepacks', 'screenshots'])
  action(`#open-${folder}`, async () => {
    const error = await api.openFolder(folder);
    if (error) toast(error);
  });
action('#open-logs', async () => {
  $('#logs-text').textContent = await api.logs();
  $('#logs-dialog').showModal();
});
const community = api.community;
const ITEMS = {
  antagon_cape: {
    name: 'Capa Primarix',
    kind: 'cape',
    image: '../assets/antagon-cape.png',
    description: 'Capa oscura con el símbolo de Primarix.',
  },
  antagon_logo_cape: {
    name: 'Capa Primarix Roja',
    kind: 'cape',
    image: '../assets/antagon-logo-cape.png',
    description: 'Capa roja con la marca de Primarix.',
  },
  antagon_crown: {
    name: 'Corona Primarix',
    kind: 'hat',
    image: '../assets/antagon-crown.png',
    description: 'Corona dorada en 3D sobre la cabeza.',
  },
};
const cosmeticUrl = (id) =>
  /^custom_[a-f0-9]{16}$/.test(id) && cosmeticStorageUrl
    ? `${cosmeticStorageUrl}/storage/v1/object/public/cosmetics/${id}.png`
    : '';
function itemPreview(item) {
  if (item.custom) return `<div class="cape-face" style="background-image: url('${cosmeticUrl(item.id)}')"></div>`;
  const meta = ITEMS[item.id] || ITEMS.antagon_cape;
  return `<img class="${item.kind === 'hat' ? 'hat' : ''}" src="${meta.image}" alt="" />`;
}
const itemDescription = (item) =>
  ITEMS[item.id]?.description || (item.kind === 'hat' ? 'Accesorio para la cabeza.' : 'Capa exclusiva.');
async function refreshAdminAccess() {
  if (!people.me) {
    adminAccess = { isAdmin: false, isOwner: false, isBanned: false };
  } else {
    try {
      adminAccess = await api.admin.access();
    } catch {
      adminAccess = { isAdmin: false, isOwner: false, isBanned: false };
    }
  }
  $('#admin-tab').hidden = !adminAccess.isAdmin;
  $('#profile-admin').hidden = !adminAccess.isAdmin;
  if (adminAccess.isAdmin) refreshCatalog();
  if (!adminAccess.isAdmin) {
    adminTarget = null;
    $('#admin-result').hidden = true;
    if ($('#view-admin').classList.contains('active')) $('[data-view="play"]').click();
  }
  return adminAccess;
}

function renderAdminTarget() {
  const user = adminTarget;
  $('#admin-result').hidden = !user;
  $('#admin-empty').hidden = !!user;
  if (!user) return;
  $('#admin-target-name').textContent = user.name;
  $('#admin-target-id').textContent = user.mc_uuid;
  $('#admin-head').src = `https://mc-heads.net/avatar/${user.mc_uuid}/48`;
  $('#admin-target-role').hidden = !user.is_admin;
  $('#admin-coins').value = user.coins;
  $('#admin-items').innerHTML = adminCatalog
    .map((item) => {
      const owned = user.items.includes(item.id);
      return `<div class="admin-item"><span>${escape(ITEMS[item.id]?.name || item.name)}<small>${owned ? 'En inventario' : 'No lo tiene'}</small></span><button class="${owned ? 'secondary' : 'primary'}" data-admin-action="item" data-item="${escape(item.id)}">${owned ? 'Quitar' : 'Dar objeto'}</button></div>`;
    })
    .join('');
  $('#admin-role-card').hidden = !adminAccess.isOwner || user.user_id === people.me?.id || user.is_owner;
  $('#admin-role-button').textContent = user.is_admin ? 'Remover admin' : 'Tornar admin';
  $('#admin-ban-status').textContent = user.is_banned ? `Bloqueado: ${user.ban_reason}` : 'Cuenta activa';
  $('#admin-ban-button').textContent = user.is_banned ? 'Desbanir usuário' : 'Banir usuário';
  $('#admin-ban-button').disabled = user.is_admin || user.user_id === people.me?.id;
  $('#admin-ban-reason').hidden = user.is_banned;
  $('#admin-ban-reason').value = '';
}

$('#admin-search').onsubmit = async (event) => {
  event.preventDefault();
  try {
    adminTarget = await api.admin.find($('#admin-name').value.trim());
    renderAdminTarget();
  } catch (error) {
    adminTarget = null;
    renderAdminTarget();
    toast(error.message);
  }
};
$('#admin-result').onclick = async (event) => {
  const button = event.target.closest('[data-admin-action]');
  if (!button || button.disabled || !adminTarget) return;
  const action = button.dataset.adminAction;
  let value;
  if (action === 'coins') {
    value = Number($('#admin-coins').value);
    if (!Number.isInteger(value) || value < 0 || value > 10000000)
      return toast('Introduce un saldo entre 0 y 10.000.000.');
  } else if (action === 'item') {
    value = { item: button.dataset.item, grant: !adminTarget.items.includes(button.dataset.item) };
  } else if (action === 'role') {
    value = !adminTarget.is_admin;
  } else if (action === 'ban') {
    value = { banned: !adminTarget.is_banned, reason: $('#admin-ban-reason').value.trim() };
    if (value.banned && !value.reason) return toast('Indica el motivo del bloqueo.');
    if (value.banned && !confirm(`¿Bloquear a ${adminTarget.name} en Primarix Client?`)) return;
  }
  button.disabled = true;
  try {
    await api.admin.change(action, adminTarget.user_id, value);
    adminTarget = await api.admin.find(adminTarget.name);
    renderAdminTarget();
    toast('Alteração salva.');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
};
let adminCatalog = [];
async function refreshCatalog() {
  try {
    adminCatalog = await api.admin.catalog();
  } catch (error) {
    toast(error.message);
  }
  renderCatalog();
  renderAdminTarget();
}
function renderCatalog() {
  $('#admin-catalog').innerHTML = adminCatalog.length
    ? adminCatalog
        .map((item) => {
          const id = escape(item.id),
            displayName = ITEMS[item.id]?.name || item.name;
          const remove = item.custom
            ? `<button class="danger" data-catalog-action="delete" data-catalog-item="${id}">Excluir</button>`
            : '';
          return `<div class="catalog-row"><div class="catalog-thumb">${itemPreview(item)}</div><span><b>${escape(displayName)}</b><small>${item.kind === 'hat' ? 'Accesorio' : 'Capa'} · ${item.price} PRIMACOINS · ${item.owners} ${item.owners === 1 ? 'propietario' : 'propietarios'}</small></span><span class="catalog-state ${item.active ? 'on' : ''}">${item.active ? 'En la tienda' : 'Fuera de la tienda'}</span><div class="catalog-actions"><button class="${item.mine ? 'secondary' : 'primary'}" data-catalog-action="take" data-catalog-item="${id}" data-mine="${item.mine ? 1 : 0}">${item.mine ? 'Devolver' : 'Añadir'}</button><button class="secondary" data-catalog-action="active" data-catalog-item="${id}" data-active="${item.active ? 1 : 0}">${item.active ? 'Quitar de la tienda' : 'Poner en la tienda'}</button>${remove}</div></div>`;
        })
        .join('')
    : '<p class="admin-empty">Nenhum item cadastrado.</p>';
}
$('#admin-catalog').onclick = async (event) => {
  const button = event.target.closest('[data-catalog-action]');
  if (!button || button.disabled) return;
  const { catalogAction: action, catalogItem: item } = button.dataset;
  const name = adminCatalog.find((entry) => entry.id === item)?.name || item;
  if (
    action === 'delete' &&
    !confirm(`¿Eliminar "${name}"? La capa saldrá de la tienda y del inventario de todos los jugadores.`)
  )
    return;
  button.disabled = true;
  try {
    if (action === 'take') {
      adminCatalog = await api.admin.take(item, button.dataset.mine !== '1');
      toast(button.dataset.mine === '1' ? 'Objeto quitado de tu inventario.' : 'Objeto añadido a tu inventario.');
    } else if (action === 'delete') {
      adminCatalog = await api.admin.remove(item);
      toast('Capa excluída.');
    } else {
      adminCatalog = await api.admin.setActive(item, button.dataset.active !== '1');
      toast(
        button.dataset.active === '1'
          ? 'Objeto quitado de la tienda. Quienes ya lo tienen lo conservarán.'
          : 'Objeto añadido de nuevo a la tienda.',
      );
    }
    renderCatalog();
    renderAdminTarget();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
};
$('#admin-tabs').onclick = (event) => {
  const button = event.target.closest('[data-admin-tab]');
  if (!button) return;
  $$('#admin-tabs [data-admin-tab]').forEach((b) => b.classList.toggle('active', b === button));
  for (const tab of ['players', 'editor', 'catalog']) $(`#admin-${tab}`).hidden = tab !== button.dataset.adminTab;
  if (button.dataset.adminTab === 'catalog') refreshCatalog();
  if (button.dataset.adminTab === 'editor') drawCape();
};

// Cape editor. The canvas is the visible face of the cape (10x16 Minecraft pixels at 16x).
const cape = {
  canvas: $('#cape-canvas'),
  image: null,
  text: { x: 80, y: 128 },
  picture: { x: 80, y: 128 },
  drag: null,
  destination: 'store',
};
function drawCape() {
  const g = cape.canvas.getContext('2d');
  g.fillStyle = $('#cape-bg').value;
  g.fillRect(0, 0, 160, 256);
  if (cape.image) {
    const w = (160 * Number($('#cape-image-size').value)) / 100,
      h = (w * cape.image.naturalHeight) / cape.image.naturalWidth;
    g.drawImage(cape.image, cape.picture.x - w / 2, cape.picture.y - h / 2, w, h);
  }
  const text = $('#cape-text').value.trim();
  if (text) {
    g.font = `${$('#cape-text-size').value}px Pixelify`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = $('#cape-text-color').value;
    g.fillText(text, cape.text.x, cape.text.y);
  }
}
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map((bit) => Math.round(((n >> bit) & 255) * amount)).join(',')})`;
}
function capeTexture() {
  const out = document.createElement('canvas');
  out.width = 1024;
  out.height = 512;
  const g = out.getContext('2d');
  g.fillStyle = shade($('#cape-bg').value, 0.6);
  g.fillRect(0, 0, 22 * 16, 17 * 16);
  g.drawImage(cape.canvas, 16, 16);
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
function capePoint(event) {
  const rect = cape.canvas.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) * 160) / rect.width, y: ((event.clientY - rect.top) * 256) / rect.height };
}
cape.canvas.onpointerdown = (event) => {
  const p = capePoint(event),
    g = cape.canvas.getContext('2d'),
    text = $('#cape-text').value.trim();
  g.font = `${$('#cape-text-size').value}px Pixelify`;
  const size = Number($('#cape-text-size').value),
    onText =
      text &&
      Math.abs(p.x - cape.text.x) < g.measureText(text).width / 2 + 4 &&
      Math.abs(p.y - cape.text.y) < size / 2 + 4;
  const target = onText || !cape.image ? cape.text : cape.picture;
  cape.drag = { target, dx: target.x - p.x, dy: target.y - p.y };
  cape.canvas.setPointerCapture(event.pointerId);
};
cape.canvas.onpointermove = (event) => {
  if (!cape.drag) return;
  const p = capePoint(event);
  cape.drag.target.x = Math.round(p.x + cape.drag.dx);
  cape.drag.target.y = Math.round(p.y + cape.drag.dy);
  drawCape();
};
cape.canvas.onpointerup = cape.canvas.onpointercancel = () => (cape.drag = null);
for (const id of ['#cape-bg', '#cape-text', '#cape-text-color', '#cape-text-size', '#cape-image-size'])
  $(id).oninput = drawCape;
$('#cape-image-pick').onclick = () => $('#cape-image').click();
$('#cape-image').onchange = () => {
  const file = $('#cape-image').files[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    cape.image = image;
    cape.picture = { x: 80, y: 128 };
    $('#cape-image-size').value = 100;
    $('#cape-image-clear').hidden = false;
    drawCape();
  };
  image.onerror = () => toast('No se pudo abrir la imagen.');
  image.src = URL.createObjectURL(file);
};
$('#cape-image-clear').onclick = () => {
  cape.image = null;
  $('#cape-image').value = '';
  $('#cape-image-clear').hidden = true;
  drawCape();
};
$('#cape-destination').onclick = (event) => {
  const button = event.target.closest('[data-destination]');
  if (!button) return;
  cape.destination = button.dataset.destination;
  $$('#cape-destination button').forEach((b) => b.classList.toggle('active', b === button));
  $('#cape-price-field').hidden = cape.destination !== 'store';
  $('#cape-target-field').hidden = cape.destination !== 'player';
};
action('#cape-create', async () => {
  const name = $('#cape-name').value.trim();
  if (!name) return toast('Escribe un nombre para la capa.');
  if (cape.destination === 'player' && !$('#cape-target').value.trim()) return toast('Indica el nick del jugador.');
  const png = new Uint8Array(await (await capeTexture()).arrayBuffer());
  await api.admin.createCape({
    name,
    price: Number($('#cape-price').value),
    destination: cape.destination,
    target: $('#cape-target').value.trim(),
    png,
  });
  toast(
    cape.destination === 'store'
      ? 'Capa creada y publicada en la tienda.'
      : cape.destination === 'player'
        ? 'Capa creada y enviada al jugador.'
        : 'Capa creada y añadida al inventario.',
  );
  $('#cape-name').value = '';
  refreshCatalog();
});
document.fonts?.load('40px Pixelify').then(drawCape, drawCape);

const ACTIVITY = {
  launcher: () => 'En el launcher',
  menu: () => 'En el menú del juego',
  singleplayer: () => 'Jugando en solitario',
  server: (p) => 'Jugando en ' + p.server,
  playing: () => 'Jugando',
  offline: () => 'Offline',
};
let people = { me: null, friends: [], incoming: [], outgoing: [] },
  unread = new Set(),
  loaded = false,
  gameRunning = false,
  refreshTimer,
  refreshRequest = null,
  communityRevision = 0;
const conversation = createConversation();
const escape = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const head = (p) =>
  /^[0-9a-f]{32}$/.test(p.mcUuid || '')
    ? `<img class="head" src="https://mc-heads.net/avatar/${p.mcUuid}/32" alt="" />`
    : '<span class="head"></span>';

function renderCommunity() {
  const me = people.me;
  $('#community-gate').hidden = !!me;
  const microsoft = settings?.mode === 'microsoft' && account;
  $('#community-gate p').textContent = !communityConfigured
    ? 'Funciones online no configuradas para Primarix.'
    : microsoft
      ? 'Conectando con tu cuenta ' + account.name + '…'
      : 'La comunidad usa tu cuenta Microsoft. Inicia sesión en tu perfil para añadir amigos y conversar.';
  $('#community-login').textContent = !communityConfigured
    ? 'No disponible'
    : microsoft
      ? 'Reintentar'
      : 'Iniciar sesión con Microsoft';
  $('#community-login').disabled = !communityConfigured;
  $('#community').hidden = !me;
  $('#community-account').textContent = me ? 'Conectado como ' + me.name : 'Sin conexión';
  $('#community-logout').hidden = !me;
  const pending = people.incoming.length + unread.size;
  $('#friends-badge').textContent = pending;
  $('#friends-badge').hidden = !pending;
  if (!me) {
    conversation.clear();
    $('#messages').replaceChildren();
    return;
  }
  const row = (p, detail, actions = '', extra = '') =>
    `<div class="person ${p.online ? 'online' : ''} ${p.id === conversation.selected ? 'active' : ''}" data-person="${escape(p.id)}">${head(p)}<span class="who"><b>${escape(p.name)}</b><small>${escape(detail)}</small></span>${extra}<span class="actions">${actions}</span></div>`;
  $('#requests').innerHTML =
    (people.incoming.length
      ? '<h3>Pedidos</h3>' +
        people.incoming
          .map((p) =>
            row(
              p,
              'Quer ser seu amigo',
              `<button class="primary" data-accept="${escape(p.id)}">Aceitar</button><button class="secondary" data-remove="${escape(p.id)}">Recusar</button>`,
            ),
          )
          .join('')
      : '') +
    (people.outgoing.length
      ? '<h3>Enviados</h3>' +
        people.outgoing
          .map((p) =>
            row(p, 'Pedido enviado', `<button class="secondary" data-remove="${escape(p.id)}">Cancelar</button>`),
          )
          .join('')
      : '');
  const friends = [...people.friends].sort((a, b) => b.online - a.online || (a.name || '').localeCompare(b.name || ''));
  $('#friend-list').innerHTML =
    `<h3>Amigos · ${friends.filter((f) => f.online).length} online</h3>` +
    (friends.length
      ? friends
          .map((p) =>
            row(
              p,
              (ACTIVITY[p.activity] || ACTIVITY.offline)(p),
              p.activity === 'server' && !gameRunning
                ? `<button class="primary" data-join="${escape(p.server)}">Entrar</button>`
                : '',
              unread.has(p.id) ? '<span class="unread"></span>' : '',
            ),
          )
          .join('')
      : '<p class="chat-empty">Añade un amigo con su nick de Minecraft.</p>');
  const friend = people.friends.find((f) => f.id === conversation.selected);
  $('#chat-empty').hidden = !!friend;
  $('#chat-head').hidden = $('#chat-form').hidden = !friend;
  if (friend) {
    const call = calls.state();
    const inCall = call.people?.some((person) => person.id === friend.id) || call.invited?.includes(friend.name);
    const button =
      call.role === 'guest' || inCall || !friend.online
        ? ''
        : `<button class="secondary" data-call="${friend.id}">${call.status === 'active' ? 'Chamar para a call' : 'Ligar'}</button>`;
    $('#chat-head').innerHTML = `${head(friend)}<span class="who"><b>${escape(friend.name)}</b></span>${button}`;
  } else {
    conversation.clear();
    $('#messages').replaceChildren();
  }
}

function resetCommunity() {
  communityRevision++;
  people = { me: null, friends: [], incoming: [], outgoing: [] };
  loaded = false;
  unread.clear();
  conversation.clear();
  renderCommunity();
  refreshAdminAccess();
}

function refreshCommunity() {
  if (refreshRequest) return refreshRequest;
  const revision = communityRevision;
  refreshRequest = (async () => {
    try {
      const next = await community.state();
      if (revision !== communityRevision) return;
      people = next;
      loaded = true;
      renderCommunity();
      refreshAdminAccess();
    } catch (error) {
      if (revision === communityRevision) toast(error.message);
    } finally {
      refreshRequest = null;
    }
  })();
  return refreshRequest;
}
const refreshSoon = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshCommunity, 300);
};

function renderMessages() {
  const list = $('#messages');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  const fragment = document.createDocumentFragment();
  for (const message of conversation.messages) {
    const bubble = document.createElement('div');
    bubble.className = 'message' + (message.sender === people.me?.id ? ' mine' : '');
    bubble.textContent = message.body;
    fragment.append(bubble);
  }
  list.replaceChildren(fragment);
  list.setAttribute('aria-busy', String(conversation.loading));
  if (atBottom) list.scrollTop = list.scrollHeight;
}

async function openChat(id) {
  const request = conversation.open(id, community.messages);
  unread.delete(id);
  renderCommunity();
  $('#chat-input').value = '';
  renderMessages();
  try {
    if (await request) {
      renderMessages();
      $('#messages').scrollTop = $('#messages').scrollHeight;
      $('#chat-input').focus();
    }
  } catch (error) {
    if (conversation.selected === id) {
      renderMessages();
      toast(error.message);
    }
  }
}

$('#community-login').onclick = async () => {
  if (settings.mode !== 'microsoft' || !account) {
    toast('La comunidad usa tu cuenta Microsoft. Inicia sesión desde tu perfil.');
    $('#profile-open').click();
    accountTab('microsoft');
    return;
  }
  const button = $('#community-login');
  button.disabled = true;
  try {
    await community.login();
    await refreshCommunity();
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
action('#community-logout', async () => {
  await community.logout();
  resetCommunity();
});
$('#add-friend').onsubmit = async (e) => {
  e.preventDefault();
  try {
    toast(await community.add($('#friend-name').value));
    $('#friend-name').value = '';
    refreshCommunity();
  } catch (error) {
    toast(error.message);
  }
};
$('#view-friends').addEventListener('click', async (e) => {
  const target = e.target.closest('[data-accept],[data-remove],[data-join],[data-person]');
  if (!target) return;
  try {
    if (target.dataset.accept) await community.accept(target.dataset.accept);
    else if (target.dataset.remove) await community.remove(target.dataset.remove);
    else if (target.dataset.join) {
      await community.join(target.dataset.join);
      return;
    } else if (people.friends.some((f) => f.id === target.dataset.person)) return openChat(target.dataset.person);
    else return;
    refreshCommunity();
  } catch (error) {
    toast(error.message);
  }
});
$('#chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#chat-input').value.trim();
  const recipient = conversation.selected;
  if (!text || !recipient) return;
  $('#chat-input').value = '';
  try {
    const message = await community.send(recipient, text);
    if (message && conversation.receive(message)) renderMessages();
  } catch (error) {
    toast(error.message);
    if (conversation.selected === recipient && !$('#chat-input').value) $('#chat-input').value = text;
  }
};
community.onNotify((notice) => {
  const card = document.createElement('div');
  card.className = 'notice';
  const head = document.createElement('img');
  head.alt = '';
  head.src = /^[0-9a-f]{32}$/.test(notice.uuid || '')
    ? `https://mc-heads.net/avatar/${notice.uuid}/32`
    : '../assets/primarix-mark.png';
  const text = document.createElement('span');
  const name = document.createElement('b');
  name.textContent = notice.name;
  text.append(name, document.createTextNode(' ' + notice.text));
  card.append(head, text);
  card.onclick = () => ($('[data-view="friends"]').click(), card.remove());
  $('#notices').append(card);
  while ($('#notices').children.length > 3) $('#notices').firstChild.remove();
  setTimeout(() => card.classList.add('leaving'), 5e3);
  setTimeout(() => card.remove(), 5.4e3);
});
function renderCall(state = calls.state()) {
  const panel = $('#call-panel');
  panel.hidden = !state.status;
  if (state.status === 'incoming')
    panel.innerHTML = `<span><b>${escape(state.hostName)}</b> está te chamando para uma call</span><button class="primary" data-call-action="accept">Atender</button><button class="danger" data-call-action="decline">Recusar</button>`;
  else if (state.status === 'active') {
    const names = state.people.filter((person) => person.id !== people.me?.id).map((person) => person.name);
    const waiting = state.invited?.length ? ` · chamando ${state.invited.join(', ')}` : '';
    panel.innerHTML = `<span><b>Em call</b>${escape(names.length ? ' com ' + names.join(', ') : '')}${escape(waiting)}</span><button class="secondary" data-call-action="mute">${state.muted ? 'Ativar microfone' : 'Mutar'}</button><button class="danger" data-call-action="end">Sair</button>`;
  }
  renderCommunity();
}
$('#call-panel').onclick = (event) => {
  const action = event.target.closest('[data-call-action]')?.dataset.callAction;
  if (action === 'accept') calls.accept();
  else if (action === 'decline') calls.decline();
  else if (action === 'mute') calls.mute();
  else if (action === 'end') calls.end();
};
$('#chat-head').onclick = (event) => {
  const id = event.target.closest('[data-call]')?.dataset.call;
  const friend = people.friends.find((person) => person.id === id);
  if (friend) calls.start(friend);
};
api.call.onCommand(({ action, id }) => {
  const friend = people.friends.find((person) => person.id === id);
  if (action === 'call' && friend) calls.start(friend);
  else if (action === 'call-accept') calls.accept();
  else if (action === 'call-decline') calls.decline();
  else if (action === 'call-mute') calls.mute();
  else if (action === 'call-leave') calls.end();
});
community.onEvent((event) => {
  if (event.type === 'call') return calls.receive(event.payload);
  if (event.type !== 'message') return refreshSoon();
  const m = event.payload;
  const other = m.sender === people.me?.id ? m.recipient : m.sender;
  if (other === conversation.selected) {
    if (conversation.receive(m)) renderMessages();
    if (!$('#view-friends').classList.contains('active') && m.sender !== people.me?.id) {
      unread.add(other);
      renderCommunity();
    }
  } else if (m.sender !== people.me?.id) {
    unread.add(other);
    toast((people.friends.find((f) => f.id === other)?.name || 'Amigo') + ': ' + m.body.slice(0, 60));
    renderCommunity();
  }
});
const communityTimer = setInterval(() => {
  if (!document.hidden && people.me) refreshCommunity();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && settings) refreshSoon();
});
window.addEventListener('pagehide', () => {
  clearInterval(communityTimer);
  clearTimeout(refreshTimer);
  clearTimeout(toastTimer);
});

(async () => {
  try {
    const data = await api.init();
    communityConfigured = data.communityConfigured;
    cosmeticStorageUrl = data.cosmeticStorageUrl;
    settingsStore = createSettingsStore(data.settings, api.saveSettings);
    settings = settingsStore.value;
    api.onSettingsUpdated(async (updated) => {
      try {
        const profileChanged = settings.nickname !== updated.nickname || settings.mode !== updated.mode;
        await settingsStore.replace(updated);
        settings = settingsStore.value;
        renderQuickNicknames();
        renderProfile();
        renderAccent(settings.accentColor);
        if (profileChanged)
          toast(
            gameRunning
              ? settings.mode === 'offline'
                ? `Nick Offline ${settings.nickname} seleccionado para tu próxima conexión.`
                : 'La cuenta Premium quedó guardada; Minecraft conserva la sesión ya iniciada.'
              : `Perfil ${settings.nickname} guardado.`,
          );
      } catch (error) {
        toast('No se pudo actualizar el perfil del launcher: ' + error.message);
      }
    });
    renderQuickNicknames();
    account = data.account;
    renderProfile();
    $('#version').textContent = data.version;
    checkUpdate();
    renderBackground(settings.background);
    renderAccent(settings.accentColor);
    $('#memory').value = settings.memory;
    $('#memory-value').textContent = settings.memory + ' GB';
    $('#fullscreen').checked = settings.fullscreen;
    $('#pack-toggle').checked = settings.pack;
    $('#install-state').textContent = data.installed ? 'Forge · instalado' : 'Forge · se instalará al jugar';
    renderOptifine(data.optifine);
    renderWallpaper(data.wallpaper).catch((error) => toast(error.message));
    $('#share-server').checked = settings.shareServer;
    $('#discord-presence').checked = settings.discordPresence;
    api.discord
      .state()
      .then((state) => {
        $('#discord-state').textContent = state.message;
      })
      .catch((error) => toast(error.message));
    refreshCommunity();
    updateState(data.state);
    api.onState(updateState);
  } catch (e) {
    toast('No se pudo cargar el launcher: ' + e.message);
  }
})();
