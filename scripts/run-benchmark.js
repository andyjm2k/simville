#!/usr/bin/env node
/**
 * Headless benchmark: LLM village vs baseline (or LLM vs LLM).
 *
 * Usage:
 *   node scripts/run-benchmark.js --config benchmark.example.json
 *   node scripts/run-benchmark.js --days 10 --seed 42 --agent-a-type llm --agent-b-type baseline
 *
 * Environment:
 *   SIMVILLE_LLM_ENDPOINT, SIMVILLE_LLM_MODEL, SIMVILLE_LLM_API_KEY
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function parseArgs(argv) {
  const config = {
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
      Object.assign(config, JSON.parse(fs.readFileSync(path.resolve(argv[++i]), 'utf8')));
    } else if (arg === '--days' && argv[i + 1]) {
      config.days = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1]) {
      config.seed = Number(argv[++i]);
    } else if (arg === '--output' && argv[i + 1]) {
      config.output = argv[++i];
    } else if (arg === '--agent-a-type' && argv[i + 1]) {
      config.agentA = { ...(config.agentA || {}), type: argv[++i] };
    } else if (arg === '--agent-b-type' && argv[i + 1]) {
      config.agentB = { ...(config.agentB || {}), type: argv[++i] };
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Simville benchmark runner

Options:
  --config <file>       JSON config (see benchmark.example.json)
  --days <n>            Simulation horizon in in-game days
  --seed <n>            World RNG seed
  --output <file>       Report path (default benchmark-report.json)
  --agent-a-type llm|baseline
  --agent-b-type llm|baseline

Env: SIMVILLE_LLM_ENDPOINT, SIMVILLE_LLM_MODEL, SIMVILLE_LLM_API_KEY`);
      process.exit(0);
    }
  }

  if (process.env.SIMVILLE_LLM_ENDPOINT) {
    config.agentA = config.agentA || { type: 'llm' };
    config.agentA.endpoint = process.env.SIMVILLE_LLM_ENDPOINT;
    config.agentA.model = process.env.SIMVILLE_LLM_MODEL || config.agentA.model || 'gpt-4o-mini';
    config.agentA.apiKey = process.env.SIMVILLE_LLM_API_KEY || config.agentA.apiKey || '';
  }

  return config;
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

async function main() {
  const config = parseArgs(process.argv);
  console.error(`Simville benchmark — seed=${config.seed} days=${config.days}`);
  console.error(`  Agent A: ${config.agentA?.type} (${config.agentA?.name || config.agentA?.model || '?'})`);
  console.error(`  Agent B: ${config.agentB?.type} (${config.agentB?.name || config.agentB?.model || '?'})`);

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
    'src/renderer/js/game.js'
  ];

  for (const script of scripts) {
    loadScript(script, sandbox);
  }

  const { Game, BenchmarkRunner, llm } = sandbox;
  const game = new Game();
  sandbox.game = game;
  sandbox.window.game = game;

  if (llm && !llm.config) {
    await llm.initialize?.();
  }

  const runner = new BenchmarkRunner(game);
  const report = await runner.run(config);

  const outPath = path.resolve(config.output || 'benchmark-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.error(`\nBenchmark complete in ${report.durationMs}ms`);
  console.error(`Winner: ${report.outcome.winner} (${report.outcome.reason}, margin=${report.outcome.margin})`);
  console.error(`Report: ${outPath}`);

  // Summary JSON to stdout for piping
  console.log(JSON.stringify({
    winner: report.outcome.winner,
    reason: report.outcome.reason,
    margin: report.outcome.margin,
    daysSimulated: report.daysSimulated,
    final: report.final.map(v => ({
      slot: v.agent?.slot,
      name: v.villageName,
      compositeScore: v.compositeScore,
      population: v.population
    }))
  }, null, 2));
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
