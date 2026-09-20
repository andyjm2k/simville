# Social Relationship Dynamics — Implementation Plan & Spec

**Status:** Implemented (phases 1–6)  
**Branch prefix:** `cursor/social-dynamics-*`  
**Depends on:** Current relationship / gossip / diplomacy systems in `game.js`, `villager.js`, `village.js`, `constants.js`, `systems/diplomacy.js`, `systems/social.js`, `systems/social-community.js`  
**Related docs:** `SPEC.md` §4.4, §5.1, §13, §16, §21; prior review of intra- and inter-village social logic

> **Implementation note:** Core logic lives in `SocialSystem` (`systems/social.js` + `systems/social-community.js`). Game orchestrates via `ensureVillageSystems()` and daily/social hooks.

This document is the **implementation plan and behavioral spec** for deepening villager social dynamics. Work proceeds in six phases in the order below. Each phase is shippable on its own: merge only when that phase’s acceptance criteria and tests pass.

---

## Goals

1. Stop long-run “friendship soup” (bonds ratchet only upward).
2. Make interaction types, jealousy, grudges, and gossip mechanically distinct.
3. Let knowledge (secrets/gossip) feed back into opinions and partner choice.
4. Couple personal bonds with village diplomacy and preserve post-conquest memory.
5. Give community rituals and informal cliques real in-group / out-group pressure.

## Non-goals (this program)

- Replacing the LLM action loop or adding a full utility-AI planner.
- Multiplayer / networked social graph.
- A separate “faction” entity system beyond lightweight cliques (Phase 6).
- Reworking combat/raid resolution (diplomacy coupling only).

## Design principles

| Principle | Rule |
|-----------|------|
| **Directed feelings, readable bond** | Prefer directed scores (A→B) once Phase 2 lands; UI may still show a “bond” summary. |
| **Contact earns intimacy** | Passive daily deepen must not push past Friend without recent contact. |
| **Knowledge has consequences** | Learning a secret or gossip always has a defined opinion/mood side effect. |
| **Tribe gate stays authoritative** | `canVillagersSocialize` remains the cross-tribe gate; phases add friction inside that gate, not bypasses. |
| **Save-compatible** | Every phase migrates missing fields on load with safe defaults. |
| **Test-first per phase** | Unit + QA coverage for new formulas before UI polish. |

## Current baseline (as of plan authoring)

| Layer | Model | Update drivers |
|-------|--------|----------------|
| Dyad | Symmetric `relationships[id]: -100…100` | Daily deepen, LLM interactions (+3/−5), rituals, secrets, marriage/divorce/affairs |
| Need | `socialNeed` 0–100 | Hourly decay/recovery; lonely interrupt |
| Tribe | `Village.relations`, `atWarWith`, `tradePartners` | Contact, diplomacy events, war/peace |
| Knowledge | `secrets[]` + `discoveredBy` | Discovery + tribe-local gossip (no opinion feedback) |

Key hotspots: `Game.deepenDailyRelationships`, `Game.applySocialVillagerAction`, `Game.processGossipSpread`, `Game.findSocialPartner`, `Villager.updateMood`, `Game.handleConquest` relationship cleanup, `llm.generateRelationChanges` (unused).

---

## Phase overview

| Phase | Title | Primary outcome |
|-------|--------|-----------------|
| **1** | Neglect decay + typed interaction deltas | Bonds need contact; actions differ numerically |
| **2** | Directed relationship deltas | Jealousy / crush / one-sided hate possible |
| **3** | Gossip → opinion + `publicKnowledge` | Secrets reshape the social graph |
| **4** | Partner preference + mood top-K | AI and mood follow strong ties / enemies |
| **5** | Personal ↔ village coupling + conquest memory | Folk diplomacy; wartime residue |
| **6** | Ritual skips, funerals, cliques / soft prestige | Community texture and status goals |

Suggested PR cadence: **one PR per phase**. Do not start phase *N+1* until phase *N* is merged or explicitly stacked on the same branch with green tests.

---

# Phase 1 — Neglect decay + interaction-typed deltas

