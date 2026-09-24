// Simville Benchmark — headless LLM vs opponent scoring and runner

/**
 * Computes comparable multi-metric scores for benchmark villages.
 */
class BenchmarkScorer {
  /**
   * Weighted resource value for scoring.
   * @param {object} resources
   * @returns {number}
   */
  static resourceScore(resources = {}) {
    return (
      (resources.food || 0) * 2 +
      (resources.water || 0) * 2 +
      (resources.wood || 0) * 1.2 +
      (resources.stone || 0) * 1.5 +
      (resources.clay || 0) * 1 +
      (resources.fish || 0) * 1.8 +
      (resources.herbs || 0) * 1.2 +
      (resources.thatch || 0) * 0.8 +
      (resources.rareMaterials || 0) * 3
    );
  }

  /**
   * Structures built after start (agent credit); excludes starting stock.
   * @param {object} village
   * @param {object} game
   * @returns {number}
   */
  static agentBuiltStructures(village, game) {
    const total = village.structureIds?.length || 0;
    const starting = game.benchmarkStartingStructures?.[village.id] || 0;
    return Math.max(0, total - starting);
  }

  /**
   * Survival dimension: living pop health/needs pressure.
   * @param {Array} villagers
   * @returns {number}
   */
  static survivalScore(villagers = []) {
    if (!villagers.length) return 0;
    const avg = (key, fallback = 100) =>
      villagers.reduce((sum, v) => sum + (v[key] ?? fallback), 0) / villagers.length;
    const health = avg('health');
    const hunger = avg('hunger');
    const thirst = avg('thirst');
    // Population kept alive is the primary survival signal
    return Math.round((villagers.length * 20 + health * 0.5 + hunger * 0.25 + thirst * 0.25) * 10) / 10;
  }

  /**
   * Growth dimension: pop + agent-built structures + resources (no autonomous credit).
   * @param {number} population
   * @param {number} agentStructures
   * @param {number} resourceTotal
   * @returns {number}
   */
  static growthScore(population, agentStructures, resourceTotal) {
    return Math.round((population * 12 + agentStructures * 18 + resourceTotal) * 10) / 10;
  }

  /**
   * Military dimension from village strength.
   * @param {number} strength
   * @returns {number}
   */
  static militaryScore(strength) {
    return Math.round(strength * 10) / 10;
  }

  /**
   * Social/goals dimension from relations and personal goal completion.
   * @param {object} village
   * @param {Array} villagers
   * @param {object} game
   * @returns {number}
   */
  static socialGoalsScore(village, villagers, game) {
    const rival = game.villages?.find((v) => v.id !== village.id);
    const relation = rival ? (village.relations?.[rival.id] ?? 0) : 0;
    let goalPoints = 0;
    let goalTotal = 0;
    for (const v of villagers) {
      for (const g of v.goals || []) {
        goalTotal += 1;
        if (g.completed) goalPoints += 1;
        else if (g.failed) goalPoints += 0;
        else goalPoints += Math.min(1, (g.progress || 0) / 100);
      }
    }
    const goalRate = goalTotal ? goalPoints / goalTotal : 0;
    return Math.round((relation * 0.4 + goalRate * 40) * 10) / 10;
  }

  /**
   * Snapshot one village for reporting with multi-metric scores.
   * @param {object} village
   * @param {object} game
   * @param {object} agentMeta
   * @param {object} agentStats
   * @returns {object}
   */
  static scoreVillage(village, game, agentMeta = {}, agentStats = {}) {
    const villagers = game.getVillagersForVillage(village.id);
    const resources = game.getResources(village.id);
    const population = villagers.length;
    const structures = village.structureIds?.length || 0;
    const agentStructures = BenchmarkScorer.agentBuiltStructures(village, game);
    const strength = village.calculateStrength(game.villagers);
    const resourceTotal = BenchmarkScorer.resourceScore(resources);
    const survival = BenchmarkScorer.survivalScore(villagers);
    const growth = BenchmarkScorer.growthScore(population, agentStructures, resourceTotal);
    const military = BenchmarkScorer.militaryScore(strength);
    const socialGoals = BenchmarkScorer.socialGoalsScore(village, villagers, game);
    // Composite uses agent-built structures only (not total structures)
    const compositeScore = Math.round(
      (survival * 0.35 + growth * 0.35 + military * 0.2 + socialGoals * 0.1) * 10
    ) / 10;

    return {
      villageId: village.id,
      villageName: village.name,
      agent: agentMeta,
      population,
      structures,
      agentStructures,
      strength: Math.round(strength * 10) / 10,
      resources: { ...resources },
      resourceScore: Math.round(resourceTotal * 10) / 10,
      metrics: {
        survival,
        growth,
        military,
        socialGoals
      },
      compositeScore,
      relationToRival: null,
      atWar: [...(village.atWarWith || [])],
      agentStats: { ...agentStats }
    };
  }

