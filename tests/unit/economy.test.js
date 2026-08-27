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
});
