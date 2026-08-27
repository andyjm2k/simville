# Simville Benchmark Mode

Headless **LLM vs opponent** runs to measure village decision-making and competitive outcomes.

## Quick start

```bash
# Heuristic vs heuristic (no API — smoke test)
npm run benchmark -- --days 5 --seed 42 --agent-a-type baseline --agent-b-type baseline

# LLM vs baseline heuristic
cp benchmark.example.json my-benchmark.json
# Edit API key / endpoint in my-benchmark.json
npm run benchmark -- --config my-benchmark.json

# Or via environment
export SIMVILLE_LLM_ENDPOINT=https://api.openai.com/v1
export SIMVILLE_LLM_MODEL=gpt-4o-mini
export SIMVILLE_LLM_API_KEY=sk-...
npm run benchmark -- --days 15 --agent-a-type llm --agent-b-type baseline
```

## What is measured

Each village is controlled by an **agent**:

| Agent type | Description |
|------------|-------------|
| `llm` | OpenAI-compatible API drives villager actions + chieftan diplomacy |
| `baseline` | Rule-based heuristic (gather/build/raid priorities) |

**Scoring** (composite at end of horizon):

- Population, structures, weighted resources, village strength
- **Winner**: elimination/conquest, else highest composite score

Reports include daily snapshots, per-agent LLM latency/failure stats, and diplomacy/raid events.

## Config (`benchmark.example.json`)

| Field | Meaning |
|-------|---------|
| `seed` | Deterministic world generation |
| `days` | In-game day horizon |
| `dayLengthMs` | Real ms per game day (lower = faster runs) |
| `tickIntervalMs` | Ms between agent decision ticks |
| `agentA` / `agentB` | Village 0 / Village 1 controllers |

**LLM vs LLM**: set both `agentA` and `agentB` to `type: "llm"` with different models/endpoints.

## Output

- Full report: `benchmark-report.json` (or `--output`)
- Summary JSON on stdout (winner, scores)

## Architecture

- `src/renderer/js/systems/benchmark.js` — runner + scorer
- `src/renderer/js/systems/baseline-agent.js` — heuristic opponent
- `src/renderer/js/systems/batch-runner.js` — batch execution & parameter sweeps
- `src/renderer/js/systems/progress-monitor.js` — progress tracking & observability
- `src/renderer/js/systems/failure-handler.js` — retry logic & error handling
- `scripts/run-benchmark.js` — CLI (Node, no Electron UI)
- `Game.initializeHeadless()` + `runHeadlessTick()` — simulation without rendering

Rival village context is injected into LLM prompts so decisions are explicitly competitive.

## Advanced Features

For batch execution, parameter sweeps, parallel workers, monitoring, and failure handling, see:

**[BENCHMARK-ADVANCED.md](./BENCHMARK-ADVANCED.md)** — Full operational features guide

Quick examples:
```bash
# Batch execution with 4 parallel workers
npm run benchmark -- --batch batch-benchmark.example.json --parallel 4

# Parameter sweep with replicates
npm run benchmark -- --sweep sweep-benchmark.example.json --parallel 4 --verbose

# Resume from checkpoint
npm run benchmark -- --batch config.json --resume --checkpoint my-checkpoint.json
```
