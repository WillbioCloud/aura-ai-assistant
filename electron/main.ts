import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { exec } from 'child_process';

// Impede que o app feche quando a janela fecha (mantém na bandeja/background)
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Deixa sem bordas (estilo futurista)
    transparent: true, // Se quiser fundo transparente
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // IMPORTANTE: Permite que a IA ouça mesmo minimizada
    },
  });

  // Em desenvolvimento carrega a URL do Vite, em produção carrega o arquivo
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  // --- COMANDOS DO SISTEMA (Aura Control) ---
  
  ipcMain.on('system-command', (event, command) => {
    console.log('Comando recebido:', command);

    switch (command.action) {
      case 'OPEN_APP':
        // No Windows, usa 'start' para abrir
        exec(`start ${command.value}`, (error) => {
          if (error) console.error(`Erro ao abrir app: ${error}`);
        });
        break;

      case 'VOLUME':
        // Ajuste de volume via PowerShell (exemplo simples)
        // Existem bibliotecas npm como 'loudness' que facilitam isso
        // Aqui simula um mute/unmute ou volume fixo
        if (command.value === 'mute') {
           // Comando powershell para mutar
           exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
        } else {
           // Implementar lógica complexa de volume aqui
           console.log("Ajustar volume para: " + command.value);
        }
        break;

      case 'SHOW_DESKTOP':
        // Minimiza tudo (Win + D ou comando shell)
        exec('powershell -command "(new-object -com shell.application).minimizeall()"');
        break;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});