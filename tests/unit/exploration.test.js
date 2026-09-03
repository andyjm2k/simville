import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('ExplorationSystem', () => {
  let game;
  let villageA;
  let villageB;

  beforeEach(() => {
    bootstrapCoreModules();
    villageA = new Village({
      id: 'a',
      name: 'Eldervale',
      center: { x: 10, y: 10 },
      territoryRadius: 12,
      relations: { b: -15 }
    });
    villageB = new Village({
      id: 'b',
      name: 'Shadowmere',
      center: { x: 40, y: 10 },
      territoryRadius: 12,
      relations: { a: -15 }
    });

    game = {
      villages: [villageA, villageB],
      villagers: [],
      world: {
        getWalkableTileNear: (x, y) => ({ x, y }),
        tiles: []
      },
      timeState: { day: 1, hours: 10 },
      chronicle: [],
      getVillage(id) {
        return this.villages.find(v => v.id === id);
      },
      getRivalVillage(id) {
        return this.villages.find(v => v.id !== id);
      },
      getVillagersForVillage(id) {
        return this.villagers.filter(v => v.villageId === id);
      },
      canVillagerEnterTerritory() {
        return true;
      },
      addChronicleEntry(text) {
        this.chronicle.push(text);
      }
    };

    game.explorationSystem = new ExplorationSystem(game);
  });

  function makeScout(id, villageId, extras = {}) {
    return new Villager({
      id,
      name: `Scout-${id}`,
      villageId,
      x: extras.x ?? 10,
      y: extras.y ?? 10,
      isChieftan: extras.isChieftan || false,
      personality: { curious: extras.curious ?? 80, sociable: 40, active: 60, empathetic: 40, confident: 50 },
      ...extras
    });
  }

  it('starts without contact between tribes', () => {
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(false);
  });

  it('records first contact once and writes chronicle entries', () => {
    expect(game.explorationSystem.recordFirstContact(villageA, villageB, null, 'sighting')).toBe(true);
    expect(game.explorationSystem.recordFirstContact(villageA, villageB, null, 'sighting')).toBe(false);
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(true);
    expect(game.chronicle.length).toBeGreaterThanOrEqual(2);
  });

  it('picks a curious adult scout', () => {
    game.villagers = [
      makeScout('c', 'a', { isChieftan: true, curious: 99 }),
      makeScout('u', 'a', { curious: 20 }),
      makeScout('q', 'a', { curious: 88 })
    ];
    expect(game.explorationSystem.pickScout(villageA).id).toBe('q');
  });

  it('returns a destination outside rival territory', () => {
    const dest = game.explorationSystem.getScoutDestination(villageA, villageB);
    expect(dest).toBeTruthy();
    expect(villageB.isInTerritory(dest.x, dest.y)).toBe(false);
  });

  it('dispatches and later clears a scout mission', () => {
    const scout = makeScout('s1', 'a');
    scout.moveTo = () => true;
    game.villagers = [scout];
    const sent = game.explorationSystem.dispatchScout(villageA, villageB, 'explore');
    expect(sent.isScouting).toBe(true);
    expect(game.explorationSystem.getActiveScout(villageA)).toBe(scout);
    game.explorationSystem.clearScout(scout);
    expect(scout.isScouting).toBe(false);
  });

  it('detects person-to-person first contact', () => {
    game.villagers = [
      makeScout('s1', 'a', { x: 24, y: 10 }),
      makeScout('s2', 'b', { x: 26, y: 10 })
    ];
    game.explorationSystem.detectContacts();
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(true);
  });

  it('uses rumor contact after enough days', () => {
    game.timeState.day = CONSTANTS.EXPLORATION.RUMOR_CONTACT_DAYS;
    game.explorationSystem.maybeRumorContact();
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(true);
  });

  it('treats night as off-hours for scouting', () => {
    game.timeState.hours = 22;
    expect(game.explorationSystem.isDaytime()).toBe(false);
  });
});
