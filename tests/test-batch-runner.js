/**
 * Unit tests for BatchRunner and ParameterSweep
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
    `;if (typeof BatchRunner !== 'undefined') globalThis.BatchRunner = BatchRunner;
     ;if (typeof ParameterSweep !== 'undefined') globalThis.ParameterSweep = ParameterSweep;
     ;if (typeof module !== 'undefined' && module.exports) {
       Object.assign(globalThis, module.exports);
     }`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  Math, Date, Object, Array, String, Number, Boolean, Map, Set, JSON,
  setTimeout, clearTimeout,
  require: (name) => {
    if (name === 'fs') return fs;
    throw new Error(`Module not available: ${name}`);
  }
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript('src/renderer/js/systems/batch-runner.js', sandbox);

const { BatchRunner, ParameterSweep } = sandbox;

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
    if (err.stack) console.error(`    ${err.stack.split('\n')[1]}`);
  }
}

console.log('\nParameterSweep');

test('generateCombinations with empty config returns single empty object', () => {
  const result = ParameterSweep.generateCombinations({});
  assert.strictEqual(result.length, 1);
  assert.strictEqual(Object.keys(result[0]).length, 0);
});

test('generateCombinations with one parameter', () => {
  const result = ParameterSweep.generateCombinations({
    temperature: [0.2, 0.4, 0.6]
  });
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].temperature, 0.2);
  assert.strictEqual(result[1].temperature, 0.4);
  assert.strictEqual(result[2].temperature, 0.6);
});

test('generateCombinations with multiple parameters', () => {
  const result = ParameterSweep.generateCombinations({
    temperature: [0.2, 0.4],
    maxTokens: [300, 500]
  });
  assert.strictEqual(result.length, 4);
  assert.ok(result.some(r => r.temperature === 0.2 && r.maxTokens === 300));
  assert.ok(result.some(r => r.temperature === 0.2 && r.maxTokens === 500));
  assert.ok(result.some(r => r.temperature === 0.4 && r.maxTokens === 300));
  assert.ok(result.some(r => r.temperature === 0.4 && r.maxTokens === 500));
});

test('applyOverrides applies simple overrides', () => {
  const base = { days: 15, seed: 42 };
  const overrides = { days: 20 };
  const result = ParameterSweep.applyOverrides(base, overrides);
  assert.strictEqual(result.days, 20);
  assert.strictEqual(result.seed, 42);
});

test('applyOverrides handles nested paths', () => {
  const base = { agentA: { type: 'llm', temperature: 0.4 } };
  const overrides = { 'agentA.temperature': 0.8 };
  const result = ParameterSweep.applyOverrides(base, overrides);
  assert.strictEqual(result.agentA.temperature, 0.8);
  assert.strictEqual(result.agentA.type, 'llm');
});

test('applyOverrides creates nested objects if missing', () => {
  const base = { days: 10 };
  const overrides = { 'agentA.model': 'gpt-4' };
  const result = ParameterSweep.applyOverrides(base, overrides);
  assert.strictEqual(result.agentA.model, 'gpt-4');
});

console.log('\nBatchRunner');

test('constructor initializes with defaults', () => {
  const runner = new BatchRunner();
  assert.strictEqual(runner.maxParallel, 1);
  assert.strictEqual(runner.retryAttempts, 3);
  assert.strictEqual(runner.queue.length, 0);
});

test('constructor accepts custom options', () => {
  const runner = new BatchRunner({ 
    maxParallel: 4, 
    retryAttempts: 5,
    checkpointPath: 'custom.json'
  });
  assert.strictEqual(runner.maxParallel, 4);
  assert.strictEqual(runner.retryAttempts, 5);
  assert.strictEqual(runner.checkpointPath, 'custom.json');
});

test('enqueue adds job to queue', () => {
  const runner = new BatchRunner();
  const config = { days: 10, seed: 42 };
  runner.enqueue(config, { test: true });
  
  assert.strictEqual(runner.queue.length, 1);
  assert.strictEqual(runner.queue[0].config.days, 10);
  assert.strictEqual(runner.queue[0].metadata.test, true);
  assert.strictEqual(runner.queue[0].status, 'queued');
  assert.strictEqual(runner.queue[0].attempts, 0);
});

test('enqueue generates unique IDs', () => {
  const runner = new BatchRunner();
  runner.enqueue({ seed: 1 });
  runner.enqueue({ seed: 2 });
  
  assert.strictEqual(runner.queue.length, 2);
  assert.notStrictEqual(runner.queue[0].id, runner.queue[1].id);
});

test('enqueueSweep generates correct number of jobs', () => {
  const runner = new BatchRunner();
  const base = { days: 10 };
  const sweep = {
    seed: [1, 2],
    days: [10, 20]
  };
  
  runner.enqueueSweep(base, sweep, 1);
  assert.strictEqual(runner.queue.length, 4); // 2 seeds × 2 days
});

test('enqueueSweep handles replicates', () => {
  const runner = new BatchRunner();
  const base = { days: 10 };
  const sweep = { temperature: [0.2, 0.4] };
  
  runner.enqueueSweep(base, sweep, 3);
  // 2 temperatures × 3 replicates = 6 runs
  assert.strictEqual(runner.queue.length, 6);
});

test('estimateRemaining returns null with no completed', () => {
  const runner = new BatchRunner();
  runner.queue = [{ id: '1' }, { id: '2' }];
  
  const eta = runner.estimateRemaining();
  assert.strictEqual(eta, null);
});

test('estimateRemaining calculates based on completed runs', () => {
  const runner = new BatchRunner();
  runner.startTime = Date.now() - 10000;
  runner.queue = [{ id: '1' }, { id: '2' }];
  runner.completed = [
    { startedAt: Date.now() - 5000, completedAt: Date.now() - 4000 },
    { startedAt: Date.now() - 3000, completedAt: Date.now() - 2000 }
  ];
  
  const eta = runner.estimateRemaining();
  assert.ok(eta > 0);
  assert.ok(eta < 10000); // Should be reasonable
});

test('sleep returns promise', async () => {
  const runner = new BatchRunner();
  const start = Date.now();
  await runner.sleep(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 45); // Allow some tolerance
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
