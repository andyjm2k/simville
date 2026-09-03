import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa village-exploration-contact
 */
describe('QA: wilderness exploration and first contact', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9010);
    game.newWorld();
    game.paused = false;
  });

  it('allows moveTo into unclaimed wilderness between villages', () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const villager = game.getVillagersForVillage(villageA.id)[0];
    const midX = Math.round((villageA.center.x + villageB.center.x) / 2);
    const midY = Math.round((villageA.center.y + villageB.center.y) / 2);
    const wild = game.world.getWalkableTileNear(midX, midY, 8);

    expect(wild).toBeTruthy();
    expect(game.getTerritoryOwnerAt(wild.x, wild.y)).toBeNull();
    expect(game.canVillagerEnterTerritory(villager, wild.x, wild.y)).toBe(true);
    expect(villager.moveTo(wild.x, wild.y, game.world)).toBe(true);
    expect(villageB.isInTerritory(villager.targetX, villager.targetY)).toBe(false);
  });

  it('still blocks settling at a rival village center', () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const villager = game.getVillagersForVillage(villageA.id)[0];

    villager.moveTo(villageB.center.x, villageB.center.y, game.world);
    expect(villageB.isInTerritory(villager.targetX, villager.targetY)).toBe(false);
  });

  it('dispatches a scout toward the rival without entering rival land', () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const destination = game.explorationSystem.getScoutDestination(villageA, villageB);
    expect(destination).toBeTruthy();
    expect(villageB.isInTerritory(destination.x, destination.y)).toBe(false);

    const scout = game.explorationSystem.dispatchScout(villageA, villageB, 'explore');
    expect(scout).toBeTruthy();
    expect(scout.isScouting).toBe(true);
    expect(scout.status).toBe(CONSTANTS.ACTIVITY.SCOUTING);
  });

  it('records first contact when rival villagers are in sight', () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    const scout = game.getVillagersForVillage(villageA.id).find(v => !v.isChieftan);
    const rival = game.getVillagersForVillage(villageB.id).find(v => !v.isChieftan);
    const midX = Math.round((villageA.center.x + villageB.center.x) / 2);
    const midY = Math.round((villageA.center.y + villageB.center.y) / 2);

    scout.x = midX;
    scout.y = midY;
    rival.x = midX + 1;
    rival.y = midY;

    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(false);
    game.explorationSystem.detectContacts();
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(true);
  });

  it('gates chieftan diplomacy to observe until first contact', async () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    expect(game.explorationSystem.hasDiscovered(villageA, villageB)).toBe(false);

    await game.requestChieftanDiplomacy(villageA.id);
    expect(game.diplomaticEvents.some(event => event.type === 'observe')).toBe(true);
    expect(game.diplomaticEvents.some(event => event.type === 'raid')).toBe(false);
  });

  it('unlocks full diplomacy after first contact', async () => {
    const villageA = game.villages[0];
    const villageB = game.villages[1];
    game.explorationSystem.recordFirstContact(villageA, villageB, null, 'sighting');
    villageA.raidCooldown = 0;

    await game.requestChieftanDiplomacy(villageA.id);
    expect(game.diplomaticEvents.length).toBeGreaterThan(0);
    expect(game.diplomaticEvents[0].type).not.toBeUndefined();
  });
});
