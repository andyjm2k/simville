import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Villager social helpers', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(4242);
    game.newWorld();
  });

  function makePair() {
    const mates = game.getVillagersForVillage(game.villages[0].id);
    const a = mates[0];
    const b = mates[1];
    a.x = b.x;
    a.y = b.y;
    a.socialNeed = 4;
    b.socialNeed = 4;
    a.hunger = 90;
    a.thirst = 90;
    a.energy = 90;
    b.hunger = 90;
    b.thirst = 90;
    b.energy = 90;
    a.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    b.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    a.socialPartnerId = b.id;
    b.socialPartnerId = a.id;
    return { a, b };
  }

  it('treats socializing as a need-locked activity', () => {
    const villager = game.villagers[0];
    villager.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    expect(villager.isNeedLockedActivity()).toBe(true);
    expect(villager.isNeedLockedActivity(CONSTANTS.ACTIVITY.IDLE)).toBe(false);
  });

  it('detects a nearby assigned social partner', () => {
    const { a, b } = makePair();
    expect(a.isWithinSocialRange(b)).toBe(true);
    expect(a.getAssignedSocialPartner(game.villagers)?.id).toBe(b.id);
    expect(a.getNearbySocialPartner(game.villagers)?.id).toBe(b.id);
  });

  it('fills social need in range and decays it when alone', () => {
    const { a, b } = makePair();
    const hour = game.timeState.hourDuration;

    a.updateNeeds(hour, game.villagers);
    expect(a.socialNeed).toBeGreaterThan(4);

    a.socialNeed = 20;
    a.socialPartnerId = 'missing';
    b.status = CONSTANTS.ACTIVITY.IDLE;
    b.socialPartnerId = null;
    a.updateNeeds(hour, game.villagers);
    expect(a.socialNeed).toBeLessThan(20);
  });

  it('serializes the current social partner', () => {
    const { a, b } = makePair();
    const data = a.serialize();
    expect(data.socialPartnerId).toBe(b.id);
    const restored = Villager.deserialize(data);
    expect(restored.socialPartnerId).toBe(b.id);
  });
});
