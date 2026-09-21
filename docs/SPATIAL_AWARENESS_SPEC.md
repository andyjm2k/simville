# Spatial Awareness — Implementation Specification & Plan

**Parent review:** [`docs/SPATIAL_AWARENESS.md`](./SPATIAL_AWARENESS.md)  
**Status:** Phases 0–3 implemented (v1)  
**Target stack:** Electron + vanilla JS (Canvas), existing `systems/*` pattern  
**Out of scope for v1:** Raid map marching, multiplayer fog sync, navmesh / hierarchical pathfinding

This document is the **contract** for implementing villager place knowledge and the pathfinding upgrades that depend on it. Implement in the phase order below; do not skip Phase 0–1 for Phase 3 features.

---

# Part A — Specification

## A.1 Goals

Villagers must:

1. Know **where they are** relative to home landmarks and zone (home / wilderness / border / foreign).
2. **Remember** resources, structures, and landmarks they have seen.
3. **Hear about** places from kin (gossip / socialize) and scouts (debrief → tribal map).
4. **Navigate** to known and rumored places via existing `moveTo` / `getPath`, with territory-respecting routes and stuck recovery.
5. Prefer known places for gather / social / LLM goals instead of omniscient full-radius world queries.

## A.2 Non-goals (v1)

| Non-goal | Rationale |
|----------|-----------|
| Perfect fog-of-war for the player camera | Optional later; memory first |
| Blocking walkability with structures | Crowding not required for awareness |
| Replacing personality secrets with only place talk | Place rumors are an *additional* channel |
| Real-time raid path marches | Separate combat scope |
| Diagonal / continuous-space pathfinding | Keep 4-connected grid |

## A.3 Glossary

| Term | Meaning |
|------|---------|
| **Place** | A remembered location with kind, coords, confidence, and tags |
| **Personal map** | `villager.knownPlaces[]` |
| **Tribal map** | `village.tribalMap[]` |
| **Rumor** | Low-confidence / low-precision place from hearsay |
| **Observe** | Record places within sight range into personal map |
| **Resolve** | Pick a place (or live fallback) for a gameplay need |
| **Locality** | Compact “where am I?” descriptor for AI / UI |
| **Sight query** | Live world lookup limited to `SIGHT_RANGE` (not full territory cheat) |

## A.4 Constants

Add under `CONSTANTS` in `constants.js` (freeze like existing blocks):

```js
PLACE_MEMORY: {
  PERSONAL_CAP: 24,
  TRIBAL_CAP: 48,
  SIGHT_RANGE: null,              // use EXPLORATION.SIGHT_RANGE when null
  MIN_CONFIDENCE_USE: 0.25,       // below this, ignore for goal resolve
  SEEN_CONFIDENCE: 0.95,
  SCOUT_CONFIDENCE: 0.8,
  TOLD_CONFIDENCE: 0.55,
  RUMOR_CONFIDENCE: 0.35,
  SEEN_PRECISION: 1.0,
  TOLD_PRECISION: 0.75,
  RUMOR_PRECISION: 0.4,
  RUMOR_JITTER_TILES: 3,          // approximate coords for rumors
  CONFIDENCE_DECAY_PER_DAY: 0.02, // rumors/told only; seen decays slower
  SEEN_DECAY_PER_DAY: 0.005,
  CONFIRM_BOOST: 0.15,
  MISS_PENALTY: 0.35,             // arrived and nothing found
  OBSERVE_INTERVAL_MS: 1500,      // throttle while moving
  SHARE_BASE_CHANCE: 0.35,
  CURIOSITY_SHARE_BONUS: 0.25,    // curious >= CURIOUS_THRESHOLD
  SOCIABLE_SHARE_BONUS: 0.15,
  LIVE_FALLBACK_RADIUS: null,     // default = SIGHT_RANGE
  LOCALITY_UPDATE_TILES: 2,      // recompute locality after this much movement
},

PLACE_KIND: {
  LANDMARK: 'landmark',
  RESOURCE: 'resource',
  STRUCTURE: 'structure',
  VILLAGE: 'village',
  WAYPOINT: 'waypoint',
  HAZARD: 'hazard'
},

PLACE_SOURCE: {
  SEEN: 'seen',
  TOLD: 'told',
  SCOUT: 'scout',
  RITUAL: 'ritual',
  RUMOR: 'rumor',
  SEEDED: 'seeded'
},

PLACE_ZONE: {
  HOME: 'home',
  WILDERNESS: 'wilderness',
  BORDER: 'border',
  FOREIGN: 'foreign'
}
```

