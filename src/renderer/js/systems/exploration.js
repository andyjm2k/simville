// Simville Exploration System — wilderness scouting and first contact

/**
 * Sends scouts into unclaimed land so rival tribes can discover each other
 * without settling inside each other's village centers.
 */
class ExplorationSystem {
  /**
   * @param {object} game - Host game instance
   */
  constructor(game) {
    // Back-reference for villages, villagers, world, and chronicle
    this.game = game;
  }

  /**
   * True once both tribes have recorded awareness of each other.
   * @param {object} village
   * @param {object} otherVillage
   * @returns {boolean}
   */
  hasDiscovered(village, otherVillage) {
    if (!village || !otherVillage) return false;
    return village.knowsVillage?.(otherVillage.id) && otherVillage.knowsVillage?.(village.id);
  }

  /**
   * Daytime window used for dispatching scouts (night parties return home).
   * @returns {boolean}
   */
  isDaytime() {
    const hours = this.game?.timeState?.hours ?? 12;
    const timeOfDay = typeof Utils !== 'undefined' ? Utils.getTimeOfDay(hours) : null;
    return timeOfDay ? timeOfDay !== 'night' : hours >= 6 && hours < 20;
  }

  /**
   * Sight radius for spotting rival people or claimed land.
   * @returns {number}
   */
  getSightRange() {
    return CONSTANTS.EXPLORATION?.SIGHT_RANGE || 8;
  }

  /**
   * Active scout for a village, if any.
   * @param {object} village
   * @returns {object|null}
   */
  getActiveScout(village) {
    if (!village) return null;
    return this.game.getVillagersForVillage(village.id).find(v => v.isScouting) || null;
  }

  /**
   * Clear scout flags so the villager can resume village life.
   * @param {object} villager
   */
  clearScout(villager) {
    if (!villager) return;
    villager.isScouting = false;
    villager.scoutMission = null;
    if (villager.status === CONSTANTS.ACTIVITY.SCOUTING) {
      villager.status = CONSTANTS.ACTIVITY.IDLE;
      villager.activity = 'Idle';
    }
  }

  /**
   * True when a villager can see another tribe's claimed land from here.
   * @param {object} villager
   * @param {object} rival
   * @returns {boolean}
   */
  canSeeRivalTerritory(villager, rival) {
    if (!villager || !rival?.center) return false;
    const dist = Utils.distance(villager.x, villager.y, rival.center.x, rival.center.y);
    return dist <= (rival.territoryRadius || 12) + this.getSightRange();
  }

  /**
   * Pick a healthy adult (prefer curious) to leave home as a scout.
   * @param {object} village
   * @returns {object|null}
   */
  pickScout(village) {
    const villagers = this.game.getVillagersForVillage(village.id);
    const candidates = villagers.filter(v =>
      !v.isChieftan &&
      !v.isScouting &&
      v.health > 40 &&
      v.energy > 40 &&
      v.hunger > 35 &&
      (v.thirst ?? 100) > 35 &&
      v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD &&
      v.status !== CONSTANTS.ACTIVITY.SLEEPING &&
      v.status !== CONSTANTS.ACTIVITY.EATING &&
      v.status !== CONSTANTS.ACTIVITY.DRINKING
    );
    if (!candidates.length) return null;
    const threshold = CONSTANTS.EXPLORATION?.CURIOUS_THRESHOLD || 55;
    candidates.sort((a, b) => {
      const curiousA = a.personality?.curious || 0;
      const curiousB = b.personality?.curious || 0;
      const bonusA = curiousA >= threshold ? 20 : 0;
      const bonusB = curiousB >= threshold ? 20 : 0;
      return (curiousB + bonusB) - (curiousA + bonusA);
    });
    return candidates[0];
  }

  /**
   * Walkable tile on the way to a rival, stopping just outside their lands.
   * @param {object} village
   * @param {object} rival
   * @returns {{x:number,y:number}|null}
   */
  getScoutDestination(village, rival) {
    const world = this.game.world;
    if (!world || !village?.center || !rival?.center) return null;

    const dx = rival.center.x - village.center.x;
    const dy = rival.center.y - village.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const stopShort = (rival.territoryRadius || 12) + 1;
    const travel = Math.max((village.territoryRadius || 12) + 3, dist - stopShort);
    const t = Math.min(1, travel / dist);
    const goalX = Math.round(village.center.x + dx * t);
    const goalY = Math.round(village.center.y + dy * t);

    for (const search of [1, 3, 5, 8]) {
      const tile = world.getWalkableTileNear(goalX, goalY, search);
      if (!tile) continue;
      const dummy = { villageId: village.id };
      if (this.game.canVillagerEnterTerritory && !this.game.canVillagerEnterTerritory(dummy, tile.x, tile.y)) {
        continue;
      }
      return tile;
    }
    return null;
  }

