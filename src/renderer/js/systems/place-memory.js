// Simville Place Memory — personal/tribal maps, observe, resolve

/**
 * Layered place knowledge (seen / told / scout / rumor).
 * Knowing is separate from walking; World.getPath still does routing.
 */
class PlaceMemorySystem {
  /** @param {object} game */
  constructor(game) {
    this.game = game;
  }

  get cfg() {
    return CONSTANTS.PLACE_MEMORY || {};
  }

  getSightRange() {
    return this.cfg.SIGHT_RANGE != null
      ? this.cfg.SIGHT_RANGE
      : (CONSTANTS.EXPLORATION?.SIGHT_RANGE || 8);
  }

  getLiveFallbackRadius() {
    return this.cfg.LIVE_FALLBACK_RADIUS != null
      ? this.cfg.LIVE_FALLBACK_RADIUS
      : this.getSightRange();
  }

  currentDay() {
    return this.game?.timeState?.day || 1;
  }

  /** @param {object} partial @returns {object|null} */
  createEntry(partial) {
    return this.normalizeEntry({
      id: partial.id,
      kind: partial.kind,
      label: partial.label,
      x: partial.x,
      y: partial.y,
      precision: partial.precision,
      confidence: partial.confidence,
      source: partial.source,
      lastSeenDay: partial.lastSeenDay ?? this.currentDay(),
      tags: partial.tags || [],
      ownerVillageId: partial.ownerVillageId ?? null,
      resourceType: partial.resourceType ?? null,
      stale: partial.stale === true
    });
  }

