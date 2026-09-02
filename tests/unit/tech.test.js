import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Technology research', () => {
  let game;
  let village;

  beforeEach(() => {
    game = createHeadlessGame(202);
    village = new Village({ name: 'Eldervale', displayIndex: 0 });
    game.villages = [village];
  });

  it('resolves tech definitions by id, key, or name', () => {
    expect(Utils.getTechDef('fire_mastery')?.id).toBe('fire_mastery');
    expect(Utils.getTechDef('FIRE_MASTERY')?.id).toBe('fire_mastery');
    expect(Utils.getTechDef('Fire Mastery')?.id).toBe('fire_mastery');
  });

  it('starts research when given a snake_case tech id from the LLM', () => {
    const started = game.startTechResearch('fire_mastery', village.id);

    expect(started).toBe(true);
    expect(village.techState.currentResearch).toEqual({
      techId: 'fire_mastery',
      progress: 0,
      startDay: game.timeState.day
    });
  });

  it('advances research progress over time until completion', () => {
    game.startTechResearch('fire_mastery', village.id);

    const dayDuration = game.timeState.dayDuration;
    const researchMs = CONSTANTS.TECH.FIRE_MASTERY.researchTime * dayDuration;

    game.processVillageTechResearch(village, researchMs + 1);

    expect(village.techState.currentResearch).toBeNull();
    expect(village.techState.researched).toContain('fire_mastery');
  });

  it('does not restart the same tech while research is in progress', () => {
    game.startTechResearch('fire_mastery', village.id);
    village.techState.currentResearch.progress = 0.4;

    const restarted = game.startTechResearch('fire_mastery', village.id);

    expect(restarted).toBe(true);
    expect(village.techState.currentResearch.progress).toBe(0.4);
  });

  it('skips LLM tech decisions while a village is actively researching', async () => {
    llm.config = { llm: { apiKey: 'test-key', endpoint: 'http://localhost:1234/v1' } };
    game.startTechResearch('fire_mastery', village.id);

    const generateSpy = vi.spyOn(llm, 'generateTechDecision').mockResolvedValue({
      decision: 'start_new',
      techId: 'tool_crafting',
      reason: 'Should not run'
    });

    await game.requestVillageTechDecision(village);

    expect(generateSpy).not.toHaveBeenCalled();
    expect(village.techState.currentResearch.techId).toBe('fire_mastery');
  });
});
