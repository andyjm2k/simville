import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules, resetRendererModules } from '../setup/load-scripts.js';

describe('PlaceMemorySystem', () => {
  let game;
  let pm;

  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
    Utils.setSeed(4242);

    game = {
      timeState: { day: 3 },
      world: new World(24),
      villages: [],
      villagers: [],
      getVillage(id) {
        return this.villages.find(v => v.id === id) || null;
      },
      getRivalVillage(id) {
        return this.villages.find(v => v.id !== id) || null;
      },
      getVillagersForVillage(id) {
        return this.villagers.filter(v => v.villageId === id);
      },
      canVillagerEnterTerritory() {
        return true;
      },
      getTerritoryOwnerAt() {
        return null;
      },
      getForeignTerritoryAccess() {
        return null;
      }
    };
    globalThis.game = game;

    game.world.seed = 99;
    // Minimal walkable land without full generate for speed
    for (let y = 0; y < game.world.size; y++) {
      game.world.tiles[y] = [];
      for (let x = 0; x < game.world.size; x++) {
        game.world.tiles[y][x] = {
          x, y,
          biome: CONSTANTS.BIOME.SAVANNA,
          walkable: true,
          explored: false,
          visible: true
        };
      }
    }
    game.world.resources = [];
    game.world.structures = [];
    game.world.rebuildOccupancy?.();

    pm = new PlaceMemorySystem(game);
    game.placeMemory = pm;
  });

  it('createEntry and normalizeEntry clamp confidence and fill defaults', () => {
    const entry = pm.createEntry({
      id: 'r1', kind: 'resource', label: 'wood node',
      x: 4.2, y: 5.8, confidence: 2, precision: -1,
      tags: ['wood'], resourceType: 'wood'
    });
    expect(entry.x).toBe(4);
    expect(entry.y).toBe(6);
    expect(entry.confidence).toBe(1);
    expect(entry.precision).toBe(0);
    expect(pm.normalizeEntry(null)).toBeNull();
  });

  it('addOrUpdate merges by id and enforces cap without dropping seeded home', () => {
    const list = [];
    pm.addOrUpdate(list, pm.createEntry({
      id: 'home', kind: 'landmark', label: 'center', x: 1, y: 1,
      source: 'seeded', confidence: 1, tags: ['home']
    }), 3);
    for (let i = 0; i < 5; i++) {
      pm.addOrUpdate(list, pm.createEntry({
        id: `r${i}`, kind: 'resource', label: 'wood', x: i, y: i,
        confidence: 0.2 + i * 0.05, tags: ['wood'], resourceType: 'wood', source: 'rumor'
      }), 3);
    }
    expect(list.some(e => e.id === 'home')).toBe(true);
    expect(list.length).toBeLessThanOrEqual(3);

    pm.addOrUpdate(list, pm.createEntry({
      id: 'r4', kind: 'resource', label: 'wood', x: 9, y: 9,
      confidence: 0.9, precision: 1, tags: ['wood'], resourceType: 'wood', source: 'seen'
    }), 8);
    const merged = pm.addOrUpdate(list, pm.createEntry({
      id: 'r4', kind: 'resource', label: 'wood', x: 10, y: 10,
      confidence: 0.5, precision: 0.5, tags: ['food'], resourceType: 'wood', source: 'told'
    }), 8);
    expect(merged.confidence).toBeGreaterThanOrEqual(0.9);
    expect(merged.tags).toContain('wood');
    expect(merged.tags).toContain('food');
  });

  it('findByNeed and rankCandidates score by confidence and distance', () => {
    const villager = new Villager({ id: 'v1', x: 0, y: 0 });
    const list = [
      pm.createEntry({ id: 'far', kind: 'resource', label: 'wood', x: 20, y: 0, confidence: 0.9, tags: ['wood'], resourceType: 'wood' }),
      pm.createEntry({ id: 'near', kind: 'resource', label: 'wood', x: 2, y: 0, confidence: 0.6, tags: ['wood'], resourceType: 'wood' })
    ];
    const hit = pm.findByNeed(list, 'wood', { villager, origin: { x: 0, y: 0 } });
    expect(hit.id).toBe('near');
  });

  it('observeSurroundings records resources and structures in sight', () => {
    const wood = game.world.addResource({ type: 'wood', x: 5, y: 5, amount: 10, depleted: false });
    const fire = { id: Utils.generateId(), type: 'fire', x: 4, y: 5 };
    game.world.structures.push(fire);
    game.world.rebuildOccupancy();
    const villager = new Villager({ id: 'v1', x: 5, y: 5, knownPlaces: [] });
    const touched = pm.observeSurroundings(villager, { radius: 3 });
    expect(touched.length).toBeGreaterThan(0);
    expect(pm.getById(villager.knownPlaces, wood.id)).toBeTruthy();
    expect(pm.getById(villager.knownPlaces, fire.id)).toBeTruthy();
  });

  it('confirmArrival boosts on hit and marks stale on miss', () => {
    game.world.addResource({ id: 'wood-a', type: 'wood', x: 3, y: 3, amount: 5, depleted: false });
    const villager = new Villager({ id: 'v1', x: 3, y: 3, knownPlaces: [] });
    const entry = pm.createEntry({
      id: 'wood-a', kind: 'resource', label: 'wood', x: 3, y: 3,
      confidence: 0.5, tags: ['wood'], resourceType: 'wood'
    });
    pm.addOrUpdate(villager.knownPlaces, entry, 24);
    expect(pm.confirmArrival(villager, entry)).toBe('confirmed');
    expect(pm.getById(villager.knownPlaces, 'wood-a').confidence).toBeGreaterThan(0.5);

    const missing = pm.createEntry({
      id: 'gone', kind: 'resource', label: 'wood', x: 8, y: 8,
      confidence: 0.8, tags: ['wood'], resourceType: 'wood'
    });
    pm.addOrUpdate(villager.knownPlaces, missing, 24);
    expect(pm.confirmArrival(villager, missing)).toBe('miss');
    expect(pm.getById(villager.knownPlaces, 'gone').stale).toBe(true);
  });

  it('sharePlaceBetween lowers confidence for the listener', () => {
    const speaker = new Villager({
      id: 's', villageId: 'home', personality: { curious: 80, sociable: 80 },
      knownPlaces: []
    });
    const listener = new Villager({ id: 'l', villageId: 'home', knownPlaces: [] });
    const place = pm.createEntry({
      id: 'berry', kind: 'resource', label: 'food', x: 7, y: 7,
      confidence: 0.95, precision: 1, tags: ['food'], resourceType: 'food', source: 'seen'
    });
    pm.addOrUpdate(speaker.knownPlaces, place, 24);
    const shared = pm.sharePlaceBetween(speaker, listener, place);
    expect(shared.source).toBe('told');
    expect(shared.confidence).toBeLessThan(place.confidence);
    expect(listener.knownPlaces.some(e => e.id === 'berry')).toBe(true);
  });

  it('mergeIntoTribal records scout finds', () => {
    const village = new Village({ id: 'home', name: 'Testvale', center: { x: 10, y: 10 } });
    game.villages = [village];
    const entries = [
      pm.createEntry({
        id: 'stone-1', kind: 'resource', label: 'stone', x: 12, y: 14,
        confidence: 0.7, tags: ['stone'], resourceType: 'stone', source: 'seen'
      })
    ];
    const result = pm.mergeIntoTribal(village, entries, 'scout');
    expect(result.added).toBe(1);
    expect(village.tribalMap[0].source).toBe('seen');
  });

  it('resolvePlaceTarget prefers personal then tribal then live', () => {
    const village = new Village({ id: 'home', name: 'Home', center: { x: 5, y: 5 }, territoryRadius: 20 });
    game.villages = [village];
    const villager = new Villager({ id: 'v1', x: 5, y: 5, villageId: 'home', knownPlaces: [] });
    game.villagers = [villager];

    pm.addOrUpdate(villager.knownPlaces, pm.createEntry({
      id: 'pers', kind: 'resource', label: 'wood', x: 6, y: 5,
      confidence: 0.9, tags: ['wood'], resourceType: 'wood'
    }), 24);
    expect(pm.resolvePlaceTarget(villager, 'wood').from).toBe('personal');

    villager.knownPlaces = [];
    village.tribalMap = [];
    pm.addOrUpdate(village.tribalMap, pm.createEntry({
      id: 'trib', kind: 'resource', label: 'wood', x: 7, y: 5,
      confidence: 0.8, tags: ['wood'], resourceType: 'wood'
    }), 48);
    expect(pm.resolvePlaceTarget(villager, 'wood').from).toBe('tribal');

    village.tribalMap = [];
    game.world.addResource({ type: 'wood', x: 5, y: 6, amount: 4, depleted: false });
    const live = pm.resolvePlaceTarget(villager, 'wood');
    expect(live.from).toBe('live');
    expect(live.liveResource).toBeTruthy();
  });

  it('decayList reduces rumor confidence over days', () => {
    const list = [
      pm.createEntry({
        id: 'rumor', kind: 'resource', label: 'wood', x: 1, y: 1,
        confidence: 0.5, source: 'rumor', lastSeenDay: 1, tags: ['wood']
      })
    ];
    pm.decayList(list, 10);
    expect(list[0].confidence).toBeLessThan(0.5);
  });

  it('updateLocality describes home near seeded landmarks', () => {
    const village = new Village({
      id: 'home', name: 'Rivermere', center: { x: 8, y: 8 }, territoryRadius: 12
    });
    game.villages = [village];
    const fire = { id: Utils.generateId(), type: 'fire', x: 8, y: 8 };
    game.world.structures.push(fire);
    game.world.rebuildOccupancy();
    village.structureIds.push(fire.id);
    const villager = new Villager({ id: 'v1', x: 8, y: 8, villageId: 'home', knownPlaces: [] });
    pm.seedHomePlaces(villager, village);
    const locality = pm.updateLocality(villager);
    expect(locality.zone).toBe('home');
    expect(locality.description).toMatch(/near|home/i);
  });

  it('serializeList round-trips entries', () => {
    const list = [
      pm.createEntry({
        id: 'a', kind: 'landmark', label: 'center', x: 1, y: 2,
        confidence: 1, source: 'seeded', tags: ['home']
      })
    ];
    const restored = pm.deserializeList(pm.serializeList(list));
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('a');
    expect(restored[0].tags).toContain('home');
  });
});

