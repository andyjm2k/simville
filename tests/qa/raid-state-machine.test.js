import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa raid-state-machine
 */
describe('QA: raid state machine', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9004);
    game.newWorld();
    game.timeState.dayDuration = 60000;
  });

  function forceFailedRaid() {
    const attacker = game.villages[0];
    const defender = game.villages[1];
    const raiders = game.getVillagersForVillage(attacker.id).slice(0, 1);

    game.activeRaid = {
      attackerVillageId: attacker.id,
      targetVillageId: defender.id,
      raiderIds: raiders.map((r) => r.id),
      phase: 'attacking',
      planningTimer: 0,
      travelTimer: 0,
      retreatTimer: 0,
      loot: null,
      combatResolved: false
    };

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    vi.spyOn(defender, 'calculateStrength').mockReturnValue(99999);
  }

  it('advances raids from planning to moving to attacking', () => {
    const attacker = game.villages[0];
    const defender = game.villages[1];
    const started = game.startRaid(attacker.id, defender.id);
    expect(started).toBe(true);
    expect(game.activeRaid.phase).toBe('planning');

    game.processRaid(game.timeState.dayDuration * 2);
    expect(['moving', 'attacking', 'retreating']).toContain(game.activeRaid.phase);
  });

  it('clears successful raids after the retreat phase completes', () => {
    const attacker = game.villages[0];
    const defender = game.villages[1];
    game.startRaid(attacker.id, defender.id);

    game.activeRaid.phase = 'retreating';
    game.activeRaid.retreatTimer = 0;
    game.activeRaid.attackerWon = true;
    game.processRaid(game.timeState.dayDuration * 2);

    expect(game.activeRaid).toBeNull();
  });

  it('exits attacking into retreating after a failed combat resolution', () => {
    forceFailedRaid();

    game.processRaid(1000);

    expect(game.activeRaid).not.toBeNull();
    expect(game.activeRaid.combatResolved).toBe(true);
    expect(game.activeRaid.phase).toBe('retreating');
    expect(game.activeRaid.attackerWon).toBe(false);

    game.processRaid(game.timeState.dayDuration * 2);
    expect(game.activeRaid).toBeNull();

    vi.restoreAllMocks();
  });
});