Need → tag mapping (resolver):

| Need / activity | Required tags (any match) | Preferred kinds |
|-----------------|---------------------------|-----------------|
| `wood` / gather wood | `wood` | resource |
| `food` / gather / hunt | `food`, `hunt` | resource |
| `water` / drink / fish | `water`, `fish` | resource, landmark |
| `stone` / clay / herbs / thatch | matching resource tag | resource |
| `social` / ritual | `social`, `sacred`, `fire` | landmark, structure |
| `sleep` / rest | `shelter`, `hut` | structure |
| `storage` / haul | `storage` | structure |
| `scout` / explore | `rival`, `unexplored`, `wilderness` | landmark, waypoint |

Resource type → tags: reuse `CONSTANTS` resource keys as tags (`wood`, `food`, `water`, …).

## A.5 Data model

### A.5.1 Place entry

```js
/**
 * @typedef {object} PlaceMemoryEntry
 * @property {string} id              Stable key: resourceId | structureId | `landmark:${key}` | generated
 * @property {string} kind            PLACE_KIND.*
 * @property {string} label           Human-readable short name
 * @property {number} x
 * @property {number} y
 * @property {number} precision       0–1
 * @property {number} confidence      0–1
 * @property {string} source          PLACE_SOURCE.*
 * @property {number} lastSeenDay     Simulation day of last confirm/update
 * @property {string[]} tags
 * @property {string|null} ownerVillageId
 * @property {string|null} resourceType  For kind===resource
 * @property {boolean} [stale]        True after miss or depleted node
 */
```

**ID stability rules:**

- Resource node: prefer world resource `id` if present; else `resource:${type}:${x}:${y}`.
- Structure: structure `id`.
- Home landmarks: `landmark:village_center:${villageId}`, `landmark:communal_fire:${structureId}`, etc.
- Rival border rumor: `landmark:rival_border:${rivalVillageId}`.
- When merging two entries with same `id`, keep higher confidence; average or take newer coords if precision ≥ other; union tags; set `lastSeenDay` to max.

### A.5.2 Villager fields

```js
villager.knownPlaces = [];           // PlaceMemoryEntry[], capped
villager.locality = null | {
  zone: PLACE_ZONE.*,
  nearestLandmarkId: string|null,
  nearestLandmarkLabel: string|null,
  nearestLandmarkDist: number|null,
  inTerritory: boolean,
  description: string              // "near communal fire", "in the wilds east of home"
};
villager._lastObserveAt = 0;         // runtime throttle; do not serialize
villager._lastLocalityTile = null;   // runtime; do not serialize
```

Serialize `knownPlaces` and `locality` in `Villager.serialize` / constructor defaults.

### A.5.3 Village fields

```js
village.tribalMap = [];              // PlaceMemoryEntry[], capped
```

Serialize in `Village.serialize`. Method: `mergeTribalMap(entries, meta)` → number added/updated.

### A.5.4 Optional world registry

Not required for Phase 1. If added later:

```js
world.landmarks = []; // canonical POIs rebuilt from structures on load
```

v1 seeds landmarks from village center + owned structures at bootstrap / load migrate.

## A.6 Module API — `PlaceMemorySystem`

**File:** `src/renderer/js/systems/place-memory.js`  
**Global:** `PlaceMemorySystem` (script tag, same pattern as `ExplorationSystem`)  
**Size budget:** &lt; 500 lines; split helpers only if exceeded.

