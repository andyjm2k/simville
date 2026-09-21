# Villager Spatial Awareness — Review & Recommendations

**Scope:** Pathfinding, location mapping, landmarks, and how villagers learn, remember, and share places.  
**Primary code:** `world.js` (`getPath`), `villager.js` (`moveTo` / wander), `systems/exploration.js`, `village.js` (`knownVillages`), `game.js` (resource lookup / territory), `llm.js` (action prompts).  
**Implementation spec & plan:** [`docs/SPATIAL_AWARENESS_SPEC.md`](./SPATIAL_AWARENESS_SPEC.md) (authoritative for build work).  
**Status:** Phases 0–3 implemented in codebase (`PlaceMemorySystem`, gather resolve, scout debrief, place gossip, territory-aware path + repath).

---

## Verdict

Spatial behavior today is **movement-capable but knowledge-poor**. Villagers can walk anywhere walkable via BFS, but they do not personally know where they are relative to named places, nor do they remember resources or routes they have seen or heard about. Location “awareness” is almost entirely **live omniscient queries** plus **village-level first-contact flags**, not a map in anyone’s head.

The highest-leverage improvement is a **layered place-knowledge model** (personal → tribal → rumor) wired into goal selection and LLM context, with pathfinding upgraded only enough to respect that knowledge and territory.

---

## Current architecture (what exists)

```
Goal pickers (LLM / baseline / gather / scout / wander)
        │
        ▼
  Villager.moveTo(x, y)     ← territory check on destination only
        │
        ▼
  World.getPath (4-way BFS) ← biome walkability only; no memory, no politics
        │
        ▼
  path[] waypoints → frame walk
```

| Layer | What it does today | Spatial knowledge? |
|-------|--------------------|--------------------|
| **Pathfinding** | Unweighted BFS on 64×64 land tiles; snap start/end to walkable | No — pure geometry |
| **Territory** | Circle claim; `canVillagerEnterTerritory` blocks *destinations* | Soft border, not a map |
| **Exploration** | Scout missions, sight-based first contact, `tile.explored` writes | Tribal contact only; `explored` unread |
| **Resources** | `getResourcesInRadius` + in-territory filter | Omniscient in radius |
| **Landmarks** | Fire / center / owned structures used as ad-hoc meeting points | No POI registry |
| **Social knowledge** | Secrets + gossip (personality intrigue) | Non-geographic |
| **LLM context** | Stockpiles, structure coords, center, rival after discovery | Ephemeral prompt snapshot |

### Pathfinding details

- Grid: 4-connected (N/E/S/W), ocean non-walkable, uniform cost.
- Structures and resource nodes do **not** block tiles.
- No A*, path cache, length cap, diagonal moves, or stuck recovery beyond `stopMoving()`.
- `REFACTOR_PLAN.md` P4 still correctly flags perf/quality risk as maps or agent counts grow.

### Location knowledge details

- `Village.knownVillages` = mutual first-contact IDs (not places, routes, or resources).
- Scouts mark `tile.explored = true` in a small radius; nothing reads it for fog, AI, or UI.
- Gathering uses live world queries — prior visits do not matter.
- Gossip spreads secrets, never coordinates or “I found a berry thicket at (x,y).”
- Raids use timers, not map travel.

### Known correctness nits (fix while touching this area)

1. **`findNearestResourceInTerritory` sort bug** (`game.js`): second distance call uses `villager.y` twice instead of `villager.x, villager.y`, so nearest-resource ordering is wrong.
2. **Territory-aware routing gap**: paths may cross closed foreign land because only the destination is gated in `moveTo`.
3. **SPEC haul loop missing**: SPEC says walk → harvest → return to storage; code credits stockpile in place with no return trip.

---

## Gaps vs. “aware of where they are / how to find known places”

| Desired behavior | Gap |
|------------------|-----|
| Know “I am near the fire / river / rival border” | No local place sense; only raw `(x,y)` and optional territory circle |
| Remember a resource found while wandering | No personal or tribal resource memory |
| Hear about a landmark from another villager | Gossip is non-spatial; no place transfer |
| Navigate to a named place heard of but never visited | No rumor entries with approximate coords / confidence |
| Prefer known good paths / avoid bad ones | Fresh BFS every `moveTo`; no route memory |
| Scout reports enrich the tribe’s map | Contact only; explored tiles unused |
| Use fog / discovery for curiosity goals | `explored` written, never consumed |

---

## Recommended design

### Principles

1. **Separate knowing from walking.** Pathfinding answers “how do I get from A to B?” Knowledge answers “what is B, and do I believe it exists?”
2. **Three confidence tiers.** Personal (seen), tribal (shared by kin), rumor (hearsay / approximate).
3. **Prefer known places for goals.** Gathering and socializing should query the knowledge graph first, then fall back to live radius search.
4. **Keep BFS until knowledge pays rent.** Upgrade pathfinding for territory-aware costs and caching after place memory exists; do not start with a full navmesh rewrite.

