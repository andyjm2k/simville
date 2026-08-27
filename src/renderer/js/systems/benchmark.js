// Simville Benchmark — headless LLM vs opponent scoring and runner

/**
 * Computes comparable scores for benchmark villages.
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
   * Snapshot one village for reporting.
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
    const strength = village.calculateStrength(game.villagers);
    const resourceTotal = BenchmarkScorer.resourceScore(resources);

    return {
      villageId: village.id,
      villageName: village.name,
      agent: agentMeta,
      population,
      structures,
      strength: Math.round(strength * 10) / 10,
      resources: { ...resources },
      resourceScore: Math.round(resourceTotal * 10) / 10,
      compositeScore: Math.round((population * 12 + structures * 18 + resourceTotal + strength * 0.5) * 10) / 10,
      relationToRival: null,
      atWar: [...(village.atWarWith || [])],
      agentStats: { ...agentStats }
    };
  }

  /**
   * Determine winner from final snapshots.
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
      reason: margin === 0 ? 'tie_score' : 'composite_score',
      margin: Math.round(margin * 10) / 10,
      winnerName: sorted[0].villageName,
      scores: sorted.map((s) => ({
        slot: s.agent?.slot,
        name: s.villageName,
        compositeScore: s.compositeScore
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
      return new BaselineAgent({ name: agentConfig.name || 'baseline-heuristic' });
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
        endpoint: agentConfig.endpoint || null
      };
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

    await this.game.initializeHeadless({
      seed,
      dayLengthMs,
      tickIntervalMs: tickMs,
      skipBackstories: true
    });

    this.setupAgents(config);

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

      // Stop early if one village eliminated
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

    // Cross-fill rival relations
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
      outcome,
      agents: finalSnapshots.map((s) => ({
        slot: s.agent?.slot,
        type: s.agent?.type,
        name: s.agent?.name,
        model: s.agent?.model
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
        const resources = this.game.getResources(v.id);
        return {
          villageId: v.id,
          name: v.name,
          slot: this.game.benchmarkAgentMeta[v.id]?.slot,
          population: this.game.getVillagersForVillage(v.id).length,
          resourceScore: Math.round(BenchmarkScorer.resourceScore(resources) * 10) / 10,
          compositeScore: BenchmarkScorer.scoreVillage(
            v,
            this.game,
            this.game.benchmarkAgentMeta[v.id]
          ).compositeScore
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
