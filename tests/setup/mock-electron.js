/**
 * Lightweight Electron preload mock for headless renderer tests.
 */
export function createElectronMock(overrides = {}) {
  const configStore = {
    llm: {
      endpoint: 'http://127.0.0.1:9999/v1',
      model: 'test-model',
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
  };

  return {
    getConfig: async (key) => configStore[key],
    setConfig: async (key, value) => {
      configStore[key] = value;
      return true;
    },
    getAllConfig: async () => ({ ...configStore }),
    testLLMConnection: async () => ({ success: true, message: 'Connection successful' }),
    saveGame: async (saveData) => ({ success: true, filename: `save_${Date.now()}.json`, data: saveData }),
    loadGame: async () => ({ success: false, error: 'No save loaded in mock' }),
    listSaves: async () => [],
    showSaveDialog: async () => ({ canceled: true, filePaths: [] }),
    onMenuEvent: noop,
    removeMenuListener: noop,
    ...overrides
  };
}

function noop() {}

export function installElectronMock(overrides = {}) {
  window.electronAPI = createElectronMock(overrides);
  return window.electronAPI;
}
