import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Chronicle legends', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(6101);
    game.newWorld();
    game.benchmarkMode = false;
  });

  it('records legendary chronicle entries into the Legends section with a title', () => {
    const village = game.villages[0];
    game.addChronicleEntry(
      'Scouts sighted a rival tribe across the river.',
      'legendary',
      village.id,
      { legendaryTitle: 'First Contact Sighting' }
    );

    const legend = village.chronicle.legendary[0];
    expect(legend).toBeTruthy();
    expect(legend.title).toBe('First Contact Sighting');
    expect(legend.title).not.toBe('undefined');
    expect(legend.text).toContain('rival tribe');
    expect(village.chronicle.entries[0].type).toBe('legendary');
  });

  it('derives a title when legendary entries omit one', () => {
    const village = game.villages[0];
    game.addChronicleEntry('The great river flood reshaped the valley forever.', 'legendary', village.id);

    expect(village.chronicle.legendary[0].title).toBeTruthy();
    expect(village.chronicle.legendary[0].title).not.toMatch(/undefined/i);
  });

  it('records tech discoveries with titled legends for that village', () => {
    const village = game.villages[0];
    const tech = Object.values(CONSTANTS.TECH)[0];
    expect(tech).toBeTruthy();

    game.completeTechResearch(tech, village.id);

    const legend = village.chronicle.legendary.find(entry => entry.title?.includes(tech.name));
    expect(legend).toBeTruthy();
    expect(legend.title).toBe(`Discovery: ${tech.name}`);
    expect(legend.text).toContain(tech.name);
  });

  it('writes first-contact legends into both village chronicles', () => {
    const [villageA, villageB] = game.villages;
    expect(villageA).toBeTruthy();
    expect(villageB).toBeTruthy();

    const exploration = new ExplorationSystem(game);
    const recorded = exploration.recordFirstContact(villageA, villageB, null, 'sighting');
    expect(recorded).toBe(true);

    expect(villageA.chronicle.legendary.length).toBeGreaterThan(0);
    expect(villageB.chronicle.legendary.length).toBeGreaterThan(0);

    const titleA = villageA.chronicle.legendary[0].title;
    const titleB = villageB.chronicle.legendary[0].title;
    expect(titleA).toContain('First Contact');
    expect(titleB).toContain('First Contact');
    expect(titleA).not.toMatch(/undefined/i);
    expect(titleB).not.toMatch(/undefined/i);
  });

  it('does not show undefined when rendering legends without a title', () => {
    const village = game.villages[0];
    village.chronicle.legendary = [{ text: 'An old tale of the founders.', day: 2 }];

    game.ui.showChronicle(village.chronicle);
    const items = [...game.ui.elements.chronicleLegendaryList.querySelectorAll('li')];
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('An old tale of the founders.');
    expect(items[0].textContent).not.toMatch(/undefined/i);
  });
});
