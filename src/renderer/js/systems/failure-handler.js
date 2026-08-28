// Failure handling for benchmarks: retries, error categorization, graceful degradation

/**
 * Categorizes and handles benchmark failures.
 */
class FailureHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 5000;
    this.enableGracefulDegradation = options.enableGracefulDegradation !== false;
    this.failureLog = [];
  }

  /**
   * Categorize an error.
   * @param {Error} error
   * @param {object} context
   * @returns {object}
   */
  categorizeError(error, context = {}) {
    const category = {
      type: 'unknown',
      severity: 'fatal',
      retryable: false,
      message: error.message || String(error),
      stack: error.stack,
      context
    };

    const msg = category.message.toLowerCase();

    // API/Network errors (retryable)
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') ||
        msg.includes('timeout') || msg.includes('enotfound')) {
      category.type = 'network';
      category.retryable = true;
      category.severity = 'transient';
    }
    // API rate limiting (retryable with delay)
    else if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
      category.type = 'rate_limit';
      category.retryable = true;
      category.severity = 'transient';
    }
    // API authentication (not retryable without config change)
    else if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('api key') ||
             msg.includes('authentication')) {
      category.type = 'auth';
      category.retryable = false;
      category.severity = 'fatal';
    }
    // API errors (might be retryable)
    else if (msg.includes('api') || msg.includes('llm') || msg.includes('openai')) {
      category.type = 'api';
      category.retryable = true;
      category.severity = 'transient';
    }
    // Validation/config errors (not retryable)
    else if (msg.includes('invalid') || msg.includes('validation') || msg.includes('config')) {
      category.type = 'validation';
      category.retryable = false;
      category.severity = 'fatal';
    }
    // Out of memory (not retryable)
    else if (msg.includes('memory') || msg.includes('heap')) {
      category.type = 'memory';
      category.retryable = false;
      category.severity = 'fatal';
    }
    // Simulation/game logic errors (might indicate bug)
    else if (msg.includes('villager') || msg.includes('village') || msg.includes('game')) {
      category.type = 'simulation';
      category.retryable = false;
      category.severity = 'error';
    }

    return category;
  }

  /**
   * Log a failure.
   * @param {object} errorCategory
   * @param {object} runContext
   */
  logFailure(errorCategory, runContext = {}) {
    const entry = {
      timestamp: Date.now(),
      ...errorCategory,
      runContext
    };

    this.failureLog.push(entry);

    // Console output
    console.error(`\n[FAILURE] ${errorCategory.type.toUpperCase()} (${errorCategory.severity})`);
    console.error(`  Message: ${errorCategory.message}`);
    if (runContext.attempt) {
      console.error(`  Attempt: ${runContext.attempt}/${runContext.maxAttempts}`);
    }
    if (errorCategory.retryable) {
      console.error(`  Retryable: Yes`);
    }
  }

  /**
   * Get failure statistics.
   * @returns {object}
   */
  getStats() {
    const stats = {
      total: this.failureLog.length,
      byType: {},
      bySeverity: {},
      retryable: 0,
      nonRetryable: 0
    };

    for (const entry of this.failureLog) {
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;
      if (entry.retryable) {
        stats.retryable++;
      } else {
        stats.nonRetryable++;
      }
    }

    return stats;
  }

  /**
   * Get retry delay based on attempt number and error type.
   * @param {number} attempt
   * @param {object} errorCategory
   * @returns {number}
   */
  getRetryDelay(attempt, errorCategory) {
    let baseDelay = this.retryDelayMs;

    // Longer delay for rate limiting
    if (errorCategory.type === 'rate_limit') {
      baseDelay = 30000; // 30 seconds
    }

    // Exponential backoff
    return baseDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Generate failure report.
   * @returns {object}
   */
  generateReport() {
    return {
      timestamp: Date.now(),
      totalFailures: this.failureLog.length,
      stats: this.getStats(),
      failures: this.failureLog.map(entry => ({
        timestamp: entry.timestamp,
        type: entry.type,
        severity: entry.severity,
        message: entry.message,
        retryable: entry.retryable,
        context: entry.runContext
      }))
    };
  }
}

