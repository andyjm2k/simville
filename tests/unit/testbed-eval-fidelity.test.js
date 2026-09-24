/**
 * Unit tests for hard-survival flags, multi-metric scoring, and scenario pack.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { bootstrapCoreModules, loadRendererScripts } from '../setup/load-scripts.js';

describe('LLM testbed eval fidelity', () => {
  beforeAll(() => {
    // Load systems + game into globalThis for headless checks
    loadRendererScripts({ includeGame: true, includeSystems: true });
  });

  it('lists stress scenarios including famine and asymmetric', () => {
    const ids = BenchmarkScenarios.list();
    expect(ids).toContain('famine');
    expect(ids).toContain('asymmetric');
    expect(ids).toContain('hostile_baseline');
  });

  it('expands replicates to at least 5 per scenario', () => {
    const runs = BenchmarkScenarios.expandReplicates(
      { days: 5, agentA: { type: 'baseline' }, agentB: { type: 'baseline' } },
      { replicates: 5, scenarios: ['famine', 'asymmetric', 'hostile_baseline'] }
    );
    expect(runs.length).toBe(15);
    expect(runs.every((r) => r.easyNeeds === false)).toBe(true);
    expect(runs.every((r) => r.allowAutonomousBuild === false)).toBe(true);
    const hostile = runs.filter((r) => r.scenario === 'hostile_baseline');
    expect(hostile.every((r) => r.agentB.strategy === 'raider')).toBe(true);
    const seeds = new Set(runs.map((r) => r.seed));
    expect(seeds.size).toBe(runs.length);
  });

  it('scores survival/growth/military/socialGoals separately and uses agent structures', () => {
    const village = {
      id: 'v1',
      name: 'Test',
      structureIds: ['a', 'b', 'c'],
      atWarWith: [],
      relations: {},
      calculateStrength: () => 12
    };
    const game = {
      villages: [village],
      benchmarkStartingStructures: { v1: 2 },
      getVillagersForVillage: () => [
        { hunger: 80, thirst: 70, health: 90, goals: [{ completed: true }, { progress: 50 }] }
      ],
      getResources: () => ({ food: 10, water: 10, wood: 5 })
    };
    const scored = BenchmarkScorer.scoreVillage(village, game, { slot: 'A' });
    expect(scored.agentStructures).toBe(1);
    expect(scored.metrics.survival).toBeGreaterThan(0);
    expect(scored.metrics.growth).toBeGreaterThan(0);
    expect(scored.metrics.military).toBe(12);
    expect(scored.metrics.socialGoals).toBeGreaterThanOrEqual(0);
    expect(scored.compositeScore).toBeGreaterThan(0);
    const naiveGrowth = BenchmarkScorer.growthScore(1, 3, scored.resourceScore);
    expect(scored.metrics.growth).toBeLessThan(naiveGrowth);
  });

  it('defaults headless to hard survival (no easyNeeds / no autonomous build)', async () => {
    bootstrapCoreModules();
    const game = new Game();
    await game.initializeHeadless({ seed: 7, dayLengthMs: 10000, tickIntervalMs: 2000 });
    expect(game.benchmarkMode).toBe(true);
    expect(game.easyNeeds).toBe(false);
    expect(game.allowAutonomousBuild).toBe(false);
    expect(Object.keys(game.benchmarkStartingStructures || {}).length).toBeGreaterThan(0);
  });

  it('applies famine scenario by cutting stores', async () => {
    const game = new Game();
    await game.initializeHeadless({ seed: 11, dayLengthMs: 10000, tickIntervalMs: 2000 });
    const village = game.villages[0];
    const beforeFood = Math.max(game.getResources(village.id).food || 0, 40);
    game.getResources(village.id).food = beforeFood;
    BenchmarkScenarios.applyFamine(game);
    expect(game.getResources(village.id).food).toBeLessThan(beforeFood);
  });

  it('creates raider baseline strategy', () => {
    const agent = new BaselineAgent({ strategy: 'raider', name: 'raider' });
    expect(agent.strategy).toBe('raider');
    const decision = agent.generateDiplomaticAction(
      { relations: { o: -5 }, atWarWith: [], raidCooldown: 0 },
      { id: 'o', name: 'Rival' },
      { yourStrength: 10, theirStrength: 10, rivalDiscovered: true }
    );
    expect(['raid', 'send_threat']).toContain(decision.action);
  });
});