  /** @param {object} entry @returns {object|null} */
  normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const kinds = Object.values(CONSTANTS.PLACE_KIND || {});
    const sources = Object.values(CONSTANTS.PLACE_SOURCE || {});
    const kind = kinds.includes(entry.kind) ? entry.kind : 'landmark';
    const source = sources.includes(entry.source) ? entry.source : 'seen';
    const id = entry.id || `place:${kind}:${Math.round(x)}:${Math.round(y)}`;
    const tags = Array.isArray(entry.tags)
      ? [...new Set(entry.tags.map(t => String(t)).filter(Boolean))]
      : [];
    return {
      id: String(id),
      kind,
      label: String(entry.label || id),
      x: Math.round(x),
      y: Math.round(y),
      precision: Utils.clamp(Number(entry.precision) || 0.5, 0, 1),
      confidence: Utils.clamp(Number(entry.confidence) || 0.5, 0, 1),
      source,
      lastSeenDay: Number(entry.lastSeenDay) || this.currentDay(),
      tags,
      ownerVillageId: entry.ownerVillageId || null,
      resourceType: entry.resourceType || null,
      stale: entry.stale === true
    };
  }

  isPinned(entry) {
    if (!entry) return false;
    if (entry.source === 'seeded') return true;
    return (entry.tags || []).includes('home');
  }

  mergeEntries(existing, incoming) {
    const preferIn = (incoming.precision || 0) >= (existing.precision || 0);
    const rank = { seen: 4, seeded: 4, scout: 3, ritual: 3, told: 2, rumor: 1 };
    const source = (rank[incoming.source] || 0) >= (rank[existing.source] || 0)
      ? incoming.source : existing.source;
    return this.normalizeEntry({
      ...existing,
      ...incoming,
      x: preferIn ? incoming.x : existing.x,
      y: preferIn ? incoming.y : existing.y,
      confidence: Math.max(existing.confidence || 0, incoming.confidence || 0),
      precision: Math.max(existing.precision || 0, incoming.precision || 0),
      source,
      tags: [...new Set([...(existing.tags || []), ...(incoming.tags || [])])],
      lastSeenDay: Math.max(existing.lastSeenDay || 0, incoming.lastSeenDay || 0),
      stale: incoming.stale === true ? true : false,
      ownerVillageId: incoming.ownerVillageId || existing.ownerVillageId,
      resourceType: incoming.resourceType || existing.resourceType
    });
  }

  enforceCap(list, cap) {
    const limit = cap || this.cfg.PERSONAL_CAP || 24;
    while (list.length > limit) {
      let dropIdx = -1;
      let worst = Infinity;
      for (let i = 0; i < list.length; i++) {
        if (this.isPinned(list[i])) continue;
        const score = (list[i].confidence || 0) + (list[i].stale ? -1 : 0);
        if (score < worst) { worst = score; dropIdx = i; }
      }
      if (dropIdx < 0) break;
      list.splice(dropIdx, 1);
    }
  }

  /** @returns {object|null} */
  addOrUpdate(list, entry, cap) {
    if (!Array.isArray(list)) return null;
    const normalized = this.normalizeEntry(entry);
    if (!normalized) return null;
    const idx = list.findIndex(e => e.id === normalized.id);
    if (idx >= 0) {
      list[idx] = this.mergeEntries(list[idx], normalized);
      return list[idx];
    }
    list.push(normalized);
    this.enforceCap(list, cap);
    return normalized;
  }

  getById(list, id) {
    return Array.isArray(list) ? (list.find(e => e.id === id) || null) : null;
  }

  tagsForNeed(need) {
    const key = String(need || '').toLowerCase();
    const map = {
      wood: ['wood'], food: ['food', 'hunt'], water: ['water', 'fish'],
      stone: ['stone'], clay: ['clay'], herbs: ['herbs'], thatch: ['thatch'],
      fish: ['fish', 'water'], hunt: ['hunt', 'food'],
      social: ['social', 'sacred', 'fire'], ritual: ['sacred', 'fire', 'social'],
      sleep: ['shelter', 'hut'], rest: ['shelter', 'hut'],
      storage: ['storage'], scout: ['rival', 'unexplored', 'wilderness']
    };
    return map[key] || [key];
  }

  tagsForStructure(type) {
    const t = String(type || '').toLowerCase();
    const table = {
      fire: ['social', 'fire', 'home'], hut: ['shelter', 'hut', 'home'],
      storage: ['storage', 'home'], well: ['water', 'home'],
      shrine: ['sacred', 'social', 'home'], farm: ['food', 'home'],
      workshop: ['craft', 'home'], watchtower: ['safety', 'home']
    };
    return table[t] || ['structure'];
  }

  labelForStructure(type) {
    const def = Object.values(CONSTANTS.STRUCTURE || {}).find(s => s.id === type);
    return def?.name || type || 'structure';
  }

  rankCandidates(list, origin, need, opts = {}) {
    if (!Array.isArray(list) || !origin) return [];
    const minConf = opts.minConfidence ?? this.cfg.MIN_CONFIDENCE_USE ?? 0.25;
    const tags = this.tagsForNeed(need);
    const villager = opts.villager || null;
    const scored = [];
    for (const entry of list) {
      if (!entry || entry.stale || (entry.confidence || 0) < minConf) continue;
      const hasTag = (entry.tags || []).some(t => tags.includes(t));
      if (!hasTag && entry.resourceType !== need) continue;
      if (villager && this.game?.canVillagerEnterTerritory
        && !this.game.canVillagerEnterTerritory(villager, entry.x, entry.y)) continue;
      const dist = Utils.distance(origin.x, origin.y, entry.x, entry.y);
      scored.push({
        entry,
        score: (entry.confidence || 0) * (entry.precision || 0.5) * (1 / (1 + dist))
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.entry);
  }

  findByNeed(list, need, opts = {}) {
    const origin = opts.origin || { x: opts.villager?.x || 0, y: opts.villager?.y || 0 };
    return this.rankCandidates(list, origin, need, opts)[0] || null;
  }

  decayList(list, currentDay = this.currentDay()) {
    if (!Array.isArray(list)) return;
    const seenDecay = this.cfg.SEEN_DECAY_PER_DAY ?? 0.005;
    const rumorDecay = this.cfg.CONFIDENCE_DECAY_PER_DAY ?? 0.02;
    const minUse = this.cfg.MIN_CONFIDENCE_USE ?? 0.25;
    const durable = new Set(['seen', 'seeded', 'scout', 'ritual']);
    for (const entry of list) {
      if (this.isPinned(entry)) continue;
      const days = Math.max(0, currentDay - (entry.lastSeenDay || currentDay));
      if (days <= 0) continue;
      const rate = durable.has(entry.source) ? seenDecay : rumorDecay;
      entry.confidence = Utils.clamp((entry.confidence || 0) - rate * days, 0, 1);
      entry.lastSeenDay = currentDay;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (this.isPinned(e)) continue;
      if ((e.confidence || 0) < 0.05 || (e.stale && (e.confidence || 0) < minUse)) {
        list.splice(i, 1);
      }
    }
  }

  pruneStale(list) {
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.stale && !this.isPinned(list[i])) list.splice(i, 1);
    }
  }

  /** @returns {object[]} */
  observeSurroundings(villager, opts = {}) {
    if (!villager || !this.game?.world) return [];
    const world = this.game.world;
    const sight = opts.radius ?? this.getSightRange();
    const cap = this.cfg.PERSONAL_CAP || 24;
    const touched = [];
    if (!Array.isArray(villager.knownPlaces)) villager.knownPlaces = [];

    for (const resource of world.getResourcesInRadius(villager.x, villager.y, sight) || []) {
      if (!resource || resource.depleted || !(resource.amount > 0)) continue;
      touched.push(this.addOrUpdate(villager.knownPlaces, this.createEntry({
        id: resource.id || `resource:${resource.type}:${resource.x}:${resource.y}`,
        kind: 'resource',
        label: `${resource.type} node`,
        x: resource.x, y: resource.y,
        precision: this.cfg.SEEN_PRECISION ?? 1,
        confidence: this.cfg.SEEN_CONFIDENCE ?? 0.95,
        source: 'seen',
        tags: [resource.type],
        resourceType: resource.type,
        stale: false
      }), cap));
    }

    for (const structure of world.getStructuresInRadius?.(villager.x, villager.y, sight) || []) {
      if (!structure) continue;
      touched.push(this.addOrUpdate(villager.knownPlaces, this.createEntry({
        id: structure.id,
        kind: 'structure',
        label: this.labelForStructure(structure.type),
        x: structure.x, y: structure.y,
        precision: this.cfg.SEEN_PRECISION ?? 1,
        confidence: this.cfg.SEEN_CONFIDENCE ?? 0.95,
        source: 'seen',
        tags: this.tagsForStructure(structure.type),
        stale: false
      }), cap));
    }

    const home = this.game.getVillage?.(villager.villageId);
    const rival = home ? this.game.getRivalVillage?.(home.id) : null;
    if (home && rival?.center) {
      const edgeDist = Utils.distance(villager.x, villager.y, rival.center.x, rival.center.y)
        - (rival.territoryRadius || 12);
      if (edgeDist <= sight) {
        touched.push(this.addOrUpdate(villager.knownPlaces, this.createEntry({
          id: `landmark:rival_border:${rival.id}`,
          kind: 'landmark',
          label: `${rival.name} border`,
          x: Math.round(rival.center.x), y: Math.round(rival.center.y),
          precision: 0.6,
          confidence: this.cfg.SCOUT_CONFIDENCE ?? 0.8,
          source: villager.isScouting ? 'scout' : 'seen',
          tags: ['rival', 'wilderness'],
          ownerVillageId: rival.id
        }), cap));
      }
    }
    return touched.filter(Boolean);
  }

  /** @returns {'confirmed'|'miss'|'none'} */
  confirmArrival(villager, expectedEntry = null) {
    if (!villager || !expectedEntry) return 'none';
    const personal = villager.knownPlaces || [];
    const existing = this.getById(personal, expectedEntry.id) || expectedEntry;
    const world = this.game?.world;
    let found = true;
    if (existing.kind === 'resource' && world) {
      const at = world.getResourceAt?.(existing.x, existing.y);
      found = !!(at && !at.depleted && at.amount > 0
        && (!existing.resourceType || at.type === existing.resourceType));
    } else if (existing.kind === 'structure' && world) {
      found = !!world.getStructureAt?.(existing.x, existing.y);
    }
    if (found) {
      existing.confidence = Utils.clamp((existing.confidence || 0) + (this.cfg.CONFIRM_BOOST ?? 0.15), 0, 1);
      existing.precision = Utils.clamp(Math.max(existing.precision || 0, 0.9), 0, 1);
      existing.stale = false;
      existing.lastSeenDay = this.currentDay();
      existing.source = 'seen';
      this.addOrUpdate(personal, existing, this.cfg.PERSONAL_CAP || 24);
      return 'confirmed';
    }
    existing.confidence = Utils.clamp((existing.confidence || 0) - (this.cfg.MISS_PENALTY ?? 0.35), 0, 1);
    existing.stale = true;
    existing.lastSeenDay = this.currentDay();
    this.addOrUpdate(personal, existing, this.cfg.PERSONAL_CAP || 24);
    return 'miss';
  }

  _seedLandmarkList(list, village, cap) {
    if (!village || !Array.isArray(list)) return;
    this.addOrUpdate(list, this.createEntry({
      id: `landmark:village_center:${village.id}`,
      kind: 'landmark',
      label: `${village.name} center`,
      x: village.center.x, y: village.center.y,
      precision: 1, confidence: 1, source: 'seeded',
      tags: ['home', 'social'], ownerVillageId: village.id
    }), cap);
    const world = this.game?.world;
    for (const sid of village.structureIds || []) {
      const structure = world?.structures?.find(s => s.id === sid);
      if (!structure) continue;
      this.addOrUpdate(list, this.createEntry({
        id: structure.id, kind: 'structure',
        label: this.labelForStructure(structure.type),
        x: structure.x, y: structure.y,
        precision: 1, confidence: 1, source: 'seeded',
        tags: this.tagsForStructure(structure.type), ownerVillageId: village.id
      }), cap);
    }
  }

  seedHomePlaces(villager, village) {
    if (!villager || !village) return;
    if (!Array.isArray(villager.knownPlaces)) villager.knownPlaces = [];
    this._seedLandmarkList(villager.knownPlaces, village, this.cfg.PERSONAL_CAP || 24);
  }

  seedTribalHome(village) {
    if (!village) return;
    if (!Array.isArray(village.tribalMap)) village.tribalMap = [];
    this._seedLandmarkList(village.tribalMap, village, this.cfg.TRIBAL_CAP || 48);
  }

  mergeIntoTribal(village, entries, source = 'scout') {
    if (!village) return { added: 0, updated: 0 };
    if (!Array.isArray(village.tribalMap)) village.tribalMap = [];
    const cap = this.cfg.TRIBAL_CAP || 48;
    let added = 0;
    let updated = 0;
    for (const raw of entries || []) {
      const before = this.getById(village.tribalMap, raw?.id);
      const entry = this.createEntry({
        ...raw,
        source: raw?.source === 'seen' ? 'seen' : (raw?.source || source),
        confidence: Math.max(
          raw?.confidence || 0,
          source === 'scout' ? (this.cfg.SCOUT_CONFIDENCE ?? 0.8) : (raw?.confidence || 0.5)
        )
      });
      if (!entry) continue;
      this.addOrUpdate(village.tribalMap, entry, cap);
      if (before) updated += 1;
      else added += 1;
    }
    return { added, updated };
  }

  /**
   * Personal → tribal → live sight-range fallback.
   * @returns {{ entry, x, y, from, liveResource }}
   */
  resolvePlaceTarget(villager, need, opts = {}) {
    const empty = { entry: null, x: null, y: null, from: 'none', liveResource: null };
    if (!villager || !need) return empty;
    const origin = { x: villager.x, y: villager.y };
    const rankOpts = { villager, origin, minConfidence: opts.minConfidence };

    const personalHit = this.findByNeed(villager.knownPlaces || [], need, rankOpts);
    if (personalHit) {
      return { entry: personalHit, x: personalHit.x, y: personalHit.y, from: 'personal', liveResource: null };
    }

    const village = this.game?.getVillage?.(villager.villageId);
    const tribalHit = this.findByNeed(village?.tribalMap || [], need, rankOpts);
    if (tribalHit) {
      return { entry: tribalHit, x: tribalHit.x, y: tribalHit.y, from: 'tribal', liveResource: null };
    }

    const radius = opts.liveRadius ?? this.getLiveFallbackRadius();
    const world = this.game?.world;
    if (!world?.getResourcesInRadius) return empty;

    const live = (world.getResourcesInRadius(villager.x, villager.y, radius) || [])
      .filter(r => r.type === need && !r.depleted && r.amount > 0
        && (!village || village.isInTerritory(r.x, r.y))
        && (!this.game.canVillagerEnterTerritory
          || this.game.canVillagerEnterTerritory(villager, r.x, r.y)))
      .sort((a, b) => Utils.distance(a.x, a.y, villager.x, villager.y)
        - Utils.distance(b.x, b.y, villager.x, villager.y))[0] || null;

    if (!live) return empty;
    this.observeSurroundings(villager, { radius });
    const entry = this.getById(villager.knownPlaces, live.id) || this.createEntry({
      id: live.id, kind: 'resource', label: `${live.type} node`,
      x: live.x, y: live.y, precision: 1,
      confidence: this.cfg.SEEN_CONFIDENCE ?? 0.95, source: 'seen',
      tags: [live.type], resourceType: live.type
    });
    return { entry, x: live.x, y: live.y, from: 'live', liveResource: live };
  }

  serializeList(list) {
    return (list || []).map(e => this.normalizeEntry(e)).filter(Boolean);
  }

  deserializeList(data) {
    return Array.isArray(data) ? data.map(e => this.normalizeEntry(e)).filter(Boolean) : [];
  }
}
