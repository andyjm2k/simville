/**
 * Unit tests for BenchmarkComparator and BatchAnalyzer
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
    `;if (typeof BenchmarkComparator !== 'undefined') globalThis.BenchmarkComparator = BenchmarkComparator;
     ;if (typeof BatchAnalyzer !== 'undefined') globalThis.BatchAnalyzer = BatchAnalyzer;
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

loadScript('src/renderer/js/systems/benchmark-analysis.js', sandbox);

const { BenchmarkComparator, BatchAnalyzer } = sandbox;

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

// Mock benchmark results
const mockResult1 = {
  daysSimulated: 30,
  ticksExecuted: 360,
  durationMs: 45000,
  outcome: { winner: 'A', reason: 'composite_score', margin: 100 },
  final: [
    {
      villageName: 'Village A',
      agent: { slot: 'A', name: 'agent-a' },
      compositeScore: 400,
      population: 20,
      resourceScore: 150,
      agentStats: { calls: 50, failures: 2, totalLatencyMs: 10000, actionsApplied: 100 }
    },
    {
      villageName: 'Village B',
      agent: { slot: 'B', name: 'agent-b' },
      compositeScore: 300,
      population: 15,
      resourceScore: 100,
      agentStats: { calls: 0, failures: 0 }
    }
  ],
  dailySnapshots: [
    {
      day: 1,
      villages: [
        { slot: 'A', villageId: 'v1', compositeScore: 50 },
        { slot: 'B', villageId: 'v2', compositeScore: 50 }
      ]
    },
    {
      day: 30,
      villages: [
        { slot: 'A', villageId: 'v1', compositeScore: 400 },
        { slot: 'B', villageId: 'v2', compositeScore: 300 }
      ]
    }
  ]
};

const mockResult2 = {
  daysSimulated: 30,
  ticksExecuted: 370,
  durationMs: 46000,
  outcome: { winner: 'B', reason: 'composite_score', margin: 50 },
  final: [
    {
      villageName: 'Village A',
      agent: { slot: 'A', name: 'agent-a' },
      compositeScore: 350,
      population: 18,
      resourceScore: 140,
      agentStats: { calls: 52, failures: 1, totalLatencyMs: 9000, actionsApplied: 98 }
    },
    {
      villageName: 'Village B',
      agent: { slot: 'B', name: 'agent-b' },
      compositeScore: 400,
      population: 20,
      resourceScore: 160,
      agentStats: {}
    }
  ]
};

console.log('\nBenchmarkComparator');

test('constructor initializes empty', () => {
  const comparator = new BenchmarkComparator();
  assert.strictEqual(comparator.results.length, 0);
});

test('constructor accepts initial results', () => {
  const comparator = new BenchmarkComparator([{ data: mockResult1 }]);
  assert.strictEqual(comparator.results.length, 1);
});

test('addResult adds result with label', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1, 'Run 1');
  
  assert.strictEqual(comparator.results.length, 1);
  assert.strictEqual(comparator.results[0].label, 'Run 1');
  assert.strictEqual(comparator.results[0].data, mockResult1);
});

test('addResult generates label if not provided', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  assert.strictEqual(comparator.results[0].label, 'Run 1');
  assert.strictEqual(comparator.results[1].label, 'Run 2');
});

test('compare returns error for no results', () => {
  const comparator = new BenchmarkComparator();
  const comparison = comparator.compare();
  
  assert.ok(comparison.error);
});

test('generateSummary calculates averages', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  const summary = comparator.generateSummary();
  
  assert.strictEqual(summary.totalRuns, 2);
  assert.strictEqual(summary.avgDuration, 45500);
  assert.strictEqual(summary.avgDaysSimulated, 30);
  assert.strictEqual(summary.avgTicksExecuted, 365);
});

test('calculateWinRates counts wins', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1); // A wins
  comparator.addResult(mockResult2); // B wins
  comparator.addResult(mockResult1); // A wins again
  
  const winRates = comparator.calculateWinRates();
  
  assert.strictEqual(winRates.A.wins, 2);
  assert.strictEqual(winRates.A.total, 3);
  assert.strictEqual(winRates.A.rate, '66.7%');
  assert.strictEqual(winRates.B.wins, 1);
  assert.strictEqual(winRates.B.rate, '33.3%');
});

test('comparePerformance aggregates metrics', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  const metrics = comparator.comparePerformance();
  
  assert.ok(metrics.A);
  assert.ok(metrics.A.score);
  assert.strictEqual(metrics.A.score.count, 2);
  assert.strictEqual(metrics.A.score.mean, 375); // (400 + 350) / 2
});

test('calculateStats computes mean, min, max, stddev', () => {
  const comparator = new BenchmarkComparator();
  const stats = comparator.calculateStats([100, 150, 200]);
  
  assert.strictEqual(stats.mean, 150);
  assert.strictEqual(stats.min, 100);
  assert.strictEqual(stats.max, 200);
  assert.ok(stats.stddev > 0);
  assert.strictEqual(stats.count, 3);
});

test('calculateStats handles empty array', () => {
  const comparator = new BenchmarkComparator();
  const stats = comparator.calculateStats([]);
  
  assert.strictEqual(stats.mean, 0);
  assert.strictEqual(stats.count, 0);
});

test('compareTrajectories averages by day', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  const trajectories = comparator.compareTrajectories();
  
  assert.ok(trajectories['1']);
  assert.ok(trajectories['1'].A);
  assert.ok(trajectories['30']);
});

test('analyzeAgents aggregates agent data', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  const analysis = comparator.analyzeAgents();
  
  assert.ok(analysis['agent-a']);
  assert.strictEqual(analysis['agent-a'].runs, 2);
  assert.ok(analysis['agent-a'].avgApiCalls > 0);
  assert.ok(analysis['agent-a'].avgLatency > 0);
});

test('generateReport produces markdown', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  comparator.addResult(mockResult2);
  
  const report = comparator.generateReport('markdown');
  
  assert.ok(report.includes('# Benchmark Comparison'));
  assert.ok(report.includes('## Win Rates'));
  assert.ok(report.includes('## Agent Analysis'));
});

test('generateReport produces JSON', () => {
  const comparator = new BenchmarkComparator();
  comparator.addResult(mockResult1);
  
  const report = comparator.generateReport('json');
  const parsed = JSON.parse(report);
  
  assert.ok(parsed.summary);
  assert.ok(parsed.winRates);
});

console.log('\nBatchAnalyzer');

const mockBatchResult = {
  total: 3,
  completed: 2,
  failed: 1,
  durationMs: 100000,
  results: [
    {
      id: 'job1',
      status: 'completed',
      config: { seed: 1, agentA: { temperature: 0.2 } },
      metadata: { sweep: { temperature: 0.2 } },
      result: mockResult1
    },
    {
      id: 'job2',
      status: 'completed',
      config: { seed: 2, agentA: { temperature: 0.4 } },
      metadata: { sweep: { temperature: 0.4 } },
      result: mockResult2
    }
  ],
  failures: [
    {
      id: 'job3',
      status: 'failed',
      error: { message: 'Network error', category: { type: 'network' } },
      attempts: 3
    }
  ]
};

test('generateOverview calculates stats', () => {
  const overview = BatchAnalyzer.generateOverview(mockBatchResult);
  
  assert.strictEqual(overview.total, 3);
  assert.strictEqual(overview.completed, 2);
  assert.strictEqual(overview.failed, 1);
  assert.strictEqual(overview.successRate, '66.7%');
  assert.ok(overview.avgDuration > 0);
});

test('analyzeFailures categorizes errors', () => {
  const failures = BatchAnalyzer.analyzeFailures(mockBatchResult);
  
  assert.strictEqual(failures.count, 1);
  assert.ok(failures.patterns.network);
  assert.strictEqual(failures.patterns.network.count, 1);
});

test('analyzeFailures handles no failures', () => {
  const noFailures = { ...mockBatchResult, failures: [] };
  const failures = BatchAnalyzer.analyzeFailures(noFailures);
  
  assert.strictEqual(failures.count, 0);
  assert.strictEqual(Object.keys(failures.patterns).length, 0);
});

test('getNestedValue retrieves nested properties', () => {
  const obj = { a: { b: { c: 123 } } };
  const value = BatchAnalyzer.getNestedValue(obj, 'a.b.c');
  
  assert.strictEqual(value, 123);
});

test('getNestedValue returns undefined for missing path', () => {
  const obj = { a: { b: 1 } };
  const value = BatchAnalyzer.getNestedValue(obj, 'a.x.y');
  
  assert.strictEqual(value, undefined);
});

test('analyze includes all sections', () => {
  const analysis = BatchAnalyzer.analyze(mockBatchResult);
  
  assert.ok(analysis.overview);
  assert.ok(analysis.comparison);
  assert.ok(analysis.failures);
});

test('analyze with groupBy creates groups', () => {
  const analysis = BatchAnalyzer.analyze(mockBatchResult, { 
    groupBy: 'metadata.sweep.temperature' 
  });
  
  assert.ok(analysis.groups);
});

test('generateReport produces markdown', () => {
  const report = BatchAnalyzer.generateReport(mockBatchResult, 'markdown');
  
  assert.ok(report.includes('# Batch Analysis Report'));
  assert.ok(report.includes('## Overview'));
  assert.ok(report.includes('## Failure Analysis'));
});

test('generateReport produces JSON', () => {
  const report = BatchAnalyzer.generateReport(mockBatchResult, 'json');
  const parsed = JSON.parse(report);
  
  assert.ok(parsed.overview);
  assert.ok(parsed.failures);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
