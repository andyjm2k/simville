import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('Village', () => {
  beforeEach(() => {
    bootstrapCoreModules();
    Utils.setSeed(777);
  });

  it('detects positions inside territory radius', () => {
    const village = new Village({ center: { x: 10, y: 10 }, territoryRadius: 5 });
    expect(village.isInTerritory(10, 10)).toBe(true);
    expect(village.isInTerritory(14, 10)).toBe(true);
    expect(village.isInTerritory(16, 10)).toBe(false);
  });

  it('calculates strength from villagers, structures, and resources', () => {
    const village = new Village({
      center: { x: 0, y: 0 },
      structureIds: ['s1', 's2'],
      resources: { wood: 20, food: 20, water: 20, stone: 10, herbs: 5, clay: 5, fish: 0, thatch: 5, rareMaterials: 0 }
    });

    const villagers = [
      new Villager({
        id: 'v1',
        age: 30,
        isChieftan: true,
        skills: { gathering: 5, crafting: 5, farming: 5, fishing: 5, hunting: 5, social: 5, leadership: 8 }
      }),
      new Villager({
        id: 'v2',
        age: 20,
        skills: { gathering: 3, crafting: 3, farming: 3, fishing: 3, hunting: 3, social: 3, leadership: 1 }
      })
    ];

    village.villagerIds = ['v1', 'v2'];
    const strength = village.calculateStrength(villagers);
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeGreaterThan(village.structureIds.length * 3);
  });

  it('round-trips serialize and deserialize', () => {
    const original = new Village({
      id: 'village-test',
      name: 'Stormmere',
      center: { x: 12, y: 18 },
      villagerIds: ['a', 'b'],
      relations: { other: -15 },
      knownVillages: ['other']
    });

    const restored = Village.deserialize(original.serialize());
    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.center).toEqual(original.center);
    expect(restored.villagerIds).toEqual(original.villagerIds);
    expect(restored.relations).toEqual(original.relations);
    expect(restored.knownVillages).toEqual(['other']);
  });

  it('stores distinct chronicle and tech state per village', () => {
    const village = new Village({
      name: 'Eldervale',
      displayIndex: 0,
      chronicle: {
        legendary: [{ title: 'Founding', text: 'We arrived.', day: 1 }],
        entries: [{ text: 'Day 1 begins.', day: 1, type: 'normal' }],
        stats: { births: 1, deaths: 0, structuresBuilt: 2, marriages: 0 }
      },
      techState: {
        researched: ['agriculture'],
        currentResearch: { techId: 'tool_crafting', progress: 0.5, startDay: 1 },
        researchSpeed: 1
      }
    });

    const restored = Village.deserialize(village.serialize());
    expect(restored.chronicle.entries).toHaveLength(1);
    expect(restored.chronicle.stats.births).toBe(1);
    expect(restored.techState.researched).toContain('agriculture');
    expect(restored.techState.currentResearch.techId).toBe('tool_crafting');
    expect(restored.displayIndex).toBe(0);
  });

  it('uses display index for stable tribe colors', () => {
    const first = new Village({ displayIndex: 0 });
    const second = new Village({ displayIndex: 1 });
    expect(first.getColor()).not.toBe(second.getColor());
  });

  it('records first awareness of another village once', () => {
    const village = new Village({ id: 'home' });
    expect(village.knowsVillage('rival')).toBe(false);
    expect(village.markVillageKnown('rival')).toBe(true);
    expect(village.knowsVillage('rival')).toBe(true);
    expect(village.markVillageKnown('rival')).toBe(false);
    expect(village.markVillageKnown('home')).toBe(false);
  });

  it('filters villagers by villagerIds membership', () => {
    const village = new Village({ villagerIds: ['keep-me'] });
    const all = [
      new Villager({ id: 'keep-me', name: 'A' }),
      new Villager({ id: 'drop-me', name: 'B' })
    ];
    expect(village.getVillagers(all)).toHaveLength(1);
    expect(village.getVillagers(all)[0].id).toBe('keep-me');
  });
});
