import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Economy', () => {
  let gameStub;
  let economy;

  beforeEach(() => {
    bootstrapCoreModules();
    gameStub = {
      villages: [],
      selectedVillager: null,
      hudVillageId: null,
      getVillage(id) {
        return this.villages.find((v) => v.id === id) || null;
      }
    };
    economy = new Economy(gameStub);
  });

  it('normalizes missing resource keys to zero defaults', () => {
    const normalized = economy.normalizeResources({ wood: 7 });
    expect(normalized.wood).toBe(7);
    expect(normalized.food).toBe(0);
    expect(normalized.water).toBe(0);
  });

  it('credits resources to the owning village pool', () => {
    const village = new Village({
      id: 'v1',
      center: { x: 10, y: 10 },
      resources: economy.getDefaultResources()
    });
    gameStub.villages = [village];

    economy.addResource('food', 5, 'v1');
    expect(economy.getResources('v1').food).toBe(5);
  });

  it('transfers all resources on conquest', () => {
    const loser = new Village({
      id: 'lose',
      resources: { ...economy.getDefaultResources(), food: 8, wood: 3 }
    });
    const winner = new Village({
      id: 'win',
      resources: { ...economy.getDefaultResources(), food: 1 }
    });
    gameStub.villages = [loser, winner];

    economy.transferAllResources(loser, winner);
    expect(winner.resources.food).toBe(9);
    expect(winner.resources.wood).toBe(3);
    expect(loser.resources.food).toBe(0);
    expect(loser.resources.wood).toBe(0);
  });

  it('prefers hudVillageId over selectedVillager for the resource HUD', () => {
    const villageA = new Village({
      id: 'a',
      resources: { ...economy.getDefaultResources(), food: 3 }
    });
    const villageB = new Village({
      id: 'b',
      resources: { ...economy.getDefaultResources(), food: 9 }
    });
    gameStub.villages = [villageA, villageB];
    gameStub.hudVillageId = 'a';
    gameStub.selectedVillager = { villageId: 'b' };

    expect(economy.getHudVillage().id).toBe('a');
    expect(economy.getResourcesSnapshot(economy.getHudVillage().id).food).toBe(3);
  });

  it('counts only owned storage barns toward capacity', () => {
    gameStub.world = {
      structures: [
        { id: 'barn-a', type: 'storage' },
        { id: 'barn-b', type: 'storage' }
      ]
    };
    const village = new Village({
      id: 'own',
      structureIds: ['barn-a'],
      resources: economy.getDefaultResources()
    });
    gameStub.villages = [village];
    gameStub.hudVillageId = 'own';

    expect(economy.getStorageCapacity('food', 'own')).toBe(170);
  });

  it('replace migration overwrites starter defaults for legacy orphan pools', () => {
    const village = new Village({
      id: 'legacy',
      resources: { ...economy.getDefaultResources(), food: 12, wood: 15 }
    });
    gameStub.villages = [village];
    economy.migrateOrphanResources({ food: 40, wood: 9 }, { replace: true });
    expect(village.resources.food).toBe(40);
    expect(village.resources.wood).toBe(9);
  });

  it('estimates daily burn and resource pressure bands for LLM planning', () => {
    const village = new Village({
      id: 'press',
      resources: { ...economy.getDefaultResources(), food: 12, water: 6, wood: 5 }
    });
    gameStub.villages = [village];
    gameStub.timeState = { season: { name: 'Dry Season' } };

    const burn = economy.estimateDailyBurn(4);
    expect(burn.foodPerDay).toBeGreaterThan(0);
    expect(burn.waterPerDay).toBeGreaterThan(0);

    const pressure = economy.getResourcePressure('press', 4);
    expect(pressure.food).toBe(12);
    expect(pressure.water).toBe(6);
    expect(['crisis', 'tight', 'stable', 'surplus']).toContain(pressure.foodBand);
    expect(['crisis', 'tight', 'stable', 'surplus']).toContain(pressure.waterBand);
    expect(pressure.materialShortfalls.some((s) => s.startsWith('wood'))).toBe(true);
    expect(pressure.seasonHint).toBe('Dry Season');
  });
});