  /**
   * Determine winner from final snapshots using multi-metric composite.
   * @param {Array} snapshots
   * @param {object} game
   * @returns {object}
   */
  static determineWinner(snapshots, game) {
    if (game.villages.length < 2) {
      return { winner: 'draw', reason: 'single_village', margin: 0 };
    }

    const alive = snapshots.filter((s) => s.population > 0);
    if (alive.length === 1) {
      return {
        winner: alive[0].agent?.slot || alive[0].villageId,
        reason: 'elimination',
        margin: alive[0].compositeScore,
        winnerName: alive[0].villageName
      };
    }

    const sorted = [...snapshots].sort((a, b) => b.compositeScore - a.compositeScore);
    const margin = sorted[0].compositeScore - (sorted[1]?.compositeScore || 0);
    const winner = margin === 0 ? 'draw' : sorted[0].agent?.slot || sorted[0].villageId;

    return {
      winner,
      reason: margin === 0 ? 'tie_score' : 'multi_metric_composite',
      margin: Math.round(margin * 10) / 10,
      winnerName: sorted[0].villageName,
      scores: sorted.map((s) => ({
        slot: s.agent?.slot,
        name: s.villageName,
        compositeScore: s.compositeScore,
        metrics: s.metrics
      }))
    };
  }
}

/**
 * Runs headless benchmark simulations and emits JSON reports.
 */
class BenchmarkRunner {
  /**
   * @param {object} game - Game instance in benchmarkMode
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Build agent from config entry.
   * @param {object} agentConfig
   * @returns {object}
   */
  static createAgent(agentConfig = {}) {
    if (agentConfig.type === 'baseline' || agentConfig.type === 'heuristic') {
      return new BaselineAgent({
        name: agentConfig.name || 'baseline-heuristic',
        strategy: agentConfig.strategy || 'balanced'
      });
    }

    const llm = new LLMManager();
    llm.config = {
      llm: {
        endpoint: agentConfig.endpoint || 'https://api.openai.com/v1',
        model: agentConfig.model || 'gpt-4o-mini',
        apiKey: agentConfig.apiKey || '',
        maxTokens: agentConfig.maxTokens || 500,
        temperature: agentConfig.temperature ?? 0.4
      }
    };
    return {
      type: 'llm',
      name: agentConfig.name || agentConfig.model || 'llm-agent',
      llm,
      stats: {
        calls: 0,
        diplomacyCalls: 0,
        failures: 0,
        actionsGenerated: 0,
        actionsApplied: 0,
        totalLatencyMs: 0
      }
    };
  }

  /**
   * Attach agents to villages by slot (A = villages[0], B = villages[1]).
   * @param {object} config
   */
  setupAgents(config) {
    this.game.benchmarkAgents = {};
    this.game.benchmarkAgentMeta = {};

    const slots = [
      { key: 'agentA', slot: 'A', index: 0 },
      { key: 'agentB', slot: 'B', index: 1 }
    ];

    for (const { key, slot, index } of slots) {
      const village = this.game.villages[index];
      if (!village) continue;
      const agentConfig = config[key] || config.agents?.[slot] || { type: 'baseline' };
      const agent = BenchmarkRunner.createAgent(agentConfig);
      this.game.benchmarkAgents[village.id] = agent;
      this.game.benchmarkAgentMeta[village.id] = {
        slot,
        type: agent.type || 'llm',
        name: agent.name || agentConfig.name || key,
        model: agentConfig.model || null,
        endpoint: agentConfig.endpoint || null,
        strategy: agentConfig.strategy || null
      };
    }
  }