## 1.1 Intent

Make passive time and active interactions both matter. Without contact, scores drift toward a neutral baseline. With contact, typed actions apply distinct deltas.

## 1.2 Data & constants

Add under `CONSTANTS.RELATIONSHIP` (names indicative; tune in balance pass):

```javascript
// Passive dynamics
NEGLECT_DECAY_PER_DAY: 0.35,          // |score| pull toward baseline when no contact
BASELINE_SCORE: 0,                    // drift target for non-family
FAMILY_BASELINE_SCORE: 40,            // drift floor target for close family
FRIEND_PASSIVE_CAP: 25,               // Friend threshold — passive deepen cannot exceed
PARTNER_PASSIVE_BONUS: 1.2,           // keep existing partner daily bonus (may still require contact for cap bypass)
CONTACT_WINDOW_DAYS: 3,               // "recent contact" if interacted within this many days

// Interaction deltas (applied once when in social range)
INTERACTION_DELTA: {
  talk: 1.5,
  share: 2.5,
  help: 5,
  romance: 4,
  gossip: 1,          // with listener only in Phase 1; subject effects in Phase 3
  argue: -6
}
```

On each villager, track contact (Phase 1 may use a compact map):

```javascript
villager.lastSocialContact = {
  // [otherId]: dayNumber of last meaningful interaction
};
```

**Meaningful contact** includes: successful in-range social action, ritual co-participation, help/romance/argue/share/talk/gossip, marriage ceremony. Proximity alone during deepen does **not** refresh contact (avoids “standing near fire” maxing everyone).

## 1.3 Behavioral rules

### Daily deepen (`deepenDailyRelationships`)

For every socializable pair `(a, b)`:

1. Compute `daysSinceContact` from `max(lastSocialContact)` both ways (or “infinite” if never).
2. **Neglect:** If `daysSinceContact > CONTACT_WINDOW_DAYS`, apply drift toward baseline:
   - Close family → `FAMILY_BASELINE_SCORE`
   - Else → `BASELINE_SCORE`
   - Drift magnitude ≈ `NEGLECT_DECAY_PER_DAY` (signed toward baseline).
   - Partners use a higher baseline (e.g. 50) but still decay if neglected.
3. **Passive deepen** only if `daysSinceContact <= CONTACT_WINDOW_DAYS`:
   - Keep existing modifiers (partner, proximity ≤ 5, socializing status, empathy/sociable, mood/hunger penalties).
   - Close family: replace flat `+0.6` short-circuit with the same formula + family floor bias (family still gets a small positive bias, e.g. `+0.35`, but mood/hunger can make net negative).
4. **Friend cap:** If neither is the other’s partner and current mutual score ≥ `FRIEND_PASSIVE_CAP`, skip positive passive deepen (negatives from mood/hunger/neglect still apply). Partners and soulmate-tier may continue slow positive deepen up to `SOULMATE_THRESHOLD` with a reduced rate (e.g. ×0.35).

### Typed interactions (`applySocialVillagerAction`)

Replace `argue ? -5 : 3` with `INTERACTION_DELTA[interactionType]` (default `talk`).

Phase 1 gossip: apply `+INTERACTION_DELTA.gossip` between speaker and listener only (no subject opinion yet).

Refresh `lastSocialContact` both ways when the action resolves in range.

### Romance jealousy (light preview)

If `interactionType === 'romance'` and actor has `partnerId` and partner ≠ target: apply `−3` actor↔spouse mood hit and `−2` relationship (symmetric in Phase 1; directed in Phase 2). Do not start an affair here (affairs stay on daily processors).

## 1.4 Files to touch

| File | Change |
|------|--------|
| `constants.js` | New RELATIONSHIP / INTERACTION delta constants |
| `villager.js` | `lastSocialContact` serialize/deserialize; helper `recordSocialContact(otherId, day)` |
| `game.js` | Deepen rewrite; typed deltas; contact recording in social/ritual paths |
| `tests/unit/villager-social.test.js` | Decay, cap, typed deltas |
| `tests/qa/villager-social.test.js` | Multi-day neglect scenario |

