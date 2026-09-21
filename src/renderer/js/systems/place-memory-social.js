// Simville Place Memory — sharing, locality, summaries (extends PlaceMemorySystem)

/** Gossip, locality descriptors, and prompt summaries for place memory. */
Object.assign(PlaceMemorySystem.prototype, {
  shouldShare(speaker, listener) {
    if (!speaker || !listener || speaker.id === listener.id) return false;
    if (speaker.villageId && listener.villageId && speaker.villageId !== listener.villageId) return false;
    let chance = this.cfg.SHARE_BASE_CHANCE ?? 0.35;
    if ((speaker.personality?.curious || 0) >= (CONSTANTS.EXPLORATION?.CURIOUS_THRESHOLD || 55)) {
      chance += this.cfg.CURIOSITY_SHARE_BONUS ?? 0.25;
    }
    if ((speaker.personality?.sociable || 0) >= 55) chance += this.cfg.SOCIABLE_SHARE_BONUS ?? 0.15;
    return Math.random() < Utils.clamp(chance, 0, 0.95);
  },

  pickShareablePlace(speaker) {
    const places = (speaker?.knownPlaces || []).filter(e =>
      e && !e.stale && (e.confidence || 0) >= (this.cfg.MIN_CONFIDENCE_USE ?? 0.25) && !this.isPinned(e)
    );
    if (!places.length) return null;
    places.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return places[0];
  },

  sharePlaceBetween(speaker, listener, entry) {
    if (!speaker || !listener || !entry) return null;
    if (!Array.isArray(listener.knownPlaces)) listener.knownPlaces = [];
    const jitterMax = (this.cfg.RUMOR_JITTER_TILES ?? 3) * (1 - (entry.precision || 0.5));
    const jitter = (span) => (span <= 0 ? 0 : Utils.randomFloat(-span, span));
    return this.addOrUpdate(listener.knownPlaces, this.createEntry({
      ...entry,
      x: Math.round(entry.x + jitter(jitterMax)),
      y: Math.round(entry.y + jitter(jitterMax)),
      source: 'told',
      confidence: Math.min(this.cfg.TOLD_CONFIDENCE ?? 0.55, (entry.confidence || 0.5) * 0.7),
      precision: this.cfg.TOLD_PRECISION ?? 0.75,
      lastSeenDay: this.currentDay(),
      stale: false
    }), this.cfg.PERSONAL_CAP || 24);
  },

  directionFrom(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 'here';
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'south' : 'north';
  },

  updateLocality(villager) {
    const home = this.game?.getVillage?.(villager?.villageId);
    const x = Math.round(villager?.x || 0);
    const y = Math.round(villager?.y || 0);
    const inTerritory = home ? home.isInTerritory(x, y) : false;
    let zone = 'wilderness';
    if (home) {
      const owner = this.game.getTerritoryOwnerAt?.(x, y);
      if (owner && owner.id !== home.id) {
        zone = this.game.getForeignTerritoryAccess?.(home, owner) ? 'border' : 'foreign';
      } else if (inTerritory) {
        const dist = Utils.distance(x, y, home.center.x, home.center.y);
        zone = dist >= (home.territoryRadius || 12) - 2 ? 'border' : 'home';
      }
    }

    const pool = [...(villager.knownPlaces || []), ...(home?.tribalMap || [])];
    let nearest = null;
    let nearestDist = Infinity;
    for (const entry of pool) {
      if (!entry || entry.kind === 'resource') continue;
      const d = Utils.distance(x, y, entry.x, entry.y);
      if (d < nearestDist && d <= 12) { nearestDist = d; nearest = entry; }
    }

    let description = 'in the wilds';
    if (zone === 'foreign') description = 'in foreign territory';
    else if (nearest && nearestDist <= 2.5) description = `near ${nearest.label}`;
    else if (zone === 'home') description = nearest ? `near ${nearest.label}` : 'in home territory';
    else if (zone === 'border') description = 'near the edge of tribal lands';
    else if (home?.center) description = `in the wilds ${this.directionFrom(home.center, { x, y })} of home`;

    villager.locality = {
      zone,
      nearestLandmarkId: nearest?.id || null,
      nearestLandmarkLabel: nearest?.label || null,
      nearestLandmarkDist: nearest ? nearestDist : null,
      inTerritory,
      description
    };
    villager._lastLocalityTile = { x, y };
    return villager.locality;
  },

  describeLocality(villager) {
    if (!villager?.locality?.description) this.updateLocality(villager);
    return villager?.locality?.description || 'somewhere in the wilds';
  },

  summarizeLandmarks(village, limit = 8) {
    return (village?.tribalMap || [])
      .filter(e => e && (e.kind === 'landmark' || e.kind === 'structure') && !e.stale)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, limit)
      .map(e => ({ id: e.id, label: e.label, x: e.x, y: e.y, tags: e.tags || [] }));
  },

  summarizeKnownResources(village, limit = 8) {
    return (village?.tribalMap || [])
      .filter(e => e && e.kind === 'resource' && !e.stale)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, limit)
      .map(e => ({
        type: e.resourceType || (e.tags || [])[0] || 'resource',
        x: e.x, y: e.y, confidence: e.confidence, source: e.source
      }));
  },

  summarizeVillagerPlaces(villager, limit = 3) {
    const places = (villager?.knownPlaces || [])
      .filter(e => e && !e.stale)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, limit);
    if (!places.length) return 'none';
    return places.map(e => {
      const approx = (e.precision || 1) < 0.7 ? '~' : '';
      return `${e.resourceType || e.label}${approx}@(${e.x},${e.y}) c=${(e.confidence || 0).toFixed(1)}`;
    }).join('; ');
  },

  seedAllVillages() {
    for (const village of this.game?.villages || []) {
      this.seedTribalHome(village);
      for (const villager of this.game.getVillagersForVillage?.(village.id) || []) {
        this.seedHomePlaces(villager, village);
        this.updateLocality(villager);
      }
    }
  },

  decayAll() {
    const day = this.currentDay();
    for (const villager of this.game?.villagers || []) this.decayList(villager.knownPlaces, day);
    for (const village of this.game?.villages || []) this.decayList(village.tribalMap, day);
  }
});
