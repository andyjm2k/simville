# Simville Test Coverage Gaps

> **Status (November 2026, verified at HEAD `bf20486` + fix-first-batch):** the P0 gaps below are **all fixed** — see the `Status` column. Do not re-file them. The P1 main-process gaps are partially closed: the LLM endpoint validator is now a pure module with unit tests (`tests/unit/llm-endpoint.test.js`), and seeded-replicate determinism has a test (`tests/unit/benchmark-determinism.test.js`).

End-to-end review of the Simville codebase against the new Vitest + headless QA harness (`tests/`). This document maps what is covered today versus what remains untested.

## Current Test Infrastructure

| Layer | Location | Runner | Purpose |
|-------|----------|--------|---------|
| Unit tests | `tests/unit/` | Vitest + jsdom | Pure logic and class methods |
| Systems unit | `tests/run-unit-tests.js` | Node VM harness | Economy / Raid / Diplomacy / Benchmark |
| QA / functional | `tests/qa/` | Vitest + headless game harness | Component integration without Electron display |
| QA CLI | `tests/qa/harness.mjs` | Node wrapper | Target individual suites in cloud/CI |
| CI | `.github/workflows/test.yml` | GitHub Actions | Regression gate on push/PR |

### Commands

```bash
npm test                    # Vitest unit+QA, then systems unit tests
npm run test:unit           # Vitest unit tests only
npm run test:qa             # QA functional tests only
npm run test:systems        # Economy/Raid/Diplomacy Node harness
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

#### P0 — Critical simulation correctness (all fixed at HEAD, Nov 2026)

| Gap | File(s) | Risk | Suggested test | Status |
|-----|---------|------|----------------|--------|
| Dual resource pools (`Game.resources` vs `Village.resources`) | `game.js`, `villager.js` | HUD/sim mismatch | QA: gather → assert village pool credited | **Fixed** — `Economy` is the single source of truth; no `Game.resources` remains |
| Failed raid stuck in `attacking` | `game.js` `processRaid` | Infinite combat loop | **Characterized** in `raid-state-machine.test.js`; flip to failing test when fixed | **Fixed** — phase machine with `combatResolved` guard; test asserts the raid exits attacking into retreating and clears |
| Conquest baseline timing | `game.js` `evaluateConquest` | Conquest never fires | QA: raid casualties → assert conquest threshold | **Fixed** — baseline snapshotted at village creation / raid start |
| Villager assignment indices 6+ | `game.js` `assignVillagersToVillages` | **Characterized** in `village-assignment.test.js` | Rewrite test when assignment fixed | **Fixed** — nearest-centre assignment; test asserts 10 villagers, all assigned, one chieftan each |
| `llmTick` early `return` | `game.js` | Aborts remaining villager actions | QA: mock LLM actions with one out-of-range interaction | **Fixed** — tick loop uses `continue`; out-of-range social actions now return `{ handled: false, reason: 'out_of_range' }` (fix-first-batch) |

#### P1 — Electron main process (0% coverage)

| Gap | File | Risk | Status (Nov 2026) |
|-----|------|------|-------------------|
| Path traversal on `game:load` | `main.js` | Arbitrary file read | **Fixed** — `basename` + `startsWith(savesDir)` |
| SSRF via LLM endpoint | `main.js` | Internal network access | **Partially fixed (fix-first-batch)** — validator extracted to `src/main/llm-endpoint.js` with unit tests; UI test routes through main-process IPC with timeout + `redirect: 'error'`. Remaining: no DNS-resolution check |
| Save/load IPC contracts | `main.js` | Data loss | Not covered |
| Config persistence | `main.js` + `electron-store` | Settings drift | Not covered |

**Recommendation:** Extract path sanitization and LLM URL validation into testable pure functions under `src/main/lib/`, then add `tests/unit/main/` with mocked `electron`. — *Update (Nov 2026): the LLM URL validation half of this is done (`src/main/llm-endpoint.js` + `tests/unit/llm-endpoint.test.js`); path sanitization is still inline in `main.js`.*

#### P2 — Renderer modules with no direct tests

| Module | Lines | Gap |
|--------|-------|-----|
| `ui.js` | ~1,376 | DOM rendering, XSS via `innerHTML`, panel state |
| `game.js` (full) | ~5,644 | ~95% of methods untested (build, diplomacy, family, tech, LLM tick) |
| `villager.js` (movement/render) | ~1,299 | Path movement, rendering, gathering loops |
| `world.js` (renderer) | ~400 | Canvas draw paths (needs canvas pixel assertions or snapshot mocks) |

#### P3 — External / non-deterministic

| Gap | Notes |
|-----|-------|
| Live LLM API calls | Mocked in tests; add optional `SIMVILLE_LLM_INTEGRATION=1` suite for manual/nightly runs |
| Audio module | Referenced in SPEC but `audio.js` missing |
| Electron window lifecycle | Requires Playwright/Electron driver for true E2E |

## Known Issues Documented by Tests

> **Status (Nov 2026):** all four items below were fixed at HEAD. The tests that used to encode the buggy behaviour have been updated to assert correct behaviour — do not flip them back.

These QA tests **pass** while encoding current (buggy) behavior so refactors can detect fixes:

1. **Village assignment** — High-index villagers may remain unassigned (`village-assignment.test.js`). → **Fixed:** nearest-centre assignment; test asserts all assigned.
2. **Failed raids** — `activeRaid` can remain in `attacking` phase (`raid-state-machine.test.js`). → **Fixed:** phase machine clears on failure; test asserts the transition.
3. **LLM fallback schema** — Generic `{ type: 'idle' }` vs `{ villagerId, action }` (`llm-fallback.test.js`, `llm.test.js`). → **Fixed:** typed per-villager fallbacks exist.
4. **Seeded RNG unused** — `randomInt`/`shuffle` ignore `setSeed` (`utils.test.js`). → **Fixed:** `Utils.random*` use the seeded LCG, and headless mode seeds `Math.random` too (fix-first-batch, `tests/unit/benchmark-determinism.test.js`).

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
