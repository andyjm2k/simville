#!/usr/bin/env node
/**
 * Headless QA harness CLI for Simville.
 *
 * Usage:
 *   node tests/qa/harness.js --list
 *   node tests/qa/harness.js --suite world-generation
 *   node tests/qa/harness.js --regression
 *   node tests/qa/harness.js --unit
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const QA_SUITES = [
  { id: 'world-generation', file: 'tests/qa/world-generation.test.js', description: 'Procedural world and village bootstrap' },
  { id: 'village-assignment', file: 'tests/qa/village-assignment.test.js', description: 'Multi-village villager assignment' },
  { id: 'save-roundtrip', file: 'tests/qa/save-roundtrip.test.js', description: 'Save/load state persistence' },
  { id: 'raid-state-machine', file: 'tests/qa/raid-state-machine.test.js', description: 'War and raid lifecycle' },
  { id: 'simulation-tick', file: 'tests/qa/simulation-tick.test.js', description: 'Game loop time and needs decay' },
  { id: 'llm-fallback', file: 'tests/qa/llm-fallback.test.js', description: 'Offline LLM fallback behavior' },
  { id: 'villager-needs', file: 'tests/qa/villager-needs.test.js', description: 'Needs-driven activity overrides' }
];

function printHelp() {
  console.log(`Simville QA Harness

Options:
  --list                 List available QA suites
  --suite <name>         Run one QA suite by id
  --regression           Run all QA functional suites
  --unit                 Run unit tests only
  --all                  Run unit + QA suites (default for npm test)
  --coverage             Include coverage report
  --help                 Show this help text

Examples:
  node tests/qa/harness.js --suite save-roundtrip
  node tests/qa/harness.js --regression --coverage
`);
}

function runVitest(args) {
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

function parseArgs(argv) {
  const options = {
    list: false,
    suite: null,
    regression: false,
    unit: false,
    all: false,
    coverage: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--regression') options.regression = true;
    else if (arg === '--unit') options.unit = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--coverage') options.coverage = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--suite') options.suite = argv[++i];
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.list) {
  console.log('Available QA suites:\n');
  QA_SUITES.forEach((suite) => {
    console.log(`  ${suite.id.padEnd(22)} ${suite.description}`);
  });
  process.exit(0);
}

const vitestArgs = [];

if (options.coverage) {
  vitestArgs.push('--coverage');
}

if (options.suite) {
  const match = QA_SUITES.find((suite) => suite.id === options.suite);
  if (!match) {
    console.error(`Unknown suite "${options.suite}". Run with --list to see options.`);
    process.exit(1);
  }
  vitestArgs.push(match.file);
} else if (options.unit) {
  vitestArgs.push('tests/unit');
} else if (options.regression) {
  vitestArgs.push('tests/qa');
} else if (options.all) {
  vitestArgs.push('tests/unit', 'tests/qa');
} else {
  printHelp();
  process.exit(0);
}

runVitest(vitestArgs);
