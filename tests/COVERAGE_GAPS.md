# Simville Test Coverage Gaps

End-to-end review of the Simville codebase against the new Vitest + headless QA harness (`tests/`). This document maps what is covered today versus what remains untested.

## Current Test Infrastructure

| Layer | Location | Runner | Purpose |
|-------|----------|--------|---------|
| Unit tests | `tests/unit/` | Vitest + jsdom | Pure logic and class methods |
| QA / functional | `tests/qa/` | Vitest + headless game harness | Component integration without Electron display |
| QA CLI | `tests/qa/harness.mjs` | Node wrapper | Target individual suites in cloud/CI |
| CI | `.github/workflows/test.yml` | GitHub Actions | Regression gate on push/PR |

### Commands

```bash
npm test                    # Full unit + QA suite
npm run test:unit           # Unit tests only
npm run test:qa             # QA functional tests only
npm run test:regression     # QA harness regression mode
npm run test:coverage       # Coverage report (renderer JS)
node tests/qa/harness.mjs --list
node tests/qa/harness.mjs --suite save-roundtrip
```

## Coverage by Component

### Covered (automated)

| Component | Unit | QA | Notes |
|-----------|------|----|-------|
| `utils.js` | Yes | — | Math, time, seasons, mood, clone, seeded RNG |
| `village.js` | Yes | Partial | Territory, strength, serialize; assignment QA |
| `llm.js` | Yes | Yes | JSON parse, fallback, offline action path |
| `world.js` | Yes | Yes | Generation, pathfinding, serialize |
| `game.js` normalization | Yes | — | Resources, rules, government helpers |
| World bootstrap | — | Yes | Two villages, resources, rivalry relations |
| Save/load | — | Yes | Round-trip persistence |
| Raid lifecycle | — | Yes | Phase transitions + known failure characterization |
| Simulation tick | — | Yes | Time advance, needs decay |
| Villager needs | — | Yes | Hunger/thirst override behavior |

### Not covered (gaps)

#### P0 — Critical simulation correctness

| Gap | File(s) | Risk | Suggested test |
|-----|---------|------|----------------|
| Dual resource pools (`Game.resources` vs `Village.resources`) | `game.js`, `villager.js` | HUD/sim mismatch | QA: gather → assert village pool credited |
| Failed raid stuck in `attacking` | `game.js` `processRaid` | Infinite combat loop | **Characterized** in `raid-state-machine.test.js`; flip to failing test when fixed |
| Conquest baseline timing | `game.js` `evaluateConquest` | Conquest never fires | QA: raid casualties → assert conquest threshold |
| Villager assignment indices 6+ | `game.js` `assignVillagersToVillages` | **Characterized** in `village-assignment.test.js` | Rewrite test when assignment fixed |
| `llmTick` early `return` | `game.js` | Aborts remaining villager actions | QA: mock LLM actions with one out-of-range interaction |

#### P1 — Electron main process (0% coverage)

| Gap | File | Risk |
|-----|------|------|
| Path traversal on `game:load` | `main.js` | Arbitrary file read |
| SSRF via LLM endpoint | `main.js` | Internal network access |
| Save/load IPC contracts | `main.js` | Data loss |
| Config persistence | `main.js` + `electron-store` | Settings drift |

**Recommendation:** Extract path sanitization and LLM URL validation into testable pure functions under `src/main/lib/`, then add `tests/unit/main/` with mocked `electron`.

#### P2 — Renderer modules with no direct tests

| Module | Lines | Gap |
|--------|-------|-----|
| `ui.js` | ~907 | DOM rendering, XSS via `innerHTML`, panel state |
| `game.js` (full) | ~4115 | ~95% of methods untested (build, diplomacy, family, tech, LLM tick) |
| `villager.js` (movement/render) | ~790 | Path movement, rendering, gathering loops |
| `world.js` (renderer) | ~400 | Canvas draw paths (needs canvas pixel assertions or snapshot mocks) |

#### P3 — External / non-deterministic

| Gap | Notes |
|-----|-------|
| Live LLM API calls | Mocked in tests; add optional `SIMVILLE_LLM_INTEGRATION=1` suite for manual/nightly runs |
| Audio module | Referenced in SPEC but `audio.js` missing |
| Electron window lifecycle | Requires Playwright/Electron driver for true E2E |

## Known Issues Documented by Tests

These QA tests **pass** while encoding current (buggy) behavior so refactors can detect fixes:

1. **Village assignment** — High-index villagers may remain unassigned (`village-assignment.test.js`).
2. **Failed raids** — `activeRaid` can remain in `attacking` phase (`raid-state-machine.test.js`).
3. **LLM fallback schema** — Generic `{ type: 'idle' }` vs `{ villagerId, action }` (`llm-fallback.test.js`, `llm.test.js`).
4. **Seeded RNG unused** — `randomInt`/`shuffle` ignore `setSeed` (`utils.test.js`).

When fixing these bugs, update the corresponding tests to assert correct behavior.

## Coverage Targets (recommended next steps)

1. **Phase 1:** Add QA suites for economy routing, conquest, and LLM tick continuation (~3–5 new test files).
2. **Phase 2:** Extract pure helpers from `game.js` into `src/renderer/js/systems/` (per `REFACTOR_PLAN.md`) to unlock unit tests without headless DOM.
3. **Phase 3:** Add Playwright + Electron for one smoke E2E (launch → new world → pause → save).
4. **Phase 4:** Main-process security tests with mocked Electron IPC.

## CI Integration

The GitHub Actions workflow runs:

1. `npm ci`
2. `npm test` (full regression)
3. `npm run test:coverage` with artifact upload

Cloud agents can run targeted suites before merge:

```bash
node tests/qa/harness.mjs --suite raid-state-machine
```