/**
 * Wraps a benchmark runner with retry and failure handling.
 */
class ResilientBenchmarkRunner {
  constructor(baseRunner, options = {}) {
    this.baseRunner = baseRunner;
    this.failureHandler = new FailureHandler(options);
    this.maxRetries = options.maxRetries || 3;
    this.onRetry = options.onRetry || null;
  }

  /**
   * Run benchmark with retry logic.
   * @param {object} config
   * @returns {Promise<object>}
   */
  async run(config) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.baseRunner.run(config);
        
        // Success - return result
        if (attempt > 1) {
          console.error(`[SUCCESS] Benchmark succeeded on attempt ${attempt}`);
        }
        return result;

      } catch (error) {
        lastError = error;
        const errorCategory = this.failureHandler.categorizeError(error, { config });
        
        this.failureHandler.logFailure(errorCategory, {
          attempt,
          maxAttempts: this.maxRetries,
          seed: config.seed
        });

        // Don't retry if error is not retryable or this is the last attempt
        if (!errorCategory.retryable || attempt === this.maxRetries) {
          throw this.enrichError(error, errorCategory, attempt);
        }

        // Wait before retry
        const delay = this.failureHandler.getRetryDelay(attempt, errorCategory);
        console.error(`  Retrying in ${(delay / 1000).toFixed(1)}s...`);
        
        if (this.onRetry) {
          this.onRetry({ attempt, maxAttempts: this.maxRetries, delay, errorCategory });
        }

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    throw this.enrichError(
      lastError,
      this.failureHandler.categorizeError(lastError),
      this.maxRetries
    );
  }

  /**
   * Enrich error with additional context.
   * @param {Error} error
   * @param {object} errorCategory
   * @param {number} attempts
   * @returns {Error}
   */
  enrichError(error, errorCategory, attempts) {
    const enriched = new Error(
      `Benchmark failed after ${attempts} attempt(s): ${error.message}`
    );
    enriched.originalError = error;
    enriched.category = errorCategory;
    enriched.attempts = attempts;
    return enriched;
  }

  /**
   * Get failure handler for statistics.
   * @returns {FailureHandler}
   */
  getFailureHandler() {
    return this.failureHandler;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Graceful degradation strategies when things go wrong.
 */
class GracefulDegradation {
  /**
   * Try to salvage partial results from a failed run.
   * @param {object} game
   * @param {Error} error
   * @returns {object|null}
   */
  static salvagePartialResults(game, error) {
    if (!game || !game.villages) return null;

    try {
      // Try to capture whatever state we have
      const partial = {
        incomplete: true,
        error: {
          message: error.message,
          type: error.category?.type || 'unknown'
        },
        daysSimulated: game.timeState?.day || 0,
        villages: []
      };

      // Capture village states if possible
      for (const village of game.villages) {
        try {
          const villagers = game.getVillagersForVillage?.(village.id) || [];
          const resources = game.getResources?.(village.id) || {};
          
          partial.villages.push({
            id: village.id,
            name: village.name,
            population: villagers.length,
            resources: { ...resources }
          });
        } catch (e) {
          // Skip this village
        }
      }

      return partial;
    } catch (e) {
      return null;
    }
  }

  /**
   * Reduce config complexity to avoid failures.
   * @param {object} config
   * @param {object} errorCategory
   * @returns {object}
   */
  static simplifyConfig(config, errorCategory) {
    const simplified = JSON.parse(JSON.stringify(config));

    if (errorCategory.type === 'memory') {
      // Reduce simulation complexity
      simplified.days = Math.min(simplified.days, 10);
      simplified.dayLengthMs = Math.max(simplified.dayLengthMs, 60000);
    }

    if (errorCategory.type === 'api' || errorCategory.type === 'rate_limit') {
      // Reduce API call frequency
      simplified.tickIntervalMs = (simplified.tickIntervalMs || 5000) * 2;
    }

    return simplified;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FailureHandler, ResilientBenchmarkRunner, GracefulDegradation };
}
