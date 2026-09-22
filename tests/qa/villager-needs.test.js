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
    villager.activityDuration = 0;
    villager.needInterruptCooldown = 0;
    // Below CRITICAL_HUNGER — local reflex only; mild hunger is LLM-owned
    villager.hunger = (CONSTANTS.NEED.CRITICAL_HUNGER ?? 25) - 5;
    villager.thirst = 90;
    villager.energy = 90;
    game.getResources(villager.villageId).food = 10;

    villager.updateStatus();

    expect([CONSTANTS.ACTIVITY.EATING, CONSTANTS.ACTIVITY.GATHERING, CONSTANTS.ACTIVITY.HUNTING, CONSTANTS.ACTIVITY.FISHING])
      .toContain(villager.status);
  });

  it('forces drinking when thirst is critically low', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    villager.activityDuration = 0;
    villager.needInterruptCooldown = 0;
    villager.hunger = 90;
    villager.thirst = (CONSTANTS.NEED.CRITICAL_THIRST ?? 25) - 5;
    villager.energy = 90;
    game.getResources(villager.villageId).water = 10;

    villager.updateStatus();

    expect([CONSTANTS.ACTIVITY.DRINKING, CONSTANTS.ACTIVITY.GATHERING])
      .toContain(villager.status);
  });

  it('does not auto-eat on mild hunger so the LLM can keep persona work', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.WORKING;
    villager.activity = 'Crafting tools';
    villager.activityDuration = 5000;
    villager.needInterruptCooldown = 0;
    villager.hunger = 40;
    villager.thirst = 90;
    villager.energy = 90;
    game.getResources(villager.villageId).food = 20;

    villager.updateStatus();

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.WORKING);
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
