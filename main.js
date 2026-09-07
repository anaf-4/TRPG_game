const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const NetManager = require('./src/net');

let mainWindow = null;
let net = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#141018',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  net = new NetManager((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  });

  mainWindow.on('closed', () => {
    if (net) net.shutdown();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (net) net.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('net:list-rooms', (_e, payload) => net.listRooms(payload));
ipcMain.handle('net:host-room', (_e, payload) => net.hostRoom(payload));
ipcMain.handle('net:join-room', (_e, payload) => net.joinRoom(payload));
ipcMain.handle('net:start-solo', (_e, payload) => net.startSolo(payload));
ipcMain.handle('net:send-action', (_e, payload) => net.sendAction(payload));
ipcMain.handle('net:leave-room', () => net.leaveRoom());
ipcMain.handle('net:start-game', () => net.startGame());
ipcMain.handle('net:kick-player', (_e, payload) => net.kickPlayer(payload.targetId));
ipcMain.handle('net:rename-room', (_e, payload) => net.renameRoom(payload.title));
