import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Utils', () => {
  beforeEach(() => {
    bootstrapCoreModules();
    Utils.setSeed(12345);
  });

  it('clamps values inside the requested range', () => {
    expect(Utils.clamp(5, 0, 10)).toBe(5);
    expect(Utils.clamp(-1, 0, 10)).toBe(0);
    expect(Utils.clamp(99, 0, 10)).toBe(10);
  });

  it('lerps between two numeric endpoints', () => {
    expect(Utils.lerp(0, 10, 0.5)).toBe(5);
    expect(Utils.lerp(2, 8, 0)).toBe(2);
    expect(Utils.lerp(2, 8, 1)).toBe(8);
  });

  it('computes euclidean and manhattan distances', () => {
    expect(Utils.distance(0, 0, 3, 4)).toBe(5);
    expect(Utils.manhattanDistance(0, 0, 3, 4)).toBe(7);
  });

  it('formats clock and calendar strings', () => {
    expect(Utils.formatTime(6.5)).toBe('06:30');
    expect(Utils.formatDayTime(1, 6)).toContain('Day 1');
    expect(Utils.formatDayTime(1, 6)).toContain('Wet Season');
  });

  it('maps days to seasons in the 90-day cycle', () => {
    expect(Utils.getSeason(1).name).toBe('Wet Season');
    expect(Utils.getSeason(31).name).toBe('Dry Season');
    expect(Utils.getSeason(61).name).toBe('Harvest Season');
    expect(Utils.getSeason(76).name).toBe('Deep Dry');
  });

  it('returns deterministic values from seededRandom after setSeed', () => {
    Utils.setSeed(999);
    const first = Utils.seededRandom();
    const second = Utils.seededRandom();
    Utils.setSeed(999);
    expect(Utils.seededRandom()).toBe(first);
    expect(Utils.seededRandom()).toBe(second);
  });

  it('shuffles arrays without losing elements', () => {
    const input = [1, 2, 3, 4, 5];
    const output = Utils.shuffle(input);
    expect(output).toHaveLength(input.length);
    expect(output.sort()).toEqual(input.sort());
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('derives life stages from age thresholds', () => {
    expect(Utils.getLifeStage(8).name).toBe('Child');
    expect(Utils.getLifeStage(15).name).toBe('Youth');
    expect(Utils.getLifeStage(30).name).toBe('Adult');
    expect(Utils.getLifeStage(60).name).toBe('Elder');
  });

  it('deep clones plain objects', () => {
    const original = { a: 1, nested: { b: 2 } };
    const clone = Utils.deepClone(original);
    clone.nested.b = 99;
    expect(original.nested.b).toBe(2);
  });

  it('maps mood scores to descriptive labels', () => {
    expect(Utils.getMoodDescription(80).text).toBe('Ecstatic');
    expect(Utils.getMoodDescription(0).text).toBe('Neutral');
    expect(Utils.getMoodDescription(-60).text).toBe('Miserable');
  });
});

describe('Utils known gaps', () => {
  beforeEach(() => {
    bootstrapCoreModules();
  });

  it('documents that randomInt still uses Math.random instead of seededRandom', () => {
    Utils.setSeed(42);
    const seededSnapshot = Utils.seed;
    Utils.randomInt(1, 1000);
    expect(Utils.seed).toBe(seededSnapshot);
  });
});
