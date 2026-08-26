import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa simulation-tick
 */
describe('QA: simulation tick', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9005);
    game.newWorld();
    game.paused = false;
    game.timeState.dayDuration = 60000;
    game.timeState.hourDuration = game.timeState.dayDuration / 24;
  });

  it('advances in-game hours when update runs', () => {
    const startingHour = game.timeState.hours;
    game.update(5000);
    expect(game.timeState.hours).toBeGreaterThan(startingHour);
  });

  it('decays villager needs over time', () => {
    const villager = game.villagers[0];
    villager.hunger = 80;
    villager.thirst = 80;
    villager.energy = 80;

    game.update(10000);

    expect(villager.hunger).toBeLessThan(80);
    expect(villager.thirst).toBeLessThan(80);
  });

  it('increments day counter after a full in-game day elapses', () => {
    game.timeState.hours = 23.5;
    game.update(game.timeState.dayDuration);
    expect(game.timeState.day).toBeGreaterThan(1);
  });
});
