/**
 * Unit tests for FailureHandler and ResilientBenchmarkRunner
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
    `;if (typeof FailureHandler !== 'undefined') globalThis.FailureHandler = FailureHandler;
     ;if (typeof ResilientBenchmarkRunner !== 'undefined') globalThis.ResilientBenchmarkRunner = ResilientBenchmarkRunner;
     ;if (typeof GracefulDegradation !== 'undefined') globalThis.GracefulDegradation = GracefulDegradation;
     ;if (typeof module !== 'undefined' && module.exports) {
       Object.assign(globalThis, module.exports);
     }`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

const sandbox = {
  console: { error: () => {} },
  module: { exports: {} },
  exports: {},
  Math, Date, Object, Array, String, Number, Boolean, Map, Set, JSON,
  setTimeout, clearTimeout,
  Error
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript('src/renderer/js/systems/failure-handler.js', sandbox);

const { FailureHandler, ResilientBenchmarkRunner, GracefulDegradation } = sandbox;

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

console.log('\nFailureHandler');

test('constructor sets default options', () => {
  const handler = new FailureHandler();
  assert.strictEqual(handler.maxRetries, 3);
  assert.strictEqual(handler.retryDelayMs, 5000);
  assert.strictEqual(handler.enableGracefulDegradation, true);
  assert.strictEqual(handler.failureLog.length, 0);
});

test('categorizeError identifies network errors', () => {
  const handler = new FailureHandler();
  const error = new Error('fetch failed: ECONNREFUSED');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'network');
  assert.strictEqual(category.retryable, true);
  assert.strictEqual(category.severity, 'transient');
});

test('categorizeError identifies rate limit errors', () => {
  const handler = new FailureHandler();
  const error = new Error('Rate limit exceeded (429)');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'rate_limit');
  assert.strictEqual(category.retryable, true);
});

test('categorizeError identifies auth errors', () => {
  const handler = new FailureHandler();
  const error = new Error('Unauthorized: invalid API key');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'auth');
  assert.strictEqual(category.retryable, false);
  assert.strictEqual(category.severity, 'fatal');
});

test('categorizeError identifies API errors', () => {
  const handler = new FailureHandler();
  const error = new Error('OpenAI API error');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'api');
  assert.strictEqual(category.retryable, true);
});

test('categorizeError identifies validation errors', () => {
  const handler = new FailureHandler();
  const error = new Error('Invalid config: missing seed');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'validation');
  assert.strictEqual(category.retryable, false);
});

test('categorizeError identifies memory errors', () => {
  const handler = new FailureHandler();
  const error = new Error('Out of memory: heap limit exceeded');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'memory');
  assert.strictEqual(category.retryable, false);
});

test('categorizeError identifies simulation errors', () => {
  const handler = new FailureHandler();
  const error = new Error('Villager action failed');
  
  const category = handler.categorizeError(error);
  
  assert.strictEqual(category.type, 'simulation');
  assert.strictEqual(category.retryable, false);
});

test('logFailure records failure', () => {
  const handler = new FailureHandler();
  const category = { type: 'network', severity: 'transient', retryable: true, message: 'Connection failed' };
  
  handler.logFailure(category, { seed: 42 });
  
  assert.strictEqual(handler.failureLog.length, 1);
  assert.strictEqual(handler.failureLog[0].type, 'network');
  assert.strictEqual(handler.failureLog[0].runContext.seed, 42);
});

test('getStats aggregates failures', () => {
  const handler = new FailureHandler();
  handler.logFailure({ type: 'network', retryable: true });
  handler.logFailure({ type: 'network', retryable: true });
  handler.logFailure({ type: 'auth', retryable: false });
  
  const stats = handler.getStats();
  
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.byType.network, 2);
  assert.strictEqual(stats.byType.auth, 1);
  assert.strictEqual(stats.retryable, 2);
  assert.strictEqual(stats.nonRetryable, 1);
});

test('getRetryDelay uses exponential backoff', () => {
  const handler = new FailureHandler();
  const category = { type: 'network' };
  
  assert.strictEqual(handler.getRetryDelay(1, category), 5000);
  assert.strictEqual(handler.getRetryDelay(2, category), 10000);
  assert.strictEqual(handler.getRetryDelay(3, category), 20000);
});

test('getRetryDelay uses longer delay for rate limits', () => {
  const handler = new FailureHandler();
  const category = { type: 'rate_limit' };
  
  const delay = handler.getRetryDelay(1, category);
  assert.ok(delay >= 30000);
});

test('generateReport includes all failures', () => {
  const handler = new FailureHandler();
  handler.logFailure({ type: 'network', message: 'Connection timeout', retryable: true });
  handler.logFailure({ type: 'api', message: 'API error', retryable: true });
  
  const report = handler.generateReport();
  
  assert.strictEqual(report.totalFailures, 2);
  assert.strictEqual(report.failures.length, 2);
  assert.ok(report.stats);
});

console.log('\nResilientBenchmarkRunner');

test('constructor initializes with base runner', () => {
  const baseRunner = { run: async () => ({ success: true }) };
  const resilient = new ResilientBenchmarkRunner(baseRunner);
  
  assert.ok(resilient.baseRunner);
  assert.ok(resilient.failureHandler);
  assert.strictEqual(resilient.maxRetries, 3);
});

test('run succeeds on first attempt', async () => {
  const baseRunner = { run: async () => ({ success: true }) };
  const resilient = new ResilientBenchmarkRunner(baseRunner, { maxRetries: 3 });
  
  const result = await resilient.run({ seed: 42 });
  
  assert.strictEqual(result.success, true);
});

test('run retries on retryable error', async () => {
  let attempts = 0;
  const baseRunner = {
    run: async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('network timeout');
      }
      return { success: true };
    }
  };
  const resilient = new ResilientBenchmarkRunner(baseRunner, { maxRetries: 3 });
  
  const result = await resilient.run({ seed: 42 });
  
  assert.strictEqual(attempts, 2);
  assert.strictEqual(result.success, true);
});

test('run throws after max retries', async () => {
  const baseRunner = {
    run: async () => { throw new Error('network timeout'); }
  };
  const resilient = new ResilientBenchmarkRunner(baseRunner, { maxRetries: 2 });
  
  let thrown = false;
  try {
    await resilient.run({ seed: 42 });
  } catch (err) {
    thrown = true;
    assert.ok(err.message.includes('failed after 2 attempt'));
  }
  
  assert.ok(thrown);
});

test('run does not retry non-retryable errors', async () => {
  let attempts = 0;
  const baseRunner = {
    run: async () => {
      attempts++;
      throw new Error('Invalid API key');
    }
  };
  const resilient = new ResilientBenchmarkRunner(baseRunner, { maxRetries: 3 });
  
  let thrown = false;
  try {
    await resilient.run({ seed: 42 });
  } catch (err) {
    thrown = true;
  }
  
  assert.strictEqual(attempts, 1); // Should not retry
  assert.ok(thrown);
});

test('enrichError adds context', () => {
  const baseRunner = { run: async () => {} };
  const resilient = new ResilientBenchmarkRunner(baseRunner);
  
  const original = new Error('Test error');
  const category = { type: 'network', retryable: true };
  const enriched = resilient.enrichError(original, category, 3);
  
  assert.ok(enriched.message.includes('3 attempt'));
  assert.strictEqual(enriched.originalError, original);
  assert.strictEqual(enriched.category.type, 'network');
  assert.strictEqual(enriched.attempts, 3);
});

console.log('\nGracefulDegradation');

test('salvagePartialResults returns null for no game', () => {
  const result = GracefulDegradation.salvagePartialResults(null, new Error('test'));
  assert.strictEqual(result, null);
});

test('salvagePartialResults captures available state', () => {
  const game = {
    timeState: { day: 10 },
    villages: [
      { id: 'v1', name: 'Village A' }
    ],
    getVillagersForVillage: () => [{ id: 'p1' }, { id: 'p2' }],
    getResources: () => ({ food: 10, wood: 5 })
  };
  
  const result = GracefulDegradation.salvagePartialResults(game, new Error('test'));
  
  assert.strictEqual(result.incomplete, true);
  assert.strictEqual(result.daysSimulated, 10);
  assert.strictEqual(result.villages.length, 1);
  assert.strictEqual(result.villages[0].population, 2);
  assert.strictEqual(result.villages[0].resources.food, 10);
});

test('simplifyConfig reduces days for memory errors', () => {
  const config = { days: 100, seed: 42 };
  const error = { type: 'memory' };
  
  const simplified = GracefulDegradation.simplifyConfig(config, error);
  
  assert.strictEqual(simplified.days, 10);
  assert.strictEqual(simplified.seed, 42);
});

test('simplifyConfig increases tick interval for API errors', () => {
  const config = { tickIntervalMs: 5000 };
  const error = { type: 'api' };
  
  const simplified = GracefulDegradation.simplifyConfig(config, error);
  
  assert.strictEqual(simplified.tickIntervalMs, 10000);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
