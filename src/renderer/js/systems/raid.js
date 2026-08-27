// Simville Raid System — one-shot combat and conquest baseline (SPEC §21.4)

/**
 * Owns active raid phase machine so combat cannot re-resolve every frame.
 */
class RaidSystem {
  /**
   * @param {object} game - Host game instance
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Snapshot defender population at village creation / raid start.
   * @param {object} village
   */
  ensureOriginalPopulation(village) {
    if (!village) return;
    if (village.originalPopulation === undefined || village.originalPopulation === null) {
      village.originalPopulation = this.game.getVillagersForVillage(village.id).length;
    }
  }

  /**
   * Begin a raid with planning phase; records defender baseline before combat.
   * @param {string} attackerVillageId
   * @param {string} targetVillageId
   * @returns {boolean}
   */
  startRaid(attackerVillageId, targetVillageId) {
    const attacker = this.game.getVillage(attackerVillageId);
    const defender = this.game.getVillage(targetVillageId);
    if (!attacker || !defender) return false;
    if (this.game.activeRaid) return false;

    this.ensureOriginalPopulation(defender);

    const raiderCount =
      CONSTANTS.WAR.MIN_RAIDERS +
      Math.floor(
        Math.random() * (CONSTANTS.WAR.MAX_RAIDERS - CONSTANTS.WAR.MIN_RAIDERS + 1)
      );
    const adultVillagers = this.game
      .getVillagersForVillage(attackerVillageId)
      .filter((v) => v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD);
    const availableRaiders = Math.min(raiderCount, Math.floor(adultVillagers.length / 2));

    if (availableRaiders < CONSTANTS.WAR.MIN_RAIDERS) {
      this.game.addChronicleEntry(
        `${attacker.name} wanted to raid ${defender.name} but lacked enough warriors.`
      );
      return false;
    }

    const raiderIds = [];
    const shuffled = [...adultVillagers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < availableRaiders; i++) {
      raiderIds.push(shuffled[i].id);
    }

    this.game.activeRaid = {
      attackerVillageId,
      targetVillageId,
      raiderIds,
      phase: 'planning',
      planningTimer: 0,
      travelTimer: 0,
      retreatTimer: 0,
      loot: null,
      combatResolved: false
    };

    this.game.addChronicleEntry(
      `${attacker.name} is organizing a raid against ${defender.name}!`
    );
    return true;
  }

  /**
   * Advance raid phases; combat resolves exactly once.
   * @param {number} deltaTime
   */
  processRaid(deltaTime) {
    if (!this.game.activeRaid) return;

    const attacker = this.game.getVillage(this.game.activeRaid.attackerVillageId);
    const defender = this.game.getVillage(this.game.activeRaid.targetVillageId);
    if (!attacker || !defender) {
      this.game.activeRaid = null;
      return;
    }

    const phase = this.game.activeRaid.phase;
    const dayDuration = Math.max(1, this.game.timeState.dayDuration || 1);

    switch (phase) {
      case 'planning': {
        this.game.activeRaid.planningTimer += deltaTime / dayDuration;
        if (this.game.activeRaid.planningTimer >= 1.5) {
          this.game.activeRaid.phase = 'moving';
          this.game.activeRaid.planningTimer = 0;
          this.game.addChronicleEntry(
            `A raiding party from ${attacker.name} sets out toward ${defender.name}!`
          );
        }
        break;
      }
      case 'moving': {
        this.game.activeRaid.travelTimer += deltaTime / dayDuration;
        if (this.game.activeRaid.travelTimer >= 1.5) {
          this.game.activeRaid.phase = 'attacking';
          this.game.activeRaid.travelTimer = 0;
          this.game.addChronicleEntry(
            `The raiders from ${attacker.name} arrive at ${defender.name}! Combat begins!`
          );
        }
        break;
      }
      case 'attacking': {
        // One-shot guard — never re-resolve combat on later frames
        if (this.game.activeRaid.combatResolved) {
          this.game.activeRaid.phase = 'retreating';
          break;
        }
        this.resolveCombat(attacker, defender);
        break;
      }
      case 'retreating': {
        this.game.activeRaid.retreatTimer += deltaTime / dayDuration;
        if (this.game.activeRaid.retreatTimer >= 1.5) {
          const won = this.game.activeRaid.attackerWon;
          this.game.addChronicleEntry(
            won
              ? `The raiding party from ${attacker.name} returns home victorious!`
              : `The surviving raiders from ${attacker.name} scatter home in defeat.`
          );
          this.game.activeRaid = null;
        }
        break;
      }
      default:
        this.game.activeRaid = null;
    }
  }

