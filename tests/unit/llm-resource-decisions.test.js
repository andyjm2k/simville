import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * Decision agents own villager labor when an endpoint is set or a benchmark is running.
 * Offline play with no endpoint still uses the survival rules.
 */
describe('LLM-owned resource decisions', () => {
  let game;
  let previousEndpoint;

  beforeEach(() => {
    game = createHeadlessGame(9011);
    game.newWorld();
    previousEndpoint = llm.config?.llm?.endpoint;
    // Ensure a mutable llm.config shape for endpoint toggling
    llm.config = {
      llm: {
        endpoint: previousEndpoint || '',
        model: 'test-model',
        apiKey: '',
        maxTokens: 100,
        temperature: 0.2
      }
    };
  });

  afterEach(() => {
    if (llm.config?.llm) {
      llm.config.llm.endpoint = previousEndpoint || '';
    }
  });

  it('skips rules-engine survival labor and grants when an LLM endpoint is set', () => {
    llm.config.llm.endpoint = 'http://localhost:1234/v1';
    expect(game.usesLlmResourceDecisions()).toBe(true);

    const village = game.villages[0];
    village.resources.food = 0;
    village.resources.water = 0;
    game.getVillagersForVillage(village.id).forEach((v) => {
      v.hunger = 10;
      v.thirst = 10;
      v.energy = 80;
      v.health = 100;
      v.status = CONSTANTS.ACTIVITY.IDLE;
      v.activity = 'Idle';
      v.currentAction = null;
    });

    const beforeFood = village.resources.food;
    game.runVillageSurvivalBehaviors(village);

    // No emergency grants and no forced survivalTask assignment
    expect(village.resources.food).toBe(beforeFood);
    const forced = game.getVillagersForVillage(village.id)
      .some((v) => v.currentAction?.survivalTask);
    expect(forced).toBe(false);
  });

  it('still uses offline survival grants when no LLM endpoint is configured', () => {
    llm.config.llm.endpoint = '';
    expect(game.usesLlmResourceDecisions()).toBe(false);

    const village = game.villages[0];
    village.resources.food = 0;
    village.resources.water = 0;
    game.getVillagersForVillage(village.id).forEach((v) => {
      v.hunger = 10;
      v.thirst = 10;
      v.energy = 80;
      v.health = 100;
    });

    game.runVillageSurvivalBehaviors(village);
    expect(village.resources.food).toBeGreaterThan(0);
    expect(village.resources.water).toBeGreaterThan(0);
  });

  it('applyVillagerActions keeps mild-need LLM picks instead of soft-eating', () => {
    llm.config.llm.endpoint = 'http://localhost:1234/v1';
    const villager = game.villagers[0];
    villager.hunger = 40;
    villager.thirst = 90;
    villager.energy = 80;
    villager.status = CONSTANTS.ACTIVITY.IDLE;
    game.getResources(villager.villageId).food = 20;

    const applied = game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood',
      duration: 5
    }]);

    expect(applied).toBe(1);
    // Must not soft-override into eating; movement may briefly mark working
    expect(villager.status).not.toBe(CONSTANTS.ACTIVITY.EATING);
    expect(villager.activity).not.toMatch(/Eating from the village stores/i);
  });

  it('does not let rules gather, build, or scout for an LLM-owned village', () => {
    llm.config.llm.endpoint = 'http://127.0.0.1:1234/v1';
    const village = game.villages[0];
    village.resources.wood = 80;
    village.resources.clay = 40;
    village.resources.thatch = 40;
    village.resources.stone = 40;
    game.constructionProjects = [];
    game.chooseNeededStructure = () => 'farm';

    game.planAutonomousConstruction();
    expect(game.constructionProjects).toHaveLength(0);

    game.timeState.hours = 10;
    game.explorationSystem.process();
    expect(game.villagers.some((villager) => villager.isScouting)).toBe(false);

    const villager = game.getVillagersForVillage(village.id)[0];
    villager.status = CONSTANTS.ACTIVITY.GATHERING;
    villager.activity = 'Gathering resources';
    villager.currentAction = { action: CONSTANTS.ACTIVITY.GATHERING, target: 'wood' };
    villager.activityDuration = 0;
    game.constructionProjects.push({
      id: 'project-1',
      type: 'hut',
      name: 'Hut',
      x: villager.x,
      y: villager.y,
      builderId: villager.id,
      villageId: village.id,
      progress: 0,
      workRequired: 100,
      startedDay: 1,
      source: 'autonomous'
    });
    game.processConstructionProjects(1000);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.GATHERING);
    expect(villager.currentAction.action).toBe(CONSTANTS.ACTIVITY.GATHERING);

    villager.status = CONSTANTS.ACTIVITY.IDLE;
    villager.currentAction = null;
    villager.startWandering(game.world);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.IDLE);
  });

  it('benchmark mode does not dispatch rule scouts or emergency labor', () => {
    llm.config.llm.endpoint = '';
    game.benchmarkMode = true;
    const village = game.villages[0];
    village.resources.food = 0;
    village.resources.water = 0;
    game.getVillagersForVillage(village.id).forEach((villager) => {
      villager.hunger = 10;
      villager.thirst = 10;
    });

    game.runVillageSurvivalBehaviors(village);
    expect(village.resources.food).toBe(0);
    expect(village.resources.water).toBe(0);

    game.timeState.hours = 10;
    game.explorationSystem.process();
    expect(game.villagers.some((villager) => villager.isScouting)).toBe(false);
  });

  it('lets a benchmark baseline order the first scout', async () => {
    llm.config.llm.endpoint = '';
    game.benchmarkMode = true;
    const village = game.villages[0];
    const rival = game.villages[1];
    game.benchmarkAgents[village.id] = new BaselineAgent({ name: 'control' });

    await game.requestChieftanDiplomacy(village.id);

    expect(game.villagers.some((villager) => villager.isScouting)).toBe(false);
    const event = game.diplomaticEvents.find((entry) => entry.sourceVillageId === village.id);
    expect(event?.type).toBe('observe');
    expect(event?.reason).toMatch(/send scouts/i);
    expect(game.benchmarkEvents.some((entry) => entry.action === 'observe')).toBe(true);

    game.timeState.day += 2;
    game.processChieftanDecisions();
    const scout = game.villagers.find((villager) => villager.isScouting);
    expect(scout?.villageId).toBe(village.id);
    expect(scout?.scoutMission?.targetVillageId).toBe(rival.id);
  });

  it('still auto-scouts an undiscovered rival when no agent owns the village', async () => {
    llm.config.llm.endpoint = '';
    game.benchmarkMode = false;
    await game.requestChieftanDiplomacy(game.villages[0].id);
    expect(game.villagers.some((villager) => villager.isScouting)).toBe(true);
  });

  it('does not replace an LLM drinking decision with a local reflex', () => {
    llm.config.llm.endpoint = 'http://127.0.0.1:1234/v1';
    const villager = game.villagers[0];
    villager.hunger = (CONSTANTS.NEED.CRITICAL_HUNGER ?? 25) - 5;
    villager.thirst = 10;
    villager.energy = 80;
    villager.status = CONSTANTS.ACTIVITY.IDLE;
    villager.activityDuration = 0;
    villager.currentAction = null;
    game.getResources(villager.villageId).water = 12;
    game.getResources(villager.villageId).food = 10;

    const blocked = game.applyCriticalNeedReflex(villager, {
      action: CONSTANTS.ACTIVITY.GATHERING,
      target: 'wood'
    });
    expect(blocked).toBe(false);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.IDLE);

    const applied = game.applyVillagerActions([{
      villagerId: villager.id,
      action: CONSTANTS.ACTIVITY.DRINKING,
      duration: 4
    }]);
    expect(applied).toBe(1);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.DRINKING);
  });

  it('applyCriticalNeedReflex overrides non-survival actions only when collapsing offline', () => {
    const villager = game.villagers[0];
    villager.hunger = (CONSTANTS.NEED.CRITICAL_HUNGER ?? 25) - 5;
    villager.thirst = 90;
    villager.energy = 80;
    game.getResources(villager.villageId).food = 10;

    const blocked = game.applyCriticalNeedReflex(villager, {
      action: CONSTANTS.ACTIVITY.SOCIALIZING
    });
    expect(blocked).toBe(true);
    expect(villager.status).toBe(CONSTANTS.ACTIVITY.EATING);

    villager.hunger = 50;
    villager.status = CONSTANTS.ACTIVITY.IDLE;
    const allowed = game.applyCriticalNeedReflex(villager, {
      action: CONSTANTS.ACTIVITY.BUILDING
    });
    expect(allowed).toBe(false);
  });

  it('buildWorldStateForVillage includes resource pressure and active directives', () => {
    const village = game.villages[0];
    village.government = game.createDefaultGovernment();
    village.government.rules = [{
      id: 'rule-1',
      title: 'Keep the jars full',
      edict: 'Draw water before midday.',
      effect: 'water_priority',
      category: 'water',
      active: true,
      createdDay: 1,
      durationDays: 10
    }];

    const worldState = game.buildWorldStateForVillage(village, null);
    expect(worldState.resourcePressure).toBeTruthy();
    expect(worldState.resourcePressure.foodBand).toBeTruthy();
    expect(worldState.activeDirectives).toHaveLength(1);
    expect(worldState.activeDirectives[0].effect).toBe('water_priority');
  });
});
