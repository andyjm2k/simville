const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  // LLM
  testLLMConnection: (config) => ipcRenderer.invoke('llm:test-connection', config),

  // Game save/load
  saveGame: (data) => ipcRenderer.invoke('game:save', data),
  loadGame: (filename) => ipcRenderer.invoke('game:load', filename),
  listSaves: () => ipcRenderer.invoke('game:list-saves'),

  // Dialogs
  showSaveDialog: () => ipcRenderer.invoke('dialog:show-save'),

  // Menu events
  onMenuNewWorld: (callback) => ipcRenderer.on('menu:new-world', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu:save', callback),
  onMenuLoad: (callback) => ipcRenderer.on('menu:load', callback),
  onMenuSettings: (callback) => ipcRenderer.on('menu:settings', callback),
  onMenuTogglePause: (callback) => ipcRenderer.on('menu:toggle-pause', callback),
  onMenuSpeed: (callback) => ipcRenderer.on('menu:speed', (event, speed) => callback(speed)),
  onMenuChronicle: (callback) => ipcRenderer.on('menu:chronicle', callback),
  onMenuVillagers: (callback) => ipcRenderer.on('menu:villagers', callback),
  onMenuToggleLabels: (callback) => ipcRenderer.on('menu:toggle-labels', callback),
  onMenuToggleBubbles: (callback) => ipcRenderer.on('menu:toggle-bubbles', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
