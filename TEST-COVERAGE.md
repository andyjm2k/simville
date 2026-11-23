# Test Coverage Documentation

## Overview

Comprehensive test suite covering all core systems and newly added features for the Simville benchmark harness.

## Test Statistics

> **Refreshed November 2026 (HEAD `bf20486` + fix-first-batch).** The old figures below (7 suites, 159 tests, 100% pass) described the pre-refactor suite and are stale — do not use them.

**Vitest suites:** 31 files — 21 in `tests/unit/`, 10 in `tests/qa/`  
**Vitest tests:** 235 `it()` cases (193 unit + 42 QA, counted by `grep` Nov 2026)  
**Standalone suites:** 7 `tests/test-*.js` scripts + `tests/run-unit-tests.js`, run via `npm test`'s second leg (`node tests/run-all-tests.js`) — per-suite counts are the repo's own, listed below  
**Pass rate:** not re-verified here — no test suite was executed during the Nov 2026 review; run `npm test` locally to confirm

**Line counts (Nov 2026):** `game.js` 5,644 lines, `ui.js` 1,376, `villager.js` 1,299, `world.js` 1,314.

## Test Suites

### 1. Core Systems (`tests/run-unit-tests.js`)
**Tests:** 29 | **Status:** ✓ All Passing

Covers:
- Economy system (resource management, storage, transfers)
- Raid system (combat, conquest, population tracking)
- Diplomacy system (relations, war, trade, events)
- Utils (seeded RNG, shuffle, ID generation)
- Baseline agent (action generation, decision-making)
- Benchmark scorer (resource scoring, winner determination)

### 2. Batch Runner (`tests/test-batch-runner.js`)
**Tests:** 15 | **Status:** ✓ All Passing

Covers:
- ParameterSweep (combination generation, overrides)
- BatchRunner (queueing, parallel execution, checkpointing)
- ETA estimation
- Job management

### 3. Progress Monitor (`tests/test-progress-monitor.js`)
**Tests:** 21 | **Status:** ✓ All Passing

Covers:
- ProgressMonitor (run tracking, event recording, formatting)
- ResourceTracker (memory/CPU sampling, statistics)
- TimeoutGuard (timeout detection, extension)

### 4. Failure Handler (`tests/test-failure-handler.js`)
**Tests:** 23 | **Status:** ✓ All Passing

Covers:
- FailureHandler (error categorization, logging, statistics)
- ResilientBenchmarkRunner (retry logic, exponential backoff)
- GracefulDegradation (partial result salvage, config simplification)

### 5. Report Generator (`tests/test-report-generator.js`)
**Tests:** 27 | **Status:** ✓ All Passing

Covers:
- ReportGenerator (format delegation, utilities)
- HTMLReportGenerator (HTML generation, charts, sections)
- MarkdownReportGenerator (GitHub-flavored markdown)
- CSVReportGenerator (daily, final, events CSV export)

### 6. Benchmark Analysis (`tests/test-benchmark-analysis.js`)
**Tests:** 23 | **Status:** ✓ All Passing

Covers:
- BenchmarkComparator (multi-run comparison, statistics)
- BatchAnalyzer (batch aggregation, failure analysis, grouping)
- Statistical calculations (mean, min, max, stddev)
- Report generation

### 7. Visualizer (`tests/test-visualizer.js`)
**Tests:** 22 | **Status:** ✓ All Passing

Covers:
- BenchmarkVisualizer (chart generation, export formats)
- Terminal ASCII charts
- Data transformation (Plotly, matplotlib, CSV)
- HeatmapGenerator (resource efficiency, performance metrics)

## Visual / Renderer Tests (`tests/unit/visual-fx.test.js`)

**Tests:** 17 | **Status:** ✓ Passing

Covers:
- `SeasonPalette` color remaps and overlays
- `LightingLayer` lighting toggle, dawn wash, night cutout compositing
- `ParticleSystem` mode resolution, capped pools, rain/dust update/render
- `TerrainCache` rebuild keys, invalidate, blit
- `PixelFont` / `PixelIcons` / `VillagerSpriteFactory` pose resolution and caching
- `WorldRenderer` integration with graphics options
- `VillagerRenderer` sprite cache + low-zoom LOD

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:unit        # Vitest unit tests only (tests/unit)
npm run test:qa          # Vitest QA tests only (tests/qa)
npm run test:systems     # Node VM harness (Economy/Raid/Diplomacy/Benchmark)
npm run test:batch       # Batch runner suite
npm run test:monitor     # Progress monitor suite
npm run test:failure     # Failure handler suite
npm run test:report      # Report generator suite
npm run test:analysis    # Benchmark analysis suite
npm run test:visualizer  # Visualizer suite
npm run test:metrics     # Advanced metrics suite
npm run test:regression  # QA harness regression mode
```

### Run Tests Matching Pattern
```bash
node tests/run-all-tests.js batch      # Runs batch-related tests
node tests/run-all-tests.js report     # Runs report-related tests
```

## Test Categories

### Unit Tests
All test suites are unit tests with mocked dependencies. No external services or files required.

### Integration Coverage
While individual tests are unit tests, they cover:
- Module exports and imports
- API contracts between modules
- Data flow between components

### Edge Cases Covered
- Empty inputs
- Missing data
- Error conditions
- Boundary values
- Retry scenarios
- Network failures
- Memory constraints

## Test Maintenance

### Adding New Tests

When adding new features:

1. **Create test file** in `tests/` directory
2. **Follow naming convention**: `test-{module-name}.js`
3. **Use test helper pattern**:
```javascript
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
```

4. **Add to test runner** in `tests/run-all-tests.js`
5. **Add npm script** in `package.json`

### Test Structure

Each test file should:
- Load dependencies via VM sandbox (for browser-style modules)
- Create mock data fixtures
- Group related tests with console.log headers
- Exit with proper code (`process.exit(failed > 0 ? 1 : 0)`)

### Best Practices

✓ **Test one thing** per test case  
✓ **Use descriptive names** that explain what's being tested  
✓ **Include edge cases** (empty, null, undefined, invalid)  
✓ **Mock external dependencies** (filesystem, network, etc.)  
✓ **Keep tests fast** (< 1ms per test typically)  
✓ **Test public APIs** not internal implementation  

## Coverage Goals

### Current Coverage
- ✅ Core game systems
- ✅ Batch execution & parameter sweeps  
- ✅ Progress monitoring & observability
- ✅ Failure handling & retry logic
- ✅ Report generation (all formats)
- ✅ Comparison & statistical analysis
- ✅ Visualization & chart generation

### Future Coverage
- [ ] End-to-end benchmark runs (integration tests)
- [ ] CLI argument parsing
- [ ] File I/O operations
- [ ] Checkpoint save/restore
- [ ] Performance benchmarks

## Continuous Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm test

- name: Check Test Coverage
  run: npm test 2>&1 | grep "passed, 0 failed"
```

## Troubleshooting

### Tests Fail to Load Modules
- Check that `loadScript` function paths are correct
- Verify VM sandbox includes required globals

### Assertion Failures
- Check for timing issues (async tests)
- Verify mock data matches expected format
- Look for object reference vs. value comparisons

### Flaky Tests
- Avoid time-dependent assertions
- Use deterministic mock data
- Don't rely on external state

## Contributing

When submitting PRs:
1. ✅ All existing tests must pass
2. ✅ New features must include tests
3. ✅ Aim for >90% code coverage
4. ✅ Follow existing test patterns
5. ✅ Update this documentation if adding new suites
