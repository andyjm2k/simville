// Simville Benchmark Scenarios — stress packs for LLM decision eval

/**
 * Named world setups that stress competing priorities under hard survival.
 */
class BenchmarkScenarios {
  /**
   * List built-in scenario ids.
   * @returns {string[]}
   */
  static list() {
    return ['default', 'famine', 'asymmetric', 'hostile_baseline'];
  }

  /**
   * Apply a scenario to an initialized headless game.
   * @param {object} game
   * @param {string} id
   * @param {object} options
   */
  static apply(game, id = 'default', options = {}) {
    const scenarioId = id || 'default';
    switch (scenarioId) {
      case 'famine':
        BenchmarkScenarios.applyFamine(game, options);
        break;
      case 'asymmetric':
        BenchmarkScenarios.applyAsymmetric(game, options);
        break;
      case 'hostile_baseline':
        // Agent B should be configured strategy:raider by the pack runner
        BenchmarkScenarios.applyHostileBaseline(game, options);
        break;
      case 'default':
      default:
        break;
    }
    if (game.benchmarkEvents) {
      game.benchmarkEvents.push({
        type: 'scenario_applied',
        scenario: scenarioId,
        day: game.timeState?.day || 1
      });
    }
  }

  /**
   * Slash food/water stores and nearby food tiles to force scarcity tradeoffs.
   * @param {object} game
   * @param {object} options
   */
  static applyFamine(game, options = {}) {
    const foodKeep = options.foodKeep ?? 0.15;
    const waterKeep = options.waterKeep ?? 0.2;
    for (const village of game.villages || []) {
      const res = game.getResources?.(village.id);
      if (!res) continue;
      res.food = Math.floor((res.food || 0) * foodKeep);
      res.water = Math.floor((res.water || 0) * waterKeep);
      res.fish = Math.floor((res.fish || 0) * foodKeep);
    }
    // Deplete world food nodes so gathering cannot instantly refill
    for (const r of game.world?.resources || []) {
      if (r.type === CONSTANTS.RESOURCE.FOOD || r.type === 'food') {
        r.amount = Math.max(0, Math.floor((r.amount || 0) * 0.2));
      }
    }
  }

  /**
   * Give village A a strong start and village B a weak start.
   * @param {object} game
   * @param {object} options
   */
  static applyAsymmetric(game, options = {}) {
    const [strong, weak] = game.villages || [];
    if (!strong || !weak) return;
    const strongRes = game.getResources?.(strong.id);
    const weakRes = game.getResources?.(weak.id);
    if (strongRes) {
      strongRes.food = (strongRes.food || 0) + (options.strongFoodBonus ?? 40);
      strongRes.water = (strongRes.water || 0) + (options.strongWaterBonus ?? 30);
      strongRes.wood = (strongRes.wood || 0) + (options.strongWoodBonus ?? 25);
    }
    if (weakRes) {
      weakRes.food = Math.min(weakRes.food || 0, options.weakFoodCap ?? 8);
      weakRes.water = Math.min(weakRes.water || 0, options.weakWaterCap ?? 8);
      weakRes.wood = Math.min(weakRes.wood || 0, options.weakWoodCap ?? 5);
    }
    // Soften weak side villager needs so asymmetry is about stockpiles, not instant death
    for (const v of game.getVillagersForVillage?.(weak.id) || []) {
      v.hunger = Math.min(v.hunger, options.weakHunger ?? 55);
      v.thirst = Math.min(v.thirst ?? 100, options.weakThirst ?? 55);
    }
  }

  /**
   * Mild resource pressure so a raider baseline has something to contest.
   * @param {object} game
   * @param {object} options
   */
  static applyHostileBaseline(game, options = {}) {
    for (const village of game.villages || []) {
      const res = game.getResources?.(village.id);
      if (!res) continue;
      res.food = Math.floor((res.food || 0) * (options.foodKeep ?? 0.5));
      res.water = Math.floor((res.water || 0) * (options.waterKeep ?? 0.5));
    }
  }

  /**
   * Expand a scenario pack into N seeded replicate configs.
   * @param {object} baseConfig - Shared benchmark config (agents, days, etc.)
   * @param {object} packOptions
   * @returns {object[]} run configs
   */
  static expandReplicates(baseConfig = {}, packOptions = {}) {
    const scenarios = packOptions.scenarios || BenchmarkScenarios.list().filter((id) => id !== 'default');
    const replicates = Math.max(1, packOptions.replicates ?? 5);
    const baseSeed = packOptions.baseSeed ?? baseConfig.seed ?? 4242;
    const runs = [];

    for (const scenario of scenarios) {
      for (let i = 0; i < replicates; i++) {
        const config = {
          ...baseConfig,
          seed: baseSeed + runs.length,
          scenario,
          easyNeeds: false,
          allowAutonomousBuild: false,
          output: packOptions.outputPattern
            ? packOptions.outputPattern.replace('{scenario}', scenario).replace('{i}', String(i))
            : undefined
        };
        // Hostile pack forces a strong raider on B when B is baseline
        if (scenario === 'hostile_baseline') {
          config.agentB = {
            ...(config.agentB || { type: 'baseline' }),
            type: config.agentB?.type || 'baseline',
            strategy: 'raider',
            name: config.agentB?.name || 'baseline-raider'
          };
        }
        runs.push(config);
      }
    }
    return runs;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BenchmarkScenarios };
}
