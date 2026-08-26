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

  it('ensures each village has a chieftan after assignment logic runs', () => {
    const chieftans = game.villagers.filter((v) => v.isChieftan);
    expect(chieftans.length).toBeGreaterThanOrEqual(2);

    const villagesWithChieftan = game.villages.filter((village) =>
      village.getChieftan(game.villagers)
    );
    expect(villagesWithChieftan).toHaveLength(2);
  });

  it('characterizes the known gap where high-index villagers may remain unassigned', () => {
    const unassigned = game.villagers.filter((v) => !v.villageId);
    expect(unassigned.length).toBeGreaterThan(0);
    expect(unassigned.some((v, idx) => game.villagers.indexOf(v) >= 6)).toBe(true);
  });
});
