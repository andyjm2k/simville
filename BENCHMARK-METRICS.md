# Advanced Metrics

Comprehensive performance metrics and analysis for Simville benchmarks.

## Overview

The Advanced Metrics system provides deep insights into benchmark performance beyond basic scoring. It analyzes efficiency, combat effectiveness, economic health, strategic patterns, temporal trends, LLM performance, and statistical significance.

## Quick Start

### Enable Advanced Metrics

Add the `--advanced-metrics` or `--metrics` flag to any benchmark run:

```bash
# Single benchmark with advanced metrics
npm run benchmark -- --days 15 --metrics

# Batch execution with metrics
npm run benchmark -- --batch config.json --metrics

# Parameter sweep with metrics
npm run benchmark -- --sweep sweep.json --metrics
```

###Output

Advanced metrics are saved to `{report-name}-metrics.json` and a summary is printed to the console.

## Metric Categories

### 1. Efficiency Metrics

Measures resource utilization and productivity per capita.

**Metrics Included:**
- `resourcesPerVillager`: Total resources divided by population
- `resourceScorePerVillager`: Weighted resource score per capita
- `structuresPerVillager`: Buildings per population
- `strengthPerVillager`: Military strength per capita
- `populationGrowthRate`: Population change over time (%)
- `resourceGrowthRate`: Resource accumulation rate (%)
- `structureGrowthRate`: Building expansion rate (%)
- `efficiencyScore`: Composite efficiency rating

**Example:**
```json
{
  "efficiency": {
    "0": {
      "resourcesPerVillager": "17.33",
      "resourceScorePerVillager": "23.33",
      "structuresPerVillager": "0.533",
      "strengthPerVillager": "3.03",
      "populationGrowthRate": "50.00%",
      "resourceGrowthRate": "75.00%",
      "structureGrowthRate": "60.00%",
      "efficiencyScore": "32.15"
    }
  }
}
```

### 2. Combat Metrics

Analyzes raid effectiveness and military performance.

**Metrics Included:**
- `raidsInitiated`: Total raids launched
- `raidsReceived`: Total raids defended against
- `raidsWon`: Successful offensive raids
- `raidsLost`: Failed offensive raids
- `totalDamageDealt`: Resources stolen from opponents
- `totalDamageTaken`: Resources lost to raids
- `casualtiesInflicted`: Enemy losses caused
- `casualtiesSuffered`: Own population losses
- `raidSuccessRate`: Win rate on offense (%)
- `raidDefenseRate`: Success rate defending (%)
- `combatEfficiency`: Casualty ratio (inflicted/suffered)

**Example:**
```json
{
  "combat": {
    "0": {
      "raidsInitiated": 3,
      "raidsWon": 2,
      "raidsLost": 1,
      "totalDamageDealt": 150,
      "casualtiesSuffered": 2,
      "raidSuccessRate": "66.7%",
      "combatEfficiency": "2.50"
    }
  }
}
```

### 3. Economic Metrics

Evaluates resource diversity, production, and economic health.

**Metrics Included:**
- `resourceDiversity`: Shannon entropy of resource distribution
- `resourceTypes`: Number of distinct resource types
- `totalResourceValue`: Weighted total value
- `composition`: Percentage breakdown by resource type
- `productionRates`: Per-day production for each resource
- `economicHealth`: Composite economic score (0-100)

**Example:**
```json
{
  "economic": {
    "0": {
      "resourceDiversity": "2.145",
      "resourceTypes": 6,
      "totalResourceValue": 350,
      "composition": {
        "food": "38.5%",
        "water": "30.8%",
        "wood": "19.2%",
        "stone": "11.5%"
      },
      "productionRates": {
        "food": "8.50",
        "water": "6.00"
      },
      "economicHealth": "67.25"
    }
  }
}
```

### 4. Strategic Metrics

Analyzes decision-making patterns and behavioral tendencies.

