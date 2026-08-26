import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa llm-fallback
 */
describe('QA: LLM fallback path', () => {
  beforeEach(() => {
    createHeadlessGame(9006);
  });

  it('returns deterministic fallback actions when no API key is configured', async () => {
    llm.config = {
      llm: {
        endpoint: 'http://127.0.0.1:9999/v1',
        model: 'test-model',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };

    const villagers = [
      new Villager({ id: 'v1', name: 'Asha', age: 25, x: 32, y: 32 }),
      new Villager({ id: 'v2', name: 'Ben', age: 30, x: 33, y: 32 })
    ];

    const actions = await llm.generateVillagerActions(
      villagers,
      { resources: { wood: 10, food: 10, water: 10, stone: 5, herbs: 2, clay: 2, fish: 0, thatch: 2, rareMaterials: 0 }, structures: [] },
      {
        day: 1,
        hours: 10,
        season: CONSTANTS.SEASON.WET,
        dayInSeason: 1
      }
    );

    expect(actions.length).toBeGreaterThan(0);
    if (actions.length === 1 && actions[0].type === 'idle') {
      expect(actions[0].villagerId).toBeUndefined();
      return;
    }

    expect(actions).toHaveLength(2);
    expect(actions[0].villagerId).toBeDefined();
    expect(actions[0].action).toBeDefined();
  });

  it('generates backstory fallback text without network access', async () => {
    llm.config.llm.apiKey = '';
    const villager = new Villager({ name: 'Lena', age: 22, gender: 'female' });
    const story = await llm.generateBackstory(villager);
    expect(story).toContain('Lena');
  });
});
