// Advanced metrics for benchmark analysis

/**
 * Computes advanced performance metrics from benchmark results.
 * Provides efficiency, strategic, temporal, and statistical analysis.
 */
class AdvancedMetrics {
  constructor(result) {
    this.result = result;
    this.dailySnapshots = result.dailySnapshots || [];
    this.final = result.final || [];
    this.events = result.benchmarkEvents || [];
  }

  /**
   * Compute all advanced metrics.
   * @returns {object}
   */
  computeAll() {
    return {
      efficiency: this.computeEfficiencyMetrics(),
      combat: this.computeCombatMetrics(),
      economic: this.computeEconomicMetrics(),
      strategic: this.computeStrategicMetrics(),
      temporal: this.computeTemporalMetrics(),
      llmPerformance: this.computeLLMPerformanceMetrics(),
      statistical: this.computeStatisticalMetrics()
    };
  }

  /**
   * Efficiency metrics: resource/population ratios, growth rates, productivity.
   * @returns {object}
   */
  computeEfficiencyMetrics() {
    const metrics = {};

    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      const population = snapshot.population;
      const resources = snapshot.resources || {};
      
      const totalResources = Object.values(resources).reduce((sum, v) => sum + (v || 0), 0);
      const resourceScore = snapshot.resourceScore || 0;

      // Per-capita metrics
      metrics[villageId] = {
        resourcesPerVillager: population > 0 ? (totalResources / population).toFixed(2) : 0,
        resourceScorePerVillager: population > 0 ? (resourceScore / population).toFixed(2) : 0,
        structuresPerVillager: population > 0 ? (snapshot.structures / population).toFixed(3) : 0,
        strengthPerVillager: population > 0 ? (snapshot.strength / population).toFixed(2) : 0,
        
        // Growth rates
        populationGrowthRate: this.calculateGrowthRate(villageId, 'population'),
        resourceGrowthRate: this.calculateGrowthRate(villageId, 'resourceScore'),
        structureGrowthRate: this.calculateGrowthRate(villageId, 'structures'),
        
        // Overall efficiency score
        efficiencyScore: this.calculateEfficiencyScore(villageId)
      };
    }

