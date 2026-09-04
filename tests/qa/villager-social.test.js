import { describe, it, expect, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * @qa villager-social
 */
describe('QA: socializing restores social need and does not loop', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9011);
    game.newWorld();
    game.paused = true;
  });

  function tribeMates() {
    const villageId = game.villages[0].id;
    const mates = game.getVillagersForVillage(villageId);
    const a = mates[0];
    const b = mates[1];
    // Unique names avoid cross-village collisions in interactionTarget resolution
    a.name = 'SocialAlpha';
    b.name = 'SocialBeta';
    for (const villager of game.villagers) {
      villager.hunger = 95;
      villager.thirst = 95;
      villager.energy = 95;
      villager.activityDuration = 0;
      villager.needInterruptCooldown = 0;
    }
    return { a, b };
  }

  it('restores social need while socializing next to a tribe-mate', () => {
    const { a, b } = tribeMates();
    a.x = b.x;
    a.y = b.y;
    a.socialNeed = 5;
    b.socialNeed = 5;
    a.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    b.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    a.socialPartnerId = b.id;
    b.socialPartnerId = a.id;

    const hour = game.timeState.hourDuration;
    a.updateNeeds(hour, game.villagers);

    expect(a.socialNeed).toBeGreaterThan(5);
    expect(a.socialNeed).toBeCloseTo(5 + CONSTANTS.NEED.SOCIAL_RECOVERY, 5);
  });

  it('does not restore social need when socializing alone and out of range', () => {
    const { a, b } = tribeMates();
    a.x = 2;
    a.y = 2;
    b.x = 60;
    b.y = 60;
    a.socialNeed = 8;
    a.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    a.socialPartnerId = b.id;
    b.socialPartnerId = a.id;

    const hour = game.timeState.hourDuration;
    a.updateNeeds(hour, game.villagers);

    expect(a.socialNeed).toBeLessThan(8);
  });

  it('keeps SOCIALIZING when walking to a partner instead of flipping to WORKING/IDLE', () => {
    const { a, b } = tribeMates();
    const village = game.getVillage(a.villageId);
    a.x = village.center.x - 4;
    a.y = village.center.y;
    b.x = village.center.x + 4;
    b.y = village.center.y;
    a.socialNeed = 0;
    a.personality.sociable = 80;
    a.status = CONSTANTS.ACTIVITY.SOCIALIZING;

    const started = game.beginSocializing(a, b);
    expect(started).toBe(true);
    expect(a.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
    expect(a.status).not.toBe(CONSTANTS.ACTIVITY.WORKING);

    if (a.isMoving && a.path.length > 0) {
      const last = a.path[a.path.length - 1];
      a.x = last.x;
      a.y = last.y;
      a.path = [];
      a.isMoving = false;
      a.updateMovement(16, game.world);
    }

    expect(a.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
  });

  it('does not repath every social action while already walking to a meetup', () => {
    const { a, b } = tribeMates();
    const village = game.getVillage(a.villageId);
    const left = game.world.getWalkableTileNear(village.center.x - 5, village.center.y - 5, 2);
    const right = game.world.getWalkableTileNear(village.center.x + 5, village.center.y + 5, 2);
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    a.x = left.x;
    a.y = left.y;
    b.x = right.x;
    b.y = right.y;
    a.stopMoving();

    game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionTarget: b.id,
      moveTo: { x: Math.round(b.x), y: Math.round(b.y) }
    });

    const firstTarget = { x: a.targetX, y: a.targetY };
    expect(a.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
    expect(a.isMoving).toBe(true);

    game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionTarget: b.id,
      moveTo: { x: Math.round(b.x), y: Math.round(b.y) }
    });

    expect(a.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
    expect(a.targetX).toBe(firstTarget.x);
    expect(a.targetY).toBe(firstTarget.y);
  });

  it('walks toward a distant partner instead of cancelling the social action', () => {
    const { a, b } = tribeMates();
    const village = game.getVillage(a.villageId);
    const left = game.world.getWalkableTileNear(village.center.x - 5, village.center.y, 2);
    const right = game.world.getWalkableTileNear(village.center.x + 5, village.center.y, 2);
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    a.x = left.x;
    a.y = left.y;
    b.x = right.x;
    b.y = right.y;
    a.stopMoving();

    const result = game.applySocialVillagerAction(a, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING,
      interactionTarget: b.id,
      interactionType: 'talk',
      speechTheme: 'Hello'
    });

    expect(result?.handled).toBe(true);
    expect(a.speechBubble?.theme).not.toBe('Too far to talk');
    expect(a.status).toBe(CONSTANTS.ACTIVITY.SOCIALIZING);
    expect(a.socialPartnerId).toBe(b.id);
    expect(Utils.distance(a.x, a.y, b.x, b.y)).toBeGreaterThan(game.getSocialRange());
  });

  it('drops mood when social need is empty even if other needs are healthy', () => {
    const { a } = tribeMates();
    a.hunger = 80;
    a.thirst = 80;
    a.energy = 80;
    a.personality.sociable = 70;
    a.personality.confident = 50;
    a.relationships = {};

    a.socialNeed = 80;
    a.updateMood();
    const supportedMood = a.mood;

    a.socialNeed = 0;
    a.updateMood();

    expect(a.mood).toBeLessThan(supportedMood - 20);
    expect(a.mood).toBeLessThan(25);
  });

  it('does not pick a rival villager as a social partner', () => {
    const { a } = tribeMates();
    const rival = game.getVillagersForVillage(game.villages[1].id)[0];
    const partner = game.findSocialPartner(a, rival);

    expect(partner).toBeTruthy();
    expect(partner.villageId).toBe(a.villageId);
    expect(game.canVillagersSocialize(a, rival)).toBe(false);
  });
});
