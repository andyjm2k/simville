#!/usr/bin/env node
/**
 * Headless benchmark: LLM village vs baseline (or LLM vs LLM).
 *
 * Usage:
 *   node scripts/run-benchmark.js --config benchmark.example.json
 *   node scripts/run-benchmark.js --days 10 --seed 42 --agent-a-type llm --agent-b-type baseline
 *
 * Batch execution:
 *   node scripts/run-benchmark.js --batch batch-config.json
 *   node scripts/run-benchmark.js --sweep sweep-config.json --parallel 4
 *
 * Environment:
 *   SIMVILLE_LLM_ENDPOINT, SIMVILLE_LLM_MODEL, SIMVILLE_LLM_API_KEY
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function parseArgs(argv) {
  const options = {
    mode: 'single', // single, batch, sweep
    config: null,
    batchConfig: null,
    sweepConfig: null,
    parallel: 1,
    retries: 3,
    verbose: false,
    silent: false,
    checkpoint: 'batch-checkpoint.json',
    resumeCheckpoint: false,
    reportFormat: null, // html, markdown, csv
    reportOutput: null,
    generateCharts: false,
    compareRuns: false,
    showTerminalCharts: false
  };

  const singleRunConfig = {
    seed: 4242,
    days: 15,
    dayLengthMs: 30000,
    tickIntervalMs: 5000,
    output: 'benchmark-report.json',
    agentA: { type: 'llm', name: 'agent-a' },
    agentB: { type: 'baseline', name: 'baseline-heuristic' }
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      Object.assign(singleRunConfig, JSON.parse(fs.readFileSync(path.resolve(argv[++i]), 'utf8')));
    } else if (arg === '--batch' && argv[i + 1]) {
      options.mode = 'batch';
      options.batchConfig = JSON.parse(fs.readFileSync(path.resolve(argv[++i]), 'utf8'));
    } else if (arg === '--sweep' && argv[i + 1]) {
      options.mode = 'sweep';
      options.sweepConfig = JSON.parse(fs.readFileSync(path.resolve(argv[++i]), 'utf8'));
    } else if (arg === '--parallel' && argv[i + 1]) {
      options.parallel = Number(argv[++i]);
    } else if (arg === '--retries' && argv[i + 1]) {
      options.retries = Number(argv[++i]);
    } else if (arg === '--days' && argv[i + 1]) {
      singleRunConfig.days = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1]) {
      singleRunConfig.seed = Number(argv[++i]);
    } else if (arg === '--output' && argv[i + 1]) {
      singleRunConfig.output = argv[++i];
    } else if (arg === '--agent-a-type' && argv[i + 1]) {
      singleRunConfig.agentA = { ...(singleRunConfig.agentA || {}), type: argv[++i] };
    } else if (arg === '--agent-b-type' && argv[i + 1]) {
      singleRunConfig.agentB = { ...(singleRunConfig.agentB || {}), type: argv[++i] };
    } else if (arg === '--checkpoint' && argv[i + 1]) {
      options.checkpoint = argv[++i];
    } else if (arg === '--resume') {
      options.resumeCheckpoint = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--silent' || arg === '-s') {
      options.silent = true;
    } else if (arg === '--report-format' && argv[i + 1]) {
      options.reportFormat = argv[++i];
    } else if (arg === '--report-output' && argv[i + 1]) {
      options.reportOutput = argv[++i];
    } else if (arg === '--charts') {
      options.generateCharts = true;
    } else if (arg === '--terminal-charts') {
      options.showTerminalCharts = true;
    } else if (arg === '--compare') {
      options.compareRuns = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Simville benchmark runner

Single run:
  --config <file>       JSON config (see benchmark.example.json)
  --days <n>            Simulation horizon in in-game days
  --seed <n>            World RNG seed
  --output <file>       Report path (default benchmark-report.json)
  --agent-a-type llm|baseline
  --agent-b-type llm|baseline

Batch execution:
  --batch <file>        Batch config with multiple runs
  --sweep <file>        Parameter sweep config
  --parallel <n>        Number of parallel workers (default 1)
  --retries <n>         Max retry attempts per run (default 3)
  --checkpoint <file>   Checkpoint file path
  --resume              Resume from checkpoint

Options:
  --verbose, -v         Verbose progress output
  --silent, -s          Minimal output
  --help, -h            Show this help

Report Options:
  --report-format <fmt> Generate report (html, markdown, csv)
  --report-output <file> Report output path
  --charts              Generate charts in HTML reports
  --terminal-charts     Show ASCII charts in terminal
  --compare             Generate comparison analysis (batch/sweep only)

Env: SIMVILLE_LLM_ENDPOINT, SIMVILLE_LLM_MODEL, SIMVILLE_LLM_API_KEY`);
      process.exit(0);
    }
  }

  if (process.env.SIMVILLE_LLM_ENDPOINT) {
    singleRunConfig.agentA = singleRunConfig.agentA || { type: 'llm' };
    singleRunConfig.agentA.endpoint = process.env.SIMVILLE_LLM_ENDPOINT;
    singleRunConfig.agentA.model = process.env.SIMVILLE_LLM_MODEL || singleRunConfig.agentA.model || 'gpt-4o-mini';
    singleRunConfig.agentA.apiKey = process.env.SIMVILLE_LLM_API_KEY || singleRunConfig.agentA.apiKey || '';
  }

  return { options, singleRunConfig };
}

function generateAdditionalReports(result, options, ReportGenerator) {
  const format = options.reportFormat.toLowerCase();
  const outputPath = options.reportOutput || `benchmark-report.${format === 'html' ? 'html' : format === 'csv' ? 'csv' : 'md'}`;

  try {
    const reportOptions = {
      includeCharts: options.generateCharts
    };

    const report = ReportGenerator.generate(result, format, reportOptions);
    
    if (format === 'csv') {
      // Generate multiple CSV files
      if (typeof report === 'object') {
        const base = outputPath.replace('.csv', '');
        fs.writeFileSync(`${base}-daily.csv`, report.daily);
        fs.writeFileSync(`${base}-final.csv`, report.final);
        if (report.events) fs.writeFileSync(`${base}-events.csv`, report.events);
        console.error(`CSV reports generated: ${base}-*.csv`);
      } else {
        fs.writeFileSync(outputPath, report);
        console.error(`CSV report: ${outputPath}`);
      }
    } else {
      fs.writeFileSync(outputPath, report);
      console.error(`${format.toUpperCase()} report: ${outputPath}`);
    }
  } catch (err) {
    console.error(`Failed to generate ${format} report:`, err.message);
  }
}

function showTerminalCharts(result, BenchmarkVisualizer) {
  try {
    const charts = BenchmarkVisualizer.generateTerminalCharts(result, { width: 70, height: 15 });
    
    if (charts.scoreChart) {
      console.error('\n' + charts.scoreChart);
    }
    
    if (charts.finalComparison) {
      console.error('\n' + charts.finalComparison);
    }
  } catch (err) {
    console.error('Failed to generate terminal charts:', err.message);
  }
}

function loadScript(relPath, sandbox) {
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  const code =
    fs.readFileSync(path.join(root, relPath), 'utf8') +
    `
;if (typeof Utils !== 'undefined') globalThis.Utils = Utils;
;if (typeof CONSTANTS !== 'undefined') globalThis.CONSTANTS = CONSTANTS;
;if (typeof LLMManager !== 'undefined') globalThis.LLMManager = LLMManager;
;if (typeof World !== 'undefined') globalThis.World = World;
;if (typeof Village !== 'undefined') globalThis.Village = Village;
;if (typeof Villager !== 'undefined') globalThis.Villager = Villager;
;if (typeof Economy !== 'undefined') globalThis.Economy = Economy;
;if (typeof RaidSystem !== 'undefined') globalThis.RaidSystem = RaidSystem;
;if (typeof DiplomacySystem !== 'undefined') globalThis.DiplomacySystem = DiplomacySystem;
;if (typeof BaselineAgent !== 'undefined') globalThis.BaselineAgent = BaselineAgent;
;if (typeof BenchmarkScorer !== 'undefined') globalThis.BenchmarkScorer = BenchmarkScorer;
;if (typeof BenchmarkRunner !== 'undefined') globalThis.BenchmarkRunner = BenchmarkRunner;
;if (typeof BatchRunner !== 'undefined') globalThis.BatchRunner = BatchRunner;
;if (typeof ParameterSweep !== 'undefined') globalThis.ParameterSweep = ParameterSweep;
;if (typeof ProgressMonitor !== 'undefined') globalThis.ProgressMonitor = ProgressMonitor;
;if (typeof ResourceTracker !== 'undefined') globalThis.ResourceTracker = ResourceTracker;
;if (typeof TimeoutGuard !== 'undefined') globalThis.TimeoutGuard = TimeoutGuard;
;if (typeof FailureHandler !== 'undefined') globalThis.FailureHandler = FailureHandler;
;if (typeof ResilientBenchmarkRunner !== 'undefined') globalThis.ResilientBenchmarkRunner = ResilientBenchmarkRunner;
;if (typeof GracefulDegradation !== 'undefined') globalThis.GracefulDegradation = GracefulDegradation;
;if (typeof ReportGenerator !== 'undefined') globalThis.ReportGenerator = ReportGenerator;
;if (typeof HTMLReportGenerator !== 'undefined') globalThis.HTMLReportGenerator = HTMLReportGenerator;
;if (typeof MarkdownReportGenerator !== 'undefined') globalThis.MarkdownReportGenerator = MarkdownReportGenerator;
;if (typeof CSVReportGenerator !== 'undefined') globalThis.CSVReportGenerator = CSVReportGenerator;
;if (typeof BenchmarkComparator !== 'undefined') globalThis.BenchmarkComparator = BenchmarkComparator;
;if (typeof BatchAnalyzer !== 'undefined') globalThis.BatchAnalyzer = BatchAnalyzer;
;if (typeof BenchmarkVisualizer !== 'undefined') globalThis.BenchmarkVisualizer = BenchmarkVisualizer;
;if (typeof HeatmapGenerator !== 'undefined') globalThis.HeatmapGenerator = HeatmapGenerator;
;if (typeof Game !== 'undefined') globalThis.Game = Game;
;if (typeof module !== 'undefined' && module.exports) {
  const exported = module.exports;
  Object.assign(globalThis, exported);
}
`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

function createSandbox() {
  const sandbox = {
    console,
    module: { exports: {} },
    exports: {},
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
    Set,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    fetch: global.fetch,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => {},
    document: {
      getElementById: () => null,
      addEventListener: () => {}
    }
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

async function runSingle(config, options, sandbox) {
  const { Game, BenchmarkRunner, ProgressMonitor, ResilientBenchmarkRunner } = sandbox;
  
  // Set up progress monitoring
  const logLevel = options.silent ? 'silent' : (options.verbose ? 'verbose' : 'info');
  const monitor = new ProgressMonitor({ logLevel });
  monitor.startRun(config);

  const game = new Game();
  sandbox.game = game;
  sandbox.window.game = game;

  const baseRunner = new BenchmarkRunner(game);
  
  // Wrap with resilient runner for retry logic
  const runner = new ResilientBenchmarkRunner(baseRunner, {
    maxRetries: options.retries || 3,
    onRetry: (info) => {
      console.error(`[RETRY] Attempt ${info.attempt}/${info.maxAttempts} after ${info.errorCategory.type} error`);
    }
  });

  // Hook into game tick for progress updates
  const originalRunHeadlessTick = game.runHeadlessTick;
  game.runHeadlessTick = async function(...args) {
    monitor.updateRun({ ticks: this.tickCount || 0, day: this.timeState?.day || 0 });
    return originalRunHeadlessTick.apply(this, args);
  };

  const report = await runner.run(config);
  monitor.completeRun(report);

  const outPath = path.resolve(config.output || 'benchmark-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (!options.silent) {
    console.error(`Report: ${outPath}`);
  }

  // Generate additional report formats
  if (options.reportFormat) {
    const { ReportGenerator } = sandbox;
    generateAdditionalReports(report, options, ReportGenerator);
  }

  // Show terminal charts
  if (options.showTerminalCharts && !options.silent) {
    const { BenchmarkVisualizer } = sandbox;
    showTerminalCharts(report, BenchmarkVisualizer);
  }

  return report;
}

async function runBatch(batchConfig, options, sandbox) {
  const { Game, BenchmarkRunner, BatchRunner, ProgressMonitor, ResilientBenchmarkRunner } = sandbox;
  
  const logLevel = options.silent ? 'silent' : (options.verbose ? 'verbose' : 'info');
  const monitor = new ProgressMonitor({ logLevel });

  const batchRunner = new BatchRunner({
    maxParallel: options.parallel || 1,
    retryAttempts: options.retries || 3,
    checkpointPath: options.checkpoint || 'batch-checkpoint.json',
    progressCallback: (progress) => monitor.updateBatch(progress)
  });

  // Enqueue runs from batch config
  if (batchConfig.runs) {
    for (const runConfig of batchConfig.runs) {
      batchRunner.enqueue(runConfig, { source: 'batch' });
    }
  }

  monitor.startBatch(batchRunner.queue.length);

  // Run factory that creates fresh game instances
  const runnerFactory = () => {
    const game = new Game();
    const baseRunner = new BenchmarkRunner(game);
    return new ResilientBenchmarkRunner(baseRunner, {
      maxRetries: options.retries || 3
    });
  };

  const summary = await batchRunner.execute(runnerFactory);
  monitor.completeBatch(summary);

  // Save batch report
  const outPath = path.resolve(batchConfig.output || 'batch-report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  // Clear checkpoint on success
  await batchRunner.clearCheckpoint();

  if (!options.silent) {
    console.error(`Batch report: ${outPath}`);
  }

  // Generate comparison analysis
  if (options.compareRuns) {
    const { BatchAnalyzer } = sandbox;
    const analysisPath = path.resolve(batchConfig.analysisOutput || 'batch-analysis.json');
    const analysis = BatchAnalyzer.analyze(summary, { groupBy: batchConfig.groupBy });
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
    
    if (!options.silent) {
      console.error(`Analysis report: ${analysisPath}`);
    }

    // Generate markdown analysis report
    if (options.reportFormat === 'markdown' || options.reportFormat === 'md') {
      const mdPath = analysisPath.replace('.json', '.md');
      const mdReport = BatchAnalyzer.generateReport(summary, 'markdown');
      fs.writeFileSync(mdPath, mdReport);
      if (!options.silent) {
        console.error(`Markdown analysis: ${mdPath}`);
      }
    }
  }

  return summary;
}

async function runSweep(sweepConfig, options, sandbox) {
  const { Game, BenchmarkRunner, BatchRunner, ProgressMonitor, ResilientBenchmarkRunner, ParameterSweep } = sandbox;
  
  const logLevel = options.silent ? 'silent' : (options.verbose ? 'verbose' : 'info');
  const monitor = new ProgressMonitor({ logLevel });

  const batchRunner = new BatchRunner({
    maxParallel: options.parallel || 1,
    retryAttempts: options.retries || 3,
    checkpointPath: options.checkpoint || 'sweep-checkpoint.json',
    progressCallback: (progress) => monitor.updateBatch(progress)
  });

  // Generate parameter sweep
  const baseConfig = sweepConfig.baseConfig || {};
  const sweepParams = sweepConfig.sweep || {};
  const replicates = sweepConfig.replicates || 1;

  batchRunner.enqueueSweep(baseConfig, sweepParams, replicates);

  if (!options.silent) {
    console.error(`Generated ${batchRunner.queue.length} runs from parameter sweep`);
  }

  monitor.startBatch(batchRunner.queue.length);

  const runnerFactory = () => {
    const game = new Game();
    const baseRunner = new BenchmarkRunner(game);
    return new ResilientBenchmarkRunner(baseRunner, {
      maxRetries: options.retries || 3
    });
  };

  const summary = await batchRunner.execute(runnerFactory);
  monitor.completeBatch(summary);

  // Save sweep report with aggregated statistics
  const report = {
    ...summary,
    sweep: {
      parameters: sweepParams,
      replicates,
      combinations: Object.keys(sweepParams).length > 0 
        ? ParameterSweep.generateCombinations(sweepParams).length 
        : 1
    }
  };

  const outPath = path.resolve(sweepConfig.output || 'sweep-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  await batchRunner.clearCheckpoint();

  if (!options.silent) {
    console.error(`Sweep report: ${outPath}`);
  }

  // Generate comparison analysis for sweep
  if (options.compareRuns) {
    const { BatchAnalyzer } = sandbox;
    const analysisPath = path.resolve(sweepConfig.analysisOutput || 'sweep-analysis.json');
    const analysis = BatchAnalyzer.analyze(summary, { 
      groupBy: sweepConfig.groupBy || 'metadata.sweep' 
    });
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
    
    if (!options.silent) {
      console.error(`Analysis report: ${analysisPath}`);
    }

    // Generate markdown analysis report
    if (options.reportFormat === 'markdown' || options.reportFormat === 'md') {
      const mdPath = analysisPath.replace('.json', '.md');
      const mdReport = BatchAnalyzer.generateReport(summary, 'markdown');
      fs.writeFileSync(mdPath, mdReport);
      if (!options.silent) {
        console.error(`Markdown analysis: ${mdPath}`);
      }
    }
  }

  return report;
}

async function main() {
  const { options, singleRunConfig } = parseArgs(process.argv);

  const sandbox = createSandbox();
  const scripts = [
    'src/renderer/js/utils.js',
    'src/renderer/js/constants.js',
    'src/renderer/js/llm.js',
    'src/renderer/js/world.js',
    'src/renderer/js/village.js',
    'src/renderer/js/villager.js',
    'src/renderer/js/systems/economy.js',
    'src/renderer/js/systems/raid.js',
    'src/renderer/js/systems/diplomacy.js',
    'src/renderer/js/systems/baseline-agent.js',
    'src/renderer/js/systems/benchmark.js',
    'src/renderer/js/systems/batch-runner.js',
    'src/renderer/js/systems/progress-monitor.js',
    'src/renderer/js/systems/failure-handler.js',
    'src/renderer/js/systems/report-generator.js',
    'src/renderer/js/systems/benchmark-analysis.js',
    'src/renderer/js/systems/visualizer.js',
    'src/renderer/js/game.js'
  ];

  for (const script of scripts) {
    loadScript(script, sandbox);
  }

  const { llm } = sandbox;
  if (llm && !llm.config) {
    await llm.initialize?.();
  }

  let result;
  if (options.mode === 'batch') {
    result = await runBatch(options.batchConfig, options, sandbox);
    
    // Output summary to stdout
    console.log(JSON.stringify({
      mode: 'batch',
      total: result.total,
      completed: result.completed,
      failed: result.failed,
      successRate: (result.completed / result.total * 100).toFixed(1) + '%'
    }, null, 2));

  } else if (options.mode === 'sweep') {
    result = await runSweep(options.sweepConfig, options, sandbox);
    
    console.log(JSON.stringify({
      mode: 'sweep',
      combinations: result.sweep.combinations,
      replicates: result.sweep.replicates,
      totalRuns: result.total,
      completed: result.completed,
      failed: result.failed
    }, null, 2));

  } else {
    // Single run
    if (!options.silent) {
      console.error(`Simville benchmark — seed=${singleRunConfig.seed} days=${singleRunConfig.days}`);
      console.error(`  Agent A: ${singleRunConfig.agentA?.type} (${singleRunConfig.agentA?.name || singleRunConfig.agentA?.model || '?'})`);
      console.error(`  Agent B: ${singleRunConfig.agentB?.type} (${singleRunConfig.agentB?.name || singleRunConfig.agentB?.model || '?'})`);
    }

    result = await runSingle(singleRunConfig, options, sandbox);
    
    console.log(JSON.stringify({
      mode: 'single',
      winner: result.outcome.winner,
      reason: result.outcome.reason,
      margin: result.outcome.margin,
      daysSimulated: result.daysSimulated,
      final: result.final.map(v => ({
        slot: v.agent?.slot,
        name: v.villageName,
        compositeScore: v.compositeScore,
        population: v.population
      }))
    }, null, 2));
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
