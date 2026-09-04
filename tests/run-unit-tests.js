#!/usr/bin/env node
/**
 * Unit tests for Economy, RaidSystem, DiplomacySystem, and seeded Utils RNG.
 * Run: npm test
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.join(__dirname, '..');

const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Map,
  Set,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  Infinity
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

/** Load a browser-style script into a shared sandbox context. */
function loadScript(relPath, sandbox) {
  // Reset module.exports so CommonJS tails from system files do not clobber each other
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  const code =
    fs.readFileSync(path.join(root, relPath), 'utf8') +
    `
;if (typeof Utils !== 'undefined') globalThis.Utils = Utils;
;if (typeof CONSTANTS !== 'undefined') globalThis.CONSTANTS = CONSTANTS;
;if (typeof Economy !== 'undefined') globalThis.Economy = Economy;
;if (typeof RaidSystem !== 'undefined') globalThis.RaidSystem = RaidSystem;
;if (typeof DiplomacySystem !== 'undefined') globalThis.DiplomacySystem = DiplomacySystem;
;if (typeof ExplorationSystem !== 'undefined') globalThis.ExplorationSystem = ExplorationSystem;
;if (typeof BaselineAgent !== 'undefined') globalThis.BaselineAgent = BaselineAgent;
;if (typeof BenchmarkScorer !== 'undefined') globalThis.BenchmarkScorer = BenchmarkScorer;
;if (typeof BenchmarkRunner !== 'undefined') globalThis.BenchmarkRunner = BenchmarkRunner;
;if (typeof module !== 'undefined' && module.exports) {
  const exported = module.exports;
  if (exported.Economy) globalThis.Economy = exported.Economy;
  if (exported.RaidSystem) globalThis.RaidSystem = exported.RaidSystem;
  if (exported.DiplomacySystem) globalThis.DiplomacySystem = exported.DiplomacySystem;
  if (exported.ExplorationSystem) globalThis.ExplorationSystem = exported.ExplorationSystem;
  if (exported.BaselineAgent) globalThis.BaselineAgent = exported.BaselineAgent;
  if (exported.BenchmarkScorer) globalThis.BenchmarkScorer = exported.BenchmarkScorer;
  if (exported.BenchmarkRunner) globalThis.BenchmarkRunner = exported.BenchmarkRunner;
}
`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

loadScript('src/renderer/js/utils.js', sandbox);
loadScript('src/renderer/js/constants.js', sandbox);
loadScript('src/renderer/js/systems/economy.js', sandbox);
loadScript('src/renderer/js/systems/raid.js', sandbox);
loadScript('src/renderer/js/systems/diplomacy.js', sandbox);
loadScript('src/renderer/js/systems/exploration.js', sandbox);
loadScript('src/renderer/js/systems/baseline-agent.js', sandbox);
loadScript('src/renderer/js/systems/benchmark.js', sandbox);

const { Utils, CONSTANTS, Economy, RaidSystem, DiplomacySystem, ExplorationSystem, BaselineAgent, BenchmarkScorer } = sandbox;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** Minimal village stub for economy/raid tests. */
function makeVillage(id, resources = {}) {
  return {
    id,
    name: `Village-${id}`,
    center: { x: 10, y: 10 },
    territoryRadius: 12,
    resources: {
      wood: 0,
      food: 0,
      water: 0,
      stone: 0,
      herbs: 0,
      clay: 0,
      fish: 0,
      thatch: 0,
      rareMaterials: 0,
      ...resources
    },
    structureIds: [],
    villagerIds: [],
    relations: {},
    atWarWith: [],
    raidCooldown: 0,
    knownVillages: [],
    lastScoutDay: 0,
    scoutAttempts: 0,
    tradePartners: [],
    isInTerritory(x, y) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      return Math.sqrt(dx * dx + dy * dy) <= this.territoryRadius;
    },
    knowsVillage(villageId) {
      return (this.knownVillages || []).includes(villageId);
    },
    markVillageKnown(villageId) {
      if (!villageId || villageId === this.id) return false;
      this.knownVillages = this.knownVillages || [];
      if (this.knownVillages.includes(villageId)) return false;
      this.knownVillages.push(villageId);
      return true;
    },
    hasTradePartner(villageId) {
      return (this.tradePartners || []).includes(villageId);
    },
    addTradePartner(villageId) {
      if (!villageId || villageId === this.id) return false;
      this.tradePartners = this.tradePartners || [];
      if (this.tradePartners.includes(villageId)) return false;
      this.tradePartners.push(villageId);
      return true;
    },
    revokeTradePartner(villageId) {
      const before = (this.tradePartners || []).length;
      this.tradePartners = (this.tradePartners || []).filter((id) => id !== villageId);
      return this.tradePartners.length !== before;
    },
    calculateStrength() {
      return this.villagerIds.length * 10;
    }
  };
}