```js
class PlaceMemorySystem {
  constructor(game) { this.game = game; }

  // --- Entry builders ---
  createEntry(partial) → PlaceMemoryEntry
  normalizeEntry(entry) → PlaceMemoryEntry|null

  // --- Personal / tribal stores ---
  addOrUpdate(list, entry, cap) → PlaceMemoryEntry
  getById(list, id) → entry|null
  findByNeed(list, need, opts) → entry|null
  rankCandidates(list, origin, need, opts) → entry[]
  decayList(list, currentDay) → void
  pruneStale(list) → void

  // --- Observation ---
  getSightRange() → number
  observeSurroundings(villager, opts?) → PlaceMemoryEntry[]  // mutates knownPlaces
  confirmArrival(villager, expectedEntry|null) → 'confirmed'|'miss'|'none'
  seedHomePlaces(villager, village) → void
  seedTribalHome(village) → void

  // --- Sharing ---
  mergeIntoTribal(village, entries, source) → { added, updated }
  sharePlaceBetween(speaker, listener, entry) → entry|null  // told copy with jitter
  pickShareablePlace(speaker) → entry|null
  shouldShare(speaker, listener) → boolean

  // --- Locality & resolve ---
  updateLocality(villager) → locality
  describeLocality(villager) → string
  resolvePlaceTarget(villager, need, opts?) → {
    entry: PlaceMemoryEntry|null,
    x, y,
    from: 'personal'|'tribal'|'live'|'none',
    liveResource: object|null
  }

  // --- Serialization helpers ---
  serializeList(list) → array
  deserializeList(data) → PlaceMemoryEntry[]
}
```

### A.6.1 `resolvePlaceTarget` contract

Order of preference:

1. **Personal** `knownPlaces` matching need, `confidence >= MIN_CONFIDENCE_USE`, not stale, reachable under territory rules.
2. **Tribal** `tribalMap` same filters (copy into personal as `told` optional — v1: use coords without copy).
3. **Live fallback:** `getResourcesInRadius` / structure lookup with radius = `LIVE_FALLBACK_RADIUS` (default sight), still applying territory filters. On hit, immediately `observe` / `addOrUpdate` personal as `seen`.
4. **None:** return `{ from: 'none' }` — caller may wander / scout instead of omniscient long-range search.

Scoring for rank:  
`score = confidence * precision * (1 / (1 + distance)) * accessFactor`  
`accessFactor = 0` if destination fails `canVillagerEnterTerritory`, else `1`.

**Breaking change vs today:** `findNearestResourceInTerritory(..., radius=10)` must not remain the primary gather path with radius 10 omniscient. Either:

- Change gather handlers to call `resolvePlaceTarget`, or  
- Reimplement `findNearestResourceInTerritory` to delegate to resolve (preferred single chokepoint).

### A.6.2 Observation contract

`observeSurroundings(villager)`:

1. Query resources and structures within sight of `(villager.x, villager.y)`.
2. For each visible resource with `amount > 0` and not depleted → upsert personal entry (`source: seen` unless already higher).
3. For each visible structure → upsert with tags from structure type (`fire` → `social`+`fire`, barn → `storage`, hut → `shelter`, shrine → `sacred`, well → `water`).
4. If rival territory edge visible and rival known or being scouted → upsert `rival_border` landmark (precision mid).
5. Respect `PERSONAL_CAP` (drop lowest confidence stale first).

Call sites:

| When | Where |
|------|-------|
| Path waypoint reached / move complete | `villager.js` update |
| Scout mission tick | `exploration.js` `updateScoutMissions` |
| After successful harvest | gather handler |
| Throttled while moving | every `OBSERVE_INTERVAL_MS` |

### A.6.3 Scout debrief contract

When scout `phase === 'returning'` and arrives at destination:

1. `mergeIntoTribal(home, scout.knownPlaces, 'scout')` — entries get `source` at least `scout` if not already `seen` on tribal map.
2. Chronicle one geographic line if any new tribal entries (cap text length).
3. Existing `clearScout` behavior unchanged otherwise.
4. Do **not** require first contact to debrief resources found in wilderness.

