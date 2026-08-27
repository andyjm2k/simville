import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('LLMManager', () => {
  let manager;

  beforeEach(() => {
    bootstrapCoreModules();
    manager = new LLMManager();
    manager.config = {
      llm: {
        endpoint: '',
        model: 'test-model',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };
  });

  it('parseResponse extracts nested JSON objects', () => {
    const payload = manager.parseResponse('Here is the plan:\n{"actions":[{"villagerId":"v1","action":"gathering"}]}');
    expect(payload.actions).toHaveLength(1);
    expect(payload.actions[0].action).toBe('gathering');
  });

  it('parseResponse handles markdown fences and nested braces', () => {
    const payload = manager.parseResponse('```json\n{"meta":{"day":1},"actions":[]}\n```');
    expect(payload.meta.day).toBe(1);
    expect(payload.actions).toEqual([]);
  });

  it('parseResponse wraps bare JSON arrays as actions', () => {
    const payload = manager.parseResponse('[{"villagerId":"v1","action":"idle"}]');
    expect(payload.actions).toHaveLength(1);
    expect(payload.actions[0].villagerId).toBe('v1');
  });

  it('parseResponse returns null when no JSON object is present', () => {
    expect(manager.parseResponse('plain text only')).toBeNull();
  });

  it('getFallbackResponse returns consumer-compatible idle actions', () => {
    const fallback = manager.getFallbackResponse('prompt');
    expect(fallback.actions[0].action).toBe('idle');
    expect(fallback.dialogue).toContain('villagers');
  });

  it('getFallbackVillagerActions emits one action per villager', () => {
    const villagers = [
      new Villager({ id: 'v1', name: 'Asha' }),
      new Villager({ id: 'v2', name: 'Ben' })
    ];
    const fallback = manager.getFallbackVillagerActions(villagers);
    expect(fallback.actions).toHaveLength(2);
    expect(fallback.actions[0].villagerId).toBe('v1');
    expect(fallback.actions[1].action).toBe('idle');
  });

  it('generateFallbackBackstory includes villager name and age', () => {
    const villager = new Villager({ name: 'Kai', age: 28, gender: 'male' });
    const story = manager.generateFallbackBackstory(villager);
    expect(story).toContain('Kai');
    expect(story).toContain('28');
  });

  it('generate uses fallback when endpoint is missing', async () => {
    const result = await manager.generate('Return actions for villagers');
    expect(result.actions).toBeDefined();
    expect(result.actions[0].action).toBe('idle');
  });
});
