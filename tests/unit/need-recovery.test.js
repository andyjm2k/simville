import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * NeedRecovery decides when a villager must keep drinking instead of gathering.
 */
describe('NeedRecovery', () => {
  beforeAll(() => {
    createHeadlessGame(9021);
  });

  const stocked = { water: 10, food: 10 };
  const empty = { water: 0, food: 0 };

  function villager(overrides = {}) {
    return {
      health: 100,
      hunger: 90,
      thirst: 90,
      energy: 90,
      status: 'idle',
      ...overrides
    };
  }

  it('thresholds exposes the critical floors and satisfied bars', () => {
    const limits = NeedRecovery.thresholds();
    expect(limits.criticalThirst).toBe(CONSTANTS.NEED.CRITICAL_THIRST);
    expect(limits.criticalHunger).toBe(CONSTANTS.NEED.CRITICAL_HUNGER);
    expect(limits.criticalEnergy).toBe(CONSTANTS.NEED.CRITICAL_ENERGY);
    expect(limits.drinkSatisfied).toBe(CONSTANTS.NEED.DRINK_SATISFIED);
    expect(limits.eatSatisfied).toBe(CONSTANTS.NEED.EAT_SATISFIED);
    expect(limits.restSatisfied).toBe(CONSTANTS.NEED.REST_SATISFIED);
  });

  it('resolve returns null for a healthy or dead villager and for mild thirst', () => {
    expect(NeedRecovery.resolve(villager(), stocked)).toBeNull();
    expect(NeedRecovery.resolve(villager({ health: 0, thirst: 0 }), stocked)).toBeNull();
    expect(NeedRecovery.resolve(villager({ thirst: 40 }), stocked)).toBeNull();
  });

  it('resolve forces a drink while water is stored and collection when it is not', () => {
    const critical = villager({ thirst: 10, status: 'gathering' });
    expect(NeedRecovery.resolve(critical, stocked)).toEqual({ kind: 'thirst', mode: 'consume' });
    expect(NeedRecovery.resolve(critical, empty)).toEqual({ kind: 'thirst', mode: 'collect' });
  });

  it('resolve holds an in-progress drink until thirst is satisfied', () => {
    const drinking = villager({ thirst: 40, status: 'drinking' });
    expect(NeedRecovery.resolve(drinking, stocked)).toEqual({ kind: 'thirst', mode: 'consume' });
    const finished = villager({ thirst: CONSTANTS.NEED.DRINK_SATISFIED, status: 'drinking' });
    expect(NeedRecovery.resolve(finished, stocked)).toBeNull();
  });

  it('resolve covers hunger and exhaustion after thirst', () => {
    expect(NeedRecovery.resolve(villager({ hunger: 10 }), stocked)).toEqual({ kind: 'hunger', mode: 'consume' });
    expect(NeedRecovery.resolve(villager({ hunger: 10 }), empty)).toEqual({ kind: 'hunger', mode: 'collect' });
    expect(NeedRecovery.resolve(villager({ energy: 5 }), stocked)).toEqual({ kind: 'energy', mode: 'consume' });
    const eating = villager({ hunger: 40, status: 'eating' });
    expect(NeedRecovery.resolve(eating, stocked)).toEqual({ kind: 'hunger', mode: 'consume' });
  });

  it('allowsAction rejects wood gathering while water is in store', () => {
    const recovery = { kind: 'thirst', mode: 'consume' };
    expect(NeedRecovery.allowsAction({ action: 'gathering', target: 'wood' }, recovery)).toBe(false);
    expect(NeedRecovery.allowsAction({ action: 'hunting' }, recovery)).toBe(false);
    expect(NeedRecovery.allowsAction({ action: 'drinking' }, recovery)).toBe(true);
    expect(NeedRecovery.allowsAction({ action: 'gathering', target: 'wood' }, null)).toBe(true);
  });

  it('isWaterCollection recognizes a water gather and not a wood gather', () => {
    expect(NeedRecovery.isWaterCollection({ action: 'gathering', target: 'water' })).toBe(true);
    expect(NeedRecovery.isWaterCollection({ action: 'gathering', survivalTask: 'water' })).toBe(true);
    expect(NeedRecovery.isWaterCollection({ action: 'gathering', target: 'wood' })).toBe(false);
    expect(NeedRecovery.isWaterCollection({ action: 'eating', target: 'water' })).toBe(false);
  });

  it('allowsAction accepts water collection only when stores are empty', () => {
    const collect = { kind: 'thirst', mode: 'collect' };
    expect(NeedRecovery.allowsAction({ action: 'gathering', target: 'water' }, collect)).toBe(true);
    expect(NeedRecovery.allowsAction({ action: 'gathering', target: 'wood' }, collect)).toBe(false);
    expect(NeedRecovery.allowsAction({ action: 'drinking' }, collect)).toBe(false);

    const hunger = { kind: 'hunger', mode: 'consume' };
    expect(NeedRecovery.allowsAction({ action: 'eating' }, hunger)).toBe(true);
    expect(NeedRecovery.allowsAction({ action: 'gathering', target: 'food' }, hunger)).toBe(false);
    const forage = { kind: 'hunger', mode: 'collect' };
    expect(NeedRecovery.allowsAction({ action: 'hunting' }, forage)).toBe(true);

    const rest = { kind: 'energy', mode: 'consume' };
    expect(NeedRecovery.allowsAction({ action: 'resting' }, rest)).toBe(true);
    expect(NeedRecovery.allowsAction({ action: 'gathering' }, rest)).toBe(false);
    expect(NeedRecovery.allowsAction({ action: 'idle' }, { kind: 'other', mode: 'consume' })).toBe(false);
  });

  it('consumeStatus maps a drink, meal, or rest and ignores collection', () => {
    expect(NeedRecovery.consumeStatus({ kind: 'thirst', mode: 'consume' })).toEqual({
      status: 'drinking',
      activity: 'Drinking water'
    });
    expect(NeedRecovery.consumeStatus({ kind: 'hunger', mode: 'consume' }).status).toBe('eating');
    expect(NeedRecovery.consumeStatus({ kind: 'energy', mode: 'consume' }).status).toBe('resting');
    expect(NeedRecovery.consumeStatus({ kind: 'thirst', mode: 'collect' })).toBeNull();
    expect(NeedRecovery.consumeStatus(null)).toBeNull();
    expect(NeedRecovery.consumeStatus({ kind: 'other', mode: 'consume' })).toBeNull();
  });
});