### A.6.4 Place rumor / gossip contract

Distinct from personality `secrets`:

```js
/**
 * @typedef {object} PlaceRumorEvent
 * @property {'place_rumor'} type
 * @property {string} placeId
 * @property {string} label
 * @property {number} x
 * @property {number} y
 * @property {number} precision
 * @property {string} fromVillagerId
 * @property {string[]} tags
 */
```

Triggers:

1. During socialize (`share` / `talk` / `help`): if `shouldShare(a,b)`, transfer `pickShareablePlace`.
2. Daily gossip pass (alongside secret gossip): same tribe only; one place rumor attempt per spreader.

Told entry rules:

- `source: told`, confidence = `TOLD_CONFIDENCE` (or speaker confidence * 0.7, clamped).
- Apply jitter up to `RUMOR_JITTER_TILES * (1 - precision)` on x/y for rumors; less jitter for `told` of `seen` places.
- Listener `addOrUpdate` personal map.

### A.6.5 Locality contract

`updateLocality(villager)` sets:

- `inTerritory` from home village.
- `zone`: `foreign` if on rival claim without access; `home` if in territory; `border` if within 2 tiles of territory radius edge; else `wilderness`.
- Nearest personal+tribal landmark within sight * 1.5 (or any known landmark within 12 tiles).
- `description` examples:
  - `near communal fire`
  - `at village center`
  - `in the wilds east of home`
  - `near the edge of tribal lands`
  - `in foreign territory`

Recompute when tile position changes by `LOCALITY_UPDATE_TILES` or on move stop.

### A.6.6 Daily decay

On day rollover (existing day-change hook in `game.js`):

- For each villager and each village tribal map: `decayList`.
- Decay amount: `SEEN_DECAY_PER_DAY` if source is `seen`/`seeded`/`scout`, else `CONFIDENCE_DECAY_PER_DAY`.
- Remove entries with `confidence < 0.05` or (`stale && confidence < MIN_CONFIDENCE_USE`).

## A.7 Pathfinding specification

### A.7.1 Phase 1 (required with knowledge)

**Territory-aware path options** on `World.getPath(sx, sy, ex, ey, options)`:

```js
options = {
  villager: Villager|null,
  avoidForeignTerritory: true,   // default true when villager provided
  maxLength: 0                   // 0 = unlimited; optional safety cap
}
```

Behavior:

- When `avoidForeignTerritory` and `game.canVillagerEnterTerritory(villager, nx, ny)` is false, treat tile as non-walkable **for this search only**.
- Destination must still pass existing `moveTo` entry checks.
- If no path, return `null` (caller may relax options once for wilderness emergencies — v1: no relax).

**Repath on block** in `villager.js`:

- If next waypoint tile becomes non-walkable OR foreign-blocked: call `getPath` once to same `targetX/Y`.
- If repath fails → `stopMoving()` (current behavior).
- Guard with `villager._repathAttempts` reset on successful `moveTo` (max 1 per move order).

### A.7.2 Phase 2 (perf)

- Path cache: key `${sx},${sy},${ex},${ey},${accessKey}` → path copy.
- `accessKey` derived from open-border set for villager’s village (sorted rival ids with access).
- Invalidate cache on: structure add/remove (optional), war/trade access change, or TTL per day.
- Cap cache size (e.g. 256 entries).

A* optional after cache: Manhattan heuristic, same walkability predicate as BFS.

### A.7.3 Phase 3 (waypoints & haul)

- If direct path length &gt; threshold OR null, try via nearest tribal landmark waypoint (two-segment path).
- Haul loop state machine on gather: `to_resource` → `harvest` → `to_storage` → `deposit` → idle. Storage = known `storage` place or fire/center fallback.

## A.8 LLM & baseline contracts

### A.8.1 `buildWorldStateForVillage` additions