## 1.5 Acceptance criteria

- [ ] Pair with no contact for >3 days drifts toward baseline (family toward family baseline).
- [ ] Passive deepen cannot raise non-partners above Friend threshold.
- [ ] `help` increases score more than `talk`; `argue` decreases.
- [ ] Existing marriage/divorce/affair flows still pass.
- [ ] Saves without `lastSocialContact` load without error (treat as empty → neglect applies).

## 1.6 Test plan

- Unit: drift sign/magnitude; friend cap; each interaction type delta.
- QA: simulate 10 days with two villagers never socializing → score near baseline; then one `help` → contact refreshed → deepen resumes.

---

# Phase 2 — Directed relationship deltas

## 2.1 Intent

Allow A’s feeling toward B to diverge from B’s feeling toward A (jealousy, crush, resentment).

## 2.2 Data model

Migrate `relationships` from symmetric scalars to **directed** scores still keyed by target id:

```javascript
// Unchanged shape, changed semantics:
villager.relationships[otherId] = number; // means "how I feel about them"
```

**Breaking change in semantics, not shape:** stop using `modifyMutualRelationship` as the default mutation path.

API:

```javascript
Villager.modifyRelationship(other, delta)           // directed: this → other
Game.modifyMutualRelationship(a, b, delta)          // apply same delta both ways (rituals, help)
Game.modifyDirectedRelationship(from, to, delta)    // explicit one-way
Game.getMutualRelationship(a, b)                    // average of both directions (marriage gates)
Game.getBondSummary(a, b)                           // { aToB, bToA, mutual, typeA, typeB }
```

Init / birth / marriage may still set both directions equal. Discovery events and romance often set asymmetric deltas.

### Migration

On load, existing saves already store per-villager maps; they were written mutually, so values start symmetric. No schema version bump required if we only change write paths. Add `meta.socialModelVersion = 2` in save for debugging.

## 2.3 Behavioral rules

| Event | Directionality |
|-------|----------------|
| Rituals, help, talk, share (default) | Mutual |
| Argue | Mutual negative, plus optional one-way grudge seed if personality `empathetic < 40` |
| Romance (requited) | Mutual positive |
| Romance (unrequited: target relationship to actor < Friend) | Actor→target `+`, target→actor `0 or slight −` |
| Jealousy (spouse witnesses romance / affair) | Spouse→unfaithful and spouse→rival directed negatives; unfaithful→spouse smaller hit |
| Secret `grudge` / `past_betrayal` reveal | Owner→target and discoverer→owner as specified; not forced mutual |
| Daily deepen / neglect | Apply per direction independently (each side’s contact clock / mood) |

**Marriage / divorce / pregnancy gates** continue to use **mutual average** (`getMutualRelationship`) so one-sided obsession cannot force marriage.

**UI:** Bonds panel shows “You → them” when inspecting a villager; optional second line “They → you” if known (always known to player in single-player omniscient UI — show both).

## 2.4 Files to touch

| File | Change |
|------|--------|
| `game.js` | Split mutual vs directed helpers; update affair discovery, secret effects, romance jealousy |
| `villager.js` | Document directed semantics; `getRelationshipType` unchanged |
| `ui.js` | Show asymmetric scores when they differ by ≥ 8 |
| `llm.js` | Prompt: include “how they feel about you” vs “how you feel about them” for top relations |
| Tests | Asymmetric jealousy; unrequited romance; marriage still requires mutual |

## 2.5 Acceptance criteria

- [ ] Affair discovery can make spouse hate rival more than rival hates spouse.
- [ ] Unrequited romance does not raise target→actor to Friend automatically.
- [ ] Marriage still requires mutual average ≥ existing threshold.
- [ ] Rituals still add the same delta both ways.
- [ ] QA social + secrets suites green.

---

# Phase 3 — Gossip opinion feedback + `publicKnowledge`

## 3.1 Intent

Hearing gossip changes how listeners feel about subjects; widely known secrets become public and cause a one-shot social shock.