describe('drinking is not interrupted by gathering', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(9022);
    game.newWorld();
    game.timeState.hourDuration = 25000;
  });

  function prepare(thirst, water, status = CONSTANTS.ACTIVITY.GATHERING) {
    const villager = game.villagers[0];
    villager.thirst = thirst;
    villager.hunger = 90;
    villager.energy = 90;
    villager.health = 100;
    villager.status = status;
    villager.activity = 'Gathering resources';
    villager.activityDuration = 300;
    villager.currentAction = { action: 'gathering', activity: 'Gathering resources', target: 'wood' };
    villager.socialNeed = 80;
    game.getResources(villager.villageId).water = water;
    game.getResources(villager.villageId).food = 20;
    return villager;
  }

  it('offline rules still make a critically thirsty villager drink instead of gathering', () => {
    const villager = prepare(10, 15);
    const before = villager.thirst;
    const statuses = [];

    for (let step = 0; step < 6; step += 1) {
      game.applyVillagerActions([{
        villagerId: villager.id,
        action: CONSTANTS.ACTIVITY.GATHERING,
        target: 'wood',
        duration: 5,
        activity: 'Gathering resources'
      }]);
      villager.update(1000, game.world, game.villagers);
      statuses.push(villager.status);
    }

    expect(statuses.every(status => status === CONSTANTS.ACTIVITY.DRINKING)).toBe(true);
    expect(villager.thirst).toBeGreaterThan(before);
    expect(villager.currentAction?.action).toBe(CONSTANTS.ACTIVITY.DRINKING);
    expect(villager.activity).toMatch(/drink/i);
  });

  it('does not resume gathering when thirst has risen above the critical floor but the drink is unfinished', () => {
    const villager = prepare(40, 12, CONSTANTS.ACTIVITY.DRINKING);
    villager.activity = 'Drinking water';

    game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5
    }]);

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.DRINKING);
    villager.update(1000, game.world, game.villagers);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.DRINKING);
    expect(villager.thirst).toBeGreaterThan(40);
  });

  it('still lets a mildly thirsty villager gather', () => {
    const villager = prepare(40, 12, CONSTANTS.ACTIVITY.IDLE);
    const applied = game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5
    }]);
    expect(applied).toBe(1);
    expect(villager.status).not.toBe(CONSTANTS.ACTIVITY.DRINKING);
  });

  it('sends a dehydrated villager to collect water when the stores are empty', () => {
    const villager = prepare(10, 0);
    game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5,
      activity: 'Gathering resources'
    }]);

    const water = game.getResources(villager.villageId).water;
    const collecting = villager.currentAction?.survivalTask === 'water' ||
      /water/i.test(villager.activity || '');
    expect(collecting || water > 0).toBe(true);
    expect(villager.activity).not.toBe('Gathering resources');

    const seen = [];
    for (let step = 0; step < 4; step += 1) {
      villager.update(100, game.world, game.villagers);
      seen.push(villager.status);
    }
    expect(seen.filter(status => status === CONSTANTS.ACTIVITY.GATHERING).length).toBeGreaterThan(0);
    expect(seen[0]).toBe(seen[1]);
  });

  it('does not clear a drink when a short activity timer expires', () => {
    const villager = prepare(30, 10, CONSTANTS.ACTIVITY.DRINKING);
    villager.activityDuration = 40;
    villager.update(200, game.world, game.villagers);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.DRINKING);
    expect(villager.thirst).toBeGreaterThan(30);
  });

  it('rules-engine labor leaves an unfinished drink alone', () => {
    const previous = llm.config?.llm?.endpoint || '';
    llm.config = llm.config || { llm: {} };
    llm.config.llm = { ...(llm.config.llm || {}), endpoint: '' };
    const villager = prepare(40, 12, CONSTANTS.ACTIVITY.DRINKING);
    villager.activity = 'Drinking water';
    expect(game.usesLlmResourceDecisions(villager.villageId)).toBe(false);

    game.runVillageSurvivalBehaviors(game.getVillage(villager.villageId));

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.DRINKING);
    llm.config.llm.endpoint = previous;
  });

  function enableLlm() {
    llm.config = {
      llm: {
        endpoint: 'http://127.0.0.1:1234/v1',
        model: 'local',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };
  }

  it('keeps a critically thirsty villager on the LLM gather order', () => {
    enableLlm();
    const villager = prepare(10, 15, CONSTANTS.ACTIVITY.IDLE);
    villager.activityDuration = 0;
    villager.currentAction = null;
    villager.actionQueue = [];

    game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5
    }]);
    villager.update(400, game.world, game.villagers);

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.GATHERING);
    expect(villager.currentAction?.action).toBe(CONSTANTS.ACTIVITY.GATHERING);
    expect(villager.actionQueue).toHaveLength(0);
  });

  it('queues the LLM drink until the current gather finishes, then thirst rises', () => {
    enableLlm();
    const villager = prepare(10, 20, CONSTANTS.ACTIVITY.IDLE);
    villager.activityDuration = 0;
    villager.currentAction = null;
    villager.actionQueue = [];
    game.timeState.hourDuration = 60000;
    const before = villager.thirst;

    game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5
    }]);
    game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.DRINKING,
      duration: 5
    }]);

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.GATHERING);
    expect(villager.actionQueue.map(action => action.action)).toEqual([CONSTANTS.ACTIVITY.DRINKING]);

    const statuses = [];
    for (let step = 0; step < 6; step += 1) {
      villager.update(1000, game.world, game.villagers);
      statuses.push(villager.status);
    }

    expect(statuses.slice(0, 4).every(status => status === CONSTANTS.ACTIVITY.GATHERING)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(CONSTANTS.ACTIVITY.DRINKING);
    expect(villager.thirst).toBeGreaterThan(before);
    expect(villager.isActionInProgress()).toBe(true);
  });

  it('drops the oldest queued action past the limit of three', () => {
    enableLlm();
    const villager = prepare(80, 10, CONSTANTS.ACTIVITY.IDLE);
    villager.activityDuration = 0;
    villager.currentAction = null;
    villager.actionQueue = [];
    game.applyVillagerActions([{ villagerId: villager.id, action: CONSTANTS.ACTIVITY.GATHERING, duration: 5 }]);
    for (const action of ['drinking', 'eating', 'resting', 'fishing']) {
      game.applyVillagerActions([{ villagerId: villager.id, action, duration: 2 }]);
    }
    expect(villager.actionQueue.map(action => action.action)).toEqual(['eating', 'resting', 'fishing']);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.GATHERING);
  });

  it('does not let a personal goal replace an in-progress LLM action', () => {
    enableLlm();
    const villager = prepare(80, 10, CONSTANTS.ACTIVITY.GATHERING);
    villager.activityDuration = 50000;
    villager.currentAction = { action: CONSTANTS.ACTIVITY.GATHERING };
    villager.goals = [{
      id: 'goal-respect',
      type: 'aspiration',
      description: 'Become a respected member of the village',
      completed: false,
      failed: false,
      progress: 10,
      lastPursuedDay: 0
    }];

    game.processPersonalGoals();

    expect(villager.status).toBe(CONSTANTS.ACTIVITY.GATHERING);
    expect(villager.currentAction?.action).toBe(CONSTANTS.ACTIVITY.GATHERING);
  });

  it('stores action duration in milliseconds of game time', () => {
    const villager = prepare(90, 10, CONSTANTS.ACTIVITY.IDLE);
    game.timeState.hourDuration = 60000;
    villager.applyAction({ action: CONSTANTS.ACTIVITY.WORKING, duration: 5 });
    expect(villager.activityDuration).toBeCloseTo(5000, 5);
  });
});
