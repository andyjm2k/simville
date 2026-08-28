// Visualization system for benchmark data

/**
 * Generate visualization data and ASCII charts for terminal display.
 */
class BenchmarkVisualizer {
  /**
   * Generate all visualizations for a benchmark result.
   * @param {object} result - Benchmark result
   * @param {object} options - Visualization options
   * @returns {object}
   */
  static generateAll(result, options = {}) {
    return {
      scoreTrajectory: this.generateScoreTrajectory(result, options),
      populationChart: this.generatePopulationChart(result, options),
      resourceChart: this.generateResourceChart(result, options),
      comparisonBar: this.generateComparisonBar(result, options),
      terminalCharts: this.generateTerminalCharts(result, options)
    };
  }

  /**
   * Generate score trajectory data for plotting.
   * @param {object} result
   * @param {object} options
   * @returns {object}
   */
  static generateScoreTrajectory(result, options = {}) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) {
      return { error: 'No daily snapshot data available' };
    }

    const data = {
      labels: [],
      datasets: []
    };

    const villageData = new Map();

    // Collect data for each village
    for (const snapshot of result.dailySnapshots) {
      data.labels.push(`Day ${snapshot.day}`);

      if (snapshot.villages) {
        for (const village of snapshot.villages) {
          const key = village.slot || village.villageId;
          if (!villageData.has(key)) {
            villageData.set(key, {
              label: village.name || village.slot || key,
              data: [],
              borderColor: this.getColor(villageData.size),
              backgroundColor: this.getColor(villageData.size, 0.2)
            });
          }
          villageData.get(key).data.push(village.compositeScore || 0);
        }
      }
    }

    data.datasets = Array.from(villageData.values());

    return {
      type: 'line',
      title: 'Composite Score Over Time',
      xAxis: 'Days',
      yAxis: 'Composite Score',
      data
    };
  }

  /**
   * Generate population chart data.
   * @param {object} result
   * @param {object} options
   * @returns {object}
   */
  static generatePopulationChart(result, options = {}) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) {
      return { error: 'No daily snapshot data available' };
    }

    const data = {
      labels: [],
      datasets: []
    };

    const villageData = new Map();

    for (const snapshot of result.dailySnapshots) {
      data.labels.push(`Day ${snapshot.day}`);

      if (snapshot.villages) {
        for (const village of snapshot.villages) {
          const key = village.slot || village.villageId;
          if (!villageData.has(key)) {
            villageData.set(key, {
              label: village.name || village.slot || key,
              data: [],
              borderColor: this.getColor(villageData.size),
              backgroundColor: this.getColor(villageData.size, 0.2)
            });
          }
          villageData.get(key).data.push(village.population || 0);
        }
      }
    }

    data.datasets = Array.from(villageData.values());

    return {
      type: 'line',
      title: 'Population Over Time',
      xAxis: 'Days',
      yAxis: 'Population',
      data
    };
  }

  /**
   * Generate resource accumulation chart.
   * @param {object} result
   * @param {object} options
   * @returns {object}
   */
  static generateResourceChart(result, options = {}) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) {
      return { error: 'No daily snapshot data available' };
    }

    const data = {
      labels: [],
      datasets: []
    };

    const villageData = new Map();

    for (const snapshot of result.dailySnapshots) {
      data.labels.push(`Day ${snapshot.day}`);

      if (snapshot.villages) {
        for (const village of snapshot.villages) {
          const key = village.slot || village.villageId;
          if (!villageData.has(key)) {
            villageData.set(key, {
              label: village.name || village.slot || key,
              data: [],
              borderColor: this.getColor(villageData.size),
              backgroundColor: this.getColor(villageData.size, 0.2)
            });
          }
          villageData.get(key).data.push(village.resourceScore || 0);
        }
      }
    }

    data.datasets = Array.from(villageData.values());

    return {
      type: 'line',
      title: 'Resource Score Over Time',
      xAxis: 'Days',
      yAxis: 'Resource Score',
      data
    };
  }

  /**
   * Generate final comparison bar chart.
   * @param {object} result
   * @param {object} options
   * @returns {object}
   */
  static generateComparisonBar(result, options = {}) {
    if (!result.final || result.final.length === 0) {
      return { error: 'No final state data available' };
    }

    const data = {
      labels: [],
      datasets: [
        { label: 'Population', data: [], backgroundColor: '#3498db' },
        { label: 'Structures', data: [], backgroundColor: '#2ecc71' },
        { label: 'Strength', data: [], backgroundColor: '#e74c3c' },
        { label: 'Resource Score', data: [], backgroundColor: '#f39c12' }
      ]
    };

    for (const village of result.final) {
      data.labels.push(village.villageName);
      data.datasets[0].data.push(village.population);
      data.datasets[1].data.push(village.structures);
      data.datasets[2].data.push(village.strength);
      data.datasets[3].data.push(village.resourceScore || 0);
    }

    return {
      type: 'bar',
      title: 'Final State Comparison',
      xAxis: 'Villages',
      yAxis: 'Value',
      data
    };
  }

  /**
   * Generate ASCII charts for terminal display.
   * @param {object} result
   * @param {object} options
   * @returns {object}
   */
  static generateTerminalCharts(result, options = {}) {
    const width = options.width || 60;
    const height = options.height || 15;

    return {
      scoreChart: this.renderASCIILineChart(
        this.generateScoreTrajectory(result),
        { width, height }
      ),
      finalComparison: this.renderASCIIBarChart(
        result.final || [],
        { width: width, label: 'Composite Score' }
      )
    };
  }

  /**
   * Render an ASCII line chart.
   * @param {object} chartData
   * @param {object} options
   * @returns {string}
   */
  static renderASCIILineChart(chartData, options = {}) {
    if (chartData.error) return chartData.error;

    const width = options.width || 60;
    const height = options.height || 15;
    const { data } = chartData.data;

    if (!data.datasets || data.datasets.length === 0) {
      return 'No data to display';
    }

    let chart = `\n${chartData.title}\n${'='.repeat(width)}\n`;

    // Find min/max values across all datasets
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (const dataset of data.datasets) {
      for (const val of dataset.data) {
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
    }

    const range = maxVal - minVal || 1;
    
    // Create chart grid
    const grid = Array(height).fill(null).map(() => Array(width).fill(' '));

    // Plot each dataset
    for (const dataset of data.datasets) {
      const symbol = this.getSymbol(data.datasets.indexOf(dataset));
      const points = dataset.data.length;
      
      for (let i = 0; i < points; i++) {
        const x = Math.floor((i / (points - 1)) * (width - 1));
        const normalized = (dataset.data[i] - minVal) / range;
        const y = height - 1 - Math.floor(normalized * (height - 1));
        
        if (y >= 0 && y < height && x >= 0 && x < width) {
          grid[y][x] = symbol;
        }
      }
    }

    // Render grid with Y-axis labels
    for (let y = 0; y < height; y++) {
      const value = maxVal - (y / (height - 1)) * range;
      const label = value.toFixed(0).padStart(6);
      chart += `${label} │ ${grid[y].join('')}\n`;
    }

    chart += `       └${'─'.repeat(width)}\n`;
    chart += '        ' + data.labels[0].padEnd(width - data.labels[data.labels.length - 1].length);
    chart += data.labels[data.labels.length - 1] + '\n\n';

    // Legend
    chart += 'Legend:\n';
    for (const dataset of data.datasets) {
      const symbol = this.getSymbol(data.datasets.indexOf(dataset));
      chart += `  ${symbol} = ${dataset.label}\n`;
    }

    return chart;
  }

  /**
   * Render an ASCII bar chart.
   * @param {Array} villages
   * @param {object} options
   * @returns {string}
   */
  static renderASCIIBarChart(villages, options = {}) {
    if (!villages || villages.length === 0) {
      return 'No data to display';
    }

    const width = options.width || 50;
    const label = options.label || 'Composite Score';

    let chart = `\n${label} Comparison\n${'='.repeat(width + 20)}\n`;

    const maxScore = Math.max(...villages.map(v => v.compositeScore || 0));

    for (const village of villages) {
      const score = village.compositeScore || 0;
      const barLength = Math.floor((score / maxScore) * width);
      const bar = '█'.repeat(barLength);
      const name = (village.villageName || 'Unknown').padEnd(15);
      chart += `${name} │ ${bar} ${score.toFixed(1)}\n`;
    }

    return chart;
  }

  /**
   * Get color for dataset index.
   * @param {number} index
   * @param {number} alpha
   * @returns {string}
   */
  static getColor(index, alpha = 1) {
    const colors = [
      '#3498db', // blue
      '#e74c3c', // red
      '#2ecc71', // green
      '#f39c12', // orange
      '#9b59b6', // purple
      '#1abc9c', // turquoise
      '#34495e', // dark gray
      '#e67e22'  // carrot
    ];

    const color = colors[index % colors.length];
    
    if (alpha < 1) {
      // Convert hex to rgba
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
  }

  /**
   * Get ASCII symbol for dataset index.
   * @param {number} index
   * @returns {string}
   */
  static getSymbol(index) {
    const symbols = ['●', '■', '▲', '◆', '★', '○', '□', '△'];
    return symbols[index % symbols.length];
  }

  /**
   * Export chart data in Chart.js format.
   * @param {object} result
   * @returns {object}
   */
  static exportChartJSData(result) {
    return {
      scoreTrajectory: this.generateScoreTrajectory(result),
      population: this.generatePopulationChart(result),
      resources: this.generateResourceChart(result),
      comparison: this.generateComparisonBar(result)
    };
  }

  /**
   * Export chart data for external tools (Plotly, matplotlib, etc).
   * @param {object} result
   * @param {string} format - 'plotly', 'matplotlib', 'csv'
   * @returns {object}
   */
  static exportForExternalTool(result, format = 'plotly') {
    const scoreData = this.generateScoreTrajectory(result);
    
    if (format === 'plotly') {
      return this.convertToPlotly(scoreData);
    } else if (format === 'matplotlib') {
      return this.convertToMatplotlib(scoreData);
    } else if (format === 'csv') {
      return this.convertToCSV(result);
    }

    return scoreData;
  }

  /**
   * Convert to Plotly format.
   * @param {object} chartData
   * @returns {object}
   */
  static convertToPlotly(chartData) {
    if (chartData.error) return chartData;

    const traces = chartData.data.datasets.map(dataset => ({
      x: chartData.data.labels,
      y: dataset.data,
      type: 'scatter',
      mode: 'lines+markers',
      name: dataset.label,
      line: { color: dataset.borderColor }
    }));

    return {
      data: traces,
      layout: {
        title: chartData.title,
        xaxis: { title: chartData.xAxis },
        yaxis: { title: chartData.yAxis }
      }
    };
  }

  /**
   * Convert to matplotlib-compatible format.
   * @param {object} chartData
   * @returns {object}
   */
  static convertToMatplotlib(chartData) {
    if (chartData.error) return chartData;

    return {
      x: chartData.data.labels,
      series: chartData.data.datasets.map(dataset => ({
        label: dataset.label,
        y: dataset.data,
        color: dataset.borderColor
      })),
      title: chartData.title,
      xlabel: chartData.xAxis,
      ylabel: chartData.yAxis
    };
  }

  /**
   * Convert to CSV format for external analysis.
   * @param {object} result
   * @returns {string}
   */
  static convertToCSV(result) {
    if (!result.dailySnapshots || result.dailySnapshots.length === 0) {
      return 'No data available';
    }

    let csv = 'day';
    const villages = result.dailySnapshots[0].villages || [];
    
    for (const village of villages) {
      const name = village.name || village.slot || village.villageId;
      csv += `,${name}_population,${name}_score,${name}_resources`;
    }
    csv += '\n';

    for (const snapshot of result.dailySnapshots) {
      csv += snapshot.day;
      if (snapshot.villages) {
        for (const village of snapshot.villages) {
          csv += `,${village.population || 0}`;
          csv += `,${village.compositeScore || 0}`;
          csv += `,${village.resourceScore || 0}`;
        }
      }
      csv += '\n';
    }

    return csv;
  }
}

/**
 * Generate heatmaps for resource efficiency and other metrics.
 */
class HeatmapGenerator {
  /**
   * Generate resource efficiency heatmap data.
   * @param {object} result
   * @returns {object}
   */
  static generateResourceEfficiency(result) {
    if (!result.final || result.final.length === 0) {
      return { error: 'No final state data' };
    }

    const data = {
      villages: [],
      resources: [],
      values: []
    };

    for (const village of result.final) {
      data.villages.push(village.villageName);
      
      if (village.resources) {
        const resourceTypes = Object.keys(village.resources);
        
        if (data.resources.length === 0) {
          data.resources = resourceTypes;
        }

        const row = resourceTypes.map(type => village.resources[type] || 0);
        data.values.push(row);
      }
    }

    return {
      type: 'heatmap',
      title: 'Resource Distribution',
      xAxis: data.resources,
      yAxis: data.villages,
      data: data.values
    };
  }

  /**
   * Generate performance metrics heatmap.
   * @param {Array} batchResults
   * @returns {object}
   */
  static generatePerformanceHeatmap(batchResults) {
    const data = {
      runs: [],
      metrics: ['Score', 'Population', 'Structures', 'API Calls'],
      values: []
    };

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      data.runs.push(`Run ${i + 1}`);

      if (result.final && result.final.length > 0) {
        const village = result.final[0];
        const stats = village.agentStats || {};
        data.values.push([
          village.compositeScore,
          village.population,
          village.structures,
          stats.calls || 0
        ]);
      }
    }

    return {
      type: 'heatmap',
      title: 'Batch Performance Metrics',
      xAxis: data.metrics,
      yAxis: data.runs,
      data: data.values
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BenchmarkVisualizer, HeatmapGenerator };
}
