/**
 * Unit tests for VillageAgents — dual LLM/baseline routing with isolated clients.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules, loadRendererScripts } from '../setup/load-scripts.js';

describe('VillageAgents', () => {
  beforeEach(() => {
    // Load systems so BenchmarkRunner / BaselineAgent / LLMManager exist
    loadRendererScripts({ includeSystems: true, force: true });
  });

  it('normalizeAgentConfigs uses legacy twin-isolated when only llm.endpoint is set', () => {
    const result = VillageAgents.normalizeAgentConfigs({
      llm: {
        endpoint: 'http://localhost:1234/v1',
        model: 'local-model',
        apiKey: '',
        maxTokens: 400,
        temperature: 0.5
      }
    });
    expect(result.mode).toBe('legacy-twin-isolated');
    expect(result.agentA.type).toBe('llm');
    expect(result.agentB.type).toBe('llm');
    expect(result.agentA.endpoint).toBe('http://localhost:1234/v1');
    expect(result.agentB.endpoint).toBe('http://localhost:1234/v1');
    expect(result.agentA.model).toBe('local-model');
    expect(result.agentB.model).toBe('local-model');
  });

  it('normalizeAgentConfigs defaults missing B to baseline when A is explicit', () => {
    const result = VillageAgents.normalizeAgentConfigs({
      agents: {
        agentA: {
          type: 'llm',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: 'sk-test'
        }
      }
    });
    expect(result.mode).toBe('explicit');
    expect(result.agentA.type).toBe('llm');
    expect(result.agentB.type).toBe('baseline');
  });

  it('normalizeAgentConfigs returns offline-baseline when nothing is configured', () => {
    const result = VillageAgents.normalizeAgentConfigs({});
    expect(result.mode).toBe('offline-baseline');
    expect(result.agentA.type).toBe('baseline');
    expect(result.agentB.type).toBe('baseline');
  });

  it('setup attaches separate LLMManager instances with isolated messageHistory', () => {
    const villages = [
      { id: 'v-a', name: 'Elderbrook' },
      { id: 'v-b', name: 'Shadowfall' }
    ];
    const registry = new VillageAgents();
    registry.setup(villages, {
      agents: {
        agentA: {
          type: 'llm',
          endpoint: 'http://localhost:1234/v1',
          model: 'model-a',
          apiKey: 'key-a',
          name: 'alpha'
        },
        agentB: {
          type: 'llm',
          endpoint: 'http://localhost:5678/v1',
          model: 'model-b',
          apiKey: 'key-b',
          name: 'beta'
        }
      }
    });

    const agentA = registry.getAgent('v-a');
    const agentB = registry.getAgent('v-b');
    expect(agentA.type).toBe('llm');
    expect(agentB.type).toBe('llm');
    expect(agentA.llm).not.toBe(agentB.llm);
    expect(agentA.llm).not.toBe(llm);
    expect(agentB.llm).not.toBe(llm);

    // Contaminate A's history — B must stay clean
    agentA.llm.messageHistory.push({ role: 'user', content: 'tribe-a secret' });
    expect(agentA.llm.messageHistory).toHaveLength(1);
    expect(agentB.llm.messageHistory).toHaveLength(0);

    expect(agentA.llm.config.llm.endpoint).toBe('http://localhost:1234/v1');
    expect(agentB.llm.config.llm.endpoint).toBe('http://localhost:5678/v1');
    expect(registry.getMeta('v-a').slot).toBe('A');
    expect(registry.getMeta('v-b').slot).toBe('B');
    expect(registry.anyLlmEndpointConfigured()).toBe(true);
    expect(registry.villageUsesLlm('v-a')).toBe(true);
  });

  it('setup can mix llm Agent A with baseline Agent B', () => {
    const villages = [
      { id: 'v-a', name: 'Elderbrook' },
      { id: 'v-b', name: 'Shadowfall' }
    ];
    const registry = new VillageAgents();
    registry.setup(villages, {
      agents: {
        agentA: { type: 'llm', endpoint: 'http://localhost:1234/v1', model: 'm' },
        agentB: { type: 'baseline', name: 'raider-b', strategy: 'raider' }
      }
    });
    expect(registry.getAgent('v-a').type).toBe('llm');
    expect(registry.getAgent('v-b').type).toBe('baseline');
    expect(registry.getAgent('v-b').strategy).toBe('raider');
    expect(registry.villageUsesLlm('v-b')).toBe(false);
    expect(registry.hasAgent('v-a')).toBe(true);
  });

  it('createAgent returns baseline with strategy and llm with fresh history', () => {
    const baseline = VillageAgents.createAgent({ type: 'baseline', name: 'b1', strategy: 'gatherer' });
    expect(baseline.type).toBe('baseline');
    expect(baseline.strategy).toBe('gatherer');

    const llmAgent = VillageAgents.createAgent({
      type: 'llm',
      endpoint: 'http://127.0.0.1:1234/v1',
      model: 'x'
    });
    expect(llmAgent.type).toBe('llm');
    expect(llmAgent.llm.messageHistory).toEqual([]);
    expect(llmAgent.llm.config.llm.model).toBe('x');
  });

  it('syncLegacyGlobalLlm copies config without sharing history arrays', () => {
    const villages = [
      { id: 'v-a', name: 'A' },
      { id: 'v-b', name: 'B' }
    ];
    const registry = new VillageAgents();
    registry.setup(villages, {
      agents: {
        agentA: { type: 'llm', endpoint: 'http://localhost:1/v1', model: 'sync-model', apiKey: 'k' },
        agentB: { type: 'baseline' }
      }
    });
    const agentA = registry.getAgent('v-a');
    agentA.llm.messageHistory.push({ role: 'user', content: 'private' });

    const globalStub = { config: { llm: { endpoint: '', model: '', apiKey: '' } }, messageHistory: [] };
    registry.syncLegacyGlobalLlm(globalStub);
    expect(globalStub.config.llm.endpoint).toBe('http://localhost:1/v1');
    expect(globalStub.config.llm.model).toBe('sync-model');
    expect(globalStub.messageHistory).toEqual([]);
    expect(agentA.llm.messageHistory).toHaveLength(1);
  });

  it('toConfigBlock returns agentA/agentB after setup', () => {
    const registry = new VillageAgents();
    registry.setup([{ id: '1' }, { id: '2' }], {
      agents: {
        agentA: { type: 'baseline', name: 'a' },
        agentB: { type: 'baseline', name: 'b' }
      }
    });
    const block = registry.toConfigBlock();
    expect(block.agentA.type).toBe('baseline');
    expect(block.agentB.name).toBe('b');
  });

  it('listLlmManagers returns only llm-backed agents', () => {
    const registry = new VillageAgents();
    registry.setup([{ id: '1' }, { id: '2' }], {
      agents: {
        agentA: { type: 'llm', endpoint: 'http://localhost:1/v1', model: 'm' },
        agentB: { type: 'baseline' }
      }
    });
    expect(registry.listLlmManagers()).toHaveLength(1);
  });
});

describe('Game interactive agent routing', () => {
  let game;

  beforeEach(() => {
    loadRendererScripts({ includeGame: true, includeSystems: true, force: true });
    game = new Game();
    game.benchmarkMode = false;
    game.villageAgents = new VillageAgents();
    // Minimal two-village stub without full world gen
    game.villages = [
      { id: 'va', name: 'TribeA', structureIds: [], relations: {}, atWarWith: [] },
      { id: 'vb', name: 'TribeB', structureIds: [], relations: {}, atWarWith: [] }
    ];
    game.villagers = [];
    game.paused = false;
  });

  it('getDecisionAgent returns interactive agents outside benchmark mode', () => {
    game.villageAgents.setup(game.villages, {
      agents: {
        agentA: { type: 'llm', endpoint: 'http://localhost:1234/v1', model: 'a' },
        agentB: { type: 'baseline', name: 'b' }
      }
    });
    expect(game.getDecisionAgent('va').type).toBe('llm');
    expect(game.getDecisionAgent('vb').type).toBe('baseline');
  });

  it('usesLlmResourceDecisions is per-village for mixed agents', () => {
    game.villageAgents.setup(game.villages, {
      agents: {
        agentA: { type: 'llm', endpoint: 'http://localhost:1234/v1', model: 'a' },
        agentB: { type: 'baseline', name: 'b', strategy: 'raider' }
      }
    });
    expect(game.usesLlmResourceDecisions('va')).toBe(true);
    expect(game.usesLlmResourceDecisions('vb')).toBe(true); // explicit baseline owns labor
    expect(game.usesLlmResourceDecisions()).toBe(true);
  });

  it('usesLlmResourceDecisions is false for offline-baseline mode villages', () => {
    game.villageAgents.setup(game.villages, {});
    expect(game.villageAgents.normalized.mode).toBe('offline-baseline');
    expect(game.usesLlmResourceDecisions('va')).toBe(false);
    llm.config = { llm: { endpoint: '' } };
    expect(game.usesLlmResourceDecisions()).toBe(false);
  });

  it('legacy twin-isolated creates two distinct llm clients on setupInteractiveAgents', async () => {
    await game.setupInteractiveAgents({
      llm: {
        endpoint: 'http://localhost:9999/v1',
        model: 'shared',
        apiKey: '',
        maxTokens: 200,
        temperature: 0.3
      }
    });
    const a = game.getDecisionAgent('va');
    const b = game.getDecisionAgent('vb');
    expect(a.llm).not.toBe(b.llm);
    expect(a.llm.config.llm.model).toBe('shared');
    expect(b.llm.config.llm.model).toBe('shared');
    a.llm.messageHistory.push({ role: 'assistant', content: 'only-a' });
    expect(b.llm.messageHistory).toHaveLength(0);
  });
});