  /**
   * Resolve combat once, then move to retreating on win or lose.
   * @param {object} attacker
   * @param {object} defender
   */
  resolveCombat(attacker, defender) {
    const raid = this.game.activeRaid;
    raid.combatResolved = true;

    const attackerStrength =
      raid.raiderIds.length *
      CONSTANTS.WAR.ATTACKER_STRENGTH_BASE *
      (0.8 + Math.random() * 0.4);
    const defenderStrength =
      defender.calculateStrength(this.game.villagers) * CONSTANTS.WAR.DEFENDER_ADVANTAGE;
    const attackerWon = attackerStrength > defenderStrength;
    raid.attackerWon = attackerWon;

    const raiderCount = raid.raiderIds.length;

    if (!attackerWon) {
      const casualties = Math.floor(raiderCount * (0.2 + Math.random() * 0.3));
      for (let i = 0; i < casualties && raid.raiderIds.length > 0; i++) {
        const raiderId = raid.raiderIds.pop();
        const raider = this.game.villagers.find((v) => v.id === raiderId);
        if (raider) {
          this.game.addChronicleEntry(`${raider.name} was slain in the raid on ${defender.name}.`);
          this.game.removeVillager(raider);
        }
      }
      this.game.addChronicleEntry(
        `The raid on ${defender.name} failed! The raiders scatter in defeat.`
      );
    } else {
      const defenderCasualties = Math.floor(raiderCount * (0.15 + Math.random() * 0.25));
      const defenderVillagers = this.game.getVillagersForVillage(defender.id);
      for (let i = 0; i < defenderCasualties && defenderVillagers.length > 0; i++) {
        const idx = Math.floor(Math.random() * defenderVillagers.length);
        const victim = defenderVillagers[idx];
        if (victim) {
          this.game.addChronicleEntry(
            `${victim.name} of ${defender.name} was killed in the raid.`
          );
          this.game.removeVillager(victim);
          defenderVillagers.splice(idx, 1);
        }
      }

      const lootAmount = 5 + Math.floor(Math.random() * 10);
      const stolenFood = Math.min(defender.resources.food || 0, lootAmount);
      const stolenWood = Math.min(defender.resources.wood || 0, lootAmount);
      attacker.resources.food = (attacker.resources.food || 0) + stolenFood;
      attacker.resources.wood = (attacker.resources.wood || 0) + stolenWood;
      defender.resources.food = (defender.resources.food || 0) - stolenFood;
      defender.resources.wood = (defender.resources.wood || 0) - stolenWood;

      this.game.addChronicleEntry(
        `The raid succeeds! ${attacker.name} claims ${stolenFood} food and ${stolenWood} wood from ${defender.name}.`
      );
      raid.loot = { food: stolenFood, wood: stolenWood };
    }

    attacker.raidCooldown = CONSTANTS.WAR.RAID_COOLDOWN_DAYS;
    raid.phase = 'retreating';
    raid.retreatTimer = 0;

    this.evaluateConquest(defender.id, attacker.id);
  }

  /**
   * Conquest when defender lost >= threshold of originalPopulation.
   * @param {string} defenderId
   * @param {string} attackerId
   */
  evaluateConquest(defenderId, attackerId) {
    const defender = this.game.getVillage(defenderId);
    const attacker = this.game.getVillage(attackerId);
    if (!defender || !attacker) return;

    // Baseline must exist from creation/raid start — never set after casualties
    this.ensureOriginalPopulation(defender);
    const currentVillagers = this.game.getVillagersForVillage(defenderId).length;
    const originalPopulation = Math.max(1, defender.originalPopulation || currentVillagers);
    const lossRatio = 1 - currentVillagers / originalPopulation;

    if (lossRatio >= CONSTANTS.WAR.CONQUEST_THRESHOLD) {
      this.game.handleConquest(defenderId, attackerId);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RaidSystem };
}
