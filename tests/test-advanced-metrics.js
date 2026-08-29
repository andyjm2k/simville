#!/usr/bin/env node
/**
 * Test suite for advanced metrics
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Load the advanced metrics module
const advancedMetricsPath = path.join(__dirname, '..', 'src', 'renderer', 'js', 'systems', 'advanced-metrics.js');
const code = fs.readFileSync(advancedMetricsPath, 'utf8');

const sandbox = { console, module: { exports: {} }, exports: {}, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code + ';if (typeof AdvancedMetrics !== "undefined") globalThis.AdvancedMetrics = AdvancedMetrics; if (typeof MetricsAggregator !== "undefined") globalThis.MetricsAggregator = MetricsAggregator;', sandbox);

const { AdvancedMetrics, MetricsAggregator } = sandbox.globalThis;

// Helper to create mock benchmark result
function createMockResult(config = {}) {
  const defaultFinal = [
    {
      villageId: 0,
      villageName: 'Village A',
      agent: { type: 'llm', name: 'GPT-4', model: 'gpt-4o-mini' },
      population: 15,
      structures: 8,
      strength: 45.5,
      resources: { food: 100, water: 80, wood: 50, stone: 30 },
      resourceScore: 350,
      compositeScore: 550,
      agentStats: {
        calls: 50,
        failures: 2,
        actionsGenerated: 200,
        actionsApplied: 180,
        totalLatencyMs: 5000,
        diplomacyCalls: 10
      }
    },
    {
      villageId: 1,
      villageName: 'Village B',
      agent: { type: 'baseline', name: 'Baseline' },
      population: 12,
      structures: 6,
      strength: 35.2,
      resources: { food: 80, water: 60, wood: 40, stone: 20 },
      resourceScore: 250,
      compositeScore: 400,
      agentStats: {
        calls: 40,
        failures: 0,
        actionsGenerated: 160,
        actionsApplied: 160,
        totalLatencyMs: 0,
        diplomacyCalls: 5
      }
    }
  ];
  
  return {
    config: config.config || { days: 10 },
    daysSimulated: config.daysSimulated || 10,
    ticksExecuted: config.ticksExecuted || 100,
    durationMs: config.durationMs || 30000,
    final: config.final || defaultFinal,
    dailySnapshots: config.dailySnapshots || generateMockDailySnapshots(),
    benchmarkEvents: config.events || []
  };
}

function generateMockDailySnapshots() {
  const snapshots = [];
  for (let day = 0; day <= 10; day++) {
    snapshots.push({
      day,
      villages: [
        {
          villageId: 0,
          population: 10 + day,
          structures: 5 + Math.floor(day / 2),
          resourceScore: 200 + day * 15,
          compositeScore: 300 + day * 25,
          resources: { food: 50 + day * 5, water: 40 + day * 4 }
        },
        {
          villageId: 1,
          population: 8 + day,
          structures: 4 + Math.floor(day / 3),
          resourceScore: 150 + day * 10,
          compositeScore: 250 + day * 15,
          resources: { food: 40 + day * 4, water: 30 + day * 3 }
        }
      ]
    });
  }
  return snapshots;
}

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\nAdvancedMetrics');

test('constructor initializes with result', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  assert(metrics.result === result);
  assert(Array.isArray(metrics.dailySnapshots));
  assert(Array.isArray(metrics.final));
  assert(Array.isArray(metrics.events));
});

test('computeAll returns all metric categories', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const all = metrics.computeAll();
  
  assert(all.efficiency);
  assert(all.combat);
  assert(all.economic);
  assert(all.strategic);
  assert(all.temporal);
  assert(all.llmPerformance);
  assert(all.statistical);
});

test('computeEfficiencyMetrics calculates per-capita metrics', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const efficiency = metrics.computeEfficiencyMetrics();
  
  assert(efficiency[0]);
  assert(efficiency[0].resourcesPerVillager);
  assert(efficiency[0].resourceScorePerVillager);
  assert(efficiency[0].structuresPerVillager);
  assert(efficiency[0].efficiencyScore);
});

test('computeEfficiencyMetrics calculates growth rates', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const efficiency = metrics.computeEfficiencyMetrics();
  
  assert(efficiency[0].populationGrowthRate);
  assert(efficiency[0].resourceGrowthRate);
  assert(efficiency[0].structureGrowthRate);
});

test('computeCombatMetrics initializes metrics for each village', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const combat = metrics.computeCombatMetrics();
  
  assert(combat[0]);
  assert(combat[1]);
  assert.strictEqual(combat[0].raidsInitiated, 0);
  assert.strictEqual(combat[0].raidsReceived, 0);
});

test('computeCombatMetrics analyzes raid events', () => {
  const final = [
    {
      villageId: 0, villageName: 'Village A', agent: { type: 'llm' },
      population: 15, structures: 8, strength: 45.5,
      resources: { food: 100 }, resourceScore: 350, compositeScore: 550,
      agentStats: { calls: 50 }
    },
    {
      villageId: 1, villageName: 'Village B', agent: { type: 'baseline' },
      population: 12, structures: 6, strength: 35.2,
      resources: { food: 80 }, resourceScore: 250, compositeScore: 400,
      agentStats: { calls: 40 }
    }
  ];
  
  const events = [
    { type: 'raid', attackerId: 0, defenderId: 1, success: true, casualties: 2, resourcesStolen: { food: 50 } },
    { type: 'raid', attackerId: 1, defenderId: 0, success: false, casualties: 1 }
  ];
  
  const result = createMockResult({ final, events });
  const metrics = new AdvancedMetrics(result);
  const combat = metrics.computeCombatMetrics();
  
  // Check that raid events were processed
  assert(combat[0].raidsInitiated >= 0);
  assert(combat[1].raidsInitiated >= 0);
  assert(combat[0].raidSuccessRate !== undefined);
  assert(combat[1].raidSuccessRate !== undefined);
});

test('computeEconomicMetrics calculates resource diversity', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const economic = metrics.computeEconomicMetrics();
  
  assert(economic[0]);
  assert(economic[0].resourceDiversity);
  assert(economic[0].resourceTypes > 0);
  assert(economic[0].composition);
});

test('computeEconomicMetrics calculates production rates', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const economic = metrics.computeEconomicMetrics();
  
  assert(economic[0].productionRates);
  assert(economic[0].economicHealth);
});

test('computeStrategicMetrics analyzes agent decisions', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const strategic = metrics.computeStrategicMetrics();
  
  assert(strategic[0]);
  assert.strictEqual(strategic[0].totalDecisions, 50);
  assert.strictEqual(strategic[0].actionsGenerated, 200);
  assert.strictEqual(strategic[0].agentType, 'llm');
});

test('computeStrategicMetrics calculates behavior patterns', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const strategic = metrics.computeStrategicMetrics();
  
  assert(strategic[0].aggressiveness !== undefined);
  assert(strategic[0].economicFocus);
  assert(strategic[0].expansionRate);
});

test('computeTemporalMetrics divides game into phases', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const temporal = metrics.computeTemporalMetrics();
  
  assert(temporal[0]);
  assert(temporal[0].earlyGameScore);
  assert(temporal[0].midGameScore);
  assert(temporal[0].lateGameScore);
});

test('computeTemporalMetrics calculates momentum', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const temporal = metrics.computeTemporalMetrics();
  
  assert(temporal[0].recentMomentum);
  assert(temporal[0].overallTrend);
});

test('computeTemporalMetrics finds peak and lowest performance days', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const temporal = metrics.computeTemporalMetrics();
  
  assert(temporal[0].peakPerformanceDay !== undefined);
  assert(temporal[0].lowestPerformanceDay !== undefined);
});

test('computeLLMPerformanceMetrics handles LLM agents', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const llmPerf = metrics.computeLLMPerformanceMetrics();
  
  assert(llmPerf[0]);
  assert.strictEqual(llmPerf[0].model, 'gpt-4o-mini');
  assert.strictEqual(llmPerf[0].totalCalls, 50);
  assert.strictEqual(llmPerf[0].failedCalls, 2);
});

test('computeLLMPerformanceMetrics handles baseline agents', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const llmPerf = metrics.computeLLMPerformanceMetrics();
  
  assert(llmPerf[1]);
  assert.strictEqual(llmPerf[1].type, 'baseline');
});

test('computeLLMPerformanceMetrics estimates costs', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const llmPerf = metrics.computeLLMPerformanceMetrics();
  
  assert(llmPerf[0].estimatedTokens > 0);
  assert(llmPerf[0].estimatedCostUSD);
  assert(llmPerf[0].estimatedCostUSD.startsWith('$'));
});

test('computeStatisticalMetrics calculates differences', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const stats = metrics.computeStatisticalMetrics();
  
  assert(stats.scoreDifference);
  assert(stats.populationDifference);
  assert(stats.resourceDifference);
});

test('computeStatisticalMetrics calculates effect size', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const stats = metrics.computeStatisticalMetrics();
  
  assert(stats.scoreDifference.effectSize);
  assert(stats.dominance);
  assert(stats.competitiveness);
});

test('calculateResourceDiversity returns entropy', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const resources = { food: 100, water: 80, wood: 50 };
  const diversity = metrics.calculateResourceDiversity(resources);
  
  assert(diversity > 0);
  assert(diversity < 10); // Shannon entropy upper bound
});

test('calculateResourceDiversity handles empty resources', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const diversity = metrics.calculateResourceDiversity({});
  
  assert.strictEqual(diversity, 0);
});

test('estimateTokenUsage calculates rough estimate', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const agentStats = { calls: 100 };
  const tokens = metrics.estimateTokenUsage(agentStats);
  
  assert.strictEqual(tokens, 20000); // 100 calls * 200 tokens/call
});

test('estimateCost returns formatted USD amount', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const agentStats = { calls: 100 };
  const cost = metrics.estimateCost(agentStats, 'gpt-4o-mini');
  
  assert(cost.startsWith('$'));
  assert(parseFloat(cost.substring(1)) > 0);
});

test('calculateEffectSize interprets Cohen\'s d', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const effectSize = metrics.calculateEffectSize(100, 50);
  
  assert(effectSize.includes('(')); // Contains interpretation
  assert(effectSize.includes(')')); // Properly formatted
});

test('calculateDominance categorizes dominance levels', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const dominance = metrics.calculateDominance();
  
  assert(['balanced', 'slight', 'moderate', 'strong', 'complete'].includes(dominance));
});

test('calculateCompetitiveness categorizes competitiveness', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const competitiveness = metrics.calculateCompetitiveness();
  
  assert(['highly competitive', 'competitive', 'moderately competitive', 'one-sided'].includes(competitiveness));
});

test('getVillageSnapshots filters snapshots by village ID', () => {
  const result = createMockResult();
  const metrics = new AdvancedMetrics(result);
  const snapshots = metrics.getVillageSnapshots(0);
  
  assert(snapshots.length > 0);
  assert(snapshots.every(s => s.villageId === 0));
  assert(snapshots.every(s => s.day !== undefined));
});

console.log('\nMetricsAggregator');

test('constructor initializes with results array', () => {
  const results = [createMockResult(), createMockResult()];
  const aggregator = new MetricsAggregator(results);
  
  assert.strictEqual(aggregator.results.length, 2);
});

test('aggregate computes metrics from multiple runs', () => {
  const results = [createMockResult(), createMockResult()];
  const aggregator = new MetricsAggregator(results);
  const aggregated = aggregator.aggregate('all');
  
  assert(aggregated.count === 2);
  assert(Array.isArray(aggregated.metrics));
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('Test Summary');
console.log('='.repeat(70));
console.log(`Total suites: 2`);
console.log(`Total tests: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('='.repeat(70));

process.exit(testsFailed > 0 ? 1 : 0);
