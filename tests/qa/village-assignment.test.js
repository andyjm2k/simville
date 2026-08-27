import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa village-assignment
 */
describe('QA: village assignment', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9002);
    game.newWorld();
  });

  it('creates ten villagers across two villages', () => {
    expect(game.villagers).toHaveLength(10);
    expect(game.villages).toHaveLength(2);
  });

  it('assigns every villager to a village', () => {
    const unassigned = game.villagers.filter((v) => !v.villageId);
    expect(unassigned).toHaveLength(0);

    const assignedCount = game.villages.reduce(
      (sum, village) => sum + village.villagerIds.length,
      0
    );
    expect(assignedCount).toBe(game.villagers.length);
  });

  it('ensures each village has exactly one chieftan', () => {
    game.villages.forEach((village) => {
      const chieftans = game
        .getVillagersForVillage(village.id)
        .filter((v) => v.isChieftan);
      expect(chieftans).toHaveLength(1);
    });
  });
});
