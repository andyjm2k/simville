# Advanced Benchmark Features

This document covers the operational features of the Simville benchmarking harness: batch execution, monitoring, and failure handling.

## Quick Start

```bash
# Single run with progress monitoring
npm run benchmark -- --days 10 --seed 42 --verbose

# Batch execution with 4 parallel workers
npm run benchmark -- --batch batch-benchmark.example.json --parallel 4

# Parameter sweep with replicates
npm run benchmark -- --sweep sweep-benchmark.example.json --parallel 4 --verbose
```

## Batch Execution

### Basic Batch

Run multiple benchmark configurations in sequence or parallel.

**Config file (`batch-benchmark.json`):**
```json
{
  "output": "batch-report.json",
  "runs": [
    {
      "seed": 1001,
      "days": 15,
      "agentA": { "type": "llm", "model": "gpt-4o-mini", "temperature": 0.2 },
      "agentB": { "type": "baseline" }
    },
    {
      "seed": 1002,
      "days": 15,
      "agentA": { "type": "llm", "model": "gpt-4o-mini", "temperature": 0.8 },
      "agentB": { "type": "baseline" }
    }
  ]
}
```

**Run:**
```bash
npm run benchmark -- --batch batch-benchmark.json --parallel 2
```

### Parameter Sweeps

Automatically generate runs across parameter combinations.

**Config file (`sweep-benchmark.json`):**
```json
{
  "output": "sweep-report.json",
  "replicates": 3,
  "baseConfig": {
    "days": 15,
    "agentA": {
      "type": "llm",
      "model": "gpt-4o-mini",
      "endpoint": "https://api.openai.com/v1",
      "apiKey": "YOUR_API_KEY"
    },
    "agentB": { "type": "baseline" }
  },
  "sweep": {
    "agentA.temperature": [0.2, 0.4, 0.6, 0.8],
    "agentA.maxTokens": [300, 500, 700]
  }
}
```

This generates 4 × 3 × 3 = 36 runs (4 temperatures × 3 token limits × 3 replicates).

**Run:**
```bash
npm run benchmark -- --sweep sweep-benchmark.json --parallel 4
```

### Parallel Execution

Control the number of concurrent benchmark runs:

```bash
# Single worker (sequential)
npm run benchmark -- --batch config.json --parallel 1

# 4 parallel workers
npm run benchmark -- --batch config.json --parallel 4

# 8 parallel workers (for large machines)
npm run benchmark -- --batch config.json --parallel 8
```

**Recommendations:**
- Use 1 worker for API rate-limited endpoints
- Use 2-4 workers for typical machines
- Monitor memory usage with `--verbose` flag

## Monitoring & Observability

### Progress Tracking

Three verbosity levels:

```bash
# Silent mode (minimal output, JSON only)
npm run benchmark -- --batch config.json --silent

# Info mode (periodic updates) - DEFAULT
npm run benchmark -- --batch config.json

# Verbose mode (detailed progress)
npm run benchmark -- --batch config.json --verbose
```

### Verbose Output Example

```
[14:23:45] Starting batch execution: 12 runs
============================================================

[14:23:47] Progress: 20.0% (Day 3/15), ETA: 2m 15s
[14:24:02] Progress: 40.0% (Day 6/15), ETA: 1m 48s
[14:24:17] Progress: 60.0% (Day 9/15), ETA: 1m 10s

[14:25:30] Batch Progress: 8/12 (66.7%) | Running: 4 | Failed: 0 | ETA: 1m 32s | Memory: 234.5MB
```

### Resource Tracking

The `--verbose` flag enables resource monitoring:
- Memory usage (current, avg, peak)
- Elapsed time and ETA
- Progress percentage
- Running/queued/failed counts

### Estimating Runtime

ETA is calculated based on:
- Average duration of completed runs
- Number of remaining runs
- Current parallelism

## Failure Handling

### Automatic Retries

Benchmarks automatically retry on transient failures:

```bash
# Default: 3 retry attempts
npm run benchmark -- --batch config.json

# Custom retry count
npm run benchmark -- --batch config.json --retries 5
```

### Retry Logic

**Retryable errors:**
- Network failures (connection refused, timeout)
- API rate limiting (429, quota exceeded)
- Transient API errors (500, 502, 503)

**Non-retryable errors:**
- Authentication failures (401, invalid API key)
- Validation errors (invalid config)
- Out of memory errors

**Retry delays:**
- Exponential backoff: 5s, 10s, 20s, ...
- Rate limit errors: 30s base delay
- Max 3 attempts by default

### Checkpoint & Resume

Long-running batches automatically checkpoint progress:

```bash
# Start a batch (creates checkpoint every 5 runs)
npm run benchmark -- --batch large-batch.json --parallel 4

# If interrupted, resume from checkpoint
npm run benchmark -- --batch large-batch.json --resume
```

**Checkpoint features:**
- Automatic saving every 5 completed runs
- Restores queue, completed, and failed runs
- 24-hour expiry (ignores stale checkpoints)
- Custom checkpoint file: `--checkpoint my-checkpoint.json`

### Error Categorization

Failures are categorized and reported:

**Categories:**
- `network` - Connection/timeout issues
- `rate_limit` - API quota/throttling
- `auth` - Authentication failures
- `api` - Generic API errors
- `validation` - Config/input errors
- `memory` - Out of memory
- `simulation` - Game logic errors
- `unknown` - Uncategorized

