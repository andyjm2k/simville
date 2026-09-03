import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa villager-needs
 */
describe('QA: villager needs arbitration', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9007);
    game.newWorld();
  });

  it('forces survival activity when hunger drops below the critical threshold', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.WORKING;
    villager.activity = 'Crafting tools';
    villager.hunger = 30;
    villager.thirst = 90;
    villager.energy = 90;

    villager.updateStatus();

    expect([CONSTANTS.ACTIVITY.EATING, CONSTANTS.ACTIVITY.GATHERING, CONSTANTS.ACTIVITY.HUNTING, CONSTANTS.ACTIVITY.FISHING])
      .toContain(villager.status);
  });

  it('forces drinking when thirst is critically low', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    villager.hunger = 90;
    villager.thirst = 25;
    villager.energy = 90;

    villager.updateStatus();

    expect([CONSTANTS.ACTIVITY.DRINKING, CONSTANTS.ACTIVITY.GATHERING])
      .toContain(villager.status);
  });

  it('seeks company when social need is critically low', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.IDLE;
    villager.hunger = 90;
    villager.thirst = 90;
    villager.energy = 90;
    villager.socialNeed = 5;
    villager.personality.sociable = 80;
    villager.activityDuration = 0;

    villager.updateStatus(game.villagers);

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
    expect(villager.socialPartnerId).toBeTruthy();
  });
});