# Simville Codebase Review & Refactor Plan

**Scope:** Full review of `src/` against `SPEC.md` (v1.1.0 multi-village)  
**Stack:** Electron 28 + vanilla JS (Canvas) + OpenAI-compatible LLM  
**Primary hotspot:** `src/renderer/js/game.js` (~4115 lines, god object)

This document identifies **implemented features that should be refactored** because they are not fit for purpose, not optimized, or not fully implemented. It is ordered by severity and proposed work phases.

---

## Executive summary

The game has a playable core loop (worldgen, day/night, villagers, build menu, LLM tick with fallbacks, chronicle UI, family systems). Several **flagship features from SPEC acceptance (§20)** are present as scaffolding but broken or dual-wired:

| System | Surface appearance | Runtime reality |
|--------|--------------------|-----------------|
| Multi-village economy | `Village.resources` + HUD | Harvest/eat/build use orphan `Game.resources` |
| War / raids / conquest | Phase machine + chronicle | Failed raids never exit; conquest baseline wrong |
| Village assignment | Two centers, two names | Most villagers stuck on village 0; 2nd chieftan mis-assigned |
| Secrets / gossip | Creation + LLM helpers | Gossip never called; discovery ≈ affairs only |
| Rituals / seasons | Constants + some hooks | Wrong timing; missing types; cosmetics only |
| Tech tree | LLM decisions + progress | `hasTech()` never gates gameplay |
| World seed | `setSeed` / `seededRandom` | All `Utils.random*` use `Math.random()` |
| Pixel art / audio | Settings toggles | Rects + emoji; no `audio.js` |

**Recommended strategy:** Fix simulation contracts first (economy, raids, assignment, LLM tick bug), harden Electron, then split `game.js`, then deepen incomplete SPEC systems.

---

## Phase 0 — Critical correctness (ship blockers)

These make advertised multi-village / war / LLM behavior actively wrong.

### 0.1 Unify resource ownership (not fit for purpose)

**Problem:** Two resource pools. HUD reads `village.resources`; simulation mutates `this.resources` on `Game` (lazily created, not saved).

**Evidence:**
- `game.js` `addResource` / `consumeResources` → `this.resources`
- `villager.js` eat/drink → `game.resources`
- Raid loot correctly touches `village.resources` (inconsistent)
- Save serializes village pools, not `Game.resources`

**Refactor:**
1. Delete / stop using `Game.resources` as source of truth.
2. Add `getVillageResources(villageId)` and route gather/build/eat/drink/farm through `villager.villageId`.
3. HUD: village selector or combined view with clear ownership.
4. Persist only village pools; migrate any orphan pool on load.
5. Wire territory: gathering in `Village.isInTerritory` / `World.getVillageAt` credits owner (SPEC §21.5).

### 0.2 Raid attacking phase one-shot + clear on failure (broken)

**Problem:** In `processRaid` `attacking` case, failure path kills villagers and chronicles but **never** sets phase to retreat or clears `activeRaid`. Combat re-runs every frame until the village is wiped.

**Refactor:**
- Resolve combat once (flag or immediate phase transition on both win and lose).
- On failure: set phase `retreating` or clear raid after scatter chronicle (SPEC §21.4).
- Guard with `combatResolved` so `update()` cannot re-resolve.

### 0.3 Conquest baseline (broken)

**Problem:** `evaluateConquest` sets `defender.originalPopulation` **after** casualties → loss ratio ≈ 0 → conquest never fires as designed.

**Refactor:**
- Set `originalPopulation` at village creation and/or at raid start.
- Optionally track cumulative war losses separately from single-raid math.
- On conquest, transfer **resources** as well as villagers/structures (currently incomplete in `handleConquest`).

### 0.4 `assignVillagersToVillages` rewrite (not fit for purpose)

**Problem:** Nested loop over villages re-runs assignment; only indices `0–4` → village 0 and index `5` → village 1; indices `6+` unassigned; second chieftan (index 1) goes to village 0; `STARTING_VILLAGERS` computed then ignored; duplicate `villagerIds` pushes.

