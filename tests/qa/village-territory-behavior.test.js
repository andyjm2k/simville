import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa village-territory-behavior
 */
describe('QA: village territory and tribal social boundaries', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9010);
    game.newWorld();
  });

  it('blocks moveTo into rival territory for neutral relations', () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const villagerA = game.getVillagersForVillage(villageA.id)[0];

    expect(game.canVillagerEnterTerritory(villagerA, villageB.center.x, villageB.center.y)).toBe(false);

    villagerA.moveTo(villageB.center.x, villageB.center.y, game.world);
    expect(villageA.isInTerritory(villagerA.targetX, villagerA.targetY)).toBe(true);
    expect(villageB.isInTerritory(villagerA.targetX, villagerA.targetY)).toBe(false);
  });

  it('allows moveTo within own territory', () => {
    const village = game.villages[0];
    const villager = game.getVillagersForVillage(village.id)[0];
    const nearCenter = game.world.getWalkableTileNear(
      village.center.x + 2,
      village.center.y + 2,
      3
    );

    expect(nearCenter).toBeTruthy();
    expect(game.canVillagerEnterTerritory(villager, nearCenter.x, nearCenter.y)).toBe(true);
    expect(villager.moveTo(nearCenter.x, nearCenter.y, game.world)).toBe(true);
  });

  it('restricts social targeting to same tribe by default', () => {
    const villagerA = game.getVillagersForVillage(game.villages[0].id)[0];
    const rival = game.getVillagersForVillage(game.villages[1].id)[0];

    expect(game.canVillagersSocialize(villagerA, rival)).toBe(false);

    const target = game.resolveGoalTargetVillager(villagerA, { type: 'social' });
    expect(target?.villageId).toBe(villagerA.villageId);
  });

  it('assigns babies to parent tribe and village center', () => {
    const parent = game.getVillagersForVillage(game.villages[0].id).find(v => !v.isChieftan);
    const baby = game.createBabyForParents(parent);

    expect(baby.villageId).toBe(parent.villageId);
    const village = game.getVillage(parent.villageId);
    expect(village.isInTerritory(baby.x, baby.y)).toBe(true);
  });

  it('finds resources only within villager territory', () => {
    const villager = game.getVillagersForVillage(game.villages[0].id)[0];
    const rivalCenter = game.villages[1].center;

    const globalWood = game.findNearestResource(rivalCenter.x, rivalCenter.y, CONSTANTS.RESOURCE.WOOD, 20);
    const territorialWood = game.findNearestResourceInTerritory(villager, CONSTANTS.RESOURCE.WOOD, 20);

    if (globalWood && territorialWood) {
      const rivalOwner = game.getTerritoryOwnerAt(globalWood.x, globalWood.y);
      if (rivalOwner?.id !== villager.villageId) {
        expect(territorialWood.x).not.toBe(globalWood.x);
        expect(territorialWood.y).not.toBe(globalWood.y);
      }
    }

    if (territorialWood) {
      const village = game.getVillage(villager.villageId);
      expect(village.isInTerritory(territorialWood.x, territorialWood.y)).toBe(true);
    }
  });
});
