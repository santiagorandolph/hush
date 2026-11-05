const { app, BrowserWindow, Menu, protocol, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// A stable origin keeps the journal intact across upgrades and app relocation.
const HOME = 'hush://app/index.html';
protocol.registerSchemesAsPrivileged([
  { scheme: 'hush', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
app.setName('HUSH');
// Used by the smoke runner so tests never read or alter a real journal.
if (process.env.HUSH_TEST_PROFILE) app.setPath('userData', process.env.HUSH_TEST_PROFILE);

const assets = new Map([
  ['index.html', 'text/html'], ['styles.css', 'text/css'],
  ['engine.js', 'text/javascript'], ['example.js', 'text/javascript'],
  ['ai.js', 'text/javascript'], ['app.js', 'text/javascript'], ['favicon.svg', 'image/svg+xml']
]);
// The interface bundles its fonts so the app renders identically offline.
const fontFiles = [
  'cormorant-garamond-latin-wght-normal.woff2',
  'cormorant-garamond-latin-ext-wght-normal.woff2',
  'cormorant-garamond-latin-wght-italic.woff2',
  'cormorant-garamond-latin-ext-wght-italic.woff2',
  'dm-sans-latin-wght-normal.woff2',
  'dm-sans-latin-ext-wght-normal.woff2'
];
fontFiles.forEach(name => assets.set(`fonts/${name}`, 'font/woff2'));
let window;
function createWindow() {
  window = new BrowserWindow({
    title: 'HUSH', width: 1180, height: 840, minWidth: 600, minHeight: 600,
    backgroundColor: '#f4eee4', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== HOME) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  window.loadURL(HOME).catch(error => dialog.showErrorBox('HUSH could not open', error.message));
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) createWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(() => {
    protocol.handle('hush', async request => {
      const url = new URL(request.url);
      const name = url.pathname.slice(1);
      if (url.host !== 'app' || !assets.has(name) || request.method !== 'GET') {
        return new Response('Not found', { status: 404 });
      }
      try {
        return new Response(await fs.readFile(path.join(app.getAppPath(), name)), {
          headers: {
            'Content-Type': assets.get(name),
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' http: https:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
          }
        });
      } catch {
        return new Response('Missing application asset', { status: 500 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Chromium handles blob downloads with a native Save dialog.
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Export HUSH journal', buttonLabel: 'Export' });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'HUSH', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' }
    ]));
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch(error => { dialog.showErrorBox('HUSH startup failed', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