## 3.2 Data model

Extend secret objects:

```javascript
secret.publicKnowledge = false;       // tribe-wide common knowledge
secret.discoveredBy = [id, ...];      // existing
secret.suppressed = false;            // optional: elder/empath blocked further spread
```

Constants:

```javascript
SECRET: {
  // existing types...
  PUBLIC_THRESHOLD_FRACTION: 0.5,     // of living tribe adults
  GOSSIP_OPINION: {
    hidden_talent: { towardOwner: 3, towardTarget: 0 },
    past_betrayal: { towardOwner: -6, towardTarget: 4 },
    forbidden_romance: { towardOwner: -4, towardTarget: -4 },
    hidden_stash: { towardOwner: -5, towardTarget: 0 },
    illness: { towardOwner: 2, towardTarget: 0 },
    aspiration: { towardOwner: 2, towardTarget: 0 },
    grudge: { towardOwner: -2, towardTarget: 3 }
  },
  PUBLIC_SHOCK_MOOD: -8,
  PUBLIC_SHOCK_OWNER_REL: -3           // each adult → owner (directed)
}
```

## 3.3 Behavioral rules

### On gossip hop (`processGossipSpread`)

When `spreader` tells `listener` about `owner`’s secret:

1. Add listener to `discoveredBy` (existing).
2. Apply **directed** opinion deltas from `GOSSIP_OPINION[type]`:
   - `listener → owner` += `towardOwner` (scaled by `listener.personality.empathetic`: high empathy halves negatives for illness/aspiration; low empathy amplifies betrayal/romance).
   - If `secret.target`, `listener → target` += `towardTarget`.
3. Speaker↔listener: keep small positive from Phase 1 gossip delta (confiding bond).
4. If listener `empathetic >= 70` and `sociable < 50` and secret not public: **25%** chance to set `suppressed` for that listener path (does not add further spread from them); may warn owner (`speech` + tiny trust/bond with owner).

### Public knowledge

When `discoveredBy` unique living tribe adults ≥ `ceil(tribeAdults * PUBLIC_THRESHOLD_FRACTION)`:

1. Set `publicKnowledge = true`.
2. One-shot: all tribe adults not in `discoveredBy` learn it; apply `PUBLIC_SHOCK_*`.
3. Chronicle once: “Word of X’s secret has spread through the village.”
4. Stop further gossip hops for that secret (already public).

### Weaponization (minimal)

If spreader has a `grudge` secret targeting owner, multiply negative `towardOwner` by **1.5** when gossiping about them.

## 3.4 Files to touch

| File | Change |
|------|--------|
| `constants.js` | Opinion tables + public threshold |
| `game.js` | `processGossipSpread`, `revealSecret`, public check helper |
| `llm.js` | Gossip prompt may mention public vs whispered |
| `ui.js` | Indicator on secret when public |
| `tests/unit/secrets.test.js` | Opinion deltas + public threshold |

## 3.5 Acceptance criteria

- [ ] Gossip changes listener→owner score by secret type.
- [ ] At ≥50% adult awareness, secret becomes public exactly once with chronicle + shock.
- [ ] Suppressed path reduces spread from high-empathy low-sociable villagers.
- [ ] Cross-tribe gossip still does not occur (`areSameTribe` gate unchanged).

---

# Phase 4 — Social partner preference + mood top-K weighting

## 4.1 Intent

Lonely villagers seek meaningful people; mood reflects important bonds and enemies, not the flat average of everyone.

## 4.2 Partner selection (`findSocialPartner`)

Scoring candidates (lower is better, matching current sort style) — replace weak `relationship * 0.05` with an explicit utility:

```
score = distance
      - lonelinessBonus(other)          // existing ~8 when other lonely
      - bondPull(self→other)            // up to ~20 for Best Friend+
      - partnerBonus                    // +15 if spouse
      - familyBonus                     // +10 if close family
      - goalBonus                       // +12 if relationship goal targets them
      + enemyPenalty                    // +25 if self→other ≤ Rival (unless conflict-seeking)
      + busyPenalty                     // existing busy filter remains hard-exclude
```