**Refactor:**
- Create N villagers per village (align `CONSTANTS.VILLAGE.STARTING_VILLAGERS`, config `initialPopulation`, SPEC §4.1).
- Assign by spawn near each `village.center`; one chieftan per village.
- Clear `villagerIds` before rebuild; assert every villager has `villageId`.

### 0.5 `llmTick` proximity `return` → `continue` (broken)

**Problem:** Too-far interaction uses `return`, aborting the entire tick’s remaining villagers.

**Refactor:** `continue` (or skip only that interaction); keep applying other actions.

---

## Phase 1 — Security & Electron hardening (high)

| Issue | Location | Refactor |
|-------|----------|----------|
| `webSecurity: false` + `disable-web-security` | `main.js` | Remove for production; CSP allowlisting LLM hosts |
| Path traversal on `game:load` | `main.js` | `basename` + resolve under `savesDir` |
| SSRF via arbitrary LLM endpoint | `main.js` / renderer fetch | Allowlist schemes/hosts; prefer main-process LLM proxy |
| API key in renderer + plaintext store | `llm.js`, `electron-store` | IPC proxy; `safeStorage` / keychain |
| XSS via `innerHTML` + LLM text | `ui.js` | Escape / `textContent` for chronicle, goals, rules |
| Debug logs of key prefixes / full responses | `llm.js` | Redact; debug flag |

SPEC claims “API key stored securely” — current store is plaintext JSON.

---

## Phase 2 — Simulation contracts that silently degrade

### 2.1 Seeded RNG unused (not fit for purpose)

`Utils.seededRandom` / `setSeed` exist, but `randomInt` / `randomFloat` / `randomElement` / `shuffle` use `Math.random()`. World seed does not control resources, names, or placement.

**Refactor:** Route worldgen RNG through seeded PRNG; keep `Math.random` only for non-deterministic combat/UI if desired.

### 2.2 LLM reliability (incomplete / unfit fallbacks)

| Issue | Refactor |
|-------|----------|
| No API key → silent fallback (blocks keyless local servers) | Optional key; gate on endpoint |
| `parseResponse` object-only; SPEC asks for JSON array | Parse object **or** array; strip fences |
| Fallback schema ≠ consumer schema (`actions:[{type}]` vs `{villagerId, action}`) | Typed per-prompt fallbacks |
| `generateChronicleEntry` / `generateGossip` unused + wrong JSON contract | Wire or remove; fix prompt↔parser |
| History stores huge prompts | Compact summaries |
| No player-facing “LLM offline” indicator | UI status |

### 2.3 Needs vs LLM arbitration (unfit)

`Villager.updateStatus()` overrides LLM/work whenever hunger &lt; 65 / thirst &lt; 70 every tick — personality-driven actions rarely stick.

**Refactor:** Priority interrupt with cooldown; don’t clobber mid-duration actions; exempt eating/drinking from need decay double-hit.

### 2.4 Aging disabled (incomplete)

Comment in `villager.update`: “Not doing continuous aging”. Life-stage / coming-of-age / elder mechanics barely fire.

**Refactor:** Age from day ticks (SPEC: ~1 year / 90 days); emit stage events.

### 2.5 Relationships keyed by name (fragile)

Duplicate names break bonds; conquest cleanup uses substring match on village name.

**Refactor:** Key relationships by villager `id`; resolve display names in UI.

### 2.6 Diplomatic / war timers broken (unfit)

- `event.age += dayDuration` **every frame** → events expire in ~3 frames.
- `evaluateWarEscalation` double-increments pair keys in nested loops.

**Refactor:** Age in day units once per day (or by `deltaTime / dayDuration` once); single pair iteration.

### 2.7 Government dual state

`Game.government` used for rules; `Village.government` unused; rules not saved.

**Refactor:** Per-village government only; persist in save.

---

## Phase 3 — Incomplete SPEC systems (implemented surface, missing depth)

