// Comparison and analysis tools for benchmark results

/**
 * Compare multiple benchmark runs and generate insights.
 */
class BenchmarkComparator {
  constructor(results = []) {
    this.results = results;
  }

  /**
   * Add a benchmark result to compare.
   * @param {object} result
   * @param {string} label - Optional label for this result
   */
  addResult(result, label = null) {
    this.results.push({
      label: label || `Run ${this.results.length + 1}`,
      data: result
    });
  }

  /**
   * Generate comparison report.
   * @returns {object}
   */
  compare() {
    if (this.results.length === 0) {
      return { error: 'No results to compare' };
    }

    return {
      summary: this.generateSummary(),
      winRates: this.calculateWinRates(),
      performanceMetrics: this.comparePerformance(),
      trajectories: this.compareTrajectories(),
      agentAnalysis: this.analyzeAgents()
    };
  }

  /**
   * Generate summary statistics.
   * @returns {object}
   */
  generateSummary() {
    return {
      totalRuns: this.results.length,
      avgDuration: this.calculateAverage(this.results.map(r => r.data.durationMs)),
      avgDaysSimulated: this.calculateAverage(this.results.map(r => r.data.daysSimulated)),
      avgTicksExecuted: this.calculateAverage(this.results.map(r => r.data.ticksExecuted || 0))
    };
  }

  /**
   * Calculate win rates for each agent.
   * @returns {object}
   */
  calculateWinRates() {
    const wins = {};
    const total = this.results.length;

    for (const result of this.results) {
      const winner = result.data.outcome?.winner;
      if (winner && winner !== 'draw') {
        wins[winner] = (wins[winner] || 0) + 1;
      }
    }

    const winRates = {};
    for (const [agent, count] of Object.entries(wins)) {
      winRates[agent] = {
        wins: count,
        total,
        rate: (count / total * 100).toFixed(1) + '%'
      };
    }

    return winRates;
  }

  /**
   * Compare performance metrics across runs.
   * @returns {object}
   */
  comparePerformance() {
    const metrics = {
      finalScores: {},
      populations: {},
      resources: {}
    };

    for (const result of this.results) {
      if (!result.data.final) continue;

      for (const village of result.data.final) {
        const agent = village.agent?.slot || village.villageName;
        
        if (!metrics.finalScores[agent]) {
          metrics.finalScores[agent] = [];
          metrics.populations[agent] = [];
          metrics.resources[agent] = [];
        }

        metrics.finalScores[agent].push(village.compositeScore);
        metrics.populations[agent].push(village.population);
        metrics.resources[agent].push(village.resourceScore || 0);
      }
    }

    // Calculate statistics for each agent
    const stats = {};
    for (const agent of Object.keys(metrics.finalScores)) {
      stats[agent] = {
        score: this.calculateStats(metrics.finalScores[agent]),
        population: this.calculateStats(metrics.populations[agent]),
        resources: this.calculateStats(metrics.resources[agent])
      };
    }

    return stats;
  }

  /**
   * Compare score trajectories across runs.
   * @returns {object}
   */
  compareTrajectories() {
    const trajectories = {};

    for (const result of this.results) {
      if (!result.data.dailySnapshots) continue;

      for (const snapshot of result.data.dailySnapshots) {
        const day = snapshot.day;
        if (!trajectories[day]) trajectories[day] = {};

        if (snapshot.villages) {
          for (const village of snapshot.villages) {
            const agent = village.slot || village.villageId;
            if (!trajectories[day][agent]) trajectories[day][agent] = [];
            trajectories[day][agent].push(village.compositeScore || 0);
          }
        }
      }
    }

    // Calculate average trajectory for each agent
    const avgTrajectories = {};
    for (const [day, agents] of Object.entries(trajectories)) {
      avgTrajectories[day] = {};
      for (const [agent, scores] of Object.entries(agents)) {
        avgTrajectories[day][agent] = this.calculateAverage(scores);
      }
    }

    return avgTrajectories;
  }