**Conflict-seeking:** If `confident > 65` and `empathetic < 40` and mood < 0, invert enemy penalty into a mild pull (seek rivals to argue). LLM `interactionType` prefer `argue` when such a partner is chosen (hint via action sanitizer or prompt).

Preferred named target from LLM still wins if socializable.

## 4.3 Mood (`Villager.updateMood`)

Replace flat mean of all relationships:

1. Take directed scores as list of `{ id, score }`.
2. **Positive set:** top `K=3` highest scores → weighted sum (`weights 0.5, 0.3, 0.2`) × `0.12`.
3. **Negative set:** all scores ≤ `RIVAL_THRESHOLD` → average × `0.15` (enemies hurt more than acquaintances help).
4. If no relationships, contribution `0`.
5. Keep socialNeed / isolation terms.

Constants:

```javascript
MOOD_REL_TOP_K: 3,
MOOD_REL_POS_WEIGHT: 0.12,
MOOD_REL_NEG_WEIGHT: 0.15
```

## 4.4 Files to touch

| File | Change |
|------|--------|
| `game.js` | `findSocialPartner` utility |
| `villager.js` | `updateMood` top-K |
| `constants.js` | Mood / partner weights |
| `llm.js` | Optional: bias interactionType when conflict-seeking |
| Tests | Partner prefers spouse over stranger; one enemy depresses mood more than many weak ties inflate it |

## 4.5 Acceptance criteria

- [ ] With equal distance, villager prefers spouse/best friend over acquaintance.
- [ ] Rival is avoided by empathetic villagers; may be sought by conflict-seeking personalities.
- [ ] Mood drops when a single Enemy exists even if many weak positive acquaintances exist.
- [ ] Social meetup / lonely interrupt QA still passes.

---

# Phase 5 — Personal ↔ village coupling + conquest memory

## 5.1 Intent

Folk diplomacy: strong cross-tribe friendships slowly improve village relations; hostility makes personal deepen harder. Conquest preserves history as trauma instead of wiping keys.

## 5.2 Village drift from personal bonds

Daily (per village pair that can already socialize or are known):

```javascript
// Among pairs (a in V1, b in V2) with canVillagersSocialize or knownVillages
avgPositive = mean of mutual bonds where mutual >= FRIEND_THRESHOLD
avgNegative = mean of mutual bonds where mutual <= RIVAL_THRESHOLD
drift = clamp(avgPositive * 0.02 - avgNegative * 0.03, -0.5, 0.5)
village.relations[other] += drift
```

Cap: folk drift alone cannot cross `ALLIANCE_THRESHOLD` or start war (war stays on diplomacy escalation rules). Clamp daily folk drift to ±0.5.

Also **wire** `llm.generateRelationChanges` (or replace with deterministic chronicle-driven nudges):

- Call from `onNewDay` at most every N days with recent chronicle events.
- Validate LLM deltas to ±5 and apply to `village.relations`.
- Fallback: skip if LLM fails (deterministic folk drift still runs).

## 5.3 Hostility friction

If village relation `< HOSTILE_THRESHOLD` or at war:

- Cross-tribe passive deepen multiplier `×0.25` and extra `−0.4` friction per day when in contact range.
- War: keep hard socializing block (`canVillagersSocialize` false).

First cross-tribe meeting (when socializing first becomes allowed): initialize missing personal scores to `CROSS_TRIBE_PRIOR` (−8) instead of 0.

## 5.4 Conquest memory

Replace deletion of cross-faction relationship keys in conquest cleanup:

1. For each former-enemy pair with a stored score, apply trauma: `score = clamp(score - random(20, 40), MIN, MAX)` both directions (or directed: winner side milder).
2. 40% chance to add a `grudge` secret targeting a known enemy if none exists.
3. Do **not** delete keys; after merge they become same-tribe scores (tense household).
4. Optional: `lastWarDay` on villager for romance cooldown (Phase 5.5).

### 5.5 Post-war romance cooldown

