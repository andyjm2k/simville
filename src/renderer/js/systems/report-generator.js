// Report generation in multiple formats: HTML, Markdown, CSV, JSON

/**
 * Base report generator with common utilities.
 */
class ReportGenerator {
  /**
   * Generate report in specified format.
   * @param {object} benchmarkResult - Result from BenchmarkRunner
   * @param {string} format - 'html', 'markdown', 'csv', 'json'
   * @param {object} options - Format-specific options
   * @returns {string}
   */
  static generate(benchmarkResult, format = 'html', options = {}) {
    switch (format.toLowerCase()) {
      case 'html':
        return HTMLReportGenerator.generate(benchmarkResult, options);
      case 'markdown':
      case 'md':
        return MarkdownReportGenerator.generate(benchmarkResult, options);
      case 'csv':
        return CSVReportGenerator.generate(benchmarkResult, options);
      case 'json':
        return JSON.stringify(benchmarkResult, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Save report to file.
   * @param {string} content - Report content
   * @param {string} filepath - Output path
   */
  static save(content, filepath) {
    if (typeof module === 'undefined' || !module.exports) {
      throw new Error('File saving only available in Node.js environment');
    }
    const fs = require('fs');
    const path = require('path');
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, content, 'utf8');
  }

  /**
   * Format duration in human-readable form.
   * @param {number} ms
   * @returns {string}
   */
  static formatDuration(ms) {
    if (!ms || ms < 0) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Format timestamp.
   * @param {number} timestamp
   * @returns {string}
   */
  static formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().replace('T', ' ').split('.')[0];
  }
}

/**
 * Generate HTML reports with embedded charts.
 */
class HTMLReportGenerator {
  static generate(result, options = {}) {
    const includeCharts = options.includeCharts !== false;
    const title = options.title || 'Simville Benchmark Report';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${this.getStyles()}
  </style>
  ${includeCharts ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>' : ''}
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="meta">
        <span>Generated: ${ReportGenerator.formatTimestamp(Date.now())}</span>
        <span>Duration: ${ReportGenerator.formatDuration(result.durationMs)}</span>
        <span>Version: ${result.version || 'N/A'}</span>
      </div>
    </header>

    ${this.generateSummarySection(result)}
    ${this.generateOutcomeSection(result)}
    ${this.generateAgentsSection(result)}
    ${includeCharts ? this.generateChartsSection(result) : ''}
    ${this.generateDailySnapshotsTable(result)}
    ${this.generateEventsSection(result)}
    ${this.generateFinalStateSection(result)}
  </div>

  ${includeCharts ? this.generateChartScripts(result) : ''}
</body>
</html>`;
  }

  static getStyles() {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        background: #f5f5f5;
        color: #333;
        line-height: 1.6;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      header {
        border-bottom: 3px solid #4CAF50;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      h1 {
        color: #2c3e50;
        font-size: 2.5em;
        margin-bottom: 10px;
      }
      h2 {
        color: #34495e;
        margin: 30px 0 15px 0;
        padding-bottom: 10px;
        border-bottom: 2px solid #ecf0f1;
      }
      h3 {
        color: #7f8c8d;
        margin: 20px 0 10px 0;
      }
      .meta {
        display: flex;
        gap: 20px;
        font-size: 0.9em;
        color: #7f8c8d;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 20px 0;
      }
      .stat-card {
        background: #ecf0f1;
        padding: 15px;
        border-radius: 8px;
        border-left: 4px solid #3498db;
      }
      .stat-card.winner { border-color: #4CAF50; background: #e8f5e9; }
      .stat-card.loser { border-color: #f44336; background: #ffebee; }
      .stat-label {
        font-size: 0.85em;
        color: #7f8c8d;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .stat-value {
        font-size: 1.8em;
        font-weight: bold;
        color: #2c3e50;
        margin-top: 5px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #ecf0f1;
      }
      th {
        background: #34495e;
        color: white;
        font-weight: 600;
      }
      tr:hover {
        background: #f8f9fa;
      }
      .winner-badge {
        display: inline-block;
        padding: 4px 12px;
        background: #4CAF50;
        color: white;
        border-radius: 12px;
        font-size: 0.85em;
        font-weight: bold;
      }
      .chart-container {
        position: relative;
        height: 400px;
        margin: 30px 0;
      }
      .agent-card {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        margin: 15px 0;
      }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.8em;
        font-weight: bold;
      }
      .badge-llm { background: #3498db; color: white; }
      .badge-baseline { background: #95a5a6; color: white; }
      .event-item {
        padding: 10px;
        margin: 5px 0;
        background: #f8f9fa;
        border-left: 3px solid #3498db;
        border-radius: 4px;
      }
      .event-raid { border-color: #e74c3c; }
      .event-diplomacy { border-color: #f39c12; }
    `;
  }

  static generateSummarySection(result) {
    return `
    <section class="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="stat-card">
          <div class="stat-label">Seed</div>
          <div class="stat-value">${result.seed || 'N/A'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Target Days</div>
          <div class="stat-value">${result.targetDays || 'N/A'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Days Simulated</div>
          <div class="stat-value">${result.daysSimulated}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Duration</div>
          <div class="stat-value">${ReportGenerator.formatDuration(result.durationMs)}</div>
        </div>
      </div>
    </section>`;
  }

  static generateOutcomeSection(result) {
    const outcome = result.outcome || {};
    return `
    <section class="outcome">
      <h2>Outcome</h2>
      <div class="summary-grid">
        <div class="stat-card winner">
          <div class="stat-label">Winner</div>
          <div class="stat-value">${outcome.winner || 'N/A'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Reason</div>
          <div class="stat-value" style="font-size: 1.2em;">${outcome.reason || 'N/A'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Margin</div>
          <div class="stat-value">${outcome.margin !== undefined ? outcome.margin.toFixed(1) : 'N/A'}</div>
        </div>
      </div>
    </section>`;
  }

  static generateAgentsSection(result) {
    if (!result.final || result.final.length === 0) return '';
    
    let html = '<section class="agents"><h2>Agents</h2>';
    
    for (const village of result.final) {
      const agent = village.agent || {};
      const isWinner = result.outcome?.winner === agent.slot;
      
      html += `
      <div class="agent-card ${isWinner ? 'winner' : ''}">
        <h3>
          ${agent.slot ? `Agent ${agent.slot}` : village.villageName}
          ${isWinner ? '<span class="winner-badge">WINNER</span>' : ''}
        </h3>
        <div class="summary-grid">
          <div>
            <strong>Type:</strong> <span class="badge badge-${agent.type}">${agent.type || 'N/A'}</span>
          </div>
          <div><strong>Name:</strong> ${agent.name || 'N/A'}</div>
          <div><strong>Model:</strong> ${agent.model || 'N/A'}</div>
        </div>
        <div class="summary-grid" style="margin-top: 15px;">
          <div class="stat-card">
            <div class="stat-label">Population</div>
            <div class="stat-value">${village.population}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Structures</div>
            <div class="stat-value">${village.structures}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Strength</div>
            <div class="stat-value">${village.strength}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Composite Score</div>
            <div class="stat-value">${village.compositeScore}</div>
          </div>
        </div>
        ${this.generateAgentStats(village.agentStats)}
      </div>`;
    }
    
    html += '</section>';
    return html;
  }

  static generateAgentStats(stats) {
    if (!stats || Object.keys(stats).length === 0) return '';
    
    return `
    <div style="margin-top: 15px;">
      <strong>Performance:</strong>
      <div class="summary-grid" style="margin-top: 10px;">
        ${stats.calls !== undefined ? `
        <div class="stat-card">
          <div class="stat-label">API Calls</div>
          <div class="stat-value" style="font-size: 1.4em;">${stats.calls}</div>
        </div>` : ''}
        ${stats.failures !== undefined ? `
        <div class="stat-card">
          <div class="stat-label">Failures</div>
          <div class="stat-value" style="font-size: 1.4em;">${stats.failures}</div>
        </div>` : ''}
        ${stats.totalLatencyMs !== undefined ? `
        <div class="stat-card">
          <div class="stat-label">Avg Latency</div>
          <div class="stat-value" style="font-size: 1.4em;">${stats.calls > 0 ? Math.round(stats.totalLatencyMs / stats.calls) : 0}ms</div>
        </div>` : ''}
        ${stats.actionsApplied !== undefined ? `
        <div class="stat-card">
          <div class="stat-label">Actions</div>
          <div class="stat-value" style="font-size: 1.4em;">${stats.actionsApplied}</div>
        </div>` : ''}
      </div>
    </div>`;
  }

  static generateChartsSection(result) {
    return `
    <section class="charts">
      <h2>Visualizations</h2>
      <div class="chart-container">
        <canvas id="scoreChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="populationChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="resourceChart"></canvas>
      </div>
    </section>`;
  }

  static generateDailySnapshotsTable(result) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) return '';
    
    let html = `
    <section class="daily-snapshots">
      <h2>Daily Progress</h2>
      <table>
        <thead>
          <tr>
            <th>Day</th>`;
    
    // Get village slots from first snapshot
    const firstSnapshot = result.dailySnapshots[0];
    if (firstSnapshot.villages) {
      firstSnapshot.villages.forEach(v => {
        html += `<th>${v.name || v.slot || v.villageId} - Population</th>`;
        html += `<th>${v.name || v.slot || v.villageId} - Score</th>`;
      });
    }
    
    html += `</tr></thead><tbody>`;
    
    for (const snapshot of result.dailySnapshots) {
      html += `<tr><td><strong>Day ${snapshot.day}</strong></td>`;
      
      if (snapshot.villages) {
        snapshot.villages.forEach(v => {
          html += `<td>${v.population}</td>`;
          html += `<td>${v.compositeScore?.toFixed(1) || 'N/A'}</td>`;
        });
      }
      
      html += '</tr>';
    }
    
    html += '</tbody></table></section>';
    return html;
  }

  static generateEventsSection(result) {
    if (!result.benchmarkEvents || result.benchmarkEvents.length === 0) return '';
    
    let html = '<section class="events"><h2>Key Events</h2>';
    
    for (const event of result.benchmarkEvents) {
      const eventClass = event.type === 'raid' ? 'event-raid' : 
                        event.type === 'diplomacy' ? 'event-diplomacy' : '';
      html += `
      <div class="event-item ${eventClass}">
        <strong>Day ${event.day || 'N/A'}</strong> - ${event.type || 'Unknown'}
        <div>${JSON.stringify(event.data || {})}</div>
      </div>`;
    }
    
    html += '</section>';
    return html;
  }

  static generateFinalStateSection(result) {
    if (!result.final || result.final.length === 0) return '';
    
    let html = '<section class="final-state"><h2>Final State</h2><table><thead><tr>';
    html += '<th>Village</th><th>Population</th><th>Structures</th><th>Strength</th>';
    html += '<th>Resources</th><th>Composite Score</th></tr></thead><tbody>';
    
    for (const village of result.final) {
      html += `<tr>
        <td><strong>${village.villageName}</strong></td>
        <td>${village.population}</td>
        <td>${village.structures}</td>
        <td>${village.strength}</td>
        <td>${village.resourceScore?.toFixed(1) || 'N/A'}</td>
        <td><strong>${village.compositeScore}</strong></td>
      </tr>`;
    }
    
    html += '</tbody></table></section>';
    return html;
  }

  static generateChartScripts(result) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) return '';
    