```js
{
  // existing fields...
  landmarks: [ { id, label, x, y, tags } ],          // from tribalMap kind landmark/structure, top 8
  knownResources: [ { type, x, y, confidence, source } ], // tribal resources, top 8
}
```

Per-villager summary in `generateVillagerActions` (compact, max ~3 places each):

```text
locality: near communal fire (home)
knownPlaces: wood@(22,31) c=0.9; water~@(35,40) c=0.4 rumor
```

### A.8.2 Prompt rules (add to system/user prompt)

- Prefer `moveTo` coordinates from LANDMARKS / knownPlaces / knownResources matching the action.
- Do not invent coordinates outside: tribal maps, listed knownPlaces, or home territory ± wilderness wander range.
- If only a low-confidence rumor exists, still `moveTo` approximate coords (explore to confirm).

### A.8.3 Baseline agent

`BaselineAgent.findResourceTarget` (or equivalent) **must** call `game.placeMemory.resolvePlaceTarget` — no parallel omniscient logic.

## A.9 Save / load / migration

| Save version behavior | Action |
|-----------------------|--------|
| Missing `knownPlaces` | `[]`, then `seedHomePlaces` after village bind |
| Missing `tribalMap` | `[]`, then `seedTribalHome` |
| Invalid entries | `normalizeEntry` drops bad rows |
| Old games mid-run | No forced rediscovery; live sight fallback still works |

Do not bump a global save version unless the project already has one; defensive defaults are enough.

## A.10 UI (minimal v1)

Required:

- No new panels mandatory.

Optional (Phase 2+):

- Villager panel: “Knows N places” + top 3 labels.
- Chronicle already used for scout debrief.

Do not block gameplay on UI.

## A.11 Acceptance criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC1 | Home landmarks seeded for villagers and tribal map on new game / load migrate | Unit + boot smoke |
| AC2 | Walking within sight of a resource adds/updates personal `knownPlaces` | Unit + integration |
| AC3 | Gather uses `resolvePlaceTarget`; prefers personal/tribal over long-range omniscient | Unit (mock world) |
| AC4 | Live fallback limited to sight-range radius; success writes memory | Unit |
| AC5 | Socialize/gossip can transfer a place with reduced confidence | Unit |
| AC6 | Scout return merges scout places into `tribalMap` and chronicles if new | Unit |
| AC7 | `locality.description` updates in home vs wilderness | Unit |
| AC8 | `getPath` with villager avoids closed foreign tiles | Unit |
| AC9 | Blocked waypoint triggers at most one repath then stop | Unit |
| AC10 | LLM world state includes landmarks / knownResources; villager summaries include locality | Unit string contains |
| AC11 | `findNearestResourceInTerritory` sort uses `(x,y)` correctly (bugfix) | Unit |
| AC12 | Serialize/deserialize round-trips places on villager and village | Unit |
| AC13 | Files stay ≤ 500 lines; new logic in `place-memory.js` not dumped into `game.js` | Review |

## A.12 Testing specification

**New file:** `tests/unit/place-memory.test.js`  
**Load order:** register `systems/place-memory.js` in `index.html` **and** `tests/setup/load-scripts.js` (before exploration if exploration calls it, or after game globals — prefer after `utils`/`constants`, before `exploration.js`).

Minimum cases (≥ 70% of `PlaceMemorySystem` methods exercised):

- `createEntry` / `normalizeEntry` clamps and defaults  
- `addOrUpdate` merge + cap eviction  
- `findByNeed` / `rankCandidates` scoring  
- `observeSurroundings` records resource + structure  
- `confirmArrival` confirmed vs miss  
- `sharePlaceBetween` confidence/precision  
- `mergeIntoTribal`  
- `resolvePlaceTarget` personal → tribal → live → none  
- `decayList`  
- `updateLocality` zones  
- serialize round trip  

Additional:

- `tests/unit/world.test.js` — territory-avoiding path  
- Extend territory QA test if present for repath / foreign avoidance  

---

# Part B — Implementation Plan

## B.1 Strategy

**Knowledge before algorithm.** Ship place memory + goal resolve + observe/share/debrief first; then territory path + repath; then cache/A*/haul/fog.