### 3.1 Secrets & gossip (SPEC §13 / §20.7) — Low completeness

- ~40% secret chance at backstory; affair discovery only.
- `llm.generateGossip` never called; no 1–2 hop/day spread; no public knowledge graph.

**Refactor:** Secret store with `discoveredBy`; daily gossip pass; discovery triggers beyond affairs; hide undiscovered affairs in UI.

### 3.2 Rituals (SPEC §15 / §20.9) — Partial / mistimed

| Spec | Code |
|------|------|
| Morning blessing at dawn | Fired from `onNewDay` (~midnight) |
| Harvest dance | Constant exists; never triggered |
| Prayer for Rain / Spirit Communion | Missing |
| Coming of age | Any life-stage change (incl. adult→elder) |
| LLM ritual narrative | Generated then discarded |

**Refactor:** Time-of-day hooks; harvest-season end trigger; stage-gated coming-of-age; chronicle ritual narratives.

### 3.3 Seasons (SPEC §14 / §20.8) — Mostly cosmetic

Present: tint, moodMod, some farm/well/regrow multipliers.  
Missing: rain particles, floods, wildfire, disease, irrigation, seasonal planning, festival trigger. Graphics toggles for particles/lighting largely unwired.

### 3.4 Personal goals (SPEC §16) — Medium

Progress/rewards work. Missing: `failed` / `failureCondition`, abandon, hidden vs shared visibility, LLM milestone judgment.

### 3.5 Chronicle (SPEC §12) — Template-heavy

`addChronicleEntry` string push only; LLM chronicler unused; open panel re-rendered every frame (`showChronicle` in `update`) → DOM thrash.

### 3.6 Needs (SPEC §5.1) — Partial

Hunger/thirst/energy/social exist. **Safety** and **Purpose** (and flee / existential wander) missing.

### 3.7 Player actions (SPEC §8.2) — Missing

Detail pane lacks Talk / Assign Task / View. Settings lack audio, end date, initial population controls present in SPEC mockups.

### 3.8 Tech tree — Implemented but inert

Large `constants` + LLM research path; `hasTech()` never gates production/build. Either wire unlocks or quarantine as future (SPEC §22 lists tech as future enhancement — current code overclaims).

### 3.9 Presentation / audio — Placeholder

- Spec file structure lists `audio.js`, sprites, fonts — **absent**.
- Rendering: colored rects + emoji/Arial, not pixel sprites (SPEC §7).
- Dead code: unreachable structure emoji branch in `world.js` after early `return`.

### 3.10 Save/load (SPEC §11) — Gaps

Not persisted: `Game.resources`, `Game.government`, `nextChieftanDecision`, `hostileDaysCount`. No auto-save rotation (last 5). Autosave window easy to miss at high speed. `dialog:show-save` uses `showOpenDialog`.

---

## Phase 4 — Optimization

| Hot path | Issue | Direction |
|----------|-------|-----------|
| `World.getPath` | BFS with `queue.shift()` → O(n²) | Deque / A* + heap; radius limit; cache |
| Visible tile render | Linear `getResourceAt` / `getStructureAt` per tile | Occupancy grids / spatial hash |
| Minimap | Full O(size²) every draw | Dirty buffer + entity overlay |
| Daily relationship deepen / rituals | O(n²) nested loops | Acceptable at n≈10; partition by village as n grows |
| Chronicle UI | Rebuild DOM every frame while open | Dirty flag / interval |
| `game.js` monolith | ~146 methods, all systems | Extract modules (below) |

---

## Phase 5 — Architecture split

**Current:** `Game` owns loop, time, LLM, war, family, goals, build, tech, chronicle, rules, save, input, render orchestration. Thin `village.js` (~156 lines). Global `game` coupling from `villager.js`.

**Target module boundaries** (keep files ≤500 lines where practical):