  /**
   * Analyze agent-specific patterns.
   * @returns {object}
   */
  analyzeAgents() {
    const agentData = {};

    for (const result of this.results) {
      if (!result.data.final) continue;

      for (const village of result.data.final) {
        const agent = village.agent?.name || village.agent?.slot || village.villageName;
        
        if (!agentData[agent]) {
          agentData[agent] = {
            type: village.agent?.type,
            model: village.agent?.model,
            runs: 0,
            apiCalls: [],
            failures: [],
            latencies: [],
            actionsApplied: []
          };
        }

        agentData[agent].runs++;

        const stats = village.agentStats || {};
        if (stats.calls !== undefined) agentData[agent].apiCalls.push(stats.calls);
        if (stats.failures !== undefined) agentData[agent].failures.push(stats.failures);
        if (stats.totalLatencyMs !== undefined && stats.calls > 0) {
          agentData[agent].latencies.push(stats.totalLatencyMs / stats.calls);
        }
        if (stats.actionsApplied !== undefined) {
          agentData[agent].actionsApplied.push(stats.actionsApplied);
        }
      }
    }

    // Calculate statistics
    const analysis = {};
    for (const [agent, data] of Object.entries(agentData)) {
      analysis[agent] = {
        type: data.type,
        model: data.model,
        runs: data.runs,
        avgApiCalls: this.calculateAverage(data.apiCalls),
        avgFailures: this.calculateAverage(data.failures),
        avgLatency: this.calculateAverage(data.latencies),
        avgActions: this.calculateAverage(data.actionsApplied),
        failureRate: data.apiCalls.length > 0 
          ? (this.calculateAverage(data.failures) / this.calculateAverage(data.apiCalls) * 100).toFixed(2) + '%'
          : 'N/A'
      };
    }

    return analysis;
  }

