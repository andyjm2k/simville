const { contextBridge, ipcRenderer } = require('electron');

// Channels the renderer may clear via removeAllListeners
const ALLOWED_REMOVE_CHANNELS = new Set([
  'menu:new-world',
  'menu:save',
  'menu:load',
  'menu:settings',
  'menu:toggle-pause',
  'menu:speed',
  'menu:chronicle',
  'menu:villagers',
  'menu:toggle-labels',
  'menu:toggle-bubbles'
]);

/**
 * Register a menu listener and return an unsubscribe function.
 * Prefer a single register per channel; call unsubscribe before re-registering.
 */
function onMenu(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

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

  // Menu events (each returns unsubscribe; prefer single register per channel)
  onMenuNewWorld: (callback) => onMenu('menu:new-world', callback),
  onMenuSave: (callback) => onMenu('menu:save', callback),
  onMenuLoad: (callback) => onMenu('menu:load', callback),
  onMenuSettings: (callback) => onMenu('menu:settings', callback),
  onMenuTogglePause: (callback) => onMenu('menu:toggle-pause', callback),
  onMenuSpeed: (callback) => onMenu('menu:speed', (speed) => callback(speed)),
  onMenuChronicle: (callback) => onMenu('menu:chronicle', callback),
  onMenuVillagers: (callback) => onMenu('menu:villagers', callback),
  onMenuToggleLabels: (callback) => onMenu('menu:toggle-labels', callback),
  onMenuToggleBubbles: (callback) => onMenu('menu:toggle-bubbles', callback),

  // Remove listeners — whitelisted channels only
  removeAllListeners: (channel) => {
    if (!ALLOWED_REMOVE_CHANNELS.has(channel)) {
      return;
    }
    ipcRenderer.removeAllListeners(channel);
  }
});