    return metrics;
  }

  /**
   * Combat metrics: raid statistics, combat effectiveness, casualties.
   * @returns {object}
   */
  computeCombatMetrics() {
    const metrics = {};

    // Initialize metrics for each village
    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      metrics[villageId] = {
        raidsInitiated: 0,
        raidsReceived: 0,
        raidsWon: 0,
        raidsLost: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        casualtiesInflicted: 0,
        casualtiesSuffered: 0,
        raidSuccessRate: 0,
        raidDefenseRate: 0,
        combatEfficiency: 0
      };
    }

    // Analyze raid events
    const raidEvents = this.events.filter(e => 
      e.type === 'raid' || e.type === 'raid_result' || e.event === 'raid'
    );

    for (const event of raidEvents) {
      const attacker = event.attackerId || event.attacker;
      const defender = event.defenderId || event.defender;
      const success = event.success || event.result === 'success';
      const casualties = event.casualties || event.losses || 0;
      const stolen = event.resourcesStolen || event.stolen || {};
      const stolenValue = Object.values(stolen).reduce((sum, v) => sum + (v || 0), 0);

      if (metrics[attacker]) {
        metrics[attacker].raidsInitiated++;
        if (success) {
          metrics[attacker].raidsWon++;
          metrics[attacker].totalDamageDealt += stolenValue;
        } else {
          metrics[attacker].raidsLost++;
        }
        metrics[attacker].casualtiesSuffered += casualties;
      }

      if (metrics[defender]) {
        metrics[defender].raidsReceived++;
        if (!success) {
          // Defender successfully defended
          metrics[defender].casualtiesInflicted += casualties;
        } else {
          metrics[defender].totalDamageTaken += stolenValue;
          metrics[defender].casualtiesSuffered += casualties;
        }
      }
    }

    // Calculate rates and efficiency
    for (const villageId in metrics) {
      const m = metrics[villageId];
      m.raidSuccessRate = m.raidsInitiated > 0 
        ? ((m.raidsWon / m.raidsInitiated) * 100).toFixed(1) + '%'
        : 'N/A';
      
      m.raidDefenseRate = m.raidsReceived > 0
        ? (((m.raidsReceived - (m.raidsReceived - m.raidsInitiated + m.raidsLost)) / m.raidsReceived) * 100).toFixed(1) + '%'
        : 'N/A';
      
      m.combatEfficiency = m.casualtiesSuffered > 0
        ? (m.casualtiesInflicted / m.casualtiesSuffered).toFixed(2)
        : m.casualtiesInflicted > 0 ? 'Infinity' : 'N/A';
    }

    return metrics;
  }

  /**
   * Economic metrics: resource diversity, production rates, storage efficiency.
   * @returns {object}
   */
  computeEconomicMetrics() {
    const metrics = {};

    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      const resources = snapshot.resources || {};
      
      // Resource diversity (Shannon entropy)
      const diversity = this.calculateResourceDiversity(resources);
      
      // Resource composition
      const composition = this.calculateResourceComposition(resources);
      
      // Production rates (from historical snapshots)
      const productionRates = this.calculateProductionRates(villageId);

      metrics[villageId] = {
        resourceDiversity: diversity.toFixed(3),
        resourceTypes: Object.keys(resources).filter(k => resources[k] > 0).length,
        totalResourceValue: snapshot.resourceScore,
        composition,
        productionRates,
        economicHealth: this.calculateEconomicHealth(villageId)
      };
    }

    return metrics;
  }

  /**
   * Strategic metrics: decision quality, adaptation, behavior patterns.
   * @returns {object}
   */
  computeStrategicMetrics() {
    const metrics = {};

    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      const agentStats = snapshot.agentStats || {};
      
      metrics[villageId] = {
        agentType: snapshot.agent?.type,
        agentName: snapshot.agent?.name,
        
        // Decision metrics
        totalDecisions: agentStats.calls || 0,
        actionsGenerated: agentStats.actionsGenerated || 0,
        actionsApplied: agentStats.actionsApplied || 0,
        actionSuccessRate: agentStats.actionsGenerated > 0
          ? ((agentStats.actionsApplied / agentStats.actionsGenerated) * 100).toFixed(1) + '%'
          : 'N/A',
        
        // Diplomacy engagement
        diplomacyEngagement: agentStats.diplomacyCalls || 0,
        
        // Behavior analysis
        aggressiveness: this.calculateAggressiveness(villageId),
        economicFocus: this.calculateEconomicFocus(villageId),
        expansionRate: this.calculateExpansionRate(villageId),
        
        // Adaptation speed
        adaptationScore: this.calculateAdaptationScore(villageId)
      };
    }

    return metrics;
  }

  /**
   * Temporal analysis: early/mid/late game performance, momentum.
   * @returns {object}
   */
  computeTemporalMetrics() {
    if (this.dailySnapshots.length === 0) {
      return { error: 'No temporal data available' };
    }

    const totalDays = this.result.daysSimulated || this.dailySnapshots.length;
    const earlyGame = Math.floor(totalDays * 0.33);
    const midGame = Math.floor(totalDays * 0.66);

    const metrics = {};

    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      
      metrics[villageId] = {
        earlyGameScore: this.getAverageScoreInPeriod(villageId, 0, earlyGame),
        midGameScore: this.getAverageScoreInPeriod(villageId, earlyGame, midGame),
        lateGameScore: this.getAverageScoreInPeriod(villageId, midGame, totalDays),
        
        // Momentum indicators
        recentMomentum: this.calculateMomentum(villageId, Math.max(0, totalDays - 5), totalDays),
        overallTrend: this.calculateOverallTrend(villageId),
        
        // Performance consistency
        scoreVariance: this.calculateScoreVariance(villageId),
        consistencyScore: this.calculateConsistencyScore(villageId),
        
        // Critical moments
        peakPerformanceDay: this.findPeakPerformanceDay(villageId),
        lowestPerformanceDay: this.findLowestPerformanceDay(villageId),
        turningPoints: this.findTurningPoints(villageId)
      };
    }

    return metrics;
  }

  /**
   * LLM performance metrics: latency, tokens, costs, reliability.
   * @returns {object}
   */
  computeLLMPerformanceMetrics() {
    const metrics = {};

    for (const snapshot of this.final) {
      const villageId = snapshot.villageId;
      const agentStats = snapshot.agentStats || {};
      const agentType = snapshot.agent?.type;

      if (agentType !== 'llm') {
        metrics[villageId] = { type: 'baseline', note: 'No LLM metrics for baseline agents' };
        continue;
      }

      const calls = agentStats.calls || 0;
      const failures = agentStats.failures || 0;
      const totalLatency = agentStats.totalLatencyMs || 0;

      metrics[villageId] = {
        model: snapshot.agent?.model,
        
        // Reliability
        totalCalls: calls,
        successfulCalls: calls - failures,
        failedCalls: failures,
        successRate: calls > 0 ? ((1 - failures / calls) * 100).toFixed(1) + '%' : 'N/A',
        
        // Latency metrics
        totalLatencyMs: totalLatency,
        avgLatencyMs: calls > 0 ? Math.round(totalLatency / calls) : 0,
        latencyPerDay: this.result.daysSimulated > 0 
          ? Math.round(totalLatency / this.result.daysSimulated)
          : 0,
        
        // Estimated costs (rough approximation)
        estimatedTokens: this.estimateTokenUsage(agentStats),
        estimatedCostUSD: this.estimateCost(agentStats, snapshot.agent?.model),
        
        // Efficiency
        decisionsPerSecond: totalLatency > 0 
          ? ((calls * 1000) / totalLatency).toFixed(3)
          : 0,
        
        // Quality indicators
        failureRate: calls > 0 ? ((failures / calls) * 100).toFixed(1) + '%' : 'N/A',
        reliabilityScore: this.calculateReliabilityScore(agentStats)
      };
    }

    return metrics;
  }

  /**
   * Statistical metrics: effect sizes, confidence, significance.
   * @returns {object}
   */
  computeStatisticalMetrics() {
    if (this.final.length < 2) {
      return { note: 'Statistical comparison requires at least 2 villages' };
    }

    const scores = this.final.map(s => s.compositeScore);
    const populations = this.final.map(s => s.population);
    const resourceScores = this.final.map(s => s.resourceScore);

    return {
      scoreDifference: {
        absolute: Math.abs(scores[0] - scores[1]).toFixed(2),
        relative: scores[1] !== 0 ? (((scores[0] - scores[1]) / scores[1]) * 100).toFixed(1) + '%' : 'N/A',
        effectSize: this.calculateEffectSize(scores[0], scores[1])
      },
      
      populationDifference: {
        absolute: Math.abs(populations[0] - populations[1]),
        relative: populations[1] !== 0 ? (((populations[0] - populations[1]) / populations[1]) * 100).toFixed(1) + '%' : 'N/A'
      },
      
      resourceDifference: {
        absolute: Math.abs(resourceScores[0] - resourceScores[1]).toFixed(2),
        relative: resourceScores[1] !== 0 ? (((resourceScores[0] - resourceScores[1]) / resourceScores[1]) * 100).toFixed(1) + '%' : 'N/A'
      },
      
      dominance: this.calculateDominance(),
      competitiveness: this.calculateCompetitiveness()
    };
  }

  // ==================== Helper Methods ====================

  calculateGrowthRate(villageId, metric) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length < 2) return 0;

    const first = snapshots[0][metric] || 0;
    const last = snapshots[snapshots.length - 1][metric] || 0;
    
    if (first === 0) return last > 0 ? 'Infinity' : 0;
    
    const growthRate = ((last - first) / first) * 100;
    return growthRate.toFixed(2) + '%';
  }

  calculateEfficiencyScore(villageId) {
    const snapshot = this.final.find(s => s.villageId === villageId);
    if (!snapshot || snapshot.population === 0) return 0;

    const resourceEff = snapshot.resourceScore / snapshot.population;
    const structureEff = snapshot.structures / snapshot.population;
    const strengthEff = snapshot.strength / snapshot.population;

    // Weighted combination
    const score = (resourceEff * 0.4 + structureEff * 30 + strengthEff * 0.3);
    return score.toFixed(2);
  }

  calculateResourceDiversity(resources) {
    const values = Object.values(resources).filter(v => v > 0);
    if (values.length === 0) return 0;

    const total = values.reduce((sum, v) => sum + v, 0);
    const probabilities = values.map(v => v / total);
    
    // Shannon entropy
    const entropy = -probabilities.reduce((sum, p) => sum + (p * Math.log2(p)), 0);
    return entropy;
  }

  calculateResourceComposition(resources) {
    const total = Object.values(resources).reduce((sum, v) => sum + (v || 0), 0);
    if (total === 0) return {};

    const composition = {};
    for (const [key, value] of Object.entries(resources)) {
      if (value > 0) {
        composition[key] = ((value / total) * 100).toFixed(1) + '%';
      }
    }
    return composition;
  }

  calculateProductionRates(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length < 2) return {};

    const first = snapshots[0].resources || {};
    const last = snapshots[snapshots.length - 1].resources || {};
    const days = snapshots.length;

    const rates = {};
    for (const resource in last) {
      const produced = (last[resource] || 0) - (first[resource] || 0);
      if (produced > 0) {
        rates[resource] = (produced / days).toFixed(2);
      }
    }

    return rates;
  }

  calculateEconomicHealth(villageId) {
    const snapshot = this.final.find(s => s.villageId === villageId);
    if (!snapshot) return 0;

    const resources = snapshot.resources || {};
    const diversity = this.calculateResourceDiversity(resources);
    const totalResources = Object.values(resources).reduce((sum, v) => sum + (v || 0), 0);
    
    // Health score based on diversity and total resources
    const diversityScore = diversity * 20;
    const resourceScore = Math.min(totalResources / 100, 50);
    
    return (diversityScore + resourceScore).toFixed(2);
  }

  calculateAggressiveness(villageId) {
    const raidEvents = this.events.filter(e => 
      (e.attackerId === villageId || e.attacker === villageId) &&
      (e.type === 'raid' || e.event === 'raid')
    );
    
    return raidEvents.length;
  }

  calculateEconomicFocus(villageId) {
    const snapshot = this.final.find(s => s.villageId === villageId);
    if (!snapshot) return 0;

    // Economic focus = resources / (strength + structures)
    const denominator = snapshot.strength + snapshot.structures;
    if (denominator === 0) return 0;

    return (snapshot.resourceScore / denominator).toFixed(2);
  }

  calculateExpansionRate(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length === 0) return 0;

    const structures = snapshots[snapshots.length - 1].structures || 0;
    const days = snapshots.length;

    return (structures / days).toFixed(3);
  }

  calculateAdaptationScore(villageId) {
    // Measures how well the village responded to challenges
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length < 5) return 'N/A';

    let recoveries = 0;
    for (let i = 2; i < snapshots.length; i++) {
      const prev2 = snapshots[i - 2].compositeScore;
      const prev1 = snapshots[i - 1].compositeScore;
      const current = snapshots[i].compositeScore;

      // If score dropped then recovered
      if (prev1 < prev2 && current > prev1) {
        recoveries++;
      }
    }

    return recoveries;
  }

  getAverageScoreInPeriod(villageId, startDay, endDay) {
    const snapshots = this.getVillageSnapshots(villageId)
      .filter(s => s.day >= startDay && s.day <= endDay);
    
    if (snapshots.length === 0) return 0;

    const avgScore = snapshots.reduce((sum, s) => sum + s.compositeScore, 0) / snapshots.length;
    return avgScore.toFixed(2);
  }

  calculateMomentum(villageId, startDay, endDay) {
    const snapshots = this.getVillageSnapshots(villageId)
      .filter(s => s.day >= startDay && s.day <= endDay);
    
    if (snapshots.length < 2) return 'N/A';

    const firstScore = snapshots[0].compositeScore;
    const lastScore = snapshots[snapshots.length - 1].compositeScore;
    
    return lastScore - firstScore > 0 ? 'positive' : lastScore - firstScore < 0 ? 'negative' : 'neutral';
  }

  calculateOverallTrend(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length < 2) return 'N/A';

    // Simple linear regression slope
    const n = snapshots.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    snapshots.forEach((s, i) => {
      sumX += i;
      sumY += s.compositeScore;
      sumXY += i * s.compositeScore;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return slope > 0 ? 'improving' : slope < 0 ? 'declining' : 'stable';
  }

  calculateScoreVariance(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length === 0) return 0;

    const scores = snapshots.map(s => s.compositeScore);
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    
    return variance.toFixed(2);
  }

  calculateConsistencyScore(villageId) {
    const variance = parseFloat(this.calculateScoreVariance(villageId));
    // Lower variance = higher consistency
    // Normalize to 0-100 scale
    const consistency = Math.max(0, 100 - variance / 10);
    return consistency.toFixed(2);
  }

  findPeakPerformanceDay(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length === 0) return 'N/A';

    let maxScore = -Infinity;
    let peakDay = 0;

    snapshots.forEach(s => {
      if (s.compositeScore > maxScore) {
        maxScore = s.compositeScore;
        peakDay = s.day;
      }
    });

    return peakDay;
  }

  findLowestPerformanceDay(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length === 0) return 'N/A';

    let minScore = Infinity;
    let lowestDay = 0;

    snapshots.forEach(s => {
      if (s.compositeScore < minScore) {
        minScore = s.compositeScore;
        lowestDay = s.day;
      }
    });

    return lowestDay;
  }

  findTurningPoints(villageId) {
    const snapshots = this.getVillageSnapshots(villageId);
    if (snapshots.length < 3) return [];

    const turningPoints = [];

    for (let i = 1; i < snapshots.length - 1; i++) {
      const prev = snapshots[i - 1].compositeScore;
      const current = snapshots[i].compositeScore;
      const next = snapshots[i + 1].compositeScore;

      // Local maximum or minimum
      if ((current > prev && current > next) || (current < prev && current < next)) {
        turningPoints.push({
          day: snapshots[i].day,
          score: current,
          type: current > prev ? 'peak' : 'valley'
        });
      }
    }

    return turningPoints.slice(0, 5); // Return top 5
  }

  estimateTokenUsage(agentStats) {
    // Rough estimation: ~200 tokens per call (prompt + completion)
    const calls = agentStats.calls || 0;
    const estimatedTokens = calls * 200;
    return estimatedTokens;
  }

  estimateCost(agentStats, model) {
    const tokens = this.estimateTokenUsage(agentStats);
    
    // Rough pricing estimates (per 1M tokens)
    const pricing = {
      'gpt-4o': 2.50,
      'gpt-4o-mini': 0.15,
      'gpt-4-turbo': 10.00,
      'gpt-3.5-turbo': 0.50,
      'claude-3-opus': 15.00,
      'claude-3-sonnet': 3.00,
      'claude-3-haiku': 0.25
    };

    const pricePerMillion = pricing[model] || 1.00; // Default fallback
    const costUSD = (tokens / 1000000) * pricePerMillion;

    return '$' + costUSD.toFixed(4);
  }

  calculateReliabilityScore(agentStats) {
    const calls = agentStats.calls || 0;
    const failures = agentStats.failures || 0;
    
    if (calls === 0) return 0;
    
    const successRate = (calls - failures) / calls;
    return (successRate * 100).toFixed(1);
  }

  calculateEffectSize(value1, value2) {
    // Cohen's d approximation
    const mean1 = value1;
    const mean2 = value2;
    const pooledStd = Math.abs(mean1 - mean2) / 2; // Rough approximation
    
    if (pooledStd === 0) return 'N/A';
    
    const d = Math.abs(mean1 - mean2) / pooledStd;
    
    let interpretation = '';
    if (d < 0.2) interpretation = 'negligible';
    else if (d < 0.5) interpretation = 'small';
    else if (d < 0.8) interpretation = 'medium';
    else interpretation = 'large';
    
    return `${d.toFixed(2)} (${interpretation})`;
  }

  calculateDominance() {
    if (this.final.length < 2) return 'N/A';

    const scores = this.final.map(s => s.compositeScore);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    
    if (minScore === 0) return 'complete';
    
    const ratio = maxScore / minScore;
    
    if (ratio > 2) return 'strong';
    if (ratio > 1.5) return 'moderate';
    if (ratio > 1.2) return 'slight';
    return 'balanced';
  }

  calculateCompetitiveness() {
    if (this.final.length < 2) return 'N/A';

    const scores = this.final.map(s => s.compositeScore);
    const diff = Math.abs(scores[0] - scores[1]);
    const avg = (scores[0] + scores[1]) / 2;
    
    if (avg === 0) return 'N/A';
    
    const relativeDiff = diff / avg;
    
    if (relativeDiff < 0.1) return 'highly competitive';
    if (relativeDiff < 0.3) return 'competitive';
    if (relativeDiff < 0.6) return 'moderately competitive';
    return 'one-sided';
  }

  getVillageSnapshots(villageId) {
    return this.dailySnapshots
      .map(daySnapshot => {
        const villageData = Array.isArray(daySnapshot) 
          ? daySnapshot.find(v => v.villageId === villageId)
          : daySnapshot.villages?.find(v => v.villageId === villageId);
        
        return villageData ? { ...villageData, day: daySnapshot.day } : null;
      })
      .filter(s => s !== null);
  }
}

/**
 * Aggregates advanced metrics across multiple benchmark runs.
 */
class MetricsAggregator {
  constructor(results = []) {
    this.results = results;
  }

  /**
   * Aggregate metrics from multiple runs.
   * @param {string} category - Metric category to aggregate
   * @returns {object}
   */
  aggregate(category = 'all') {
    const allMetrics = this.results.map(result => {
      const metrics = new AdvancedMetrics(result);
      return category === 'all' ? metrics.computeAll() : metrics[`compute${this.capitalize(category)}Metrics`]();
    });

    return this.computeAggregateStats(allMetrics);
  }

  /**
   * Compute aggregate statistics (mean, min, max, stddev).
   * @param {Array} metricsList
   * @returns {object}
   */
  computeAggregateStats(metricsList) {
    // This would need more sophisticated aggregation logic
    // For now, return summary
    return {
      count: metricsList.length,
      summary: 'Aggregation across multiple runs',
      metrics: metricsList
    };
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdvancedMetrics, MetricsAggregator };
}
