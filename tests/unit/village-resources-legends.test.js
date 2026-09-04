import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Village resource HUD', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(42);
    game.newWorld();
  });

  it('shows the tribe selector village resources even when another tribe villager is selected', () => {
    const [v1, v2] = game.villages;
    v1.resources.food = 11;
    v2.resources.food = 99;

    // Selecting a villager from village 1 must not trap the HUD on that stockpile
    game.selectedVillager = game.villagers.find(v => v.villageId === v1.id);
    game.hudVillageId = v1.id;

    game.setSelectedVillage(v2.id);

    expect(game.hudVillageId).toBe(v2.id);
    expect(game.selectedVillager).toBeNull();
    expect(game.getHudResources().food).toBe(99);
    expect(game.ui.elements.resFood.textContent).toBe('99');
  });

  it('restores per-village stockpiles after save/load and lets each be viewed', async () => {
    const [v1, v2] = game.villages;
    v1.resources.wood = 40;
    v2.resources.wood = 7;

    const saveData = {
      version: CONSTANTS.VERSION,
      world: game.world.serialize(),
      villagers: game.villagers.map(v => v.serialize()),
      villages: game.villages.map(v => v.serialize()),
      timeState: { ...game.timeState },
      constructionProjects: [],
      graphicsSettings: game.graphicsSettings,
      hudVillageId: v2.id
    };

    const reloaded = createHeadlessGame(99);
    await reloaded.loadGame(saveData);

    reloaded.setSelectedVillage(v1.id);
    expect(reloaded.getHudResources().wood).toBe(40);

    reloaded.setSelectedVillage(v2.id);
    expect(reloaded.getHudResources().wood).toBe(7);
  });
});

describe('Chronicle legend save repair', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(6102);
    game.newWorld();
    game.benchmarkMode = false;
  });

  it('does not show undefined for saved legends with corrupted or missing titles', () => {
    const village = game.villages[0];
    village.chronicle.legendary = [
      { title: 'undefined', text: 'Discovered Fire Mastery: Control of fire.', day: 3 },
      { text: 'Discovered Pottery: Shape clay into vessels.', day: 4 },
      { day: 5, text: 'Discovered Weaving: Transform plant fibers.' },
      'An oral tale of the founding.'
    ];

    // Simulate save/load JSON roundtrip before UI render
    village.chronicle = JSON.parse(JSON.stringify(village.chronicle));
    game.ui.showChronicle(village.chronicle);

    const items = [...game.ui.elements.chronicleLegendaryList.querySelectorAll('li')];
    expect(items.length).toBe(4);
    for (const item of items) {
      expect(item.textContent).not.toMatch(/\bundefined\b/i);
    }
    expect(items[0].textContent).toContain('Discovered Fire Mastery');
  });

  it('migrates corrupted legend titles when loading a saved game', async () => {
    const village = game.villages[0];
    village.chronicle.legendary = [
      { title: 'undefined', text: 'The great flood reshaped the valley forever.', day: 2 },
      { text: 'Discovered Fire Mastery: Control of fire brings warmth.', day: 8 }
    ];

    const saveData = {
      version: CONSTANTS.VERSION,
      world: game.world.serialize(),
      villagers: game.villagers.map(v => v.serialize()),
      villages: game.villages.map(v => v.serialize()),
      timeState: { ...game.timeState },
      constructionProjects: [],
      graphicsSettings: game.graphicsSettings,
      hudVillageId: village.id
    };

    const reloaded = createHeadlessGame(6103);
    await reloaded.loadGame(saveData);

    const legends = reloaded.villages[0].chronicle.legendary;
    expect(legends[0].title).toBeTruthy();
    expect(legends[0].title).not.toMatch(/undefined/i);
    expect(legends[0].title).toContain('great flood');
    expect(legends[1].title).toBeTruthy();
    expect(legends[1].title).not.toMatch(/undefined/i);

    reloaded.ui.showChronicle(reloaded.villages[0].chronicle);
    const items = [...reloaded.ui.elements.chronicleLegendaryList.querySelectorAll('li')];
    for (const item of items) {
      expect(item.textContent).not.toMatch(/\bundefined\b/i);
    }
  });

  it('rejects undefined string titles when writing new legends', () => {
    const village = game.villages[0];
    game.addLegendaryEntry('undefined', 'Scouts mapped the southern ridge.', village.id);
    expect(village.chronicle.legendary[0].title).not.toMatch(/undefined/i);
    expect(village.chronicle.legendary[0].title).toContain('Scouts mapped');
  });
});
