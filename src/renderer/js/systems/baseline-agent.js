// Simville Baseline Agent — rule-based opponent for LLM benchmarks

/**
 * Heuristic controller that competes without an LLM (gather/build/raid rules).
 */
class BaselineAgent {
  /**
   * @param {object} options
   */
  constructor(options = {}) {
    // Agent display name in benchmark reports
    this.type = 'baseline';
    this.name = options.name || 'baseline-heuristic';
    this.stats = {
      calls: 0,
      actionsGenerated: 0,
      diplomacyCalls: 0,
      failures: 0,
      totalLatencyMs: 0
    };
  }

  /**
   * Record a synthetic call for benchmark parity with LLM agents.
   * @param {number} latencyMs
   * @param {number} actionCount
   */
  recordCall(latencyMs, actionCount) {
    this.stats.calls += 1;
    this.stats.actionsGenerated += actionCount;
    this.stats.totalLatencyMs += latencyMs;
  }

  /**
   * Pick nearest resource tile of a type (requires game world).
   * @param {object} villager
   * @param {object} game
   * @param {string} resourceType
   * @returns {{x:number,y:number}|null}
   */
  findResourceTarget(villager, game, resourceType) {
    const resource = game.findNearestResource?.(villager.x, villager.y, resourceType, 18);
    if (resource) return { x: resource.x, y: resource.y };
    const center = game.getVillage(villager.villageId)?.center || game.world?.villageCenter;
    if (!center) return null;
    const tile = game.world?.getWalkableTileNear(
      center.x + Utils.randomInt(-5, 5),
      center.y + Utils.randomInt(-5, 5),
      6
    );
    return tile ? { x: tile.x, y: tile.y } : { x: Math.round(villager.x), y: Math.round(villager.y) };
  }

  /**
   * Generate villager actions using survival-first heuristics.
   * @param {Array} villagers
   * @param {object} worldState
   * @param {object} timeState
   * @param {object} game
   * @returns {Array}
   */
  generateVillagerActions(villagers, worldState, timeState, game) {
    const start = Date.now();
    const resources = worldState.resources || {};
    const pop = villagers.length || 1;
    const foodReserve = resources.food || 0;
    const waterReserve = resources.water || 0;
    const center = worldState.villageCenter || { x: 32, y: 32 };

    const actions = villagers.map((v) => {
      const moveNearCenter = {
        x: Utils.clamp(Math.round(center.x + Utils.randomInt(-3, 3)), 0, 63),
        y: Utils.clamp(Math.round(center.y + Utils.randomInt(-3, 3)), 0, 63)
      };

      // Critical survival overrides
      if ((v.thirst ?? 100) < 40 && waterReserve > 0) {
        return {
          villagerId: v.id,
          action: 'drinking',
          moveTo: moveNearCenter,
          duration: 4,
          speechEmoji: '💧',
          speechTheme: 'Drinking from stores'
        };
      }
      if (v.hunger < 40 && foodReserve > 0) {
        return {
          villagerId: v.id,
          action: 'eating',
          moveTo: moveNearCenter,
          duration: 4,
          speechEmoji: '🍖',
          speechTheme: 'Eating from stores'
        };
      }
      if (v.energy < 25) {
        return {
          villagerId: v.id,
          action: 'resting',
          moveTo: moveNearCenter,
          duration: 6,
          speechEmoji: '😴',
          speechTheme: 'Resting'
        };
      }

      // Village-level priorities
      if (foodReserve < pop * 4) {
        const target = this.findResourceTarget(v, game, CONSTANTS.RESOURCE.FOOD) || moveNearCenter;
        const action = Utils.randomInt(0, 2) === 0 ? 'fishing' : 'gathering';
        return {
          villagerId: v.id,
          action,
          moveTo: target,
          resourceType: CONSTANTS.RESOURCE.FOOD,
          duration: 6,
          speechEmoji: action === 'fishing' ? '🎣' : '💪',
          speechTheme: 'Securing food for the tribe'
        };
      }

      if (waterReserve < pop * 3) {
        return {
          villagerId: v.id,
          action: 'gathering',
          moveTo: this.findResourceTarget(v, game, CONSTANTS.RESOURCE.WATER) || moveNearCenter,
          resourceType: CONSTANTS.RESOURCE.WATER,
          duration: 5,
          speechEmoji: '💧',
          speechTheme: 'Gathering water'
        };
      }

      // Chieftan builds when stocked
      if (v.isChieftan && (resources.wood || 0) >= 20 && (resources.clay || 0) >= 8) {
        const structure = foodReserve < pop * 8 ? 'farm' : 'hut';
        return {
          villagerId: v.id,
          action: 'building',
          structure,
          moveTo: moveNearCenter,
          duration: 8,
          speechEmoji: '💪',
          speechTheme: `Planning a new ${structure}`
        };
      }

      // Default: gather wood or stone for growth
      const gatherType = (resources.wood || 0) < 30 ? CONSTANTS.RESOURCE.WOOD : CONSTANTS.RESOURCE.STONE;
      return {
        villagerId: v.id,
        action: 'gathering',
        moveTo: this.findResourceTarget(v, game, gatherType) || moveNearCenter,
        resourceType: gatherType,
        duration: 5,
        speechEmoji: '💪',
        speechTheme: 'Working for the village'
      };
    });

    this.recordCall(Date.now() - start, actions.length);
    return actions;
  }

  /**
   * Rule-based diplomatic decision vs rival village.
   * @param {object} village
   * @param {object} otherVillage
   * @param {object} context
   * @returns {object}
   */
  generateDiplomaticAction(village, otherVillage, context) {
    const start = Date.now();
    this.stats.diplomacyCalls += 1;

    const relation = village.relations?.[otherVillage.id] || 0;
    const yourStrength = context?.yourStrength || 0;
    const theirStrength = Math.max(1, context?.theirStrength || 1);
    const strengthRatio = yourStrength / theirStrength;
    const atWar = village.atWarWith?.includes(otherVillage.id);

    let decision;
    if (atWar && strengthRatio > 1.15 && (village.raidCooldown || 0) <= 0) {
      decision = {
        action: 'raid',
        targetVillage: otherVillage.name,
        reason: 'Press the advantage while we hold the upper hand.',
        urgency: 'high'
      };
    } else if (relation < -45 && strengthRatio > 1.1 && (village.raidCooldown || 0) <= 0) {
      decision = {
        action: 'raid',
        targetVillage: otherVillage.name,
        reason: 'Hostile relations and favorable strength — strike now.',
        urgency: 'medium'
      };
    } else if (relation > 25) {
      decision = {
        action: 'propose_trade',
        targetVillage: otherVillage.name,
        reason: 'Stable relations favor mutual trade.',
        urgency: 'low'
      };
    } else if (strengthRatio < 0.75) {
      decision = {
        action: 'observe',
        targetVillage: otherVillage.name,
        reason: 'We are outmatched; gather intelligence before acting.',
        urgency: 'low'
      };
    } else if (relation < -20) {
      decision = {
        action: 'send_threat',
        targetVillage: otherVillage.name,
        reason: 'Deter rival encroachment without committing to war yet.',
        urgency: 'medium'
      };
    } else {
      decision = {
        action: 'ignore',
        targetVillage: otherVillage.name,
        reason: 'Focus on internal development this cycle.',
        urgency: 'low'
      };
    }

    this.recordCall(Date.now() - start, 1);
    return decision;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BaselineAgent };
}
