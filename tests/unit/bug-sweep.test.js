import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Bug sweep: per-village resources and builds', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(4201);
    game.newWorld();
    game.benchmarkMode = false;
  });

  it('charges the HUD tribe for manual builds, not a rival builder', () => {
    const [v1, v2] = game.villages;
    v1.resources = { ...game.getDefaultResources(), wood: 80, clay: 40, thatch: 40 };
    v2.resources = { ...game.getDefaultResources(), wood: 0, clay: 0, thatch: 0 };

    // Select tribe 1 in the HUD while a tribe-2 villager would otherwise be preferred
    game.hudVillageId = v1.id;
    game.selectedVillager = null;
    const rivalBuilder = game.getVillagersForVillage(v2.id).find(v => !v.isChieftan);
    expect(rivalBuilder).toBeTruthy();

    const started = game.startConstructionProject('hut', {
      source: 'manual',
      builderId: rivalBuilder.id,
      villageId: v1.id
    });

    // Rival builder is rejected; a tribe-1 builder is used against tribe-1 stockpile
    expect(started).toBe(true);
    expect(v1.resources.wood).toBeLessThan(80);
    expect(v2.resources.wood).toBe(0);
    expect(game.constructionProjects[0].villageId).toBe(v1.id);
    const builder = game.villagers.find(v => v.id === game.constructionProjects[0].builderId);
    expect(builder.villageId).toBe(v1.id);
  });

  it('grants survival emergency resources to each hungry village stockpile', () => {
    const [v1, v2] = game.villages;
    v1.resources.food = 0;
    v1.resources.water = 0;
    v2.resources.food = 50;
    v2.resources.water = 50;

    game.getVillagersForVillage(v1.id).forEach(v => {
      v.hunger = 10;
      v.thirst = 10;
      v.energy = 80;
      v.health = 100;
    });

    game.hudVillageId = v2.id;
    game.runSurvivalBehaviors();

    expect(v1.resources.food).toBeGreaterThan(0);
    expect(v1.resources.water).toBeGreaterThan(0);
    // Selected HUD village was already stocked and not starving
    expect(v2.resources.food).toBe(50);
  });

  it('does not count rival barns toward storage capacity', () => {
    bootstrapCoreModules();
    const economy = new Economy({
      villages: [],
      selectedVillager: null,
      hudVillageId: null,
      world: { structures: [{ id: 'barn-a', type: 'storage' }, { id: 'barn-b', type: 'storage' }] },
      getVillage(id) {
        return this.villages.find(v => v.id === id) || null;
      }
    });
    const village = new Village({
      id: 'own',
      structureIds: ['barn-a'],
      resources: economy.getDefaultResources()
    });
    economy.game.villages = [village];
    economy.game.hudVillageId = village.id;

    const foodCap = economy.getStorageCapacity('food', village.id);
    expect(foodCap).toBe(70 + 100); // base + one owned barn, not two
  });
});

describe('Bug sweep: conquest legends and legacy saves', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(4202);
    game.newWorld();
    game.benchmarkMode = false;
  });

  it('keeps Fall of and prior legends on the winning tribe after conquest', () => {
    const [winner, loser] = game.villages;
    loser.chronicle.legendary = [
      { title: 'Founding Fire', text: 'The first fire was lit.', day: 1 }
    ];

    game.handleConquest(loser.id, winner.id);

    expect(game.villages.find(v => v.id === loser.id)).toBeFalsy();
    const titles = winner.chronicle.legendary.map(entry => entry.title);
    expect(titles.some(title => title.includes('Fall of') || title.includes(loser.name))).toBe(true);
    expect(titles).toContain('Founding Fire');
    expect(titles.some(title => String(title).includes('Conquest'))).toBe(true);
  });

  it('migrates legacy top-level chronicle onto village 0 when per-village chronicle is empty', async () => {
    const legacyChronicle = {
      legendary: [{ title: 'Old Days', text: 'Remembered from before the split.', day: 3 }],
      entries: [{ text: 'Dawn over Simville.', day: 1, type: 'normal' }],
      stats: { births: 2, deaths: 0, structuresBuilt: 1, marriages: 0 }
    };

    const saveData = {
      version: CONSTANTS.VERSION,
      world: game.world.serialize(),
      villagers: game.villagers.map(v => {
        const data = v.serialize();
        delete data.villageId;
        return data;
      }),
      // Pre-multi-village: no villages array
      timeState: { ...game.timeState },
      chronicle: legacyChronicle,
      techState: { researched: ['fire_mastery'], currentResearch: null, researchSpeed: 1 },
      resources: { wood: 33, food: 21, water: 19, stone: 4, herbs: 1, clay: 2, fish: 0, thatch: 5, rareMaterials: 0 },
      constructionProjects: [],
      graphicsSettings: game.graphicsSettings
    };

    const reloaded = createHeadlessGame(4203);
    await reloaded.loadGame(saveData);

    expect(reloaded.villages).toHaveLength(1);
    expect(reloaded.villages[0].chronicle.legendary[0].title).toBe('Old Days');
    expect(reloaded.villages[0].techState.researched).toContain('fire_mastery');
    expect(reloaded.villages[0].resources.food).toBe(21);
    expect(reloaded.villages[0].resources.wood).toBe(33);
  });

  it('resolves duplicate social names within the same tribe first', () => {
    const [v1, v2] = game.villages;
    const a = game.getVillagersForVillage(v1.id)[0];
    const b = game.getVillagersForVillage(v1.id)[1];
    const rival = game.getVillagersForVillage(v2.id)[0];
    a.name = 'SharedName';
    rival.name = 'SharedName';
    b.name = 'UniqueMate';

    const resolved = game.resolveVillagerByNameOrId('SharedName', a.villageId);
    expect(resolved.id).toBe(a.id);

    const result = game.applySocialVillagerAction(b, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionTarget: 'SharedName'
    });
    expect(result?.handled).toBe(true);
    expect(b.socialPartnerId).toBe(a.id);
  });
});