  /**
   * Calculate basic statistics for an array of numbers.
   * @param {Array<number>} values
   * @returns {object}
   */
  calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, min: 0, max: 0, stddev: 0, count: 0 };
    }

    const mean = this.calculateAverage(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const stddev = this.calculateStdDev(values, mean);

    return {
      mean: Math.round(mean * 100) / 100,
      min,
      max,
      stddev: Math.round(stddev * 100) / 100,
      count: values.length
    };
  }

  /**
   * Calculate average of array.
   * @param {Array<number>} values
   * @returns {number}
   */
  calculateAverage(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation.
   * @param {Array<number>} values
   * @param {number} mean
   * @returns {number}
   */
  calculateStdDev(values, mean) {
    if (!values || values.length === 0) return 0;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Generate comparison report in specified format.
   * @param {string} format - 'json', 'markdown', 'html'
   * @returns {string}
   */
  generateReport(format = 'json') {
    const comparison = this.compare();

    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        return this.generateMarkdownReport(comparison);
      case 'html':
        return this.generateHTMLReport(comparison);
      case 'json':
      default:
        return JSON.stringify(comparison, null, 2);
    }
  }

  /**
   * Generate markdown comparison report.
   * @param {object} comparison
   * @returns {string}
   */
  generateMarkdownReport(comparison) {
    let md = '# Benchmark Comparison Report\n\n';
    
    md += `## Summary\n\n`;
    md += `- **Total Runs:** ${comparison.summary.totalRuns}\n`;
    md += `- **Average Duration:** ${Math.round(comparison.summary.avgDuration)}ms\n`;
    md += `- **Average Days Simulated:** ${Math.round(comparison.summary.avgDaysSimulated)}\n\n`;

    md += `## Win Rates\n\n`;
    md += `| Agent | Wins | Total | Win Rate |\n`;
    md += `|-------|------|-------|----------|\n`;
    for (const [agent, stats] of Object.entries(comparison.winRates)) {
      md += `| ${agent} | ${stats.wins} | ${stats.total} | ${stats.rate} |\n`;
    }
    md += `\n`;

    md += `## Performance Metrics\n\n`;
    for (const [agent, metrics] of Object.entries(comparison.performanceMetrics)) {
      md += `### ${agent}\n\n`;
      md += `**Composite Score:**\n`;
      md += `- Mean: ${metrics.score.mean}\n`;
      md += `- Min: ${metrics.score.min}\n`;
      md += `- Max: ${metrics.score.max}\n`;
      md += `- StdDev: ${metrics.score.stddev}\n\n`;

      md += `**Population:**\n`;
      md += `- Mean: ${metrics.population.mean}\n`;
      md += `- Min: ${metrics.population.min}\n`;
      md += `- Max: ${metrics.population.max}\n\n`;
    }

    md += `## Agent Analysis\n\n`;
    md += `| Agent | Type | Runs | Avg API Calls | Avg Latency | Failure Rate |\n`;
    md += `|-------|------|------|---------------|-------------|-------------|\n`;
    for (const [agent, analysis] of Object.entries(comparison.agentAnalysis)) {
      md += `| ${agent} | ${analysis.type || 'N/A'} | ${analysis.runs} | `;
      md += `${Math.round(analysis.avgApiCalls)} | ${Math.round(analysis.avgLatency)}ms | `;
      md += `${analysis.failureRate} |\n`;
    }
    md += `\n`;

    return md;
  }

  /**
   * Generate HTML comparison report.
   * @param {object} comparison
   * @returns {string}
   */
  generateHTMLReport(comparison) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Benchmark Comparison</title>
  <style>
    body { font-family: sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; }
    h2 { color: #34495e; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { background: #34495e; color: white; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat-card { background: #ecf0f1; padding: 15px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Benchmark Comparison Report</h1>
  
  <h2>Summary</h2>
  <div class="stat-grid">
    <div class="stat-card"><strong>Total Runs:</strong> ${comparison.summary.totalRuns}</div>
    <div class="stat-card"><strong>Avg Duration:</strong> ${Math.round(comparison.summary.avgDuration)}ms</div>
    <div class="stat-card"><strong>Avg Days:</strong> ${Math.round(comparison.summary.avgDaysSimulated)}</div>
  </div>
  
  <h2>Win Rates</h2>
  <table>
    <tr><th>Agent</th><th>Wins</th><th>Total</th><th>Win Rate</th></tr>
    ${Object.entries(comparison.winRates).map(([agent, stats]) => 
      `<tr><td>${agent}</td><td>${stats.wins}</td><td>${stats.total}</td><td>${stats.rate}</td></tr>`
    ).join('')}
  </table>
  
  <h2>Agent Analysis</h2>
  <table>
    <tr><th>Agent</th><th>Type</th><th>Runs</th><th>Avg API Calls</th><th>Avg Latency</th><th>Failure Rate</th></tr>
    ${Object.entries(comparison.agentAnalysis).map(([agent, analysis]) => 
      `<tr><td>${agent}</td><td>${analysis.type || 'N/A'}</td><td>${analysis.runs}</td>` +
      `<td>${Math.round(analysis.avgApiCalls)}</td><td>${Math.round(analysis.avgLatency)}ms</td>` +
      `<td>${analysis.failureRate}</td></tr>`
    ).join('')}
  </table>
</body>
</html>`;
  }
}

/**
 * Aggregate statistics from batch/sweep results.
 */
class BatchAnalyzer {
  /**
   * Analyze batch results with grouping.
   * @param {object} batchResult - Result from BatchRunner
   * @param {object} options - Analysis options
   * @returns {object}
   */
  static analyze(batchResult, options = {}) {
    const groupBy = options.groupBy || null; // null, 'agent', 'seed', 'temperature', etc.
    
    const analysis = {
      overview: this.generateOverview(batchResult),
      groups: groupBy ? this.groupResults(batchResult, groupBy) : null,
      comparison: this.compareAllRuns(batchResult),
      failures: this.analyzeFailures(batchResult)
    };

    return analysis;
  }

  /**
   * Generate overview statistics.
   * @param {object} batchResult
   * @returns {object}
   */
  static generateOverview(batchResult) {
    return {
      total: batchResult.total || 0,
      completed: batchResult.completed || 0,
      failed: batchResult.failed || 0,
      successRate: batchResult.total > 0 
        ? ((batchResult.completed / batchResult.total) * 100).toFixed(1) + '%'
        : 'N/A',
      totalDuration: batchResult.durationMs || 0,
      avgDuration: batchResult.completed > 0
        ? Math.round((batchResult.durationMs || 0) / batchResult.completed)
        : 0
    };
  }

  /**
   * Group results by a parameter.
   * @param {object} batchResult
   * @param {string} groupBy
   * @returns {object}
   */
  static groupResults(batchResult, groupBy) {
    const groups = {};
    
    if (!batchResult.results) return groups;

    for (const job of batchResult.results) {
      if (job.status !== 'completed' || !job.result) continue;

      let groupKey;
      if (groupBy === 'agent') {
        groupKey = job.result.agents?.[0]?.name || 'unknown';
      } else if (groupBy.startsWith('metadata.')) {
        const path = groupBy.substring(9);
        groupKey = this.getNestedValue(job.metadata, path) || 'unknown';
      } else if (groupBy.startsWith('config.')) {
        const path = groupBy.substring(7);
        groupKey = this.getNestedValue(job.config, path) || 'unknown';
      } else {
        groupKey = job.config[groupBy] || 'unknown';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(job.result);
    }

    // Analyze each group
    const groupAnalysis = {};
    for (const [key, results] of Object.entries(groups)) {
      const comparator = new BenchmarkComparator();
      results.forEach((r, i) => comparator.addResult(r, `Run ${i + 1}`));
      groupAnalysis[key] = comparator.compare();
    }

    return groupAnalysis;
  }

  /**
   * Compare all completed runs.
   * @param {object} batchResult
   * @returns {object}
   */
  static compareAllRuns(batchResult) {
    if (!batchResult.results) return null;

    const comparator = new BenchmarkComparator();
    for (const job of batchResult.results) {
      if (job.status === 'completed' && job.result) {
        comparator.addResult(job.result, job.id);
      }
    }

    return comparator.compare();
  }

  /**
   * Analyze failure patterns.
   * @param {object} batchResult
   * @returns {object}
   */
  static analyzeFailures(batchResult) {
    if (!batchResult.failures || batchResult.failures.length === 0) {
      return { count: 0, patterns: {} };
    }

    const patterns = {};
    for (const failure of batchResult.failures) {
      const errorType = failure.error?.category?.type || 'unknown';
      if (!patterns[errorType]) {
        patterns[errorType] = {
          count: 0,
          examples: []
        };
      }
      patterns[errorType].count++;
      if (patterns[errorType].examples.length < 3) {
        patterns[errorType].examples.push({
          message: failure.error?.message,
          attempts: failure.attempts
        });
      }
    }

    return {
      count: batchResult.failures.length,
      patterns
    };
  }

  /**
   * Get nested value from object by path.
   * @param {object} obj
   * @param {string} path
   * @returns {any}
   */
  static getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  /**
   * Generate batch analysis report.
   * @param {object} batchResult
   * @param {string} format
   * @param {object} options
   * @returns {string}
   */
  static generateReport(batchResult, format = 'markdown', options = {}) {
    const analysis = this.analyze(batchResult, options);

    if (format === 'json') {
      return JSON.stringify(analysis, null, 2);
    }

    if (format === 'markdown' || format === 'md') {
      return this.generateMarkdownReport(analysis);
    }

    return JSON.stringify(analysis, null, 2);
  }

  /**
   * Generate markdown report for batch analysis.
   * @param {object} analysis
   * @returns {string}
   */
  static generateMarkdownReport(analysis) {
    let md = '# Batch Analysis Report\n\n';
    
    md += '## Overview\n\n';
    md += `- **Total Runs:** ${analysis.overview.total}\n`;
    md += `- **Completed:** ${analysis.overview.completed}\n`;
    md += `- **Failed:** ${analysis.overview.failed}\n`;
    md += `- **Success Rate:** ${analysis.overview.successRate}\n`;
    md += `- **Total Duration:** ${analysis.overview.totalDuration}ms\n`;
    md += `- **Avg Duration:** ${analysis.overview.avgDuration}ms\n\n`;

    if (analysis.failures.count > 0) {
      md += '## Failure Analysis\n\n';
      md += `**Total Failures:** ${analysis.failures.count}\n\n`;
      md += '| Error Type | Count | Example |\n';
      md += '|------------|-------|----------|\n';
      for (const [type, data] of Object.entries(analysis.failures.patterns)) {
        const example = data.examples[0]?.message || 'N/A';
        md += `| ${type} | ${data.count} | ${example.substring(0, 50)}... |\n`;
      }
      md += '\n';
    }

    if (analysis.comparison) {
      md += '## Overall Comparison\n\n';
      md += '### Win Rates\n\n';
      md += '| Agent | Wins | Total | Win Rate |\n';
      md += '|-------|------|-------|----------|\n';
      for (const [agent, stats] of Object.entries(analysis.comparison.winRates)) {
        md += `| ${agent} | ${stats.wins} | ${stats.total} | ${stats.rate} |\n`;
      }
      md += '\n';
    }

    return md;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BenchmarkComparator, BatchAnalyzer };
}
