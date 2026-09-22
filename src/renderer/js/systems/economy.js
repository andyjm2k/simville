// Simville Economy System — per-village resource ownership (SPEC §21.1 / §21.5)

/**
 * Manages village resource pools, storage capacity, and territory-aware credit.
 * Game remains the orchestrator; Economy is the single source of truth for stocks.
 */
class Economy {
  /**
   * @param {object} game - Host game instance (villages, world, villagers)
   */
  constructor(game) {
    // Back-reference to game for villages/world lookups
    this.game = game;
  }

  /**
   * Default empty stockpile matching Village constructor shape.
   * @returns {object}
   */
  getDefaultResources() {
    return {
      wood: 0,
      food: 0,
      water: 0,
      stone: 0,
      herbs: 0,
      clay: 0,
      fish: 0,
      thatch: 0,
      rareMaterials: 0
    };
  }

  /**
   * Merge partial resource maps onto defaults.
   * @param {object} resources
   * @returns {object}
   */
  normalizeResources(resources = {}) {
    return { ...this.getDefaultResources(), ...resources };
  }

  /**
   * Resolve a Village from id, villager, or map position (territory).
   * @param {string|null} villageId
   * @param {number|null} x
   * @param {number|null} y
   * @returns {object|null}
   */
  resolveVillage(villageId = null, x = null, y = null) {
    if (villageId) {
      const byId = this.game.getVillage(villageId);
      if (byId) return byId;
    }

    // Territory ownership for gather/build credit (SPEC §21.5)
    if (x != null && y != null && this.game.villages?.length) {
      for (const village of this.game.villages) {
        if (village.isInTerritory(x, y)) return village;
      }
    }

    return this.getHudVillage();
  }

  /**
   * Village shown in the resource HUD.
   * Prefers the tribe selector (hudVillageId) so each village's stockpile can be viewed.
   * Falls back to the selected villager's tribe, then the first village.
   * @returns {object|null}
   */
  getHudVillage() {
    // Tribe selector is the intentional HUD ownership signal
    if (this.game.hudVillageId) {
      const fromHud = this.game.getVillage(this.game.hudVillageId);
      if (fromHud) return fromHud;
    }

    // Fall back to the selected villager's village when no tribe is selected yet
    const selectedId = this.game.selectedVillager?.villageId;
    if (selectedId) {
      const fromVillager = this.game.getVillage(selectedId);
      if (fromVillager) return fromVillager;
    }

    return this.game.villages?.[0] || null;
  }

  /**
   * Mutable resource object for a village (normalized in place).
   * @param {string|null} villageId
   * @param {number|null} x
   * @param {number|null} y
   * @returns {object}
   */
  getResources(villageId = null, x = null, y = null) {
    const village = this.resolveVillage(villageId, x, y);
    if (!village) return this.normalizeResources({});
    village.resources = this.normalizeResources(village.resources);
    return village.resources;
  }

  /**
   * Snapshot for HUD / LLM prompts.
   * @param {string|null} villageId
   * @returns {object}
   */
  getResourcesSnapshot(villageId = null) {
    return { ...this.getResources(villageId) };
  }

  /**
   * Storage capacity for one resource or all, scoped to a village's barns.
   * @param {string|null} resourceType
   * @param {string|null} villageId
   * @returns {number|object}
   */
  getStorageCapacity(resourceType = null, villageId = null) {
    const village = this.resolveVillage(villageId);
    const structureIds = new Set(village?.structureIds || []);
    // Only barns owned by this village count; empty ownership means base capacity only
    const storageCount = (this.game.world?.structures || []).filter(
      (s) => s.type === 'storage' && structureIds.has(s.id)
    ).length;

    const baseCapacity = {
      wood: 80,
      food: 70,
      water: 70,
      stone: 70,
      herbs: 40,
      clay: 70,
      fish: 40,
      thatch: 80,
      rareMaterials: 20
    };

    const addedCapacity = storageCount * 100;
    if (resourceType) {
      return (baseCapacity[resourceType] || 50) + addedCapacity;
    }

    return Object.fromEntries(
      Object.values(CONSTANTS.RESOURCE).map((resource) => [
        resource,
        (baseCapacity[resource] || 50) + addedCapacity
      ])
    );
  }

  /**
   * Add resources to the owning village; returns amount actually stored.
   * @param {string} resourceType
   * @param {number} amount
   * @param {string|null} villageId
   * @param {number|null} x
   * @param {number|null} y
   * @returns {number}
   */
  addResource(resourceType, amount, villageId = null, x = null, y = null) {
    if (!resourceType || !Number.isFinite(amount) || amount <= 0) return 0;

    const village = this.resolveVillage(villageId, x, y);
    if (!village) return 0;

    village.resources = this.normalizeResources(village.resources);
    const capacity = this.getStorageCapacity(resourceType, village.id);
    const before = village.resources[resourceType] || 0;
    const after = Utils.clamp(before + amount, 0, capacity);
    village.resources[resourceType] = after;
    return after - before;
  }

  /**
   * Consume resources from a village pool.
   * @param {string} resourceType
   * @param {number} amount
   * @param {string|null} villageId
   * @returns {number} amount consumed
   */
  consumeResource(resourceType, amount, villageId = null) {
    if (!resourceType || !Number.isFinite(amount) || amount <= 0) return 0;
    const resources = this.getResources(villageId);
    const available = resources[resourceType] || 0;
    const used = Math.min(available, amount);
    resources[resourceType] = available - used;
    return used;
  }

