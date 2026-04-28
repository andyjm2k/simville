const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const Store = require('electron-store');

// Set up permissive CSP for local development
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-insecure-localhost');

// Configure logging
log.transports.file.level = 'info';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.console.level = false;

// Initialize store for config
const store = new Store({
  name: 'config',
  defaults: {
    llm: {
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: '',
      maxTokens: 500,
      temperature: 0.8
    },
    simulation: {
      dayLengthMinutes: 10,
      initialPopulation: 6,
      worldSize: 64,
      endCondition: 'unlimited'
    },
    graphics: {
      pixelScale: 2,
      showSpeechBubbles: true,
      showLabels: true,
      lighting: true,
      particles: true
    },
    audio: {
      masterVolume: 0.5,
      musicVolume: 0.3,
      sfxVolume: 0.7
    },
    window: {
      width: 1280,
      height: 720
    }
  }
});

let mainWindow;

log.info('Simville starting...');

function createWindow() {
  const windowConfig = store.get('window');

  mainWindow = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: 1024,
    minHeight: 600,
    title: 'Simville',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('Main window displayed');
  });

  mainWindow.on('resize', () => {
    store.set('window', {
      width: mainWindow.getSize()[0],
      height: mainWindow.getSize()[1]
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New World',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new-world')
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:save')
        },
        {
          label: 'Load',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:load')
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:settings')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Simulation',
      submenu: [
        {
          label: 'Pause',
          accelerator: 'Space',
          click: () => mainWindow.webContents.send('menu:toggle-pause')
        },
        { type: 'separator' },
        {
          label: 'Speed: 0.5x',
          click: () => mainWindow.webContents.send('menu:speed', 0.5)
        },
        {
          label: 'Speed: 1x',
          click: () => mainWindow.webContents.send('menu:speed', 1)
        },
        {
          label: 'Speed: 2x',
          click: () => mainWindow.webContents.send('menu:speed', 2)
        },
        {
          label: 'Speed: 4x',
          click: () => mainWindow.webContents.send('menu:speed', 4)
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Chronicle',
          accelerator: 'CmdOrCtrl+L',
          click: () => mainWindow.webContents.send('menu:chronicle')
        },
        {
          label: 'Villagers',
          accelerator: 'CmdOrCtrl+V',
          click: () => mainWindow.webContents.send('menu:villagers')
        },
        { type: 'separator' },
        {
          label: 'Toggle Labels',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu:toggle-labels')
        },
        {
          label: 'Toggle Speech Bubbles',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu:toggle-bubbles')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Simville',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Simville',
              message: 'Simville v1.0.0',
              detail: 'An LLM-driven tribal village life simulation.\n\nBuild your village, guide your people, and create legends that will be remembered for generations.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers

// Get config
ipcMain.handle('config:get', (event, key) => {
  return store.get(key);
});

// Set config
ipcMain.handle('config:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

// Get all config
ipcMain.handle('config:getAll', () => {
  return store.store;
});

// Test LLM connection
ipcMain.handle('llm:test-connection', async (event, config) => {
  try {
    const response = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello, respond with "Connection successful" only.' }],
        max_tokens: 50,
        temperature: 0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, message: data.choices[0].message.content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save game
ipcMain.handle('game:save', async (event, saveData) => {
  try {
    const savesDir = path.join(app.getPath('userData'), 'saves');
    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir, { recursive: true });
    }

    const filename = `save_${Date.now()}.json`;
    const filepath = path.join(savesDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2));
    log.info(`Game saved: ${filename}`);
    return { success: true, filename };
  } catch (error) {
    log.error('Save failed:', error);
    return { success: false, error: error.message };
  }
});

// Load game
ipcMain.handle('game:load', async (event, filename) => {
  try {
    const filepath = path.join(app.getPath('userData'), 'saves', filename);
    if (!fs.existsSync(filepath)) {
      return { success: false, error: 'Save file not found' };
    }
    const data = fs.readFileSync(filepath, 'utf-8');
    log.info(`Game loaded: ${filename}`);
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    log.error('Load failed:', error);
    return { success: false, error: error.message };
  }
});

// List saves
ipcMain.handle('game:list-saves', async () => {
  try {
    const savesDir = path.join(app.getPath('userData'), 'saves');
    if (!fs.existsSync(savesDir)) {
      return [];
    }
    const files = fs.readdirSync(savesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        filename: f,
        timestamp: fs.statSync(path.join(savesDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
    return files;
  } catch (error) {
    log.error('List saves failed:', error);
    return [];
  }
});

// Show save dialog
ipcMain.handle('dialog:show-save', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Simville Saves', extensions: ['json'] }],
    defaultPath: path.join(app.getPath('userData'), 'saves')
  });
  return result;
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  log.info('Simville initialized');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Global error handlers
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
  if (error?.code === 'EPIPE') return;
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection at:', promise, 'reason:', reason);
});
