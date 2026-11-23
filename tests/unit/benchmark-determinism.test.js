/**
 * Unit tests for seeded benchmark reproducibility.
 *
 * Same-seed headless runs must produce identical sim snapshots. Before the
 * fix, `initializeHeadless` seeded only Utils' LCG while sim code calls
 * Math.random directly in ~46 places (raid combat, secrets, chronicle
 * picks, wandering), so two runs with --seed 42 diverged.
 */
import { describe, it, expect } from 'vitest';
import { loadRendererScripts } from '../setup/load-scripts.js';

async function runSeededSnapshot(seed) {
  // Deliberately the raw benchmark path (new Game() + initializeHeadless),
  // not createHeadlessGame() — the test harness already seeded Math.random,
  // so only this path catches a regression in initializeHeadless itself.
  loadRendererScripts({ includeGame: true, includeSystems: true });
  const game = new Game();
  await game.initializeHeadless({
    seed,
    dayLengthMs: 10000,
    tickIntervalMs: 2000,
    skipBackstories: true
  });

  // No benchmark agents are registered, so no LLM calls happen; ticks
  // exercise survival, movement, needs, raids, diplomacy and chronicle.
  for (let i = 0; i < 20; i += 1) {
    await game.runHeadlessTick(2000);
  }

  const round3 = (n) => Math.round((n ?? 0) * 1000) / 1000;
  const villagers = game.villagers
    .map((v) => ({
      name: v.name,
      x: round3(v.x),
      y: round3(v.y),
      hunger: round3(v.hunger),
      thirst: round3(v.thirst),
      energy: round3(v.energy),
      health: round3(v.health),
      socialNeed: round3(v.socialNeed),
      status: v.status
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const villages = game.villages
    .map((v) => ({
      name: v.name,
      population: game.getVillagersForVillage(v.id).length,
      resources: game.getResources(v.id)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return JSON.stringify({
    villagers,
    villages,
    day: game.timeState.day,
    tickCount: game.tickCount
  });
}

describe('Seeded benchmark reproducibility', () => {
  it('two runs with the same seed produce identical snapshots', async () => {
    const first = await runSeededSnapshot(42);
    const second = await runSeededSnapshot(42);
    expect(second).toBe(first);
  });

  it('different seeds produce different snapshots', async () => {
    const seed42 = await runSeededSnapshot(42);
    const seed7 = await runSeededSnapshot(7);
    expect(seed7).not.toBe(seed42);
  });

  it('seedMathRandom produces a deterministic, seed-dependent stream', () => {
    const a = Utils.createSeededRandom(123);
    const b = Utils.createSeededRandom(123);
    const c = Utils.createSeededRandom(124);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(c()).not.toBe(a());
  });
});