  /**
   * Clamp all stocks for one village (or every village) to capacity.
   * @param {string|null} villageId
   */
  clampStoredResources(villageId = null) {
    const villages = villageId
      ? [this.game.getVillage(villageId)].filter(Boolean)
      : this.game.villages || [];

    for (const village of villages) {
      village.resources = this.normalizeResources(village.resources);
      for (const resourceType of Object.values(CONSTANTS.RESOURCE)) {
        village.resources[resourceType] = Utils.clamp(
          village.resources[resourceType] || 0,
          0,
          this.getStorageCapacity(resourceType, village.id)
        );
      }
    }
  }

  /**
   * Structure cost rows from constants definition.
   * @param {object} struct
   * @returns {Array<[string, number]>}
   */
  getStructureCosts(struct) {
    return Object.values(CONSTANTS.RESOURCE)
      .filter((resource) => Number.isFinite(struct?.[resource]) && struct[resource] > 0)
      .map((resource) => [resource, struct[resource]]);
  }

  /**
   * Whether a village can pay for a structure.
   * @param {object} struct
   * @param {string|null} villageId
   * @returns {boolean}
   */
  canAffordStructure(struct, villageId = null) {
    const resources = this.getResources(villageId);
    return this.getStructureCosts(struct).every(
      ([resource, amount]) => (resources[resource] || 0) >= amount
    );
  }

  /**
   * Deduct structure materials from a village.
   * @param {object} struct
   * @param {string|null} villageId
   * @returns {boolean}
   */
  consumeStructureCost(struct, villageId = null) {
    if (!this.canAffordStructure(struct, villageId)) return false;
    const resources = this.getResources(villageId);
    this.getStructureCosts(struct).forEach(([resource, amount]) => {
      resources[resource] -= amount;
    });
    return true;
  }

  /**
   * Migrate legacy Game.resources orphan pool into village 0 (save loads).
   * @param {object|null} orphanResources
   * @param {{ replace?: boolean }} options - when replace, overwrite starter defaults
   */
  migrateOrphanResources(orphanResources, options = {}) {
    if (!orphanResources || !this.game.villages?.length) return;
    const target = this.game.villages[0];
    if (options.replace) {
      // Legacy single-village saves: orphan pool is the true stockpile
      target.resources = this.normalizeResources(orphanResources);
      this.clampStoredResources(target.id);
      return;
    }

    target.resources = this.normalizeResources(target.resources);
    for (const [key, value] of Object.entries(orphanResources)) {
      if (!Number.isFinite(value) || value <= 0) continue;
      this.addResource(key, value, target.id);
    }
  }

  /**
   * Transfer all resources from one village to another (conquest).
   * @param {object} fromVillage
   * @param {object} toVillage
   */
  transferAllResources(fromVillage, toVillage) {
    if (!fromVillage || !toVillage) return;
    fromVillage.resources = this.normalizeResources(fromVillage.resources);
    toVillage.resources = this.normalizeResources(toVillage.resources);
    for (const [key, value] of Object.entries(fromVillage.resources)) {
      if (!Number.isFinite(value) || value <= 0) continue;
      this.addResource(key, value, toVillage.id);
      fromVillage.resources[key] = 0;
    }
  }

  /**
   * Estimate daily food/water burn from need decay and eat/drink conversion.
   * Used so the LLM can plan by days-of-cover instead of raw stockpile counts.
   * @param {number} population
   * @returns {{ foodPerDay: number, waterPerDay: number }}
   */
  estimateDailyBurn(population = 1) {
    // Hunger decays 5/hour → ~120/day; ~25 hunger restored per 1 food
    const pop = Math.max(1, population);
    const foodPerDay = Math.max(1, Math.ceil((pop * 120) / 25));
    // Thirst decays 7/hour → ~168/day; ~35 thirst restored per 1 water
    const waterPerDay = Math.max(1, Math.ceil((pop * 168) / 35));
    return { foodPerDay, waterPerDay };
  }

  /**
   * Build a compact resource-pressure briefing for LLM action prompts.
   * @param {string|null} villageId
   * @param {number} population
   * @returns {object}
   */
  getResourcePressure(villageId = null, population = 1) {
    const resources = this.getResources(villageId);
    const burn = this.estimateDailyBurn(population);
    const food = resources.food || 0;
    const water = resources.water || 0;
    const foodDays = Math.round((food / burn.foodPerDay) * 10) / 10;
    const waterDays = Math.round((water / burn.waterPerDay) * 10) / 10;

    // Band labels steer the LLM without a rules engine forcing labor
    const bandFor = (days) => {
      if (days < 2) return 'crisis';
      if (days < 5) return 'tight';
      if (days < 10) return 'stable';
      return 'surplus';
    };

    const materialShortfalls = [];
    const materialFloors = { wood: 20, stone: 15, clay: 12, thatch: 12, herbs: 5 };
    for (const [type, floor] of Object.entries(materialFloors)) {
      if ((resources[type] || 0) < floor) {
        materialShortfalls.push(`${type}<${floor}`);
      }
    }

    return {
      food,
      water,
      foodDays,
      waterDays,
      foodBand: bandFor(foodDays),
      waterBand: bandFor(waterDays),
      dailyBurn: burn,
      materialShortfalls,
      seasonHint: this.game?.timeState?.season?.name || null
    };
  }
}

// Node / browser export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Economy };
}
