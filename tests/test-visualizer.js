/**
 * Unit tests for BenchmarkVisualizer
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadScript(relPath, sandbox) {
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  const code = fs.readFileSync(path.join(root, relPath), 'utf8') +
    `;if (typeof BenchmarkVisualizer !== 'undefined') globalThis.BenchmarkVisualizer = BenchmarkVisualizer;
     ;if (typeof HeatmapGenerator !== 'undefined') globalThis.HeatmapGenerator = HeatmapGenerator;
     ;if (typeof module !== 'undefined' && module.exports) {
       Object.assign(globalThis, module.exports);
     }`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  Math, Date, Object, Array, String, Number, Boolean, Map, Set, JSON
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript('src/renderer/js/systems/visualizer.js', sandbox);

const { BenchmarkVisualizer, HeatmapGenerator } = sandbox;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// Mock benchmark result
const mockResult = {
  dailySnapshots: [
    {
      day: 1,
      villages: [
        { slot: 'A', villageId: 'v1', name: 'Village A', population: 5, compositeScore: 50, resourceScore: 20 },
        { slot: 'B', villageId: 'v2', name: 'Village B', population: 5, compositeScore: 50, resourceScore: 20 }
      ]
    },
    {
      day: 15,
      villages: [
        { slot: 'A', villageId: 'v1', name: 'Village A', population: 15, compositeScore: 200, resourceScore: 80 },
        { slot: 'B', villageId: 'v2', name: 'Village B', population: 12, compositeScore: 150, resourceScore: 60 }
      ]
    },
    {
      day: 30,
      villages: [
        { slot: 'A', villageId: 'v1', name: 'Village A', population: 20, compositeScore: 400, resourceScore: 150 },
        { slot: 'B', villageId: 'v2', name: 'Village B', population: 15, compositeScore: 300, resourceScore: 100 }
      ]
    }
  ],
  final: [
    {
      villageName: 'Village A',
      compositeScore: 400,
      population: 20,
      structures: 5,
      strength: 100,
      resourceScore: 150,
      resources: { food: 50, wood: 30, stone: 20 }
    },
    {
      villageName: 'Village B',
      compositeScore: 300,
      population: 15,
      structures: 3,
      strength: 75,
      resourceScore: 100,
      resources: { food: 30, wood: 20, stone: 10 }
    }
  ]
};

console.log('\nBenchmarkVisualizer');

test('generateScoreTrajectory returns chart data', () => {
  const chart = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  
  assert.strictEqual(chart.type, 'line');
  assert.strictEqual(chart.title, 'Composite Score Over Time');
  assert.ok(chart.data);
  assert.ok(chart.data.labels);
  assert.ok(chart.data.datasets);
  assert.strictEqual(chart.data.datasets.length, 2); // Two villages
});

test('generateScoreTrajectory handles no data', () => {
  const chart = BenchmarkVisualizer.generateScoreTrajectory({ dailySnapshots: [] });
  
  assert.ok(chart.error);
});

test('generateScoreTrajectory includes all days', () => {
  const chart = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  
  assert.strictEqual(chart.data.labels.length, 3);
  assert.ok(chart.data.labels[0].includes('Day 1'));
  assert.ok(chart.data.labels[2].includes('Day 30'));
});

test('generateScoreTrajectory tracks villages separately', () => {
  const chart = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  
  const datasetA = chart.data.datasets.find(d => d.label.includes('Village A'));
  const datasetB = chart.data.datasets.find(d => d.label.includes('Village B'));
  
  assert.ok(datasetA);
  assert.ok(datasetB);
  assert.strictEqual(datasetA.data[0], 50);
  assert.strictEqual(datasetA.data[2], 400);
  assert.strictEqual(datasetB.data[2], 300);
});

test('generatePopulationChart returns chart data', () => {
  const chart = BenchmarkVisualizer.generatePopulationChart(mockResult);
  
  assert.strictEqual(chart.type, 'line');
  assert.strictEqual(chart.title, 'Population Over Time');
  assert.ok(chart.data.datasets);
});

test('generateResourceChart returns chart data', () => {
  const chart = BenchmarkVisualizer.generateResourceChart(mockResult);
  
  assert.strictEqual(chart.type, 'line');
  assert.strictEqual(chart.title, 'Resource Score Over Time');
  assert.ok(chart.data.datasets);
});

test('generateComparisonBar returns bar chart', () => {
  const chart = BenchmarkVisualizer.generateComparisonBar(mockResult);
  
  assert.strictEqual(chart.type, 'bar');
  assert.strictEqual(chart.title, 'Final State Comparison');
  assert.ok(chart.data.datasets);
  assert.strictEqual(chart.data.datasets.length, 4); // Population, Structures, Strength, Resources
});

test('generateComparisonBar handles no final data', () => {
  const chart = BenchmarkVisualizer.generateComparisonBar({ final: [] });
  
  assert.ok(chart.error);
});

test('generateTerminalCharts returns ASCII charts', () => {
  const charts = BenchmarkVisualizer.generateTerminalCharts(mockResult, { width: 60, height: 10 });
  
  assert.ok(charts);
  assert.ok(charts.scoreChart || charts.finalComparison);
});

test('renderASCIILineChart produces text output', () => {
  const chartData = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  if (chartData.error) {
    console.log('Skipping - no chart data');
    return;
  }
  
  const ascii = BenchmarkVisualizer.renderASCIILineChart(chartData, { width: 60, height: 10 });
  
  assert.ok(typeof ascii === 'string');
  assert.ok(ascii.length > 0);
});

test('renderASCIIBarChart produces bar visualization', () => {
  const ascii = BenchmarkVisualizer.renderASCIIBarChart(mockResult.final, { width: 50 });
  
  assert.ok(typeof ascii === 'string');
  assert.ok(ascii.includes('Village A'));
  assert.ok(ascii.includes('Village B'));
  assert.ok(ascii.includes('█')); // Bar character
});

test('getColor returns consistent colors', () => {
  const color0 = BenchmarkVisualizer.getColor(0);
  const color1 = BenchmarkVisualizer.getColor(1);
  
  assert.ok(color0.startsWith('#'));
  assert.ok(color1.startsWith('#'));
  assert.notStrictEqual(color0, color1);
});

test('getColor cycles through colors', () => {
  const color0 = BenchmarkVisualizer.getColor(0);
  const color8 = BenchmarkVisualizer.getColor(8); // Should cycle
  
  assert.strictEqual(color0, color8);
});

test('getColor handles alpha', () => {
  const color = BenchmarkVisualizer.getColor(0, 0.5);
  
  assert.ok(color.startsWith('rgba('));
  assert.ok(color.includes('0.5'));
});

test('getSymbol returns unique symbols', () => {
  const sym0 = BenchmarkVisualizer.getSymbol(0);
  const sym1 = BenchmarkVisualizer.getSymbol(1);
  
  assert.ok(typeof sym0 === 'string');
  assert.notStrictEqual(sym0, sym1);
});

test('exportChartJSData returns all charts', () => {
  const data = BenchmarkVisualizer.exportChartJSData(mockResult);
  
  assert.ok(data.scoreTrajectory);
  assert.ok(data.population);
  assert.ok(data.resources);
  assert.ok(data.comparison);
});

test('convertToPlotly transforms data', () => {
  const chartData = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  const plotly = BenchmarkVisualizer.convertToPlotly(chartData);
  
  assert.ok(plotly.data);
  assert.ok(plotly.layout);
  assert.ok(Array.isArray(plotly.data));
  assert.ok(plotly.layout.title);
});

test('convertToMatplotlib transforms data', () => {
  const chartData = BenchmarkVisualizer.generateScoreTrajectory(mockResult);
  const mpl = BenchmarkVisualizer.convertToMatplotlib(chartData);
  
  assert.ok(mpl.x);
  assert.ok(mpl.series);
  assert.ok(mpl.title);
  assert.ok(Array.isArray(mpl.series));
});

test('convertToCSV produces CSV string', () => {
  const csv = BenchmarkVisualizer.convertToCSV(mockResult);
  
  assert.ok(typeof csv === 'string');
  assert.ok(csv.includes('day'));
  assert.ok(csv.includes('Village A_population'));
  assert.ok(csv.includes('1,5,50,20')); // Day 1 data
});

console.log('\nHeatmapGenerator');

test('generateResourceEfficiency returns heatmap data', () => {
  const heatmap = HeatmapGenerator.generateResourceEfficiency(mockResult);
  
  assert.strictEqual(heatmap.type, 'heatmap');
  assert.strictEqual(heatmap.title, 'Resource Distribution');
  assert.ok(heatmap.xAxis);
  assert.ok(heatmap.yAxis);
  assert.ok(heatmap.data);
});

test('generateResourceEfficiency handles no data', () => {
  const heatmap = HeatmapGenerator.generateResourceEfficiency({ final: [] });
  
  assert.ok(heatmap.error);
});

test('generatePerformanceHeatmap aggregates batch results', () => {
  const batchResults = [mockResult, mockResult];
  const heatmap = HeatmapGenerator.generatePerformanceHeatmap(batchResults);
  
  assert.strictEqual(heatmap.type, 'heatmap');
  assert.strictEqual(heatmap.title, 'Batch Performance Metrics');
  assert.ok(heatmap.data);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
