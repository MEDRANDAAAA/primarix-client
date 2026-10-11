const LAUNCHER_VIEWS = new Set(['settings', 'friends', 'voice', 'admin']);

function isAllowedLauncherView(view) {
  return LAUNCHER_VIEWS.has(view);
}

module.exports = { isAllowedLauncherView };
