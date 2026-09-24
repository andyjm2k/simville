# Simville Benchmark Mode

Headless **LLM vs opponent** runs to measure village decision-making and competitive outcomes.

**Default eval fidelity:** hard survival (no hunger/thirst/health floors), no autonomous rules-engine builds, multi-metric scoring. Use `--easy-needs` only for demos/smoke tests.

## Quick start

```bash
# Heuristic vs heuristic (no API — smoke test, hard survival)
npm run benchmark -- --days 5 --seed 42 --agent-a-type baseline --agent-b-type baseline

# Stress scenario pack (famine, asymmetric, hostile raider) × 5 seeds
npm run benchmark -- --scenario-pack --replicates 5 --days 8 --agent-a-type baseline --agent-b-type baseline

# Single stress scenario
npm run benchmark -- --scenario famine --days 10 --agent-a-type baseline --agent-b-type baseline

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
| `baseline` | Rule-based heuristic (`strategy`: `balanced` \| `raider`) |

**Multi-metric scoring** (reported per village):

| Metric | Meaning |
|--------|---------|
| `survival` | Population kept alive + need/health state |
| `growth` | Population + **agent-built** structures + resources |
| `military` | Village strength |
| `socialGoals` | Rival relations + personal goal progress |
| `compositeScore` | Weighted blend (secondary ranking key) |

Starting structures are excluded from growth credit. Autonomous construction is **off** unless `--allow-autonomous-build`.

**Winner**: elimination/conquest, else highest multi-metric composite.

Reports include daily snapshots, per-agent LLM latency/failure stats, and diplomacy/raid events.

## Config (`benchmark.example.json`)

| Field | Meaning |
|-------|---------|
| `seed` | Deterministic world generation |
| `days` | In-game day horizon |
| `dayLengthMs` | Real ms per game day (lower = faster runs) |
| `tickIntervalMs` | Ms between agent decision ticks |
| `easyNeeds` | `true` restores old need floors (opt-in demo only) |
| `allowAutonomousBuild` | `true` re-enables rules-engine builds |
| `scenario` | `famine` \| `asymmetric` \| `hostile_baseline` \| null |
| `agentA` / `agentB` | Village 0 / Village 1 controllers |

**LLM vs LLM**: set both `agentA` and `agentB` to `type: "llm"` with different models/endpoints.

## CLI fidelity flags

| Flag | Effect |
|------|--------|
| `--easy-needs` | Enable need floors (demo/smoke only) |
| `--allow-autonomous-build` | Credit rules-engine construction again |
| `--scenario <id>` | Apply a stress scenario |
| `--scenario-pack` | Run famine/asymmetric/hostile × `--replicates` (default 5) |
| `--replicates <n>` | Seeded replicates per scenario in a pack |

## Output

- Full report: `benchmark-report.json` (or `--output`)
- Summary JSON on stdout (winner, scores, metrics)

## Architecture

- `src/renderer/js/systems/benchmark.js` — runner + multi-metric scorer
- `src/renderer/js/systems/scenarios.js` — stress scenarios + replicate expansion
- `src/renderer/js/systems/baseline-agent.js` — heuristic opponent (incl. raider)
- `src/renderer/js/systems/batch-runner.js` — batch execution & parameter sweeps
- `scripts/run-benchmark.js` — CLI (Node, no Electron UI)
- `Game.initializeHeadless()` + `runHeadlessTick()` — simulation without rendering

Rival village context is injected into LLM prompts so decisions are explicitly competitive.

## Advanced Features

For batch execution, parameter sweeps, parallel workers, monitoring, and failure handling, see:

**[BENCHMARK-ADVANCED.md](./BENCHMARK-ADVANCED.md)** — Full operational features guide

For report generation, visualizations, and analysis, see:

**[BENCHMARK-REPORTING.md](./BENCHMARK-REPORTING.md)** — Complete reporting & visualization guide

**[BENCHMARK-METRICS.md](./BENCHMARK-METRICS.md)** — Advanced metrics and analysis

Quick examples:
```bash
# Batch execution with 4 parallel workers
npm run benchmark -- --batch batch-benchmark.example.json --parallel 4

# Parameter sweep with comparison analysis
npm run benchmark -- --sweep sweep-benchmark.example.json --parallel 4 --compare

# Generate HTML report with charts
npm run benchmark -- --days 10 --report-format html --charts

# Generate reports from existing JSON
node scripts/generate-report.js benchmark-report.json html --charts

# Resume from checkpoint
npm run benchmark -- --batch config.json --resume --checkpoint my-checkpoint.json
```