```
systems/
  Economy.js          # village resource pools, gather, storage
  RaidSystem.js       # raid phases, combat one-shot, conquest
  Diplomacy.js        # chieftan decisions, war escalation
  FamilySystem.js     # marriage, pregnancy, divorce, affairs
  RitualSystem.js     # timed rituals
  SeasonSystem.js     # season effects + events
  GoalSystem.js       # pursue / fail / reward
  ChronicleSystem.js  # entries + LLM narrative
  Construction.js     # build projects
  LlmDirector.js      # tick batching, validation, fallbacks
```

`Game` becomes orchestrator: `update(dt)` calls systems; save/load aggregates snapshots.

Add unit tests for economy ownership, raid state machine, villager assignment, LLM parse/fallback contracts, and seeded RNG (project rule: cover ≥70% of methods on new classes).

---

## Feature fitness matrix (refactor candidates)

| Feature | Fit for purpose? | Optimized? | Fully implemented? | Priority |
|---------|------------------|------------|--------------------|----------|
| Multi-village resources | No (dual pool) | N/A | No | P0 |
| Raids / combat | No (stuck attacking) | OK at small n | Partial | P0 |
| Conquest | No (baseline) | OK | Partial | P0 |
| Villager↔village assignment | No | OK | No | P0 |
| LLM action tick | Fragile (`return`) | Batched OK | Partial | P0 |
| Electron security | No | N/A | No | P1 |
| World seed | No | N/A | Fake | P2 |
| LLM parse/fallback | No | Chatty logs | Partial | P2 |
| Need vs LLM priority | No | Overrides every tick | Partial | P2 |
| Aging / life stages | No | N/A | Stubbed | P2 |
| Diplomacy timers | No | Frame-broken | Partial | P2 |
| Secrets / gossip | Incomplete | N/A | ~20% | P3 |
| Rituals | Mistimed | N/A | ~40% | P3 |
| Seasons | Cosmetic | N/A | ~30% | P3 |
| Goals | OK core | OK | ~60% | P3 |
| Chronicle LLM | Unused | DOM thrash | ~50% | P3 |
| Tech tree | Inert | Extra cost | Surface only | P3 / cut |
| Pathfinding / render | Works small maps | No | Yes | P4 |
| Pixel art / audio | Placeholder | N/A | No | P5 |
| `game.js` structure | Unmaintainable | Monolith | N/A | P5 (start extracting during P0–P2) |

---

## Suggested PR sequence

1. **P0-economy** — Single village resource API + HUD + save  
2. **P0-war** — Raid one-shot, conquest baseline, assignment rewrite  
3. **P0-llm-tick** — `continue` + action validation smoke tests  
4. **P1-security** — webSecurity, path-safe saves, escape UI, LLM proxy  
5. **P2-sim-contracts** — seeded RNG, aging, need interrupts, diplomacy aging, relationship IDs  
6. **P2-llm-contracts** — parse/fallback schemas, offline indicator  
7. **P3-depth** — gossip, rituals timing, seasons events, goal failure (pick by product priority)  
8. **P4-perf** — pathfinding + spatial indexes  
9. **P5-arch** — extract systems from `game.js`; presentation/audio last  

Do not expand tech tree or pixel art until P0–P2 simulation contracts are stable.

---

## Out of scope / explicit non-goals for early refactors

- Mobile companion (SPEC §22)
- Full 16-bit sprite atlas until sim contracts stabilize
- Expanding tech tree content while `hasTech` is unwired — prefer feature-flag or remove from player-facing claims

---

## Review method used

- Full read of `SPEC.md` acceptance criteria (§20) and multi-village (§21)
- Line-level inspection of `game.js`, `villager.js`, `village.js`, `world.js`, `llm.js`, `ui.js`, `utils.js`, `constants.js`, `main.js`, `preload.js`
- Cross-reference of dead LLM helpers (`generateGossip`, `generateChronicleEntry`) and unused gameplay gates (`hasTech`, territory helpers)

No runtime gameplay session was executed in this pass; findings are static-analysis backed. Highest-confidence bugs (raid loop, `return` in tick, dual resources, assignment, seeded RNG, webSecurity) are directly evidenced in source.