    // Prepare data for charts
    const days = result.dailySnapshots.map(s => s.day);
    const villageData = {};
    
    if (result.dailySnapshots[0].villages) {
      result.dailySnapshots[0].villages.forEach(v => {
        const key = v.slot || v.villageId;
        villageData[key] = {
          name: v.name || v.slot || v.villageId,
          scores: [],
          populations: [],
          resources: []
        };
      });
      
      for (const snapshot of result.dailySnapshots) {
        snapshot.villages.forEach(v => {
          const key = v.slot || v.villageId;
          if (villageData[key]) {
            villageData[key].scores.push(v.compositeScore || 0);
            villageData[key].populations.push(v.population || 0);
            villageData[key].resources.push(v.resourceScore || 0);
          }
        });
      }
    }
    
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12'];
    const datasets = Object.keys(villageData).map((key, idx) => ({
      label: villageData[key].name,
      data: villageData[key].scores,
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length] + '20',
      tension: 0.1
    }));
    
    const populationDatasets = Object.keys(villageData).map((key, idx) => ({
      label: villageData[key].name,
      data: villageData[key].populations,
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length] + '20',
      tension: 0.1
    }));
    
    const resourceDatasets = Object.keys(villageData).map((key, idx) => ({
      label: villageData[key].name,
      data: villageData[key].resources,
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length] + '20',
      tension: 0.1
    }));
    
    return `
  <script>
    // Composite Score Chart
    new Chart(document.getElementById('scoreChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(days)},
        datasets: ${JSON.stringify(datasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Composite Score Over Time' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    
    // Population Chart
    new Chart(document.getElementById('populationChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(days)},
        datasets: ${JSON.stringify(populationDatasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Population Over Time' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    
    // Resource Score Chart
    new Chart(document.getElementById('resourceChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(days)},
        datasets: ${JSON.stringify(resourceDatasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Resource Score Over Time' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  </script>`;
  }
}