Fix the resource sort bug in the first PR that touches gather resolution.

## B.2 PR / phase breakdown

### Phase 0 — Correctness (½ day equivalent; tiny PR)

| Task | File(s) | Notes |
|------|---------|-------|
| P0.1 Fix distance sort in `findNearestResourceInTerritory` | `game.js` | `Utils.distance(b.x, b.y, villager.x, villager.y)` |
| P0.2 Unit assertion for sort order with two nodes | `tests/unit/...` | Existing game/resource test or new |

**Exit:** Nearest resource ordering correct.

---

### Phase 1 — Place memory foundations (core PR)

| Task | File(s) | Details |
|------|---------|---------|
| P1.1 Add constants | `constants.js` | `PLACE_MEMORY`, `PLACE_KIND`, `PLACE_SOURCE`, `PLACE_ZONE` |
| P1.2 Create `PlaceMemorySystem` | `systems/place-memory.js` | API per A.6; comment each logical block per project norms |
| P1.3 Script registration | `index.html`, `load-scripts.js` | Export global expectations |
| P1.4 Construct on Game | `game.js` | `this.placeMemory = new PlaceMemorySystem(this)` near other systems |
| P1.5 Villager fields + serialize | `villager.js` | `knownPlaces`, `locality` |
| P1.6 Village fields + serialize + merge | `village.js` | `tribalMap`, `mergeTribalMap` delegates to system |
| P1.7 Seed on assign / load | `game.js` | After villagers bound to villages |
| P1.8 Observe on arrive + throttle | `villager.js` | Call system |
| P1.9 Resolve chokepoint | `game.js` | `findNearestResource*` / gather handlers → `resolvePlaceTarget` |
| P1.10 Unit tests | `tests/unit/place-memory.test.js` | A.12 |

**Exit:** AC1–AC4, AC7 (partial), AC11–AC13.

**Manual check:** New game → select villager → gather wood twice near same node → second trip should still work; personal list non-empty in debugger.

---

### Phase 2 — Sharing, scout debrief, locality in AI

| Task | File(s) | Details |
|------|---------|---------|
| P2.1 Scout observe each tick | `exploration.js` | Already marks explored; add `observeSurroundings` |
| P2.2 Scout debrief on return | `exploration.js` | Merge + chronicle |
| P2.3 Place rumor on socialize | `game.js` social handler | Beside secret discovery |
| P2.4 Daily place gossip | `game.js` gossip pass | Tribe-scoped |
| P2.5 Locality update cadence | `villager.js` | A.6.5 |
| P2.6 World state + LLM prompt | `game.js`, `llm.js` | A.8 |
| P2.7 Baseline agent | `baseline-agent.js` | Use resolve |
| P2.8 Day decay hook | `game.js` | A.6.6 |
| P2.9 Tests | place-memory + exploration tests | AC5–AC6, AC10 |

**Exit:** AC5, AC6, AC7, AC10.

---

### Phase 3 — Pathfinding respect & recovery

| Task | File(s) | Details |
|------|---------|---------|
| P3.1 `getPath` options | `world.js` | Avoid foreign tiles |
| P3.2 `moveTo` passes villager into getPath | `villager.js` | |
| P3.3 Single repath on block | `villager.js` | A.7.1 |
| P3.4 Tests | `world.test.js`, territory QA | AC8–AC9 |

**Exit:** Paths do not cross closed claims; stuck recovery once.

---

### Phase 4 — Navigation richness (optional follow-ups)

| Task | Details | Priority |
|------|---------|----------|
| P4.1 Path cache | A.7.2 | Medium |
| P4.2 A* | After cache | Low–medium |
| P4.3 Waypoint routing via landmarks | A.7.3 | Medium |
| P4.4 Haul-to-storage loop | SPEC gathering | High for SPEC fidelity |
| P4.5 Consume `tile.explored` for wander bias / minimap fog | Visual + curious AI | Medium |
| P4.6 Villager panel known places | UX | Low |
| P4.7 Raid map travel | Large; separate epic | Optional |

