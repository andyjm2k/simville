/**
 * Unit tests for SOCIAL_DYNAMICS_PLAN.md phases 1–6.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

describe('Social dynamics plan', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9001);
    game.newWorld();
    game.benchmarkMode = false;
    game.ensureVillageSystems();
  });

  function tribePair() {
    const mates = game.getVillagersForVillage(game.villages[0].id);
    const a = mates[0];
    const b = mates[1];
    a.x = b.x;
    a.y = b.y;
    return { a, b, mates };
  }

  it('Phase 1: typed interaction deltas differ by type', () => {
    const { a, b } = tribePair();
    a.relationships[b.id] = 10;
    b.relationships[a.id] = 10;

    game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionType: 'help',
      interactionTarget: b.name
    });
    const afterHelp = a.getRelationship(b);

    a.relationships[b.id] = 10;
    b.relationships[a.id] = 10;
    game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionType: 'talk',
      interactionTarget: b.name
    });
    const afterTalk = a.getRelationship(b);

    a.relationships[b.id] = 10;
    b.relationships[a.id] = 10;
    game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionType: 'argue',
      interactionTarget: b.name
    });
    const afterArgue = a.getRelationship(b);

    expect(afterHelp - 10).toBeGreaterThan(afterTalk - 10);
    expect(afterArgue).toBeLessThan(10);
    expect(a.lastSocialContact[b.id]).toBe(game.timeState.day);
  });

  it('Phase 1: neglect drifts scores toward baseline without contact', () => {
    const { a, b } = tribePair();
    a.relationships[b.id] = 60;
    b.relationships[a.id] = 60;
    a.lastSocialContact = {};
    b.lastSocialContact = {};
    a.partnerId = null;
    b.partnerId = null;
    // Ensure not treated as close family
    a.parentIds = [];
    b.parentIds = [];
    a.childrenIds = [];
    b.childrenIds = [];

    game.timeState.day = 10;
    game.socialSystem.deepenDailyRelationships();

    expect(a.getRelationship(b)).toBeLessThan(60);
    expect(a.getRelationship(b)).toBeGreaterThanOrEqual(60 - (CONSTANTS.RELATIONSHIP.NEGLECT_DECAY_PER_DAY + 0.01));
  });

  it('Phase 1: passive deepen cannot push non-partners past friend cap', () => {
    const { a, b } = tribePair();
    const cap = CONSTANTS.RELATIONSHIP.FRIEND_PASSIVE_CAP;
    a.relationships[b.id] = cap;
    b.relationships[a.id] = cap;
    a.partnerId = null;
    b.partnerId = null;
    a.parentIds = [];
    b.parentIds = [];
    a.childrenIds = [];
    b.childrenIds = [];
    a.recordSocialContact(b.id, game.timeState.day);
    b.recordSocialContact(a.id, game.timeState.day);
    a.mood = 50;
    b.mood = 50;
    a.hunger = 80;
    b.hunger = 80;

    game.socialSystem.deepenDailyRelationships();
    expect(a.getRelationship(b)).toBeLessThanOrEqual(cap + 0.01);
  });

  it('Phase 2: affair discovery applies asymmetric jealousy', () => {
    const { a, b, mates } = tribePair();
    const rival = mates[2];
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.relationships[b.id] = 80;
    b.relationships[a.id] = 80;
    a.relationships[rival.id] = 20;
    rival.relationships[a.id] = 20;
    b.affairPartnerId = rival.id;
    rival.affairPartnerId = b.id;
    b.secrets = [{
      type: 'forbidden_romance',
      description: 'secret',
      revealed: false,
      discoveredBy: []
    }];

    game.handleAffairDiscovery(a, b, rival);

    expect(a.getRelationship(b)).toBeLessThan(b.getRelationship(a));
    expect(a.getRelationship(rival)).toBeLessThan(rival.getRelationship(a));
  });

  it('Phase 2: unrequited romance raises only actor→target', () => {
    const { a, b } = tribePair();
    a.relationships[b.id] = 40;
    b.relationships[a.id] = 5; // below friend
    a.partnerId = null;

    game.socialSystem.applyRomanceInteraction(a, b, 4);

    expect(a.getRelationship(b)).toBeGreaterThan(40);
    expect(b.getRelationship(a)).toBeLessThanOrEqual(5);
  });

  it('Phase 2: marriage gate uses mutual average', () => {
    const { a, b } = tribePair();
    a.relationships[b.id] = 90;
    b.relationships[a.id] = 10;
    expect(game.getMutualRelationship(a, b)).toBe(50);
    const summary = game.getBondSummary(a, b);
    expect(summary.aToB).toBe(90);
    expect(summary.bToA).toBe(10);
  });

  it('Phase 3: gossip changes listener opinion of owner', () => {
    const { a, b, mates } = tribePair();
    const listener = mates[2];
    listener.personality = { ...listener.personality, sociable: 80, empathetic: 50 };
    a.secrets = [{
      type: CONSTANTS.SECRET.PAST_BETRAYAL,
      description: `${a.name} betrayed someone.`,
      secrecyLevel: 2,
      revealed: true,
      discoveredBy: [b.id],
      publicKnowledge: false,
      target: b.id
    }];
    const before = listener.getRelationship(a) || 0;
    game.socialSystem.applyGossipOpinion(b, listener, a, a.secrets[0]);
    expect(listener.getRelationship(a)).toBeLessThan(before);
  });

  it('Phase 3: publicKnowledge triggers once at threshold', () => {
    const mates = game.getVillagersForVillage(game.villages[0].id)
      .filter(v => v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD);
    const owner = mates[0];
    const adults = mates.filter(v => v.id !== owner.id);
    owner.secrets = [{
      type: CONSTANTS.SECRET.HIDDEN_STASH,
      description: 'stash',
      revealed: true,
      discoveredBy: adults.slice(0, Math.ceil(mates.length * 0.5)).map(v => v.id),
      publicKnowledge: false
    }];

    game.socialSystem.maybeMarkPublicKnowledge(owner, owner.secrets[0]);
    expect(owner.secrets[0].publicKnowledge).toBe(true);

    const chronicle = game.getChronicle(owner.villageId);
    expect(chronicle.entries.some(e => e.text.includes('spread through the village'))).toBe(true);

    const entriesBefore = chronicle.entries.length;
    game.socialSystem.maybeMarkPublicKnowledge(owner, owner.secrets[0]);
    expect(chronicle.entries.length).toBe(entriesBefore);
  });

  it('Phase 4: partner preference favors spouse over distant acquaintance', () => {
    const { a, b, mates } = tribePair();
    const stranger = mates[2];
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.relationships[b.id] = 80;
    a.relationships[stranger.id] = 5;
    // Place both candidates at same distance
    b.x = a.x + 2;
    b.y = a.y;
    stranger.x = a.x + 2;
    stranger.y = a.y;
    a.socialPartnerId = null;
    b.socialPartnerId = null;
    stranger.socialPartnerId = null;
    b.socialNeed = 50;
    stranger.socialNeed = 50;

    const partner = game.findSocialPartner(a);
    expect(partner.id).toBe(b.id);
  });

  it('Phase 4: mood drops from a single enemy despite weak positive acquaintances', () => {
    const v = game.villagers[0];
    v.relationships = {
      a1: 10,
      a2: 10,
      a3: 10,
      a4: 10,
      enemy: -60
    };
    v.socialNeed = 80;
    v.hunger = 80;
    v.thirst = 80;
    v.energy = 80;
    v.updateMood();
    const withEnemy = v.mood;

    v.relationships = {
      a1: 10,
      a2: 10,
      a3: 10,
      a4: 10,
      a5: 10
    };
    v.updateMood();
    const withoutEnemy = v.mood;

    expect(withEnemy).toBeLessThan(withoutEnemy);
  });

  it('Phase 5: conquest retains relationship keys with trauma', () => {
    const v1 = game.villages[0];
    const v2 = game.villages[1];
    const winners = game.getVillagersForVillage(v1.id);
    const losers = game.getVillagersForVillage(v2.id);
    const w = winners[0];
    const l = losers[0];
    w.relationships[l.id] = 20;
    l.relationships[w.id] = 15;

    game.handleConquest(v2.id, v1.id);

    expect(w.relationships[l.id]).toBeDefined();
    expect(w.relationships[l.id]).toBeLessThan(20);
    expect(l.relationships[w.id]).toBeLessThan(15);
    expect(w.warTraumaTargets[l.id]).toBe(game.timeState.day);
  });

  it('Phase 5: folk diplomacy drifts village relations from personal bonds', () => {
    const v1 = game.villages[0];
    const v2 = game.villages[1];
    v1.knownVillages = [v2.id];
    v2.knownVillages = [v1.id];
    v1.relations[v2.id] = 35;
    v2.relations[v1.id] = 35;
    game.establishTradeAccess(v1, v2);

    const aList = game.getVillagersForVillage(v1.id);
    const bList = game.getVillagersForVillage(v2.id);
    aList.forEach(a => {
      bList.forEach(b => {
        a.relationships[b.id] = 70;
        b.relationships[a.id] = 70;
      });
    });

    const before = v1.relations[v2.id];
    game.socialSystem.applyFolkDiplomacyDrift();
    expect(v1.relations[v2.id]).toBeGreaterThan(before);
  });

  it('Phase 6: ritual absentees take shame toward leaders', () => {
    const village = game.villages[0];
    const mates = game.getVillagersForVillage(village.id);
    const chieftan = mates.find(v => v.isChieftan) || mates[0];
    chieftan.isChieftan = true;
    const sleeper = mates.find(v => v.id !== chieftan.id);
    sleeper.status = CONSTANTS.ACTIVITY.SLEEPING;
    mates.filter(v => v.id !== sleeper.id).forEach(v => {
      v.status = CONSTANTS.ACTIVITY.IDLE;
      v.isScouting = false;
      // Keep attendees inside territory
      v.x = village.center.x;
      v.y = village.center.y;
    });
    sleeper.x = village.center.x;
    sleeper.y = village.center.y;

    const before = sleeper.getRelationship(chieftan) || 0;
    const moodBefore = sleeper.mood;
    game.socialSystem.performRitualWithAttendance(CONSTANTS.RITUAL.MORNING_BLESSING, village.id);

    expect(sleeper.mood).toBeLessThan(moodBefore);
    expect(sleeper.getRelationship(chieftan)).toBeLessThan(before);
  });

  it('Phase 6: funeral attendees gain social bonds', () => {
    const village = game.villages[0];
    const mates = game.getVillagersForVillage(village.id);
    const deceased = mates[0];
    const a = mates[1];
    const b = mates[2];
    a.status = CONSTANTS.ACTIVITY.IDLE;
    b.status = CONSTANTS.ACTIVITY.IDLE;
    a.x = village.center.x;
    a.y = village.center.y;
    b.x = village.center.x;
    b.y = village.center.y;
    a.relationships[b.id] = 10;
    b.relationships[a.id] = 10;

    game.socialSystem.performRitualWithAttendance(CONSTANTS.RITUAL.FUNERAL, village.id, deceased);
    expect(a.getRelationship(b)).toBeGreaterThan(10);
  });

  it('Phase 6: prestige defaults and social goal completion', () => {
    const chieftan = game.villagers.find(v => v.isChieftan);
    expect(chieftan.prestige).toBeGreaterThanOrEqual(50);

    const villager = game.villagers.find(v => !v.isChieftan);
    villager.prestige = 70;
    villager.goals = [{
      id: 'g1',
      type: 'social',
      description: 'Become respected as an elder',
      progress: 50,
      completed: false
    }];
    game.pursueRelationshipGoal(villager, villager.goals[0]);
    expect(villager.goals[0].progress).toBeGreaterThanOrEqual(100);
  });

  it('serializes lastSocialContact and prestige', () => {
    const { a, b } = tribePair();
    a.recordSocialContact(b.id, 3);
    a.prestige = 44;
    const data = a.serialize();
    expect(data.lastSocialContact[b.id]).toBe(3);
    expect(data.prestige).toBe(44);
    const restored = Villager.deserialize(data);
    expect(restored.lastSocialContact[b.id]).toBe(3);
    expect(restored.prestige).toBe(44);
  });
});
