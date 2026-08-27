// Batch benchmark execution with parameter sweeps and parallel runs

/**
 * Generates parameter combinations for sweeps.
 */
class ParameterSweep {
  /**
   * Generate all combinations of parameters.
   * @param {object} sweepConfig - { param: [value1, value2, ...], ... }
   * @returns {Array<object>} Array of parameter combinations
   */
  static generateCombinations(sweepConfig) {
    const keys = Object.keys(sweepConfig);
    if (keys.length === 0) return [{}];

    const [firstKey, ...restKeys] = keys;
    const firstValues = sweepConfig[firstKey];
    const restConfig = {};
    restKeys.forEach(k => restConfig[k] = sweepConfig[k]);

    const restCombinations = ParameterSweep.generateCombinations(restConfig);
    const result = [];

    for (const value of firstValues) {
      for (const rest of restCombinations) {
        result.push({ [firstKey]: value, ...rest });
      }
    }

    return result;
  }

  /**
   * Apply parameter overrides to base config.
   * @param {object} baseConfig
   * @param {object} overrides
   * @returns {object}
   */
  static applyOverrides(baseConfig, overrides) {
    const config = JSON.parse(JSON.stringify(baseConfig));
    
    for (const [key, value] of Object.entries(overrides)) {
      if (key.includes('.')) {
        // Nested path like "agentA.temperature"
        const parts = key.split('.');
        let target = config;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      } else {
        config[key] = value;
      }
    }

    return config;
  }
}

/**
 * Manages batch execution of benchmarks with parallelism.
 */
class BatchRunner {
  constructor(options = {}) {
    this.maxParallel = options.maxParallel || 1;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelayMs = options.retryDelayMs || 5000;
    this.checkpointInterval = options.checkpointInterval || 5;
    this.checkpointPath = options.checkpointPath || 'batch-checkpoint.json';
    this.progressCallback = options.progressCallback || null;
    
    this.queue = [];
    this.running = [];
    this.completed = [];
    this.failed = [];
    this.startTime = null;
  }

  /**
   * Add a run configuration to the batch queue.
   * @param {object} config
   * @param {object} metadata - Optional metadata for this run
   */
  enqueue(config, metadata = {}) {
    this.queue.push({
      id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      config,
      metadata,
      attempts: 0,
      status: 'queued',
      result: null,
      error: null,
      startedAt: null,
      completedAt: null
    });
  }

  /**
   * Generate batch from parameter sweep.
   * @param {object} baseConfig
   * @param {object} sweepConfig
   * @param {number} replicates - Number of replications per combination
   */
  enqueueSweep(baseConfig, sweepConfig, replicates = 1) {
    const combinations = ParameterSweep.generateCombinations(sweepConfig);
    
    for (const combo of combinations) {
      for (let rep = 0; rep < replicates; rep++) {
        const config = ParameterSweep.applyOverrides(baseConfig, combo);
        
        // Use different seed for each replicate if not specified
        if (replicates > 1 && !combo.seed) {
          config.seed = (config.seed || 4242) + rep;
        }
        
        this.enqueue(config, {
          sweep: combo,
          replicate: rep,
          totalReplicates: replicates
        });
      }
    }
  }

  /**
   * Execute all queued runs with parallel execution.
   * @param {Function} runnerFactory - Function that creates a BenchmarkRunner
   * @returns {Promise<object>}
   */
  async execute(runnerFactory) {
    this.startTime = Date.now();
    const total = this.queue.length + this.completed.length;

    // Try to restore from checkpoint
    await this.restoreCheckpoint();

    while (this.queue.length > 0 || this.running.length > 0) {
      // Start new runs up to maxParallel
      while (this.running.length < this.maxParallel && this.queue.length > 0) {
        const job = this.queue.shift();
        this.running.push(job);
        this.executeOne(job, runnerFactory);
      }

      // Wait a bit before checking again
      await this.sleep(100);

      // Report progress
      if (this.progressCallback) {
        this.progressCallback({
          total,
          queued: this.queue.length,
          running: this.running.length,
          completed: this.completed.length,
          failed: this.failed.length,
          elapsedMs: Date.now() - this.startTime,
          estimatedRemainingMs: this.estimateRemaining()
        });
      }

      // Checkpoint periodically
      if (this.completed.length % this.checkpointInterval === 0) {
        await this.saveCheckpoint();
      }
    }

    // Final checkpoint and cleanup
    await this.saveCheckpoint();

    return {
      total,
      completed: this.completed.length,
      failed: this.failed.length,
      durationMs: Date.now() - this.startTime,
      results: this.completed,
      failures: this.failed
    };
  }

