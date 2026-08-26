import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Game normalization helpers', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(101);
  });

  it('fills missing resource keys with defaults', () => {
    const normalized = game.normalizeResources({ wood: 99 });
    expect(normalized.wood).toBe(99);
    expect(normalized.food).toBe(game.getDefaultResources().food);
    expect(normalized.water).toBe(game.getDefaultResources().water);
  });

  it('normalizes government rules with clamped compliance', () => {
    game.timeState.day = 3;
    const government = game.normalizeGovernment({
      compliance: 500,
      rules: [{ title: 'Rest at night', effect: 'rest curfew', compliance: 200 }]
    });

    expect(government.compliance).toBe(100);
    expect(government.rules[0].effect).toBe('rest_curfew');
    expect(government.rules[0].compliance).toBe(100);
  });

  it('maps rule categories from free-form text', () => {
    expect(game.normalizeRuleCategory('increase food reserves')).toBe('food');
    expect(game.normalizeRuleCategory('build more huts')).toBe('building');
    expect(game.normalizeRuleCategory('care for elders')).toBe('care');
  });

  it('expires rules after their configured duration', () => {
    game.government = game.createDefaultGovernment();
    game.government.rules = [
      game.normalizeRule({ title: 'Old rule', createdDay: 1, durationDays: 3 })
    ];
    game.timeState.day = 5;

    const active = game.getActiveRules();
    expect(active).toHaveLength(0);
  });

  it('formats villager-facing text and resolves ids to names', () => {
    game.villagers = [
      new Villager({ id: 'abc123', name: 'Mira' })
    ];
    expect(game.formatVillagerFacingText('Talk to abc123')).toBe('Talk to Mira');
  });
});