/** Minimal game stub hosting villages and chronicle. */
function makeGame(villages) {
  const game = {
    villages,
    villagers: [],
    world: { structures: [] },
    selectedVillager: null,
    hudVillageId: null,
    timeState: { day: 1, hours: 10, dayDuration: 600000 },
    diplomaticEvents: [],
    hostileDaysCount: {},
    activeRaid: null,
    chronicle: [],
    getVillage(id) {
      return this.villages.find((v) => v.id === id);
    },
    getRivalVillage(id) {
      return this.villages.find((v) => v.id !== id) || null;
    },
    getVillagersForVillage(villageId) {
      return this.villagers.filter((v) => v.villageId === villageId);
    },
    canVillagerEnterTerritory() {
      return true;
    },
    establishTradeAccess(a, b) {
      a.addTradePartner(b.id);
      b.addTradePartner(a.id);
    },
    revokeTradeAccess(a, b) {
      a.revokeTradePartner(b.id);
      b.revokeTradePartner(a.id);
    },
    addChronicleEntry(text) {
      this.chronicle.push(text);
    },
    removeVillager(villager) {
      this.villagers = this.villagers.filter((v) => v.id !== villager.id);
      for (const village of this.villages) {
        village.villagerIds = village.villagerIds.filter((id) => id !== villager.id);
      }
    },
    handleConquest() {
      this.conquered = true;
    }
  };
  game.economy = new Economy(game);
  game.raidSystem = new RaidSystem(game);
  game.diplomacySystem = new DiplomacySystem(game);
  game.explorationSystem = new ExplorationSystem(game);
  return game;
}

function makeScoutVillager(id, villageId, extras = {}) {
  return {
    id,
    name: `Scout-${id}`,
    villageId,
    x: 10,
    y: 10,
    health: 100,
    energy: 80,
    hunger: 80,
    thirst: 80,
    isChieftan: false,
    isScouting: false,
    isMoving: false,
    status: 'idle',
    activity: 'Idle',
    lifeStage: CONSTANTS.LIFE_STAGE.ADULT,
    personality: { curious: 80 },
    moveTo() {
      this.isMoving = true;
      return true;
    },
    showSpeechBubble() {},
    ...extras
  };
}

console.log('\nEconomy');
test('normalizeResources fills defaults', () => {
  const game = makeGame([makeVillage('a')]);
  const normalized = game.economy.normalizeResources({ food: 5 });
  assert.strictEqual(normalized.food, 5);
  assert.strictEqual(normalized.wood, 0);
});

test('addResource credits owning village only', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  const stored = game.economy.addResource('food', 10, 'a');
  assert.strictEqual(stored, 10);
  assert.strictEqual(a.resources.food, 10);
  assert.strictEqual(b.resources.food, 0);
});

test('addResource uses territory for credit when no villageId', () => {
  const a = makeVillage('a', {});
  a.center = { x: 5, y: 5 };
  const b = makeVillage('b');
  b.center = { x: 50, y: 50 };
  const game = makeGame([a, b]);
  game.economy.addResource('wood', 7, null, 6, 6);
  assert.strictEqual(a.resources.wood, 7);
  assert.strictEqual(b.resources.wood, 0);
});

test('consumeResource reduces stock', () => {
  const a = makeVillage('a', { food: 8 });
  const game = makeGame([a]);
  const used = game.economy.consumeResource('food', 3, 'a');
  assert.strictEqual(used, 3);
  assert.strictEqual(a.resources.food, 5);
});

test('canAffordStructure and consumeStructureCost', () => {
  const a = makeVillage('a', { wood: 25, clay: 12, thatch: 12 });
  const game = makeGame([a]);
  const hut = { wood: 20, clay: 10, thatch: 10 };
  assert.ok(game.economy.canAffordStructure(hut, 'a'));
  assert.ok(game.economy.consumeStructureCost(hut, 'a'));
  assert.strictEqual(a.resources.wood, 5);
});

