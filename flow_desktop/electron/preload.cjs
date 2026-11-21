const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  onDictationTrigger: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('dictation-trigger', handler);
    return () => ipcRenderer.removeListener('dictation-trigger', handler);
  },
  onOpenSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings', handler);
    return () => ipcRenderer.removeListener('open-settings', handler);
  },
  updateHotkeys: (hotkeys) => ipcRenderer.invoke('update-hotkeys', hotkeys),
  injectText: (text) => ipcRenderer.invoke('inject-text', text),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  showDashboard: () => ipcRenderer.send('show-dashboard'),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  showOverlay: () => ipcRenderer.send('show-overlay'),
});
