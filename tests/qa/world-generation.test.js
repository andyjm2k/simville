import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa world-generation
 */
describe('QA: world generation', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9001);
    game.newWorld();
  });

  it('creates a 64x64 world with two village centers', () => {
    expect(game.world.size).toBe(64);
    expect(game.world.villageCenters).toHaveLength(2);
    expect(game.villages).toHaveLength(2);
  });

  it('ensures essential resources exist near the primary village center', () => {
    const center = game.world.villageCenter;
    const nearby = game.world.getResourcesInRadius(center.x, center.y, 12);
    const types = new Set(nearby.map((resource) => resource.type));

    expect(types.has(CONSTANTS.RESOURCE.WATER)).toBe(true);
    expect(types.has(CONSTANTS.RESOURCE.FOOD)).toBe(true);
    expect(types.has(CONSTANTS.RESOURCE.WOOD)).toBe(true);
  });

  it('initializes rival villages with negative relations', () => {
    const [first, second] = game.villages;
    expect(first.relations[second.id]).toBeLessThan(0);
    expect(second.relations[first.id]).toBeLessThan(0);
  });
});