  /**
   * Send one scout toward a rival through unclaimed wilderness.
   * @param {object} village
   * @param {object} rival
   * @param {string} reason
   * @returns {object|null}
   */
  dispatchScout(village, rival, reason = 'explore') {
    if (!village || !rival) return null;
    if (this.hasDiscovered(village, rival)) return null;
    if (this.getActiveScout(village)) return this.getActiveScout(village);

    const scout = this.pickScout(village);
    const destination = this.getScoutDestination(village, rival);
    if (!scout || !destination) return null;

    const moved = scout.moveTo(destination.x, destination.y, this.game.world);
    if (!moved) return null;

    scout.isScouting = true;
    scout.scoutMission = {
      targetVillageId: rival.id,
      phase: 'outbound',
      destination: { x: destination.x, y: destination.y },
      reason
    };
    scout.status = CONSTANTS.ACTIVITY.SCOUTING;
    scout.activity = `Scouting toward ${rival.name}`;
    scout.showSpeechBubble?.('🔭', 'Scouting the wilds', 4000);

    village.lastScoutDay = this.game.timeState?.day || 1;
    village.scoutAttempts = (village.scoutAttempts || 0) + 1;
    return scout;
  }

  /**
   * Path a scout back to their village center and mark the return leg.
   * @param {object} villager
   */
  sendScoutHome(villager) {
    if (!villager?.isScouting) return;
    const village = this.game.getVillage(villager.villageId);
    if (!village?.center) {
      this.clearScout(villager);
      return;
    }

    villager.scoutMission = {
      ...(villager.scoutMission || {}),
      phase: 'returning',
      destination: { x: village.center.x, y: village.center.y }
    };
    villager.status = CONSTANTS.ACTIVITY.SCOUTING;
    villager.activity = `Returning to ${village.name}`;
    villager.moveTo(village.center.x, village.center.y, this.game.world);
  }

  /**
   * Record mutual first contact, chronicle it, and nudge relations.
   * @param {object} villageA
   * @param {object} villageB
   * @param {object|null} scout
   * @param {string} kind
   * @returns {boolean}
   */
  recordFirstContact(villageA, villageB, scout = null, kind = 'sighting') {
    if (!villageA || !villageB || villageA.id === villageB.id) return false;
    if (this.hasDiscovered(villageA, villageB)) return false;

    villageA.markVillageKnown(villageB.id);
    villageB.markVillageKnown(villageA.id);

    const bump = CONSTANTS.EXPLORATION?.CONTACT_RELATION_BUMP || 8;
    villageA.relations[villageB.id] = Math.min(
      100,
      (villageA.relations[villageB.id] || 0) + bump
    );
    villageB.relations[villageA.id] = Math.min(
      100,
      (villageB.relations[villageA.id] || 0) + bump
    );

    const scoutName = scout?.name || 'Scouts';
    const text = kind === 'meeting'
      ? `${scoutName} of ${villageA.name} has met people of ${villageB.name} in the wilds! The tribes now know of each other, but claimed lands stay closed until war or trade.`
      : kind === 'rumor'
        ? `Word reaches ${villageA.name} and ${villageB.name}: another people live on this continent. Borders remain closed until war or trade opens them.`
        : `${scoutName} of ${villageA.name} has sighted the lands of ${villageB.name}. First contact is made — their territory stays closed until conquest or trade.`;

    this.game.addChronicleEntry(text, 'legendary', villageA.id);
    this.game.addChronicleEntry(text, 'legendary', villageB.id);
    scout?.showSpeechBubble?.('😮', 'Another tribe!', 5000);
    return true;
  }

