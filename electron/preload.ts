import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command: any) => ipcRenderer.send('system-command', command),
});