test('transferAllResources moves stocks on conquest', () => {
  const loser = makeVillage('lose', { food: 20, wood: 15 });
  const winner = makeVillage('win', { food: 1 });
  const game = makeGame([loser, winner]);
  game.economy.transferAllResources(loser, winner);
  assert.strictEqual(loser.resources.food, 0);
  assert.ok(winner.resources.food >= 21);
});

test('migrateOrphanResources seeds village 0', () => {
  const a = makeVillage('a');
  const game = makeGame([a]);
  game.economy.migrateOrphanResources({ food: 40, wood: 9 });
  assert.strictEqual(a.resources.food, 40);
  assert.strictEqual(a.resources.wood, 9);
});

test('getHudVillage prefers tribe selector over selected villager', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  game.hudVillageId = 'a';
  game.selectedVillager = { villageId: 'b' };
  assert.strictEqual(game.economy.getHudVillage().id, 'a');
});

test('getHudVillage falls back to selected villager when no tribe selected', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  game.hudVillageId = null;
  game.selectedVillager = { villageId: 'b' };
  assert.strictEqual(game.economy.getHudVillage().id, 'b');
});

test('getStorageCapacity returns number for one resource', () => {
  const a = makeVillage('a');
  const game = makeGame([a]);
  assert.ok(typeof game.economy.getStorageCapacity('food', 'a') === 'number');
});

test('getStructureCosts lists positive costs', () => {
  const game = makeGame([makeVillage('a')]);
  const costs = game.economy.getStructureCosts({ wood: 5, food: 0, stone: 3 });
  assert.ok(costs.some(([r, a]) => r === 'wood' && a === 5));
  assert.ok(costs.some(([r, a]) => r === 'stone' && a === 3));
  assert.ok(!costs.some(([r]) => r === 'food'));
});

console.log('\nRaidSystem');
test('ensureOriginalPopulation sets baseline once', () => {
  const defender = makeVillage('d');
  const game = makeGame([defender]);
  game.villagers = [
    { id: '1', villageId: 'd', lifeStage: CONSTANTS.LIFE_STAGE.ADULT },
    { id: '2', villageId: 'd', lifeStage: CONSTANTS.LIFE_STAGE.ADULT }
  ];
  defender.villagerIds = ['1', '2'];
  game.raidSystem.ensureOriginalPopulation(defender);
  assert.strictEqual(defender.originalPopulation, 2);
  game.villagers.pop();
  game.raidSystem.ensureOriginalPopulation(defender);
  assert.strictEqual(defender.originalPopulation, 2);
});

test('resolveCombat sets combatResolved and leaves attacking', () => {
  const attacker = makeVillage('atk', { food: 0, wood: 0 });
  const defender = makeVillage('def', { food: 50, wood: 50 });
  defender.originalPopulation = 10;
  const game = makeGame([attacker, defender]);
  for (let i = 0; i < 10; i++) {
    const id = `d${i}`;
    game.villagers.push({
      id,
      name: id,
      villageId: 'def',
      lifeStage: CONSTANTS.LIFE_STAGE.ADULT,
      skills: { gathering: 1 },
      health: 100,
      isChieftan: false
    });
    defender.villagerIds.push(id);
  }
  for (let i = 0; i < 4; i++) {
    const id = `a${i}`;
    game.villagers.push({
      id,
      name: id,
      villageId: 'atk',
      lifeStage: CONSTANTS.LIFE_STAGE.ADULT,
      skills: { gathering: 1 },
      health: 100,
      isChieftan: false
    });
    attacker.villagerIds.push(id);
  }
  game.activeRaid = {
    attackerVillageId: 'atk',
    targetVillageId: 'def',
    raiderIds: ['a0', 'a1', 'a2', 'a3'],
    phase: 'attacking',
    combatResolved: false,
    retreatTimer: 0
  };
  game.raidSystem.resolveCombat(attacker, defender);
  assert.strictEqual(game.activeRaid.combatResolved, true);
  assert.strictEqual(game.activeRaid.phase, 'retreating');
});