  /**
   * Execute a single benchmark run with retry logic.
   * @param {object} job
   * @param {Function} runnerFactory
   */
  async executeOne(job, runnerFactory) {
    job.startedAt = Date.now();
    job.status = 'running';

    while (job.attempts < this.retryAttempts) {
      try {
        job.attempts++;
        const runner = runnerFactory();
        const result = await runner.run(job.config);
        
        job.result = result;
        job.status = 'completed';
        job.completedAt = Date.now();
        job.error = null;
        
        this.running = this.running.filter(r => r.id !== job.id);
        this.completed.push(job);
        return;
        
      } catch (error) {
        job.error = {
          message: error.message,
          stack: error.stack,
          attempt: job.attempts
        };

        if (job.attempts < this.retryAttempts) {
          // Retry with exponential backoff
          const delay = this.retryDelayMs * Math.pow(2, job.attempts - 1);
          await this.sleep(delay);
          continue;
        } else {
          // Max retries exceeded
          job.status = 'failed';
          job.completedAt = Date.now();
          this.running = this.running.filter(r => r.id !== job.id);
          this.failed.push(job);
          return;
        }
      }
    }
  }

  /**
   * Estimate remaining time based on completed runs.
   * @returns {number}
   */
  estimateRemaining() {
    if (this.completed.length === 0) return null;

    const avgDuration = this.completed.reduce((sum, job) => {
      return sum + (job.completedAt - job.startedAt);
    }, 0) / this.completed.length;

    const remaining = this.queue.length + this.running.length;
    return Math.round(avgDuration * remaining);
  }

  /**
   * Save checkpoint to disk.
   */
  async saveCheckpoint() {
    if (typeof module === 'undefined' || !module.exports) {
      return; // Only works in Node.js
    }

    const checkpoint = {
      version: '1.0',
      savedAt: Date.now(),
      queue: this.queue,
      running: this.running.map(j => ({ ...j, status: 'queued' })), // Re-queue running jobs
      completed: this.completed,
      failed: this.failed,
      startTime: this.startTime
    };

    try {
      const fs = require('fs');
      fs.writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
    } catch (err) {
      console.error('Failed to save checkpoint:', err.message);
    }
  }

  /**
   * Restore from checkpoint if it exists.
   */
  async restoreCheckpoint() {
    if (typeof module === 'undefined' || !module.exports) {
      return;
    }

    try {
      const fs = require('fs');
      if (!fs.existsSync(this.checkpointPath)) return;

      const checkpoint = JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
      
      // Only restore if checkpoint is recent (within 24 hours)
      if (Date.now() - checkpoint.savedAt > 24 * 60 * 60 * 1000) {
        console.warn('Checkpoint is stale, ignoring');
        return;
      }

      this.queue = [...checkpoint.queue, ...checkpoint.running];
      this.completed = checkpoint.completed || [];
      this.failed = checkpoint.failed || [];
      this.startTime = checkpoint.startTime || Date.now();

      console.error(`Restored checkpoint: ${this.completed.length} completed, ${this.queue.length} remaining`);
    } catch (err) {
      console.error('Failed to restore checkpoint:', err.message);
    }
  }

  /**
   * Clear checkpoint file.
   */
  async clearCheckpoint() {
    if (typeof module === 'undefined' || !module.exports) {
      return;
    }

    try {
      const fs = require('fs');
      if (fs.existsSync(this.checkpointPath)) {
        fs.unlinkSync(this.checkpointPath);
      }
    } catch (err) {
      console.error('Failed to clear checkpoint:', err.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BatchRunner, ParameterSweep };
}