**Failure report:**
```json
{
  "totalFailures": 3,
  "stats": {
    "byType": {
      "rate_limit": 2,
      "network": 1
    },
    "retryable": 3,
    "nonRetryable": 0
  },
  "failures": [...]
}
```

### Graceful Degradation

When enabled, the system attempts to:
- Salvage partial results from failed runs
- Reduce config complexity on repeated failures
- Continue batch execution despite individual failures

## Output & Reports

### Batch Report Structure

```json
{
  "total": 12,
  "completed": 11,
  "failed": 1,
  "durationMs": 720000,
  "results": [
    {
      "id": "run-123abc",
      "status": "completed",
      "attempts": 1,
      "config": {...},
      "result": {...},
      "startedAt": 1234567890,
      "completedAt": 1234568000
    }
  ],
  "failures": [
    {
      "id": "run-456def",
      "status": "failed",
      "attempts": 3,
      "error": {...}
    }
  ]
}
```

### Sweep Report Structure

Includes all batch fields plus:

```json
{
  "sweep": {
    "parameters": {
      "agentA.temperature": [0.2, 0.4, 0.6],
      "days": [10, 15]
    },
    "replicates": 3,
    "combinations": 6
  }
}
```

## CLI Reference

### Single Run Options
```
--config <file>       JSON config
--days <n>            Simulation days
--seed <n>            RNG seed
--output <file>       Report output path
--agent-a-type <type> Agent A type (llm|baseline)
--agent-b-type <type> Agent B type (llm|baseline)
```

### Batch/Sweep Options
```
--batch <file>        Batch config file
--sweep <file>        Parameter sweep config file
--parallel <n>        Number of parallel workers
--retries <n>         Max retry attempts (default: 3)
--checkpoint <file>   Checkpoint file path
--resume              Resume from checkpoint
```

### Output Options
```
--verbose, -v         Verbose progress output
--silent, -s          Minimal output (JSON only)
--help, -h            Show help
```

## Examples

### Example 1: Temperature Comparison

Test different LLM temperatures:

```bash
# Create sweep config
cat > temp-sweep.json << EOF
{
  "replicates": 5,
  "baseConfig": {
    "days": 20,
    "agentA": { "type": "llm", "model": "gpt-4o-mini" },
    "agentB": { "type": "baseline" }
  },
  "sweep": {
    "agentA.temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
  }
}
EOF

# Run with 3 parallel workers
npm run benchmark -- --sweep temp-sweep.json --parallel 3 --verbose
```

### Example 2: Model Comparison

Compare different models:

```bash
cat > model-comparison.json << EOF
{
  "runs": [
    {
      "seed": 42,
      "days": 30,
      "agentA": { "type": "llm", "model": "gpt-4o-mini" },
      "agentB": { "type": "baseline" }
    },
    {
      "seed": 42,
      "days": 30,
      "agentA": { "type": "llm", "model": "gpt-4o" },
      "agentB": { "type": "baseline" }
    },
    {
      "seed": 42,
      "days": 30,
      "agentA": { "type": "llm", "model": "claude-3-5-sonnet-20241022", 
                  "endpoint": "https://api.anthropic.com/v1" },
      "agentB": { "type": "baseline" }
    }
  ]
}
EOF

npm run benchmark -- --batch model-comparison.json --retries 5
```

### Example 3: Long-Running Batch with Checkpointing

```bash
# Start a large sweep (100+ runs)
npm run benchmark -- --sweep large-sweep.json --parallel 4 --checkpoint sweep.ckpt

# If interrupted (Ctrl+C or crash), resume:
npm run benchmark -- --sweep large-sweep.json --resume --checkpoint sweep.ckpt
```

### Example 4: High-Availability Run

Maximum reliability for critical benchmarks:

```bash
npm run benchmark -- \
  --batch important-runs.json \
  --parallel 2 \
  --retries 10 \
  --verbose \
  --checkpoint critical.ckpt
```

## Best Practices

### Parallelism
- Start with `--parallel 1` to test configs
- Increase to 2-4 for production runs
- Monitor memory with `--verbose`
- Respect API rate limits

### Reliability
- Use `--retries 5+` for unreliable networks
- Enable checkpointing for long batches
- Test with small `--days` values first
- Keep `--verbose` on for debugging

### Performance
- Use faster `dayLengthMs` for quick tests
- Batch similar configs together
- Run overnight with checkpointing
- Clean up output files regularly

### Cost Management
- Use `gpt-4o-mini` for sweeps
- Reduce `maxTokens` when possible
- Test with `--days 5` before full runs
- Monitor API usage during parallel runs

## Troubleshooting

### "All runs failed"
- Check API key: `echo $SIMVILLE_LLM_API_KEY`
- Verify endpoint connectivity
- Reduce `--parallel` to 1
- Check error categories in report

### "Out of memory"
- Reduce `--parallel` workers
- Decrease `days` or increase `dayLengthMs`
- Close other applications
- Monitor with `--verbose`

### "Checkpoint not restoring"
- Check checkpoint file exists
- Verify checkpoint < 24 hours old
- Use `--checkpoint` flag explicitly
- Delete stale checkpoint: `rm *.ckpt`

### "Slow progress"
- Check network latency to API
- Reduce API complexity (lower `maxTokens`)
- Increase `tickIntervalMs`
- Use `--verbose` to see bottlenecks