  /**
   * Pairwise check for rival villagers in sight or a scout seeing rival land.
   */
  detectContacts() {
    const villages = this.game.villages || [];
    if (villages.length < 2) return;

    const sight = this.getSightRange();
    const villagers = this.game.villagers || [];

    for (let i = 0; i < villagers.length; i++) {
      const a = villagers[i];
      if (!a || a.health <= 0 || !a.villageId) continue;
      const home = this.game.getVillage(a.villageId);
      if (!home) continue;

      for (let j = i + 1; j < villagers.length; j++) {
        const b = villagers[j];
        if (!b || b.health <= 0 || !b.villageId || a.villageId === b.villageId) continue;
        const other = this.game.getVillage(b.villageId);
        if (!other || this.hasDiscovered(home, other)) continue;
        if (Utils.distance(a.x, a.y, b.x, b.y) <= sight) {
          this.recordFirstContact(home, other, a, 'meeting');
        }
      }

      const rival = this.game.getRivalVillage?.(home.id) || villages.find(v => v.id !== home.id);
      if (rival && !this.hasDiscovered(home, rival) && this.canSeeRivalTerritory(a, rival)) {
        this.recordFirstContact(home, rival, a, 'sighting');
      }
    }
  }

  /**
   * Advance scout travel, return at night, and finish missions at the destination.
   */
  updateScoutMissions() {
    for (const villager of this.game.villagers || []) {
      if (!villager.isScouting) continue;

      this.markExploredAround(villager.x, villager.y);

      const mission = villager.scoutMission || {};
      const dest = mission.destination;
      const atDest = dest
        ? Utils.distance(villager.x, villager.y, dest.x, dest.y) <= 1.6
        : !villager.isMoving;

      if (!this.isDaytime() && mission.phase !== 'returning') {
        this.sendScoutHome(villager);
        continue;
      }

      if (mission.phase === 'returning' && atDest) {
        this.clearScout(villager);
        continue;
      }

      if (mission.phase === 'outbound' && atDest) {
        const home = this.game.getVillage(villager.villageId);
        const rival = this.game.getVillage(mission.targetVillageId) ||
          this.game.getRivalVillage?.(villager.villageId);
        if (home && rival && this.canSeeRivalTerritory(villager, rival)) {
          this.recordFirstContact(home, rival, villager, 'sighting');
        }
        this.sendScoutHome(villager);
      }
    }
  }

  /**
   * Mark nearby tiles explored as a scout travels.
   * @param {number} x
   * @param {number} y
   */
  markExploredAround(x, y) {
    const tiles = this.game.world?.tiles;
    if (!tiles) return;
    const radius = CONSTANTS.EXPLORATION?.EXPLORED_TILE_RADIUS || 2;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = tiles[cy + dy]?.[cx + dx];
        if (tile) tile.explored = true;
      }
    }
  }

  /**
   * Dispatch a scout from each village that has not yet found its rival.
   */
  maybeDispatchScouts() {
    if (!this.isDaytime()) return;
    const villages = this.game.villages || [];
    for (const village of villages) {
      const rival = this.game.getRivalVillage?.(village.id) ||
        villages.find(v => v.id !== village.id);
      if (!rival || this.hasDiscovered(village, rival)) continue;
      if (this.getActiveScout(village)) continue;
      this.dispatchScout(village, rival, 'explore');
    }
  }

  /**
   * If scouts never physically arrive, rumored contact still unlocks diplomacy.
   */
  maybeRumorContact() {
    const day = this.game.timeState?.day || 1;
    const rumorDay = CONSTANTS.EXPLORATION?.RUMOR_CONTACT_DAYS || 5;
    if (day < rumorDay) return;

    const villages = this.game.villages || [];
    for (let i = 0; i < villages.length; i++) {
      for (let j = i + 1; j < villages.length; j++) {
        const a = villages[i];
        const b = villages[j];
        if (this.hasDiscovered(a, b)) continue;
        const attempts = (a.scoutAttempts || 0) + (b.scoutAttempts || 0);
        if (attempts > 0 || day >= rumorDay) {
          this.recordFirstContact(a, b, null, 'rumor');
        }
      }
    }
  }

  /**
   * Per-frame exploration: contact checks, scout travel, then new missions.
   */
  process() {
    if (!this.game?.villages?.length) return;
    this.detectContacts();
    this.updateScoutMissions();
    this.maybeDispatchScouts();
    this.maybeRumorContact();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExplorationSystem };
}
