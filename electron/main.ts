import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import loudness from 'loudness';

// Adiciona flags para evitar bloqueios de autotocar e mídia
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-speech-dispatcher'); 

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Vital para ouvir em background
    },
  });

  // --- PERMISSÃO AUTOMÁTICA DE MICROFONE ---
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'audioCapture', 'notifications', 'mediaKeySystem'];
    if (allowedPermissions.includes(permission)) {
      callback(true); // Aprova automaticamente
    } else {
      callback(false);
    }
  });

  // Garante que erros de permissão sejam logados
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true; // Força retorno positivo na checagem
  });

  const startUrl = process.env.ELECTRON_START_URL || 
    (app.isPackaged 
      ? `file://${path.join(__dirname, '../dist/index.html')}` 
      : 'http://localhost:3000');

  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  ipcMain.on('system-command', async (event, command) => {
    console.log('Comando recebido:', command);
    switch (command.action) {
      case 'OPEN_APP':
        exec(`start ${command.value}`, (error) => {
          if (error) console.error(`Erro ao abrir app: ${error}`);
        });
        break;
      case 'VOLUME':
        try {
          if (command.value === 'mute') {
             const muted = await loudness.getMuted();
             await loudness.setMuted(!muted);
          } else {
             const vol = Math.round(parseFloat(command.value) * 100);
             await loudness.setVolume(vol);
          }
        } catch (e) {
          console.error("Erro no volume:", e);
        }
        break;
      case 'SHOW_DESKTOP':
        exec('powershell -command "(new-object -com shell.application).minimizeall()"');
        break;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});