If either villager had trauma flag / grudge from conquest within `WAR_ROMANCE_COOLDOWN_DAYS` (e.g. 20), block partnership between those individuals (not entire tribes).

## 5.6 Files to touch

| File | Change |
|------|--------|
| `game.js` | Folk drift daily; conquest memory; cross-tribe prior on first bond |
| `systems/diplomacy.js` | Optional hooks for relation clamps |
| `llm.js` | Activate `generateRelationChanges` with validation |
| `constants.js` | Drift rates, prior, trauma ranges, cooldown |
| Tests | Conquest retains keys; folk drift moves relation slowly; war still blocks socialize |

## 5.7 Acceptance criteria

- [ ] Two villages with many cross-friend pairs see `relations` trend up over 20+ days without trade events.
- [ ] Hostile relation reduces cross-tribe deepen.
- [ ] After conquest, former enemies keep relationship entries and are more likely rivals/grudges.
- [ ] LLM relation changes clamped; failure does not break the day tick.

---

# Phase 6 — Ritual skips, funerals, cliques / soft prestige

## 6.1 Intent

Rituals create belonging and shame; funerals bond mourners; soft prestige supports social goals without a full politics sim.

## 6.2 Ritual attendance

When `performRitual` runs for a village:

1. Eligible pool = per ritual `participants` filter (existing).
2. **Absentees** = eligible but `SLEEPING` or off-territory or `isScouting` (and not dead).
3. Attendees: existing mood + socialGain (mutual).
4. Absentees:
   - Mood `−10` (shame) once.
   - Directed relationship `−5` toward each **ritual leader** (chieftan + elders present); leaders → absentee `−2`.
5. Funeral exception: absentees who are close family of the deceased take mood `−15` but **no** shame relationship penalty (grief, not scandal).

### Funeral social gain

Set `FUNERAL.socialGain` to `4` among attendees (shared mourning). Close family of deceased: extra `+6` mutual among themselves.

## 6.3 Cliques (lightweight)

No new entity class required. Daily or every N days:

1. Per tribe, for each adult, take top 2 directed friends with score ≥ Friend.
2. Union-find / clustering: groups of size ≥ 3 sharing mutual friend links → assign `cliqueId` (string) on members (ephemeral, recomputed; persisted optional).
3. Effects:
   - Passive deepen `×1.25` inside clique.
   - Passive deepen `×0.85` across different cliques (same tribe).
   - Gossip: prefer listeners inside clique (+10% spread chance).

## 6.4 Soft prestige

```javascript
villager.prestige = 0…100;  // default from role: chieftan 60, elder 45, adult 25, youth 10
```

Adjustments:

- Lead/complete village project: `+5`
- Public secret (owner): `−8` (betrayal/stash) or `+5` (hidden talent)
- Ritual leadership / blessing: `+1`
- Social goal “become respected” completes at `prestige >= 70`

Prestige slightly biases partner preference (`−prestigeDiff * 0.05` in score) and LLM prompt (“respected” / “overlooked”).

## 6.5 Files to touch

| File | Change |
|------|--------|
| `constants.js` | Funeral socialGain; shame penalties; clique thresholds; prestige defaults |
| `game.js` | Ritual attendance; clique recompute; funeral extras |
| `villager.js` | `prestige`, optional `cliqueId` |
| `ui.js` | Prestige on villager panel; clique label optional |
| Goal processors | Wire social goal to prestige |
| Tests | Absentee shame; funeral bonding; clique deepen differential |

## 6.6 Acceptance criteria

- [ ] Skipping Morning Blessing applies shame mood and −5 toward chieftan.
- [ ] Funeral attendees gain relationships; close family gain more.
- [ ] Two cliques deepen faster inside than across.
- [ ] Prestige gates the existing social/status goal type.
- [ ] File size discipline: if `game.js` growth is large, extract `systems/social.js` (see below).

---

## Cross-cutting engineering

### Extract `systems/social.js` (recommended at Phase 2 or 3)

Move from `game.js` when a phase would push the god-object further:

- `deepenDailyRelationships`, contact/neglect helpers  
- `applySocialVillagerAction` delta tables  
- Gossip opinion + public knowledge  
- Clique recompute  
- Folk diplomacy drift  

`Game` keeps orchestration (`onNewDay` calls `this.socialSystem.tickDaily()`).

Keep each new module **≤ 500 lines**; split further (`social-gossip.js`) if needed.

### Comment / style rules

Follow repo norms for the touched files. New classes get unit tests covering ≥70% of methods. Prefer complete, runnable behavior with defaults — no manual migration steps for players.

### Balance checklist (end of each phase)

Run a short sandbox day-loop (or existing benchmark social metrics if present) and record:

- Mean / stdev of relationship scores  
- % pairs at Friend+ and Rival−  
- Marriages / divorces / affairs per 30 days  
- Gossip public events per 30 days  

Avoid returning to “everyone Friends” (Phase 1 success metric: Friend+ share stable or down vs baseline).

### Save compatibility

| Phase | New fields | Default if missing |
|-------|------------|--------------------|
| 1 | `lastSocialContact` | `{}` |
| 2 | (semantics only) + `socialModelVersion` | `1` → treat as directed-equal |
| 3 | `secret.publicKnowledge`, `suppressed` | `false` |
| 4 | none | — |
| 5 | trauma/grudge on conquest; priors on first meet | computed on event |
| 6 | `prestige`, `cliqueId` | role-based / null |

---

## Implementation order (checklist)

Use this as the execution backlog:

- [x] **P1** Constants + `lastSocialContact` + neglect drift + friend passive cap  
- [x] **P1** Typed `INTERACTION_DELTA` in `applySocialVillagerAction`  
- [x] **P1** Tests + balance smoke  
- [x] **P2** Directed mutation API; convert jealousy/secrets/romance  
- [x] **P2** UI + LLM dual-perspective relationships  
- [x] **P2** Tests for asymmetry + marriage mutual gate  
- [x] **P3** Gossip opinion table + empathy suppression  
- [x] **P3** `publicKnowledge` threshold + chronicle shock  
- [x] **P3** Secrets unit/QA updates  
- [x] **P4** `findSocialPartner` utility weights  
- [x] **P4** Mood top-K + enemy weighting  
- [x] **P4** Conflict-seeking argue bias  
- [x] **P5** Folk diplomacy drift + cross-tribe prior  
- [x] **P5** Conquest trauma memory + romance cooldown  
- [x] **P5** Wire validated `generateRelationChanges`  
- [x] **P6** Ritual skip shame + funeral socialGain  
- [x] **P6** Clique clustering + deepen modifiers  
- [x] **P6** Prestige + social goal completion  
- [x] Final: update `SPEC.md` acceptance checkboxes; archive this plan’s phases as Done

---

## Mapping to main SPEC

| SPEC section | Plan coverage |
|--------------|---------------|
| §4.4 Relationship System (trust, jealousy, family, affairs) | P1–P2 (trust approximated by directed score + secret gates until explicit Trust layer; optional follow-up) |
| §5.1 Social need | Unchanged core; P4 mood coupling |
| §13 Secrets & Gossip | P3 |
| §13.5 Divorce & Infidelity | P2 directed discovery effects |
| §16 Rituals (skip penalties) | P6 |
| §21 Inter-village relations | P5 |
| Social / status goals | P6 prestige |

### Explicit follow-up (out of this six-phase program)

- Separate **Trust** channel distinct from affection (SPEC wording).  
- **Purpose** and **Safety** needs (§5.1) as full need meters.  
- Cross-tribe marriage alliances as diplomacy actions.  
- Full “knowledge graph” UI beyond `discoveredBy` / public flag.

---

## Success definition

The program is complete when:

1. All six phase acceptance lists are checked.  
2. Automated unit + QA social/secrets/territory tests pass.  
3. A 30-day smoke sim shows **non-degenerate** score distribution (both Friend+ and Rival− populations non-zero in a two-village setup).  
4. `SPEC.md` relationship/gossip/ritual/inter-village checklist items matching this work are marked done or amended to match shipped behavior.