  /**
   * Apply named stress scenario after headless init (mutates game state).
   * @param {string|object} scenario
   */
  applyScenario(scenario) {
    if (!scenario) return;
    const id = typeof scenario === 'string' ? scenario : scenario.id;
    if (typeof BenchmarkScenarios !== 'undefined' && BenchmarkScenarios.apply) {
      BenchmarkScenarios.apply(this.game, id, typeof scenario === 'object' ? scenario : {});
    }
  }

  /**
   * Run benchmark until target day or elimination.
   * @param {object} config
   * @returns {Promise<object>}
   */
  async run(config) {
    const startedAt = Date.now();
    const targetDays = config.days || 30;
    const seed = config.seed ?? 4242;
    const tickMs = config.tickIntervalMs || 5000;
    const dayLengthMs = config.dayLengthMs || 60000;
    const maxTicks = config.maxTicks || Math.ceil((targetDays * dayLengthMs) / tickMs) + 50;
    const easyNeeds = config.easyNeeds === true;
    const allowAutonomousBuild = config.allowAutonomousBuild === true;

    await this.game.initializeHeadless({
      seed,
      dayLengthMs,
      tickIntervalMs: tickMs,
      skipBackstories: true,
      easyNeeds,
      allowAutonomousBuild
    });

    this.setupAgents(config);
    this.applyScenario(config.scenario);

    const dailySnapshots = [];
    let ticks = 0;
    let lastRecordedDay = 0;

    while (this.game.timeState.day <= targetDays && ticks < maxTicks) {
      await this.game.runHeadlessTick(tickMs);
      ticks += 1;

      if (this.game.timeState.day > lastRecordedDay) {
        lastRecordedDay = this.game.timeState.day;
        dailySnapshots.push(this.captureSnapshot(lastRecordedDay));
      }

      const alive = this.game.villages.filter(
        (v) => this.game.getVillagersForVillage(v.id).length > 0
      );
      if (alive.length <= 1 && this.game.villages.length > 1) {
        break;
      }
    }

    const finalSnapshots = this.game.villages.map((v) => {
      const agent = this.game.benchmarkAgents[v.id];
      const stats = agent?.stats || agent?.llm ? this.collectAgentStats(agent) : {};
      return BenchmarkScorer.scoreVillage(
        v,
        this.game,
        this.game.benchmarkAgentMeta[v.id],
        stats
      );
    });

    if (this.game.villages.length === 2) {
      const [a, b] = this.game.villages;
      finalSnapshots[0].relationToRival = a.relations[b.id] ?? 0;
      finalSnapshots[1].relationToRival = b.relations[a.id] ?? 0;
    }

    const outcome = BenchmarkScorer.determineWinner(finalSnapshots, this.game);

    return {
      version: CONSTANTS.VERSION,
      mode: 'llm_vs_opponent',
      seed,
      targetDays,
      daysSimulated: this.game.timeState.day,
      ticksExecuted: ticks,
      durationMs: Date.now() - startedAt,
      easyNeeds,
      allowAutonomousBuild,
      scenario: config.scenario || null,
      outcome,
      agents: finalSnapshots.map((s) => ({
        slot: s.agent?.slot,
        type: s.agent?.type,
        name: s.agent?.name,
        model: s.agent?.model,
        strategy: s.agent?.strategy
      })),
      dailySnapshots,
      final: finalSnapshots,
      benchmarkEvents: this.game.benchmarkEvents || []
    };
  }

  /**
   * Capture mid-run snapshot for a given day.
   * @param {number} day
   * @returns {object}
   */
  captureSnapshot(day) {
    return {
      day,
      villages: this.game.villages.map((v) => {
        const scored = BenchmarkScorer.scoreVillage(
          v,
          this.game,
          this.game.benchmarkAgentMeta[v.id]
        );
        return {
          villageId: v.id,
          name: v.name,
          slot: this.game.benchmarkAgentMeta[v.id]?.slot,
          population: scored.population,
          resourceScore: scored.resourceScore,
          compositeScore: scored.compositeScore,
          metrics: scored.metrics
        };
      })
    };
  }

  /**
   * Normalize agent stats from LLM or baseline wrappers.
   * @param {object} agent
   * @returns {object}
   */
  collectAgentStats(agent) {
    if (agent.type === 'baseline') {
      return { ...agent.stats };
    }
    return { ...(agent.stats || {}) };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BenchmarkScorer, BenchmarkRunner };
}
