import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa save-roundtrip
 */
describe('QA: save and load roundtrip', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9003);
    game.newWorld();
  });

  it('preserves world, villagers, villages, and chronicle through serialize/deserialize', async () => {
    game.chronicle.entries.push({ day: 1, text: 'The village awakens.' });
    game.timeState.day = 4;
    game.timeState.hours = 14;

    const saveData = {
      version: CONSTANTS.VERSION,
      world: game.world.serialize(),
      villagers: game.villagers.map((v) => v.serialize()),
      villages: game.villages.map((v) => v.serialize()),
      timeState: { ...game.timeState },
      chronicle: JSON.parse(JSON.stringify(game.chronicle)),
      constructionProjects: [],
      graphicsSettings: game.graphicsSettings,
      techState: game.techState,
      activeRaid: null,
      diplomaticEvents: [],
      savedAt: Date.now()
    };

    const reloaded = createHeadlessGame(9003);
    await reloaded.loadGame(saveData);

    expect(reloaded.world.size).toBe(saveData.world.size);
    expect(reloaded.villagers).toHaveLength(saveData.villagers.length);
    expect(reloaded.villages).toHaveLength(saveData.villages.length);
    expect(reloaded.timeState.day).toBe(4);
    expect(reloaded.chronicle.entries.some((entry) => entry.text === 'The village awakens.')).toBe(true);
  });

  it('restores villager skills and village resource pools', async () => {
    const targetVillager = game.villagers[0];
    targetVillager.skills.gathering = 9;
    game.villages[0].resources.food = 42;

    const saveData = {
      version: CONSTANTS.VERSION,
      world: game.world.serialize(),
      villagers: game.villagers.map((v) => v.serialize()),
      villages: game.villages.map((v) => v.serialize()),
      timeState: { ...game.timeState },
      chronicle: game.chronicle,
      constructionProjects: [],
      graphicsSettings: game.graphicsSettings,
      techState: game.techState,
      activeRaid: null,
      diplomaticEvents: []
    };

    const reloaded = createHeadlessGame(9003);
    await reloaded.loadGame(saveData);

    expect(reloaded.villagers[0].skills.gathering).toBe(9);
    expect(reloaded.villages[0].resources.food).toBe(42);
  });
});