**Metrics Included:**
- `totalDecisions`: Number of agent decisions made
- `actionsGenerated`: Total actions proposed
- `actionsApplied`: Actions successfully executed
- `actionSuccessRate`: Execution success rate (%)
- `diplomacyEngagement`: Diplomatic interactions initiated
- `aggressiveness`: Raid frequency score
- `economicFocus`: Resource-to-military ratio
- `expansionRate`: Structures built per day
- `adaptationScore`: Number of successful recoveries from setbacks

**Example:**
```json
{
  "strategic": {
    "0": {
      "agentType": "llm",
      "totalDecisions": 50,
      "actionsGenerated": 200,
      "actionsApplied": 180,
      "actionSuccessRate": "90.0%",
      "diplomacyEngagement": 10,
      "aggressiveness": 3,
      "economicFocus": "7.69",
      "expansionRate": "0.800",
      "adaptationScore": 4
    }
  }
}
```

### 5. Temporal Metrics

Tracks performance across game phases and identifies trends.

**Metrics Included:**
- `earlyGameScore`: Average score in first third of game
- `midGameScore`: Average score in middle third
- `lateGameScore`: Average score in final third
- `recentMomentum`: Performance direction in last 5 days
- `overallTrend`: Long-term trajectory (improving/declining/stable)
- `scoreVariance`: Performance consistency measure
- `consistencyScore`: Stability rating (0-100)
- `peakPerformanceDay`: Day of highest score
- `lowestPerformanceDay`: Day of lowest score
- `turningPoints`: Key inflection points (peaks/valleys)

**Example:**
```json
{
  "temporal": {
    "0": {
      "earlyGameScore": "325.50",
      "midGameScore": "425.75",
      "lateGameScore": "550.00",
      "recentMomentum": "positive",
      "overallTrend": "improving",
      "scoreVariance": "1250.45",
      "consistencyScore": "87.50",
      "peakPerformanceDay": 15,
      "lowestPerformanceDay": 1,
      "turningPoints": [
        { "day": 5, "score": 350, "type": "peak" },
        { "day": 8, "score": 310, "type": "valley" }
      ]
    }
  }
}
```

### 6. LLM Performance Metrics

Evaluates AI model performance, costs, and reliability.

**Metrics Included:**
- `model`: Model name/version
- `totalCalls`: API requests made
- `successfulCalls`: Successful requests
- `failedCalls`: Failed requests
- `successRate`: Reliability percentage
- `totalLatencyMs`: Cumulative API time
- `avgLatencyMs`: Average response time
- `latencyPerDay`: API time per game day
- `estimatedTokens`: Approximate token usage
- `estimatedCostUSD`: Rough cost estimate
- `decisionsPerSecond`: Throughput metric
- `reliabilityScore`: Overall reliability (0-100)

**Example:**
```json
{
  "llmPerformance": {
    "0": {
      "model": "gpt-4o-mini",
      "totalCalls": 50,
      "successfulCalls": 48,
      "failedCalls": 2,
      "successRate": "96.0%",
      "avgLatencyMs": 100,
      "estimatedTokens": 10000,
      "estimatedCostUSD": "$0.0015",
      "decisionsPerSecond": "0.010",
      "reliabilityScore": "96.0"
    }
  }
}
```

### 7. Statistical Metrics

Provides comparative analysis and effect size measurements.

**Metrics Included:**
- `scoreDifference`: Absolute and relative score gap
- `populationDifference`: Population comparison
- `resourceDifference`: Resource accumulation comparison
- `effectSize`: Cohen's d with interpretation (negligible/small/medium/large)
- `dominance`: Categorized dominance level (balanced/slight/moderate/strong/complete)
- `competitiveness`: Match competitiveness rating

**Example:**
```json
{
  "statistical": {
    "scoreDifference": {
      "absolute": "150.00",
      "relative": "37.5%",
      "effectSize": "1.25 (large)"
    },
    "dominance": "moderate",
    "competitiveness": "competitive"
  }
}
```

## Use Cases

### 1. Model Comparison

Compare LLM performance across different models:

```bash
# Run with different models
npm run benchmark -- --config gpt4-config.json --metrics
npm run benchmark -- --config claude-config.json --metrics

# Compare results
node scripts/generate-report.js gpt4-report.json claude-report.json --compare
```