### Proposed data model

```js
// PlaceKind: landmark | resource | village | structure | waypoint | hazard
placeMemoryEntry = {
  id,                 // stable id (resource node id, structure id, or generated)
  kind,               // PlaceKind
  label,              // "communal fire", "berry thicket", "Riverbend"
  x, y,               // believed position (may be approximate for rumors)
  precision,          // 0–1: 1 = exact tile, ~0.4 = "somewhere north"
  confidence,         // 0–1: decays for rumors, rises on revisit
  source,             // 'seen' | 'told' | 'scout' | 'ritual' | 'rumor'
  lastSeenDay,        // simulation day of last confirmation
  tags,               // ['water','food','rival','sacred',...]
  ownerVillageId,     // optional claim
}
```

**Storage:**

| Store | Owner | Purpose |
|-------|-------|---------|
| `villager.knownPlaces` | Person | What *this* villager has seen or been told |
| `village.tribalMap` | Tribe | Shared map after campfire / scout debrief / gossip |
| `world.landmarks` (optional registry) | World | Canonical POIs (fire, shrine, named biome features) for seeding |

Cap sizes (e.g. 24 personal, 48 tribal) and decay low-confidence rumors so maps stay prompt- and save-friendly.

### Knowledge acquisition (how places get in)

| Event | Who learns | Confidence |
|-------|------------|------------|
| Walk within sight of resource / structure / landmark | Personal | high (`seen`) |
| Harvest / build / ritual at place | Personal + optional tribal bump | high |
| Scout returns (`phase: returning` complete) | Merge scout’s personal finds → `tribalMap` | medium–high (`scout`) |
| Socialize / gossip with spatial payload | Listener personal (and later tribal if public) | medium (`told`) |
| Rumor first contact / elder stories | Personal or tribal approximate entries | low (`rumor`) |
| Revisit confirms coords | Raise confidence + precision | — |
| Node depleted / structure removed | Mark stale or remove after failed visit | — |

Reuse the existing gossip loop (`processGossip` / socializing) but add a **place-rumor** payload distinct from personality secrets:

```js
{ type: 'place_rumor', placeId, label, x, y, precision, fromVillagerId }
```

Curious / sociable personalities should share places more often; stoic / secretive less.

### Goal selection (how knowledge is used)

Replace “nearest in radius omniscient” with:

1. **Resolve target from known places** filtered by need (`food`, `water`, `wood`, `social`, `scout`).
2. Prefer higher `confidence * proximity` (and in-territory / access rules).
3. If none known, **explore toward unknown** (unexplored tiles or wilderness ring) rather than magically querying the full resource grid — *or* keep a short-range omniscient fallback for playability, gated by `SIGHT_RANGE`.
4. `moveTo` uses believed `(x,y)`; on arrival, if nothing is there, lower confidence and optionally re-query locally.

Wire the same resolver into:

- `handleGathering` / hunting / fishing  
- Baseline agent `findResourceTarget`  
- LLM prompt: list each villager’s top known places + tribal landmarks (compact)  
- Curious wander: bias toward unexplored tiles or low-precision rumor coords  

### Sense of “where I am”

Add a cheap **locality descriptor** updated when a villager stops or every N tiles:

```js
villager.locality = {
  zone: 'home' | 'wilderness' | 'border' | 'foreign',
  nearestLandmarkId,
  nearestLandmarkDist,
  inTerritory: boolean,
}
```

Expose in LLM summaries (“near communal fire”, “in the wilds east of home”) so agents stop treating the map as anonymous coordinates.

### Pathfinding upgrades (ordered, incremental)

| Priority | Change | Why |
|----------|--------|-----|
| **P0** | Fix nearest-resource sort bug | Correctness |
| **P1** | Territory-aware BFS cost / filter (blocked or high cost for closed foreign tiles) | Paths match politics |
| **P1** | On blocked next tile: repath once toward same goal before `stopMoving` | Stuck recovery |
| **P2** | Path cache keyed by `(sx,sy,ex,ey,accessMask)` with invalidation on biome/structure change | Perf (REFACTOR_PLAN P4) |
| **P2** | Optional A* with Manhattan heuristic once caching exists | Long scout routes |
| **P3** | Landmark waypoints: path via known waypoints if direct path fails or is very long | “Find your way” via known geography |
| **P3** | Haul loop: harvest → `moveTo` storage barn / fire → deposit | Match SPEC § work loop |
| **P4** | Consume `tile.explored` for fog UI + explore incentives | Make scouting visible |

Do **not** block tiles with structures unless gameplay needs crowding; keep walkability simple.

### Tribal map & scout debrief

Today outbound scouts only create first contact. Extend `sendScoutHome` / return completion:

1. While outbound, call `observeSurroundings(villager)` (resources, biomes, rival edge).
2. On return to center, `village.mergeTribalMap(scout.knownPlaces)` and chronicle a short geographic note (“Kael found a stone outcrop west of the river”).
3. Feed `tribalMap` into `buildWorldStateForVillage` as `knownPlaces` / `landmarks` for LLM and baseline agents.

### LLM / baseline contract changes

Add to world state (compact):

```text
LANDMARKS: fire (30,28), shrine (none), storage (31,29)
KNOWN RESOURCES (tribal): wood@ (22,31) conf=0.9; water@ (35,40) conf=0.6 rumor
VILLAGER Kael knownPlaces: berry@ (18,27), rival-border~ (45,30) conf=0.4
```

Prompt rules:

- Prefer `moveTo` toward known places matching the action.
- If only a rumor exists, move toward approximate coords and treat arrival as an explore action.
- Do not invent coordinates outside known + sight + tribal map (reduces hallucinated teleport goals).

Baseline agent should call the same `resolvePlaceTarget(villager, need)` helper so offline play gets the same awareness.

### Save / serialize

- Persist `knownPlaces` on villagers and `tribalMap` on villages (already have serialize hooks).
- Landmarks registry can be rebuilt from structures + seeded world features if needed.
- Migrate old saves: empty maps; seed home landmarks (center, fire, owned structures) on load.

---

## Suggested implementation phases

### Phase A — Foundations (small, high value)

1. Fix `findNearestResourceInTerritory` distance sort.
2. Introduce `PlaceMemory` helpers (add / recall / decay / serialize) + unit tests.
3. Seed each villager/tribe with home landmarks (center, fire, huts).
4. `observeSurroundings` on move arrival and scout ticks (sight range).
5. Gathering prefers known resource places within confidence threshold; fallback to short-range live query.

### Phase B — Sharing & locality

1. Place-rumor gossip during socialize / daily gossip pass.
2. Scout debrief → tribal map merge + chronicle.
3. `locality` descriptor + LLM/baseline prompt fields.
4. Territory-cost pathfinding + single repath on block.

### Phase C — Navigation richness

1. Path cache / A*.
2. Waypoint routing through tribal landmarks.
3. Haul-to-storage work loop.
4. Fog / explored consumption for UI and curious wander bias.
5. Abstract raid travel replaced with real march along paths (optional; larger scope).

---

## File-level touch list

| File | Likely changes |
|------|----------------|
| `src/renderer/js/systems/place-memory.js` *(new)* | CRUD, merge, decay, resolve-by-need |
| `src/renderer/js/villager.js` | `knownPlaces`, locality, observe on arrive |
| `src/renderer/js/village.js` | `tribalMap`, merge from scout/gossip |
| `src/renderer/js/systems/exploration.js` | Observe while scouting; debrief on return |
| `src/renderer/js/game.js` | Resource goal resolver; gossip place payload; world state |
| `src/renderer/js/world.js` | Territory-aware `getPath` options; optional cache |
| `src/renderer/js/llm.js` + `baseline-agent.js` | Known places in prompts / heuristics |
| `src/renderer/js/constants.js` | Sight, memory caps, decay rates |
| `tests/unit/place-memory.test.js` *(new)* | Coverage for add/recall/merge/decay/resolve |

Keep new modules under ~500 lines; extract before stuffing more into `game.js`.

---

## Non-goals (for early phases)

- Full fog-of-war multiplayer sync  
- Navmesh / hierarchical pathfinding beyond 64×64 needs  
- Perfect information parity with the player minimap  
- Replacing personality gossip with only geographic talk  

---

## Success criteria

Villagers should demonstrably:

1. **Anchor** — After load, navigate to fire/center/storage by landmark id, not only raw LLM coords.  
2. **Discover** — After walking past a resource, later gather trips target that memory without a full-map radius cheat (or with sight-limited fallback only).  
3. **Hear** — After socialize/gossip, a second villager gains a lower-confidence place and can path toward it.  
4. **Report** — Scout return merges finds into `tribalMap` and LLM world state lists them.  
5. **Respect borders** — Paths to wilderness goals do not cut through closed rival territory.  
6. **Recover** — Temporary block triggers repath instead of permanent idle stuck.

---

## Relation to existing plans

- Complements **REFACTOR_PLAN P4** (pathfinding perf) but prioritizes **knowledge before algorithm**.  
- Extends **P3 gossip** with a geographic channel without blocking personality secrets.  
- Aligns with **SPEC** work loops (walk → harvest → storage) and ritual locations (`communal_fire` / `shrine` / `village_center`) as first-class landmarks.

---

## Summary recommendation

Build a **place-memory layer** (personal + tribal + rumor) and teach goal pickers / LLM prompts to use it; then harden pathfinding for territory, repathing, and caching. That sequence makes individuals feel located in a known world—able to find the fire, the berry patch they heard about, and the stone the scout described—without pretending every villager omnisciently sees the whole continent.
