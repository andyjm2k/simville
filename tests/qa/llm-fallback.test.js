import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa llm-fallback
 */
describe('QA: LLM fallback path', () => {
  beforeEach(() => {
    createHeadlessGame(9006);
  });

  it('returns one offline action per villager via typed fallback helper', () => {
    const villagers = [
      new Villager({ id: 'v1', name: 'Asha', age: 25, x: 32, y: 32 }),
      new Villager({ id: 'v2', name: 'Ben', age: 30, x: 33, y: 32 })
    ];

    const actions = llm.getFallbackVillagerActions(villagers).actions;

    expect(actions).toHaveLength(2);
    expect(actions[0].villagerId).toBe('v1');
    expect(actions[0].action).toBe('idle');
    expect(actions[1].villagerId).toBe('v2');
  });

  it('falls back offline when no endpoint is configured', async () => {
    llm.config = {
      llm: {
        endpoint: '',
        model: 'test-model',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };

    const result = await llm.generate('anything');
    expect(result.actions[0].action).toBe('idle');
    expect(llm.offline).toBe(true);
  });

  it('generates backstory fallback text without network access', async () => {
    llm.config = {
      llm: {
        endpoint: '',
        model: 'test-model',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };
    const villager = new Villager({ name: 'Lena', age: 22, gender: 'female' });
    const story = await llm.generateBackstory(villager);
    expect(story).toContain('Lena');
  });
});