## B.3 Dependency graph

```
P0 sort fix
   │
   ▼
P1 PlaceMemorySystem + seed + observe + resolve
   │
   ├──────────────► P2 share / debrief / LLM / decay
   │
   └──────────────► P3 territory path + repath
                        │
                        ▼
                   P4 cache / A* / haul / fog
```

P2 and P3 can proceed in parallel after P1 merges.

## B.4 Risk register

| Risk | Mitigation |
|------|------------|
| Gather fails because memory empty early game | Sight-range live fallback + home seeding |
| LLM ignores new fields | Explicit prompt rules + baseline parity |
| Pathfinding never finds wilderness route around rival | Ensure unclaimed corridors exist in worldgen; path around claim circle |
| Memory bloat in prompts | Caps + top-N truncation in world state |
| Cap eviction forgets fire | Never evict `seeded` home landmarks; pin by tag `home` |
| Double-counting tribal + personal in resolve | Dedupe by id when ranking combined lists |
| Performance of observe every frame | Throttle `OBSERVE_INTERVAL_MS`; radius query only |

## B.5 Pinning rules (important)

When enforcing `PERSONAL_CAP` / `TRIBAL_CAP`:

1. Never drop entries with tag `home` or source `seeded`.
2. Prefer dropping `stale` and lowest confidence rumors first.

## B.6 Implementation checklist (developer)

- [ ] Phase 0 merged  
- [ ] `place-memory.js` + constants + script tags  
- [ ] Villager/village serialize fields  
- [ ] Seed + observe + resolve wired to gather  
- [ ] Unit tests green (`npm test`)  
- [ ] Scout debrief + place gossip  
- [ ] Locality + LLM/baseline  
- [ ] Territory-aware path + repath  
- [ ] Acceptance table AC1–AC13 signed off  
- [ ] Update `docs/SPATIAL_AWARENESS.md` status to “Spec implemented through Phase N”

## B.7 Effort characterization (technical, not calendar)

| Phase | Components touched | Invasiveness | Main dependencies |
|-------|--------------------|--------------|-------------------|
| 0 | 1 function + test | Trivial | None |
| 1 | New system + villager/village/game gather path | Moderate | Script load order |
| 2 | Exploration, gossip, LLM prompts | Moderate | Phase 1 API stable |
| 3 | `getPath` signature + move loop | Moderate | Game territory helpers |
| 4 | Cache/A*/haul/UI | Higher | Stable path API |

## B.8 Definition of done (feature complete for v1)

v1 is **done** when Phases 0–3 are merged and AC1–AC13 pass. Phase 4 items are enhancements tracked separately.

---

# Part C — Example flows

## C.1 Discover and regather

1. Mira wanders; `observeSurroundings` sees wood node → personal entry `wood@ (20,22) conf=0.95`.  
2. Later hunger/wood need → `resolvePlaceTarget('wood')` returns personal entry.  
3. `moveTo(20,22)` → harvest → `confirmArrival` boosts confidence.

## C.2 Hear and seek

1. Mira socializes with Toren; shares wood place.  
2. Toren gains `told` entry conf≈0.55, slight jitter.  
3. Toren gather resolves to rumor coords; on arrival confirms or misses.

## C.3 Scout report

1. Scout observes stone in wilderness.  
2. Returns home → tribal map gains stone; chronicle notes find.  
3. Next LLM tick lists `knownResources: stone@(…)`.

## C.4 Closed border path

1. Villager targets wilderness tile; rival claim sits on straight line.  
2. `getPath(..., { villager })` routes through unclaimed tiles or returns null.  
3. No silent walk through closed territory.

---

# Part D — Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-09-20 | Initial spec & plan from spatial awareness review |

**Owners:** Implement against this doc; if behavior conflicts with [`SPATIAL_AWARENESS.md`](./SPATIAL_AWARENESS.md), **this spec wins** for implementation detail; update the review doc’s phase status when shipping.