/**
 * Generate Markdown reports for documentation and GitHub.
 */
class MarkdownReportGenerator {
  static generate(result, options = {}) {
    const title = options.title || 'Simville Benchmark Report';
    
    let md = `# ${title}\n\n`;
    md += `**Generated:** ${ReportGenerator.formatTimestamp(Date.now())}  \n`;
    md += `**Duration:** ${ReportGenerator.formatDuration(result.durationMs)}  \n`;
    md += `**Version:** ${result.version || 'N/A'}\n\n`;
    
    md += this.generateSummarySection(result);
    md += this.generateOutcomeSection(result);
    md += this.generateAgentsSection(result);
    md += this.generateFinalStateSection(result);
    md += this.generateDailyProgressSection(result);
    md += this.generateEventsSection(result);
    
    return md;
  }

  static generateSummarySection(result) {
    return `## Summary\n\n` +
      `| Metric | Value |\n` +
      `|--------|-------|\n` +
      `| Seed | ${result.seed || 'N/A'} |\n` +
      `| Target Days | ${result.targetDays || 'N/A'} |\n` +
      `| Days Simulated | ${result.daysSimulated} |\n` +
      `| Ticks Executed | ${result.ticksExecuted || 'N/A'} |\n` +
      `| Duration | ${ReportGenerator.formatDuration(result.durationMs)} |\n\n`;
  }