**Key Metrics to Check:**
- LLM performance (latency, cost, reliability)
- Strategic metrics (decision quality, adaptation)
- Efficiency metrics (resource management)

### 2. Strategy Analysis

Understand agent behavior patterns:

```bash
npm run benchmark -- --days 30 --metrics
```

**Key Metrics to Check:**
- Strategic metrics (aggressiveness, economic focus)
- Combat metrics (raid success rates)
- Temporal metrics (adaptation to challenges)

### 3. Cost Optimization

Estimate and optimize API costs:

```bash
npm run benchmark -- --sweep model-sweep.json --metrics --parallel 4
```

**Key Metrics to Check:**
- LLM performance (estimatedCostUSD, estimatedTokens)
- Efficiency metrics (outcomes per dollar spent)
- Strategic metrics (decision quality vs. cost)

### 4. Performance Tuning

Optimize game balance and difficulty:

```bash
npm run benchmark -- --batch difficulty-test.json --metrics
```

**Key Metrics to Check:**
- Statistical metrics (competitiveness, dominance)
- Temporal metrics (game phase balance)
- Combat metrics (raid effectiveness)

## Programmatic Usage

You can also use advanced metrics programmatically:

```javascript
const { AdvancedMetrics } = require('./src/renderer/js/systems/advanced-metrics.js');

// Load benchmark result
const result = JSON.parse(fs.readFileSync('benchmark-report.json', 'utf8'));

// Compute all metrics
const metrics = new AdvancedMetrics(result);
const allMetrics = metrics.computeAll();

// Or compute specific categories
const efficiency = metrics.computeEfficiencyMetrics();
const combat = metrics.computeCombatMetrics();
const llmPerf = metrics.computeLLMPerformanceMetrics();

// Aggregate metrics from multiple runs
const { MetricsAggregator } = require('./src/renderer/js/systems/advanced-metrics.js');

const results = [result1, result2, result3];
const aggregator = new MetricsAggregator(results);
const aggregated = aggregator.aggregate('all');
```

## Interpreting Results

### Efficiency Score

- **< 20**: Poor resource management
- **20-40**: Average efficiency
- **40-60**: Good efficiency
- **> 60**: Excellent optimization

### Economic Health

- **< 30**: Struggling economy
- **30-50**: Stable economy
- **50-70**: Healthy economy
- **> 70**: Thriving economy

### Combat Efficiency

- **< 0.5**: Losing more than inflicting
- **0.5-1.0**: Break-even trades
- **1.0-2.0**: Favorable exchanges
- **> 2.0**: Dominant military

### Reliability Score (LLM)

- **< 80%**: Concerning failure rate
- **80-90%**: Acceptable reliability
- **90-95%**: Good reliability
- **> 95%**: Excellent reliability

## Integration with Reports

Advanced metrics are automatically included when generating reports with the `--metrics` flag:

```bash
# HTML report with metrics
npm run benchmark -- --days 15 --report-format html --charts --metrics

# Markdown report with metrics
npm run benchmark -- --days 15 --report-format markdown --metrics

# Generate from existing results
node scripts/generate-report.js benchmark-report.json html --charts
# Then separately compute metrics
node -e "const {AdvancedMetrics} = require('./src/renderer/js/systems/advanced-metrics.js'); const result = require('./benchmark-report.json'); const m = new AdvancedMetrics(result); console.log(JSON.stringify(m.computeAll(), null, 2))" > metrics.json
```

## Performance Considerations

- Minimal overhead: < 100ms for typical benchmarks
- Scales linearly with daily snapshots
- No impact on benchmark execution (computed post-run)

## See Also

- [BENCHMARK.md](./BENCHMARK.md) - Core benchmarking guide
- [BENCHMARK-ADVANCED.md](./BENCHMARK-ADVANCED.md) - Operational features
- [BENCHMARK-REPORTING.md](./BENCHMARK-REPORTING.md) - Report generation
- [TEST-COVERAGE.md](./TEST-COVERAGE.md) - Testing documentation