test('processRaid does not re-resolve combat after flag set', () => {
  const attacker = makeVillage('atk');
  const defender = makeVillage('def');
  defender.originalPopulation = 5;
  const game = makeGame([attacker, defender]);
  game.activeRaid = {
    attackerVillageId: 'atk',
    targetVillageId: 'def',
    raiderIds: [],
    phase: 'attacking',
    combatResolved: true,
    retreatTimer: 0,
    attackerWon: false
  };
  const before = game.chronicle.length;
  game.raidSystem.processRaid(1000);
  assert.strictEqual(game.activeRaid.phase, 'retreating');
  assert.strictEqual(game.chronicle.length, before);
});

test('evaluateConquest uses pre-set originalPopulation', () => {
  const defender = makeVillage('def');
  defender.originalPopulation = 10;
  const attacker = makeVillage('atk');
  const game = makeGame([attacker, defender]);
  game.villagers = [
    { id: '1', villageId: 'def', lifeStage: CONSTANTS.LIFE_STAGE.ADULT }
  ];
  defender.villagerIds = ['1'];
  game.raidSystem.evaluateConquest('def', 'atk');
  assert.strictEqual(game.conquered, true);
});

test('startRaid refuses when already active', () => {
  const attacker = makeVillage('atk');
  const defender = makeVillage('def');
  const game = makeGame([attacker, defender]);
  game.activeRaid = { phase: 'planning' };
  assert.strictEqual(game.raidSystem.startRaid('atk', 'def'), false);
});

console.log('\nDiplomacySystem');
test('triggerWar sets mutual atWarWith', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  game.diplomacySystem.triggerWar('a', 'b');
  assert.ok(a.atWarWith.includes('b'));
  assert.ok(b.atWarWith.includes('a'));
});

test('endWar clears war flags', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  a.atWarWith = ['b'];
  b.atWarWith = ['a'];
  const game = makeGame([a, b]);
  game.diplomacySystem.endWar('a', 'b');
  assert.deepStrictEqual(a.atWarWith, []);
  assert.deepStrictEqual(b.atWarWith, []);
});

test('processDiplomaticEvents expires by day', () => {
  const game = makeGame([makeVillage('a'), makeVillage('b')]);
  game.timeState.day = 10;
  game.diplomaticEvents = [{ createdDay: 5, type: 'propose_trade' }];
  game.diplomacySystem.processDiplomaticEvents();
  assert.strictEqual(game.diplomaticEvents.length, 0);
});

test('processChieftanDecisions applies trade bonus', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  a.relations.b = 0;
  b.relations.a = 0;
  const game = makeGame([a, b]);
  game.timeState.day = 3;
  game.diplomaticEvents = [
    {
      type: 'propose_trade',
      sourceVillageId: 'a',
      targetVillageId: 'b',
      createdDay: 2,
      urgency: 'medium'
    }
  ];
  game.diplomacySystem.processChieftanDecisions();
  assert.strictEqual(a.relations.b, 15);
  assert.strictEqual(game.diplomaticEvents.length, 0);
  assert.ok(a.hasTradePartner('b'));
  assert.ok(b.hasTradePartner('a'));
});

test('triggerWar revokes trade partners for conquest track', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  a.tradePartners = ['b'];
  b.tradePartners = ['a'];
  const game = makeGame([a, b]);
  game.diplomacySystem.triggerWar('a', 'b');
  assert.deepStrictEqual(a.tradePartners, []);
  assert.deepStrictEqual(b.tradePartners, []);
  assert.ok(a.atWarWith.includes('b'));
});

test('evaluateWarEscalation increments unique pair once', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  a.relations.b = CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD - 1;
  b.relations.a = CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD - 1;
  const game = makeGame([a, b]);
  game.diplomacySystem.evaluateWarEscalation();
  const key = ['a', 'b'].sort().join('_');
  assert.strictEqual(game.hostileDaysCount[key], 1);
});

test('processChieftanDecisions observe dispatches a scout', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  b.center = { x: 40, y: 10 };
  const game = makeGame([a, b]);
  game.world.getWalkableTileNear = (x, y) => ({ x, y });
  game.villagers = [makeScoutVillager('s1', 'a')];
  a.villagerIds = ['s1'];
  game.timeState.day = 3;
  game.diplomaticEvents = [
    {
      type: 'observe',
      sourceVillageId: 'a',
      targetVillageId: 'b',
      createdDay: 2,
      urgency: 'medium'
    }
  ];
  game.diplomacySystem.processChieftanDecisions();
  assert.strictEqual(game.villagers[0].isScouting, true);
  assert.strictEqual(game.diplomaticEvents.length, 0);
});

