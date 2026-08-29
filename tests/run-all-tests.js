#!/usr/bin/env node
/**
 * Comprehensive test runner for all Simville tests
 * Run: npm test
 * Run specific suite: node tests/run-all-tests.js batch-runner
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testSuites = [
  { name: 'Core Systems', file: 'run-unit-tests.js' },
  { name: 'Batch Runner', file: 'test-batch-runner.js' },
  { name: 'Progress Monitor', file: 'test-progress-monitor.js' },
  { name: 'Failure Handler', file: 'test-failure-handler.js' },
  { name: 'Report Generator', file: 'test-report-generator.js' },
  { name: 'Benchmark Analysis', file: 'test-benchmark-analysis.js' },
  { name: 'Visualizer', file: 'test-visualizer.js' },
  { name: 'Advanced Metrics', file: 'test-advanced-metrics.js' }
];

let totalPassed = 0;
let totalFailed = 0;
let failedSuites = [];

async function runTest(testFile) {
  const testPath = path.join(__dirname, testFile);
  
  if (!fs.existsSync(testPath)) {
    console.error(`  ✗ Test file not found: ${testFile}`);
    return { passed: 0, failed: 1 };
  }

  return new Promise((resolve) => {
    const proc = spawn('node', [testPath], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      resolve({ exitCode: code });
    });

    proc.on('error', (err) => {
      console.error(`  ✗ Failed to run ${testFile}:`, err.message);
      resolve({ exitCode: 1 });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let suitesToRun = testSuites;

  // Filter by name if provided
  if (args.length > 0) {
    const filter = args[0].toLowerCase();
    suitesToRun = testSuites.filter(suite => 
      suite.name.toLowerCase().includes(filter) || 
      suite.file.toLowerCase().includes(filter)
    );
    
    if (suitesToRun.length === 0) {
      console.error(`No test suites match "${filter}"`);
      console.error('\nAvailable suites:');
      testSuites.forEach(s => console.error(`  - ${s.name} (${s.file})`));
      process.exit(1);
    }
  }

  console.log('='.repeat(70));
  console.log('Simville Test Suite');
  console.log('='.repeat(70));
  console.log(`Running ${suitesToRun.length} test suite(s)...\n`);

  const startTime = Date.now();

  for (const suite of suitesToRun) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Running: ${suite.name}`);
    console.log(`${'─'.repeat(70)}`);

    const result = await runTest(suite.file);

    if (result.exitCode !== 0) {
      failedSuites.push(suite.name);
      totalFailed++;
    } else {
      totalPassed++;
    }
  }

  const duration = Date.now() - startTime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('Test Summary');
  console.log(`${'='.repeat(70)}`);
  console.log(`Total suites: ${suitesToRun.length}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);

  if (failedSuites.length > 0) {
    console.log(`\nFailed suites:`);
    failedSuites.forEach(name => console.log(`  ✗ ${name}`));
  }

  console.log(`${'='.repeat(70)}\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
