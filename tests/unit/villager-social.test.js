import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Villager social helpers', () => {
  beforeEach(() => {
    bootstrapCoreModules();
    Utils.setSeed(4242);
  });

  function makePair() {
    const a = new Villager({
      id: 'social-a',
      name: 'Kana',
      x: 10,
      y: 10,
      socialNeed: 4,
      hunger: 90,
      thirst: 90,
      energy: 90,
      personality: { sociable: 75, active: 50, curious: 50, empathetic: 50, confident: 50 }
    });
    const b = new Villager({
      id: 'social-b',
      name: 'Toma',
      x: 11,
      y: 10,
      socialNeed: 4,
      hunger: 90,
      thirst: 90,
      energy: 90,
      personality: { sociable: 60, active: 50, curious: 50, empathetic: 50, confident: 50 }
    });
    a.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    b.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    a.socialPartnerId = b.id;
    b.socialPartnerId = a.id;
    return { a, b };
  }

  it('treats socializing as a need-locked activity', () => {
    const villager = new Villager({ status: CONSTANTS.ACTIVITY.SOCIALIZING });
    expect(villager.isNeedLockedActivity()).toBe(true);
    expect(villager.isNeedLockedActivity(CONSTANTS.ACTIVITY.IDLE)).toBe(false);
  });

  it('detects a nearby assigned social partner', () => {
    const { a, b } = makePair();
    expect(a.isWithinSocialRange(b)).toBe(true);
    expect(a.getAssignedSocialPartner([a, b])?.id).toBe(b.id);
    expect(a.getNearbySocialPartner([a, b])?.id).toBe(b.id);
  });

  it('fills social need in range and decays it when alone', () => {
    const { a, b } = makePair();
    const hour = (typeof game !== 'undefined' && game?.timeState?.hourDuration) || 600;

    a.updateNeeds(hour, [a, b]);
    expect(a.socialNeed).toBeGreaterThan(4);

    a.socialNeed = 20;
    a.socialPartnerId = 'missing';
    b.x = 40;
    b.y = 40;
    a.updateNeeds(hour, [a, b]);
    expect(a.socialNeed).toBeLessThan(20);
  });

  it('serializes the current social partner', () => {
    const { a } = makePair();
    const data = a.serialize();
    expect(data.socialPartnerId).toBe('social-b');
    const restored = Villager.deserialize(data);
    expect(restored.socialPartnerId).toBe('social-b');
  });
});