console.log('\nExplorationSystem');
test('hasDiscovered is false until both tribes are marked', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  assert.strictEqual(game.explorationSystem.hasDiscovered(a, b), false);
  a.markVillageKnown('b');
  assert.strictEqual(game.explorationSystem.hasDiscovered(a, b), false);
  b.markVillageKnown('a');
  assert.strictEqual(game.explorationSystem.hasDiscovered(a, b), true);
});

test('recordFirstContact is idempotent and bumps relations', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  a.relations.b = -15;
  b.relations.a = -15;
  const game = makeGame([a, b]);
  assert.strictEqual(game.explorationSystem.recordFirstContact(a, b, null, 'sighting'), true);
  assert.strictEqual(game.explorationSystem.recordFirstContact(a, b, null, 'sighting'), false);
  assert.ok(a.knowsVillage('b'));
  assert.ok(b.knowsVillage('a'));
  assert.ok(a.relations.b > -15);
  assert.ok(game.chronicle.length >= 2);
});

test('pickScout prefers curious adults and skips chieftans', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  game.villagers = [
    makeScoutVillager('chief', 'a', { isChieftan: true, personality: { curious: 99 } }),
    makeScoutVillager('lazy', 'a', { personality: { curious: 20 } }),
    makeScoutVillager('curious', 'a', { personality: { curious: 90 } })
  ];
  a.villagerIds = ['chief', 'lazy', 'curious'];
  assert.strictEqual(game.explorationSystem.pickScout(a).id, 'curious');
});

test('canSeeRivalTerritory uses sight range beyond claimed land', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  b.center = { x: 40, y: 10 };
  const game = makeGame([a, b]);
  const villager = makeScoutVillager('s1', 'a', { x: 10, y: 10 });
  assert.strictEqual(game.explorationSystem.canSeeRivalTerritory(villager, b), false);
  villager.x = 22;
  assert.strictEqual(game.explorationSystem.canSeeRivalTerritory(villager, b), true);
});

test('detectContacts records a meeting when rivals are in sight', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  b.center = { x: 50, y: 50 };
  const game = makeGame([a, b]);
  game.villagers = [
    makeScoutVillager('s1', 'a', { x: 20, y: 20 }),
    makeScoutVillager('s2', 'b', { x: 22, y: 20 })
  ];
  game.explorationSystem.detectContacts();
  assert.strictEqual(game.explorationSystem.hasDiscovered(a, b), true);
});

test('clearScout and sendScoutHome end or return a mission', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  const scout = makeScoutVillager('s1', 'a', { isScouting: true, status: CONSTANTS.ACTIVITY.SCOUTING });
  game.villagers = [scout];
  a.villagerIds = ['s1'];
  game.explorationSystem.sendScoutHome(scout);
  assert.strictEqual(scout.scoutMission.phase, 'returning');
  game.explorationSystem.clearScout(scout);
  assert.strictEqual(scout.isScouting, false);
  assert.strictEqual(game.explorationSystem.getActiveScout(a), null);
});

test('isDaytime is false at night', () => {
  const game = makeGame([makeVillage('a')]);
  game.timeState.hours = 22;
  assert.strictEqual(game.explorationSystem.isDaytime(), false);
  game.timeState.hours = 10;
  assert.strictEqual(game.explorationSystem.isDaytime(), true);
});

test('maybeRumorContact unlocks discovery after the rumor day', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  const game = makeGame([a, b]);
  game.timeState.day = CONSTANTS.EXPLORATION.RUMOR_CONTACT_DAYS;
  game.explorationSystem.maybeRumorContact();
  assert.strictEqual(game.explorationSystem.hasDiscovered(a, b), true);
});

test('dispatchScout marks a villager as scouting', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  b.center = { x: 40, y: 10 };
  const game = makeGame([a, b]);
  game.world.getWalkableTileNear = (x, y) => ({ x, y });
  game.villagers = [makeScoutVillager('s1', 'a')];
  a.villagerIds = ['s1'];
  const scout = game.explorationSystem.dispatchScout(a, b, 'explore');
  assert.ok(scout);
  assert.strictEqual(scout.isScouting, true);
  assert.strictEqual(a.scoutAttempts, 1);
});

