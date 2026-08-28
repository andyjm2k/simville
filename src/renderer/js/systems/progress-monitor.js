// Progress monitoring and observability for benchmark runs

/**
 * Tracks and displays progress for benchmark execution.
 */
class ProgressMonitor {
  constructor(options = {}) {
    this.enableConsole = options.enableConsole !== false;
    this.updateIntervalMs = options.updateIntervalMs || 1000;
    this.logLevel = options.logLevel || 'info'; // 'silent', 'info', 'verbose'
    
    this.currentRun = null;
    this.batchStats = null;
    this.lastUpdate = 0;
    this.startTime = null;
    this.resourceTracker = new ResourceTracker();
  }

  /**
   * Start monitoring a single run.
   * @param {object} config
   */
  startRun(config) {
    this.currentRun = {
      config,
      startTime: Date.now(),
      ticks: 0,
      days: 0,
      events: [],
      lastTick: Date.now()
    };
    this.startTime = Date.now();
    
    if (this.logLevel !== 'silent') {
      console.error(`\n[${this.timestamp()}] Starting benchmark run...`);
      console.error(`  Seed: ${config.seed}, Days: ${config.days}`);
    }
  }

  /**
   * Update progress during a run.
   * @param {object} state
   */
  updateRun(state) {
    if (!this.currentRun) return;

    const now = Date.now();
    if (now - this.lastUpdate < this.updateIntervalMs) return;
    this.lastUpdate = now;

    this.currentRun.ticks = state.ticks || 0;
    this.currentRun.days = state.day || 0;
    
    const elapsed = now - this.currentRun.startTime;
    const targetDays = this.currentRun.config.days || 30;
    const progress = Math.min(100, (this.currentRun.days / targetDays) * 100);
    const eta = this.estimateETA(this.currentRun.days, targetDays, elapsed);

    if (this.logLevel === 'verbose') {
      const resources = this.resourceTracker.sample();
      console.error(
        `[${this.timestamp()}] Day ${this.currentRun.days}/${targetDays} ` +
        `(${progress.toFixed(1)}%) | ETA: ${this.formatDuration(eta)} | ` +
        `Memory: ${this.formatBytes(resources.memoryUsedMB * 1024 * 1024)}`
      );
    } else if (this.logLevel === 'info' && this.currentRun.days % 5 === 0) {
      console.error(
        `[${this.timestamp()}] Progress: ${progress.toFixed(1)}% ` +
        `(Day ${this.currentRun.days}/${targetDays}), ETA: ${this.formatDuration(eta)}`
      );
    }
  }

  /**
   * Record a benchmark event (raid, diplomacy, etc).
   * @param {string} type
   * @param {object} data
   */
  recordEvent(type, data) {
    if (!this.currentRun) return;
    
    this.currentRun.events.push({
      type,
      day: this.currentRun.days,
      timestamp: Date.now(),
      data
    });

    if (this.logLevel === 'verbose') {
      console.error(`[${this.timestamp()}] Event: ${type}`, data);
    }
  }

  /**
   * Complete the current run.
   * @param {object} result
   */
  completeRun(result) {
    if (!this.currentRun) return;

    const duration = Date.now() - this.currentRun.startTime;
    
    if (this.logLevel !== 'silent') {
      console.error(`\n[${this.timestamp()}] Benchmark completed in ${this.formatDuration(duration)}`);
      console.error(`  Winner: ${result.outcome?.winner} (${result.outcome?.reason})`);
      console.error(`  Days simulated: ${result.daysSimulated}`);
      console.error(`  Ticks executed: ${result.ticksExecuted}`);
    }

    this.currentRun = null;
  }

  /**
   * Start monitoring a batch of runs.
   * @param {number} total
   */
  startBatch(total) {
    this.batchStats = {
      total,
      completed: 0,
      failed: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      runDurations: []
    };

    if (this.logLevel !== 'silent') {
      console.error(`\n${'='.repeat(60)}`);
      console.error(`Starting batch execution: ${total} runs`);
      console.error(`Parallel workers: ${this.maxParallel || 1}`);
      console.error(`${'='.repeat(60)}\n`);
    }
  }

