/**
 * Loads Simville renderer scripts synchronously for headless testing.
 * Mirrors src/renderer/index.html script order, including systems/*.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { installElectronMock } from './mock-electron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_JS = path.resolve(__dirname, '../../src/renderer/js');

const CORE_SCRIPT_ORDER = [
  'utils.js',
  'constants.js',
  'llm.js',
  'world.js',
  'village.js',
  'villager.js'
];

const SYSTEM_SCRIPT_ORDER = [
  'systems/economy.js',
  'systems/raid.js',
  'systems/diplomacy.js',
  'systems/baseline-agent.js',
  'systems/benchmark.js'
];

const SCRIPT_EXPORTS = {
  'utils.js': ['Utils'],
  'constants.js': ['CONSTANTS'],
  'llm.js': ['LLMManager', 'llm'],
  'world.js': ['World', 'WorldRenderer'],
  'village.js': ['Village'],
  'villager.js': ['Villager', 'VillagerRenderer'],
  'ui.js': ['UIManager'],
  'systems/economy.js': ['Economy'],
  'systems/raid.js': ['RaidSystem'],
  'systems/diplomacy.js': ['DiplomacySystem'],
  'systems/baseline-agent.js': ['BaselineAgent'],
  'systems/benchmark.js': ['BenchmarkScorer', 'BenchmarkRunner'],
  'game.js': ['Game', 'game']
};

const GLOBAL_EXPORTS = [
  'Utils',
  'CONSTANTS',
  'LLMManager',
  'World',
  'Village',
  'Villager',
  'UIManager',
  'Economy',
  'RaidSystem',
  'DiplomacySystem',
  'BaselineAgent',
  'BenchmarkScorer',
  'BenchmarkRunner',
  'Game',
  'WorldRenderer',
  'VillagerRenderer',
  'llm',
  'game'
];

let scriptsLoaded = false;
let loadedScope = { core: false, ui: false, systems: false, game: false };
let scriptContext = null;

function createScriptContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    performance: globalThis.performance,
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Promise,
    fetch: globalThis.fetch,
    document,
    window: null,
    globalThis: null,
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.get(key) ?? null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      }
    }
  };

  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function exportBridge(relativePath) {
  const keys = SCRIPT_EXPORTS[relativePath] || [];
  return keys.map((key) => `globalThis.${key} = ${key};`).join('\n');
}

function runScript(context, relativePath) {
  const absolutePath = path.join(RENDERER_JS, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInContext(`${source}\n${exportBridge(relativePath)}`, context, { filename: absolutePath });
}

function syncGlobalsFromContext(context) {
  for (const key of GLOBAL_EXPORTS) {
    if (context[key] !== undefined) {
      globalThis[key] = context[key];
    }
  }
}

export function loadRendererScripts(options = {}) {
  const { includeGame = false, includeUi = false, includeSystems = false, force = false } = options;
  const needSystems = includeSystems || includeGame;

  if (
    !force &&
    scriptsLoaded &&
    loadedScope.core &&
    (!includeUi || loadedScope.ui) &&
    (!needSystems || loadedScope.systems) &&
    (!includeGame || loadedScope.game)
  ) {
    syncGlobalsFromContext(scriptContext);
    return scriptContext;
  }

  if (force || !scriptContext) {
    scriptContext = createScriptContext();
    installElectronMock();
    loadedScope = { core: false, ui: false, systems: false, game: false };
  }

  if (force || !loadedScope.core) {
    for (const script of CORE_SCRIPT_ORDER) {
      runScript(scriptContext, script);
    }
    loadedScope.core = true;
  }

  if ((includeUi || includeGame) && (force || !loadedScope.ui)) {
    runScript(scriptContext, 'ui.js');
    loadedScope.ui = true;
  }

  if (needSystems && (force || !loadedScope.systems)) {
    for (const script of SYSTEM_SCRIPT_ORDER) {
      runScript(scriptContext, script);
    }
    loadedScope.systems = true;
  }

  if (includeGame && (force || !loadedScope.game)) {
    runScript(scriptContext, 'game.js');
    loadedScope.game = true;
  }

  scriptsLoaded = true;
  syncGlobalsFromContext(scriptContext);
  return scriptContext;
}

export function installMinimalDom() {
  document.body.innerHTML = `
    <div id="game-container" style="width:1280px;height:720px;">
      <div id="hud">
        <span id="time-display"></span>
        <span id="season-display"></span>
        <span id="speed-display"></span>
        <button id="btn-pause"></button>
        <button id="btn-chronicle"></button>
        <button id="btn-build"></button>
        <button id="btn-tech"></button>
        <button id="btn-settings"></button>
      </div>
      <div id="resource-bar">
        <span id="res-wood"></span>
        <span id="res-food"></span>
        <span id="res-water"></span>
        <span id="res-stone"></span>
        <span id="res-herbs"></span>
        <span id="res-clay"></span>
        <span id="res-fish"></span>
        <span id="res-thatch"></span>
        <span id="res-rare"></span>
        <span id="res-population"></span>
      </div>
      <canvas id="game-canvas" width="1280" height="644"></canvas>
      <canvas id="minimap-canvas" width="150" height="150"></canvas>
      <div id="villager-panel" class="panel hidden">
        <span id="villager-name"></span>
        <div id="villager-sprite"></div>
        <div id="villager-title"></div>
        <div id="villager-skills"></div>
        <div id="villager-mood"></div>
        <div id="villager-status"></div>
        <div id="villager-needs"></div>
        <p id="villager-activity-text"></p>
        <ul id="villager-interaction-list"></ul>
        <ul id="villager-family-list"></ul>
        <ul id="villager-goals-list"></ul>
        <ul id="villager-secrets-list"></ul>
        <span id="secrets-count"></span>
        <div id="villager-backstory-text"></div>
      </div>
      <div id="build-menu" class="panel hidden"><div id="build-grid"></div></div>
      <div id="chronicle-panel" class="panel hidden">
        <ul id="chronicle-legendary-list"></ul>
        <ul id="chronicle-rule-list"></ul>
        <ul id="chronicle-entry-list"></ul>
        <span id="chronicle-page"></span>
      </div>
      <div id="tech-panel" class="panel hidden">
        <ul id="tech-available-list"></ul>
        <ul id="tech-researched-list"></ul>
        <div id="tech-research-info"></div>
      </div>
      <div id="settings-panel" class="panel hidden">
        <input id="setting-endpoint" />
        <input id="setting-model" />
        <input id="setting-apikey" />
        <input id="setting-tokens" />
        <input id="setting-maxtokens" />
        <input id="setting-temperature" />
        <span id="temp-value"></span>
        <span id="connection-status"></span>
        <input id="setting-daylength" />
        <input id="setting-population" />
        <input id="setting-worldsize" />
        <select id="setting-endcondition"></select>
        <input id="setting-pixelscale" />
        <input id="setting-bubbles" type="checkbox" />
        <input id="setting-speechbubbles" type="checkbox" />
        <input id="setting-labels" type="checkbox" />
        <input id="setting-lighting" type="checkbox" />
        <input id="setting-particles" type="checkbox" />
        <input id="setting-mastervolume" />
        <input id="setting-musicvolume" />
        <input id="setting-sfxvolume" />
        <button id="btn-test-connection"></button>
        <button id="btn-save-settings"></button>
        <button id="btn-settings-save"></button>
        <button id="btn-settings-cancel"></button>
        <button id="btn-chronicle-prev"></button>
        <button id="btn-chronicle-next"></button>
        <button id="btn-newworld-confirm"></button>
      </div>
      <div id="load-dialog" class="dialog hidden">
        <div id="save-list"></div>
      </div>
      <div id="newworld-dialog" class="dialog hidden"></div>
      <div id="toast" class="toast hidden"><span id="toast-message"></span></div>
    </div>
  `;
}

export function createHeadlessGame(seed = 424242) {
  installMinimalDom();
  const context = loadRendererScripts({ includeGame: true });

  Utils.setSeed(seed);
  Math.random = () => Utils.seededRandom();

  const gameInstance = new Game();
  context.__headlessGame = gameInstance;
  vm.runInContext('game = __headlessGame;', context);
  context.game = gameInstance;
  globalThis.game = gameInstance;

  gameInstance.canvas = document.getElementById('game-canvas');
  gameInstance.worldRenderer = new WorldRenderer(gameInstance.canvas, null);
  gameInstance.villagerRenderer = new VillagerRenderer(gameInstance.canvas.getContext('2d'));
  gameInstance.ui = new UIManager();
  gameInstance.ui.initialize();
  gameInstance.timeState.dayDuration = 600000;
  gameInstance.timeState.hourDuration = gameInstance.timeState.dayDuration / 24;

  return gameInstance;
}

export function bootstrapCoreModules() {
  loadRendererScripts({ includeGame: false, includeSystems: true });
}

export function resetRendererModules() {
  scriptsLoaded = false;
  loadedScope = { core: false, ui: false, systems: false, game: false };
  scriptContext = null;
  for (const key of GLOBAL_EXPORTS) {
    delete globalThis[key];
  }
}