  static generateOutcomeSection(result) {
    const outcome = result.outcome || {};
    return `## Outcome\n\n` +
      `**Winner:** ${outcome.winner || 'N/A'}  \n` +
      `**Reason:** ${outcome.reason || 'N/A'}  \n` +
      `**Margin:** ${outcome.margin !== undefined ? outcome.margin.toFixed(1) : 'N/A'}  \n\n`;
  }

  static generateAgentsSection(result) {
    if (!result.final || result.final.length === 0) return '';
    
    let md = `## Agents\n\n`;
    
    for (const village of result.final) {
      const agent = village.agent || {};
      const isWinner = result.outcome?.winner === agent.slot;
      
      md += `### ${agent.slot ? `Agent ${agent.slot}` : village.villageName}`;
      if (isWinner) md += ` 🏆 WINNER`;
      md += `\n\n`;
      
      md += `- **Type:** ${agent.type || 'N/A'}\n`;
      md += `- **Name:** ${agent.name || 'N/A'}\n`;
      md += `- **Model:** ${agent.model || 'N/A'}\n\n`;
      
      md += `**Final State:**\n\n`;
      md += `| Metric | Value |\n`;
      md += `|--------|-------|\n`;
      md += `| Population | ${village.population} |\n`;
      md += `| Structures | ${village.structures} |\n`;
      md += `| Strength | ${village.strength} |\n`;
      md += `| Resource Score | ${village.resourceScore?.toFixed(1) || 'N/A'} |\n`;
      md += `| Composite Score | ${village.compositeScore} |\n\n`;
      
      if (village.agentStats && Object.keys(village.agentStats).length > 0) {
        md += `**Performance:**\n\n`;
        const stats = village.agentStats;
        if (stats.calls !== undefined) md += `- API Calls: ${stats.calls}\n`;
        if (stats.failures !== undefined) md += `- Failures: ${stats.failures}\n`;
        if (stats.totalLatencyMs !== undefined && stats.calls > 0) {
          md += `- Avg Latency: ${Math.round(stats.totalLatencyMs / stats.calls)}ms\n`;
        }
        if (stats.actionsApplied !== undefined) md += `- Actions Applied: ${stats.actionsApplied}\n`;
        md += `\n`;
      }
    }
    
    return md;
  }

  static generateFinalStateSection(result) {
    if (!result.final || result.final.length === 0) return '';
    
    let md = `## Final State Comparison\n\n`;
    md += `| Village | Population | Structures | Strength | Resources | Composite |\n`;
    md += `|---------|------------|------------|----------|-----------|----------|\n`;
    
    for (const village of result.final) {
      md += `| ${village.villageName} | ${village.population} | ${village.structures} | `;
      md += `${village.strength} | ${village.resourceScore?.toFixed(1) || 'N/A'} | `;
      md += `**${village.compositeScore}** |\n`;
    }
    
    md += `\n`;
    return md;
  }