test('process dispatches scouts for undiscovered rivals', () => {
  const a = makeVillage('a');
  const b = makeVillage('b');
  b.center = { x: 40, y: 10 };
  const game = makeGame([a, b]);
  game.world.getWalkableTileNear = (x, y) => ({ x, y });
  game.villagers = [
    makeScoutVillager('s1', 'a'),
    makeScoutVillager('s2', 'b', { x: 40, y: 10 })
  ];
  a.villagerIds = ['s1'];
  b.villagerIds = ['s2'];
  game.explorationSystem.process();
  assert.ok(game.villagers.some((v) => v.isScouting));
});

console.log('\nUtils seeded RNG');
test('seededRandom is deterministic for same seed', () => {
  Utils.setSeed(42);
  const a = [Utils.randomInt(0, 100), Utils.randomFloat(0, 1), Utils.randomElement([1, 2, 3])];
  Utils.setSeed(42);
  const b = [Utils.randomInt(0, 100), Utils.randomFloat(0, 1), Utils.randomElement([1, 2, 3])];
  assert.deepStrictEqual(a, b);
});

test('shuffle is deterministic under seed', () => {
  Utils.setSeed(7);
  const first = Utils.shuffle([1, 2, 3, 4, 5]);
  Utils.setSeed(7);
  const second = Utils.shuffle([1, 2, 3, 4, 5]);
  assert.deepStrictEqual(first, second);
});

test('escapeHtml escapes markup', () => {
  assert.strictEqual(Utils.escapeHtml('<script>'), '&lt;script&gt;');
});

test('generateId is unique under same seed progression', () => {
  Utils.setSeed(1);
  Utils._idCounter = 0;
  const ids = new Set([Utils.generateId(), Utils.generateId(), Utils.generateId()]);
  assert.strictEqual(ids.size, 3);
});

test('clamp bounds values', () => {
  assert.strictEqual(Utils.clamp(150, 0, 100), 100);
  assert.strictEqual(Utils.clamp(-5, 0, 100), 0);
});

console.log('\nBaselineAgent');
test('baseline generates actions for each villager', () => {
  const agent = new BaselineAgent();
  const game = makeGame([makeVillage('a')]);
  game.getVillage = () => makeVillage('a');
  game.world = { villageCenter: { x: 32, y: 32 }, getWalkableTileNear: () => ({ x: 32, y: 33 }) };
  game.findNearestResource = () => null;
  const villagers = [{ id: 'v1', x: 32, y: 32, hunger: 50, thirst: 80, energy: 70, villageId: 'a', isChieftan: false }];
  const actions = agent.generateVillagerActions(
    villagers,
    { resources: { food: 2, water: 10, wood: 5 }, villageCenter: { x: 32, y: 32 } },
    { day: 1, hours: 8, season: CONSTANTS.SEASON.WET, dayInSeason: 1 },
    game
  );
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].villagerId, 'v1');
});

test('baseline prefers raid when strong and hostile', () => {
  const agent = new BaselineAgent();
  const village = makeVillage('a');
  village.relations = { b: -50 };
  village.raidCooldown = 0;
  const other = makeVillage('b');
  const decision = agent.generateDiplomaticAction(village, other, { yourStrength: 120, theirStrength: 80 });
  assert.strictEqual(decision.action, 'raid');
});

console.log('\nBenchmarkScorer');
test('resourceScore weights food and water', () => {
  const score = BenchmarkScorer.resourceScore({ food: 10, water: 5, wood: 0 });
  assert.strictEqual(score, 10 * 2 + 5 * 2);
});

test('determineWinner picks higher composite score', () => {
  const game = makeGame([makeVillage('a'), makeVillage('b')]);
  const snapshots = [
    { agent: { slot: 'A' }, villageName: 'A', population: 5, compositeScore: 200 },
    { agent: { slot: 'B' }, villageName: 'B', population: 5, compositeScore: 150 }
  ];
  const outcome = BenchmarkScorer.determineWinner(snapshots, game);
  assert.strictEqual(outcome.winner, 'A');
  assert.strictEqual(outcome.reason, 'composite_score');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