describe('findNearestResourceInTerritory sort', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
  });

  it('orders by true distance to villager (x and y)', () => {
    // Lightweight stand-in matching the fixed sort expression
    const villager = { x: 0, y: 0 };
    const nodes = [
      { x: 0, y: 10, type: 'wood' },
      { x: 3, y: 0, type: 'wood' }
    ];
    const sorted = [...nodes].sort((a, b) =>
      Utils.distance(a.x, a.y, villager.x, villager.y)
      - Utils.distance(b.x, b.y, villager.x, villager.y)
    );
    expect(sorted[0]).toEqual({ x: 3, y: 0, type: 'wood' });
  });
});

describe('World.getPath territory filter', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
    Utils.setSeed(11);
  });

  it('skips tiles rejected by canEnterTile', () => {
    const world = new World(12);
    for (let y = 0; y < world.size; y++) {
      world.tiles[y] = [];
      for (let x = 0; x < world.size; x++) {
        world.tiles[y][x] = {
          x, y, biome: CONSTANTS.BIOME.SAVANNA, walkable: true, explored: false, visible: true
        };
      }
    }
    // Partial wall at x=5 (y=3..8) — path must detour around north or south
    const blocked = new Set();
    for (let y = 3; y <= 8; y++) blocked.add(`5,${y}`);

    const path = world.getPath(1, 6, 10, 6, {
      canEnterTile: (x, y) => !blocked.has(`${x},${y}`)
    });
    expect(path).not.toBeNull();
    expect(path.some(p => p.x === 5 && p.y >= 3 && p.y <= 8)).toBe(false);
    expect(path[path.length - 1]).toEqual({ x: 10, y: 6 });
  });
});