  /**
   * Update batch progress.
   * @param {object} progress
   */
  updateBatch(progress) {
    if (!this.batchStats) return;

    const now = Date.now();
    if (now - this.batchStats.lastUpdate < this.updateIntervalMs) return;
    this.batchStats.lastUpdate = now;

    this.batchStats.completed = progress.completed || 0;
    this.batchStats.failed = progress.failed || 0;

    const pct = (this.batchStats.completed / this.batchStats.total * 100).toFixed(1);
    const elapsed = now - this.batchStats.startTime;
    const eta = progress.estimatedRemainingMs || this.estimateETA(
      this.batchStats.completed,
      this.batchStats.total,
      elapsed
    );

    const resources = this.resourceTracker.sample();

    if (this.logLevel !== 'silent') {
      console.error(
        `[${this.timestamp()}] Batch Progress: ${this.batchStats.completed}/${this.batchStats.total} ` +
        `(${pct}%) | Running: ${progress.running || 0} | Failed: ${this.batchStats.failed} | ` +
        `ETA: ${this.formatDuration(eta)} | Memory: ${this.formatBytes(resources.memoryUsedMB * 1024 * 1024)}`
      );
    }
  }

  /**
   * Complete batch execution.
   * @param {object} summary
   */
  completeBatch(summary) {
    if (!this.batchStats) return;

    const duration = Date.now() - this.batchStats.startTime;

    if (this.logLevel !== 'silent') {
      console.error(`\n${'='.repeat(60)}`);
      console.error(`Batch execution completed in ${this.formatDuration(duration)}`);
      console.error(`  Total runs: ${summary.total}`);
      console.error(`  Completed: ${summary.completed}`);
      console.error(`  Failed: ${summary.failed}`);
      console.error(`  Success rate: ${(summary.completed / summary.total * 100).toFixed(1)}%`);
      console.error(`${'='.repeat(60)}\n`);
    }

    this.batchStats = null;
  }

  /**
   * Estimate time remaining.
   * @param {number} current
   * @param {number} target
   * @param {number} elapsed
   * @returns {number}
   */
  estimateETA(current, target, elapsed) {
    if (current === 0) return null;
    const rate = elapsed / current;
    return Math.round(rate * (target - current));
  }

  /**
   * Format duration in human-readable form.
   * @param {number} ms
   * @returns {string}
   */
  formatDuration(ms) {
    if (!ms || ms < 0) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format bytes in human-readable form.
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  /**
   * Get current timestamp string.
   * @returns {string}
   */
  timestamp() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  }

  /**
   * Get current resource usage snapshot.
   * @returns {object}
   */
  getResourceSnapshot() {
    return this.resourceTracker.sample();
  }
}

/**
 * Tracks system resource usage.
 */
class ResourceTracker {
  constructor() {
    this.samples = [];
    this.maxSamples = 100;
  }

  /**
   * Sample current resource usage.
   * @returns {object}
   */
  sample() {
    const usage = {
      timestamp: Date.now(),
      memoryUsedMB: 0,
      cpuPercent: 0
    };

    // Node.js memory tracking
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      usage.memoryUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
      usage.memoryTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
      usage.memoryExternalMB = Math.round(mem.external / 1024 / 1024);
    }

    // CPU usage (if available)
    if (typeof process !== 'undefined' && process.cpuUsage) {
      const cpu = process.cpuUsage();
      usage.cpuUserMs = Math.round(cpu.user / 1000);
      usage.cpuSystemMs = Math.round(cpu.system / 1000);
    }

    this.samples.push(usage);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    return usage;
  }

  /**
   * Get statistics over all samples.
   * @returns {object}
   */
  getStats() {
    if (this.samples.length === 0) return null;

    const memValues = this.samples.map(s => s.memoryUsedMB);
    return {
      memory: {
        current: memValues[memValues.length - 1],
        avg: memValues.reduce((a, b) => a + b, 0) / memValues.length,
        max: Math.max(...memValues),
        min: Math.min(...memValues)
      },
      samples: this.samples.length
    };
  }
}

/**
 * Timeout detection and handling.
 */
class TimeoutGuard {
  constructor(timeoutMs, onTimeout) {
    this.timeoutMs = timeoutMs;
    this.onTimeout = onTimeout;
    this.timerId = null;
    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
    this.timerId = setTimeout(() => {
      if (this.onTimeout) {
        this.onTimeout(Date.now() - this.startTime);
      }
    }, this.timeoutMs);
  }

  clear() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  extend(additionalMs) {
    this.clear();
    this.timeoutMs += additionalMs;
    this.start();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProgressMonitor, ResourceTracker, TimeoutGuard };
}
