// Developer desktop runner. No installer or executable packaging step.
const {app, BrowserWindow, Menu, shell} = require('electron');
const path = require('node:path');

app.setAppUserModelId('dev.trusslab.architect');
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1650,
    height: 1000,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#08171d',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true
    }
  });
  window.once('ready-to-show', () => window.show());
  window.loadFile(path.join(__dirname, '..', 'index.html'));
  // No automatic external navigation or arbitrary page opening.
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', e => e.preventDefault());
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
