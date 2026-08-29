/**
 * Unit tests for ProgressMonitor and ResourceTracker
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
    `;if (typeof ProgressMonitor !== 'undefined') globalThis.ProgressMonitor = ProgressMonitor;
     ;if (typeof ResourceTracker !== 'undefined') globalThis.ResourceTracker = ResourceTracker;
     ;if (typeof TimeoutGuard !== 'undefined') globalThis.TimeoutGuard = TimeoutGuard;
     ;if (typeof module !== 'undefined' && module.exports) {
       Object.assign(globalThis, module.exports);
     }`;
  vm.runInContext(code, sandbox, { filename: relPath });
}

const sandbox = {
  console: { error: () => {} }, // Suppress console output during tests
  module: { exports: {} },
  exports: {},
  Math, Date, Object, Array, String, Number, Boolean, Map, Set, JSON,
  setTimeout, clearTimeout,
  process: { memoryUsage: () => ({ heapUsed: 100000000, heapTotal: 200000000, external: 10000000 }), cpuUsage: () => ({ user: 1000000, system: 500000 }) }
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

loadScript('src/renderer/js/systems/progress-monitor.js', sandbox);

const { ProgressMonitor, ResourceTracker, TimeoutGuard } = sandbox;

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

console.log('\nProgressMonitor');

test('constructor sets default options', () => {
  const monitor = new ProgressMonitor();
  assert.strictEqual(monitor.enableConsole, true);
  assert.strictEqual(monitor.updateIntervalMs, 1000);
  assert.strictEqual(monitor.logLevel, 'info');
});

test('constructor accepts custom options', () => {
  const monitor = new ProgressMonitor({ 
    enableConsole: false, 
    updateIntervalMs: 500,
    logLevel: 'verbose'
  });
  assert.strictEqual(monitor.enableConsole, false);
  assert.strictEqual(monitor.updateIntervalMs, 500);
  assert.strictEqual(monitor.logLevel, 'verbose');
});

test('startRun initializes currentRun', () => {
  const monitor = new ProgressMonitor({ logLevel: 'silent' });
  const config = { seed: 42, days: 10 };
  monitor.startRun(config);
  
  assert.ok(monitor.currentRun);
  assert.strictEqual(monitor.currentRun.config.seed, 42);
  assert.strictEqual(monitor.currentRun.ticks, 0);
  assert.strictEqual(monitor.currentRun.days, 0);
  assert.ok(monitor.currentRun.startTime > 0);
});

test('updateRun updates progress', () => {
  const monitor = new ProgressMonitor({ logLevel: 'silent' });
  monitor.startRun({ days: 30 });
  monitor.lastUpdate = 0; // Force update
  
  monitor.updateRun({ ticks: 10, day: 5 });
  
  assert.strictEqual(monitor.currentRun.ticks, 10);
  assert.strictEqual(monitor.currentRun.days, 5);
});

test('updateRun respects update interval', () => {
  const monitor = new ProgressMonitor({ logLevel: 'silent', updateIntervalMs: 10000 });
  monitor.startRun({ days: 30 });
  monitor.lastUpdate = Date.now();
  
  const before = monitor.currentRun.ticks;
  monitor.updateRun({ ticks: 99, day: 10 });
  
  // Should not update because interval hasn't passed
  assert.strictEqual(monitor.currentRun.ticks, before);
});

test('recordEvent stores events', () => {
  const monitor = new ProgressMonitor({ logLevel: 'silent' });
  monitor.startRun({ days: 10 });
  monitor.currentRun.days = 5;
  
  monitor.recordEvent('raid', { attacker: 'A', defender: 'B' });
  
  assert.strictEqual(monitor.currentRun.events.length, 1);
  assert.strictEqual(monitor.currentRun.events[0].type, 'raid');
  assert.strictEqual(monitor.currentRun.events[0].day, 5);
  assert.deepStrictEqual(monitor.currentRun.events[0].data, { attacker: 'A', defender: 'B' });
});

test('completeRun clears currentRun', () => {
  const monitor = new ProgressMonitor({ logLevel: 'silent' });
  monitor.startRun({ days: 10 });
  monitor.completeRun({ outcome: { winner: 'A' } });
  
  assert.strictEqual(monitor.currentRun, null);
});

test('estimateETA calculates correctly', () => {
  const monitor = new ProgressMonitor();
  const eta = monitor.estimateETA(10, 100, 1000);
  assert.strictEqual(eta, 9000); // (100-10) * (1000/10)
});

test('estimateETA returns null for zero current', () => {
  const monitor = new ProgressMonitor();
  const eta = monitor.estimateETA(0, 100, 1000);
  assert.strictEqual(eta, null);
});

test('formatDuration handles seconds', () => {
  const monitor = new ProgressMonitor();
  assert.strictEqual(monitor.formatDuration(5000), '5s');
  assert.strictEqual(monitor.formatDuration(45000), '45s');
});

test('formatDuration handles minutes', () => {
  const monitor = new ProgressMonitor();
  assert.strictEqual(monitor.formatDuration(90000), '1m 30s');
  assert.strictEqual(monitor.formatDuration(300000), '5m 0s');
});

test('formatDuration handles hours', () => {
  const monitor = new ProgressMonitor();
  assert.strictEqual(monitor.formatDuration(3700000), '1h 1m');
  assert.strictEqual(monitor.formatDuration(7200000), '2h 0m');
});

test('formatBytes handles different scales', () => {
  const monitor = new ProgressMonitor();
  assert.strictEqual(monitor.formatBytes(500), '500B');
  assert.strictEqual(monitor.formatBytes(1024), '1.0KB');
  assert.strictEqual(monitor.formatBytes(1024 * 1024), '1.0MB');
  assert.strictEqual(monitor.formatBytes(1024 * 1024 * 1024), '1.0GB');
});

test('timestamp returns time string', () => {
  const monitor = new ProgressMonitor();
  const ts = monitor.timestamp();
  assert.ok(ts.match(/^\d{2}:\d{2}:\d{2}$/));
});

console.log('\nResourceTracker');

test('sample captures resource usage', () => {
  const tracker = new ResourceTracker();
  const usage = tracker.sample();
  
  assert.ok(usage.timestamp > 0);
  assert.ok(typeof usage.memoryUsedMB === 'number');
  assert.strictEqual(tracker.samples.length, 1);
});

test('sample limits stored samples', () => {
  const tracker = new ResourceTracker();
  tracker.maxSamples = 5;
  
  for (let i = 0; i < 10; i++) {
    tracker.sample();
  }
  
  assert.strictEqual(tracker.samples.length, 5);
});

test('getStats calculates statistics', () => {
  const tracker = new ResourceTracker();
  tracker.samples = [
    { memoryUsedMB: 100 },
    { memoryUsedMB: 150 },
    { memoryUsedMB: 200 }
  ];
  
  const stats = tracker.getStats();
  assert.strictEqual(stats.memory.current, 200);
  assert.strictEqual(stats.memory.min, 100);
  assert.strictEqual(stats.memory.max, 200);
  assert.strictEqual(stats.memory.avg, 150);
  assert.strictEqual(stats.samples, 3);
});

test('getStats returns null for empty samples', () => {
  const tracker = new ResourceTracker();
  const stats = tracker.getStats();
  assert.strictEqual(stats, null);
});

console.log('\nTimeoutGuard');

test('start sets timer', () => {
  let called = false;
  const guard = new TimeoutGuard(100, () => { called = true; });
  guard.start();
  
  assert.ok(guard.timerId);
  assert.ok(guard.startTime > 0);
  
  guard.clear();
});

test('clear removes timer', () => {
  const guard = new TimeoutGuard(100, () => {});
  guard.start();
  const timerId = guard.timerId;
  
  guard.clear();
  
  assert.strictEqual(guard.timerId, null);
});

test('extend increases timeout', () => {
  const guard = new TimeoutGuard(1000, () => {});
  guard.start();
  
  guard.extend(500);
  
  assert.strictEqual(guard.timeoutMs, 1500);
  assert.ok(guard.timerId);
  
  guard.clear();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
