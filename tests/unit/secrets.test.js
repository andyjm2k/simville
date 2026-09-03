import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame, bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Villager secrets', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(6202);
    game.newWorld();
    game.benchmarkMode = false;
  });

  function sameTribePair() {
    const mates = game.getVillagersForVillage(game.villages[0].id);
    const owner = mates[0];
    const listener = mates[1];
    owner.x = listener.x;
    owner.y = listener.y;
    return { owner, listener };
  }

  it('LLM fallback generates a structured secret without the API', () => {
    bootstrapCoreModules();
    const manager = new LLMManager();
    const villager = game.villagers[0];
    const others = game.villagers.filter(v => v.id !== villager.id);

    const secret = manager.generateFallbackSecret(villager, others);
    expect(secret).toBeTruthy();
    expect(Object.values(CONSTANTS.SECRET)).toContain(secret.type);
    expect(secret.description).toContain(villager.name);
    expect(secret.revealed).toBe(false);
    expect(Array.isArray(secret.discoveredBy)).toBe(true);
    expect(secret.secrecyLevel).toBeGreaterThanOrEqual(1);
    expect(secret.secrecyLevel).toBeLessThanOrEqual(5);
  });

  it('generateSecret returns a fallback when LLM is offline', async () => {
    const manager = new LLMManager();
    manager.config = { llm: { endpoint: '', apiKey: '', model: 'x', maxTokens: 50, temperature: 0.1 } };
    const villager = game.villagers[0];
    const secret = await manager.generateSecret(villager, game.villagers.slice(1));
    expect(secret).toBeTruthy();
    expect(secret.description).toBeTruthy();
  });

  it('reveals secrets through socializing and chronicles the discovery', () => {
    const { owner, listener } = sameTribePair();
    owner.secrets = [{
      type: CONSTANTS.SECRET.HIDDEN_TALENT,
      description: `${owner.name} secretly carves spirit masks.`,
      secrecyLevel: 1,
      discoveryTriggers: ['shared_confidence', 'high_relationship'],
      revealed: false,
      discoveredBy: []
    }];
    owner.relationships[listener.id] = 90;
    listener.relationships[owner.id] = 90;

    // Force discovery by patching Math.random for this call
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const revealed = game.tryDiscoverSecretThroughSocializing(owner, listener, 'shared_confidence');
      expect(revealed).toBe(true);
    } finally {
      Math.random = originalRandom;
    }

    expect(owner.secrets[0].revealed).toBe(true);
    expect(owner.secrets[0].discoveredBy).toContain(listener.id);
    expect(owner.villageId).toBeTruthy();
    const chronicle = game.getChronicle(owner.villageId);
    expect(chronicle.entries.some(entry => entry.text.includes('uncovered a secret'))).toBe(true);
  });

  it('processSecretDiscoveries can uncover high-relationship secrets', () => {
    const { owner, listener } = sameTribePair();
    owner.secrets = [{
      type: CONSTANTS.SECRET.ASPIRATION,
      description: `${owner.name} longs to lead the evening songs.`,
      secrecyLevel: 1,
      discoveryTriggers: ['high_relationship'],
      revealed: false,
      discoveredBy: []
    }];
    owner.relationships[listener.id] = 95;
    listener.relationships[owner.id] = 95;
    owner.x = listener.x;
    owner.y = listener.y;

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      game.processSecretDiscoveries();
    } finally {
      Math.random = originalRandom;
    }

    expect(owner.secrets[0].revealed).toBe(true);
  });

  it('spreads gossip only within the secret owner tribe', async () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const owner = game.getVillagersForVillage(villageA.id)[0];
    const outsider = game.getVillagersForVillage(villageB.id)[0];
    const insider = game.getVillagersForVillage(villageA.id)[1];

    owner.secrets = [{
      type: CONSTANTS.SECRET.GRUDGE,
      description: `${owner.name} resents a rival hunter.`,
      secrecyLevel: 2,
      discoveryTriggers: ['high_relationship'],
      revealed: true,
      discoveredBy: []
    }];

    owner.personality.sociable = 80;
    insider.personality.sociable = 80;
    outsider.personality.sociable = 80;

    // Force gossip RNG so the daily spread always fires within the tribe
    const originalFloat = Utils.randomFloat;
    const originalInt = Utils.randomInt;
    const originalShuffle = Utils.shuffle;
    const originalElement = Utils.randomElement;
    Utils.randomFloat = () => 0.1;
    Utils.randomInt = (min) => min;
    Utils.shuffle = (arr) => [...arr];
    Utils.randomElement = (arr) => arr[0];
    try {
      await game.processGossipSpread();
    } finally {
      Utils.randomFloat = originalFloat;
      Utils.randomInt = originalInt;
      Utils.shuffle = originalShuffle;
      Utils.randomElement = originalElement;
    }

    expect(owner.secrets[0].discoveredBy).toContain(insider.id);
    expect(owner.secrets[0].discoveredBy).not.toContain(outsider.id);
  });
});
