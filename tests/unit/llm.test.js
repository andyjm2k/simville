import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('LLMManager', () => {
  let manager;

  beforeEach(() => {
    bootstrapCoreModules();
    manager = new LLMManager();
    manager.config = {
      llm: {
        endpoint: 'http://127.0.0.1:9999/v1',
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

  it('parseResponse returns null when no JSON object is present', () => {
    expect(manager.parseResponse('plain text only')).toBeNull();
  });

  it('getFallbackResponse returns idle actions with dialogue', () => {
    const fallback = manager.getFallbackResponse('prompt');
    expect(fallback.actions[0].type).toBe('idle');
    expect(fallback.dialogue).toContain('villagers');
  });

  it('generateFallbackBackstory includes villager name and age', () => {
    const villager = new Villager({ name: 'Kai', age: 28, gender: 'male' });
    const story = manager.generateFallbackBackstory(villager);
    expect(story).toContain('Kai');
    expect(story).toContain('28');
  });

  it('generate uses fallback when API key is missing', async () => {
    const result = await manager.generate('Return actions for villagers');
    expect(result.actions).toBeDefined();
    expect(result.actions[0].type).toBe('idle');
  });
});

describe('LLMManager schema gaps', () => {
  beforeEach(() => {
    bootstrapCoreModules();
  });

  it('documents fallback schema mismatch with villager action consumers', () => {
    const manager = new LLMManager();
    const fallback = manager.getFallbackResponse('actions');
    expect(fallback.actions[0].villagerId).toBeUndefined();
    expect(fallback.actions[0].type).toBeDefined();
  });
});