  static generateDailyProgressSection(result) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) return '';
    
    let md = `## Daily Progress\n\n`;
    
    // Sample every N days if too many
    const snapshots = result.dailySnapshots.length > 20 
      ? result.dailySnapshots.filter((_, i) => i % Math.ceil(result.dailySnapshots.length / 20) === 0)
      : result.dailySnapshots;
    
    md += `| Day |`;
    if (snapshots[0].villages) {
      snapshots[0].villages.forEach(v => {
        md += ` ${v.name || v.slot} Pop | ${v.name || v.slot} Score |`;
      });
    }
    md += `\n|-----|`;
    if (snapshots[0].villages) {
      snapshots[0].villages.forEach(() => md += `----------|--------------|`);
    }
    md += `\n`;
    
    for (const snapshot of snapshots) {
      md += `| **${snapshot.day}** |`;
      if (snapshot.villages) {
        snapshot.villages.forEach(v => {
          md += ` ${v.population} | ${v.compositeScore?.toFixed(1) || 'N/A'} |`;
        });
      }
      md += `\n`;
    }
    
    md += `\n`;
    return md;
  }

  static generateEventsSection(result) {
    if (!result.benchmarkEvents || result.benchmarkEvents.length === 0) return '';
    
    let md = `## Key Events\n\n`;
    
    for (const event of result.benchmarkEvents) {
      md += `- **Day ${event.day || 'N/A'}** - ${event.type || 'Unknown'}: `;
      md += `${JSON.stringify(event.data || {})}\n`;
    }
    
    md += `\n`;
    return md;
  }
}

/**
 * Generate CSV reports for external analysis.
 */
class CSVReportGenerator {
  static generate(result, options = {}) {
    const format = options.format || 'daily'; // 'daily', 'final', 'events'
    
    switch (format) {
      case 'daily':
        return this.generateDailyCSV(result);
      case 'final':
        return this.generateFinalCSV(result);
      case 'events':
        return this.generateEventsCSV(result);
      case 'all':
        return {
          daily: this.generateDailyCSV(result),
          final: this.generateFinalCSV(result),
          events: this.generateEventsCSV(result)
        };
      default:
        return this.generateDailyCSV(result);
    }
  }

  static generateDailyCSV(result) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) {
      return 'No daily snapshot data available\n';
    }
    
    let csv = 'day';
    const firstSnapshot = result.dailySnapshots[0];
    
    if (firstSnapshot.villages) {
      firstSnapshot.villages.forEach(v => {
        const name = (v.name || v.slot || v.villageId).replace(/,/g, '');
        csv += `,${name}_population,${name}_structures,${name}_resourceScore,${name}_compositeScore`;
      });
    }
    csv += '\n';
    
    for (const snapshot of result.dailySnapshots) {
      csv += snapshot.day;
      if (snapshot.villages) {
        snapshot.villages.forEach(v => {
          csv += `,${v.population || 0}`;
          csv += `,${v.structures || 0}`;
          csv += `,${v.resourceScore?.toFixed(2) || 0}`;
          csv += `,${v.compositeScore?.toFixed(2) || 0}`;
        });
      }
      csv += '\n';
    }
    
    return csv;
  }

  static generateFinalCSV(result) {
    if (!result.final || result.final.length === 0) {
      return 'No final state data available\n';
    }
    
    let csv = 'village,agent_type,agent_name,population,structures,strength,resourceScore,compositeScore,';
    csv += 'api_calls,failures,avg_latency_ms\n';
    
    for (const village of result.final) {
      const agent = village.agent || {};
      const stats = village.agentStats || {};
      
      csv += `"${village.villageName}",`;
      csv += `${agent.type || 'N/A'},`;
      csv += `"${agent.name || 'N/A'}",`;
      csv += `${village.population},`;
      csv += `${village.structures},`;
      csv += `${village.strength},`;
      csv += `${village.resourceScore?.toFixed(2) || 0},`;
      csv += `${village.compositeScore},`;
      csv += `${stats.calls || 0},`;
      csv += `${stats.failures || 0},`;
      csv += `${stats.calls > 0 ? Math.round(stats.totalLatencyMs / stats.calls) : 0}`;
      csv += '\n';
    }
    
    return csv;
  }

  static generateEventsCSV(result) {
    if (!result.benchmarkEvents || result.benchmarkEvents.length === 0) {
      return 'No events data available\n';
    }
    
    let csv = 'day,type,data\n';
    
    for (const event of result.benchmarkEvents) {
      csv += `${event.day || 0},`;
      csv += `${event.type || 'unknown'},`;
      csv += `"${JSON.stringify(event.data || {}).replace(/"/g, '""')}"`;
      csv += '\n';
    }
    
    return csv;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    ReportGenerator, 
    HTMLReportGenerator, 
    MarkdownReportGenerator, 
    CSVReportGenerator 
  };
}
