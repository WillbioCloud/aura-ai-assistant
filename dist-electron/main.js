"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const loudness_1 = __importDefault(require("loudness"));
// Adiciona flags para evitar bloqueios de autotocar e mídia
electron_1.app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
electron_1.app.commandLine.appendSwitch('enable-speech-dispatcher');
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        transparent: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // Vital para ouvir em background
        },
    });
    // --- PERMISSÃO AUTOMÁTICA DE MICROFONE ---
    electron_1.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture', 'notifications', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
            callback(true); // Aprova automaticamente
        }
        else {
            callback(false);
        }
    });
    // Garante que erros de permissão sejam logados
    electron_1.session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return true; // Força retorno positivo na checagem
    });
    const startUrl = process.env.ELECTRON_START_URL ||
        (electron_1.app.isPackaged
            ? `file://${path_1.default.join(__dirname, '../dist/index.html')}`
            : 'http://localhost:3000');
    mainWindow.loadURL(startUrl);
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.ipcMain.on('window-minimize', () => mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize());
    electron_1.ipcMain.on('window-maximize', () => {
        if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized())
            mainWindow.unmaximize();
        else
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
    });
    electron_1.ipcMain.on('window-close', () => mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close());
    electron_1.ipcMain.on('system-command', (event, command) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('Comando recebido:', command);
        switch (command.action) {
            case 'OPEN_APP':
                (0, child_process_1.exec)(`start ${command.value}`, (error) => {
                    if (error)
                        console.error(`Erro ao abrir app: ${error}`);
                });
                break;
            case 'VOLUME':
                try {
                    if (command.value === 'mute') {
                        const muted = yield loudness_1.default.getMuted();
                        yield loudness_1.default.setMuted(!muted);
                    }
                    else {
                        const vol = Math.round(parseFloat(command.value) * 100);
                        yield loudness_1.default.setVolume(vol);
                    }
                }
                catch (e) {
                    console.error("Erro no volume:", e);
                }
                break;
            case 'SHOW_DESKTOP':
                (0, child_process_1.exec)('powershell -command "(new-object -com shell.application).minimizeall()"');
                break;
        }
    }));
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
//# sourceMappingURL=main.js.map