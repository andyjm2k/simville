import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHeadlessGame } from '../setup/load-scripts.js';

/**
 * LLM owns resource strategy when an endpoint is configured.
 * Local rules only apply critical collapse reflexes.
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

  it('applyCriticalNeedReflex overrides non-survival actions only when collapsing', () => {
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
