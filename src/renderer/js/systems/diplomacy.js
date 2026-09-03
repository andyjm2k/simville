// Simville Diplomacy System — war, peace, and day-based event processing (SPEC §21)

/**
 * Owns inter-village war state and diplomatic event resolution.
 */
class DiplomacySystem {
  /**
   * @param {object} game - Host game instance
   */
  constructor(game) {
    // Back-reference for villages, chronicle, raids
    this.game = game;
  }

  /**
   * Declare war between two villages and clamp relations into war range.
   * @param {string} villageId1
   * @param {string} villageId2
   */
  triggerWar(villageId1, villageId2) {
    const v1 = this.game.getVillage(villageId1);
    const v2 = this.game.getVillage(villageId2);
    if (!v1 || !v2) return;

    if (!v1.atWarWith.includes(villageId2)) {
      v1.atWarWith.push(villageId2);
    }
    if (!v2.atWarWith.includes(villageId1)) {
      v2.atWarWith.push(villageId1);
    }

    v1.relations[villageId2] = Math.min(
      v1.relations[villageId2] || 0,
      CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD - 10
    );
    v2.relations[villageId1] = Math.min(
      v2.relations[villageId1] || 0,
      CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD - 10
    );

    this.game.addChronicleEntry(
      `War has broken out between ${v1.name} and ${v2.name}! The tribes prepare for conflict.`
    );
  }

  /**
   * End war and raise relations to the hostile floor.
   * @param {string} villageId1
   * @param {string} villageId2
   */
  endWar(villageId1, villageId2) {
    const v1 = this.game.getVillage(villageId1);
    const v2 = this.game.getVillage(villageId2);
    if (!v1 || !v2) return;

    v1.atWarWith = v1.atWarWith.filter((id) => id !== villageId2);
    v2.atWarWith = v2.atWarWith.filter((id) => id !== villageId1);

    v1.relations[villageId2] = Math.max(
      v1.relations[villageId2] || 0,
      CONSTANTS.VILLAGE_RELATION.HOSTILE_THRESHOLD
    );
    v2.relations[villageId1] = Math.max(
      v2.relations[villageId1] || 0,
      CONSTANTS.VILLAGE_RELATION.HOSTILE_THRESHOLD
    );

    this.game.addChronicleEntry(
      `Peace has been negotiated between ${v1.name} and ${v2.name}. A new era of cautious relations begins.`
    );
  }

  /**
   * Drop diplomatic events older than 3 in-game days.
   */
  processDiplomaticEvents() {
    for (let i = this.game.diplomaticEvents.length - 1; i >= 0; i--) {
      const event = this.game.diplomaticEvents[i];
      if (event.createdDay == null) {
        event.createdDay = this.game.timeState.day;
      }
      if (this.game.timeState.day - event.createdDay > 3) {
        this.game.diplomaticEvents.splice(i, 1);
      }
    }
  }

  /**
   * Resolve pending diplomatic proposals once their day delay elapses.
   */
  processChieftanDecisions() {
    for (let i = this.game.diplomaticEvents.length - 1; i >= 0; i--) {
      const event = this.game.diplomaticEvents[i];
      const sourceVillage = this.game.getVillage(event.sourceVillageId);
      const targetVillage = this.game.getVillage(event.targetVillageId);
      if (!sourceVillage || !targetVillage) {
        this.game.diplomaticEvents.splice(i, 1);
        continue;
      }

      if (event.createdDay == null) {
        event.createdDay = this.game.timeState.day;
      }

      const minDays = event.urgency === 'high' ? 0 : event.urgency === 'low' ? 2 : 1;
      if (this.game.timeState.day - event.createdDay < minDays) continue;

      switch (event.type) {
        case 'propose_trade': {
          const currentRelation = sourceVillage.relations[targetVillage.id] || 0;
          sourceVillage.relations[targetVillage.id] = Math.min(100, currentRelation + 15);
          targetVillage.relations[sourceVillage.id] = Math.min(
            100,
            (targetVillage.relations[sourceVillage.id] || 0) + 15
          );
          this.game.addChronicleEntry(
            `${sourceVillage.name} and ${targetVillage.name} have established a trade agreement.`
          );
          break;
        }
        case 'propose_alliance': {
          const currentRelation = sourceVillage.relations[targetVillage.id] || 0;
          sourceVillage.relations[targetVillage.id] = Math.min(100, currentRelation + 40);
          targetVillage.relations[sourceVillage.id] = Math.min(
            100,
            (targetVillage.relations[sourceVillage.id] || 0) + 40
          );
          this.game.addChronicleEntry(
            `${sourceVillage.name} and ${targetVillage.name} have formed an alliance!`
          );
          break;
        }
        case 'send_threat': {
          sourceVillage.relations[targetVillage.id] = Math.max(
            -100,
            (sourceVillage.relations[targetVillage.id] || 0) - 20
          );
          targetVillage.relations[sourceVillage.id] = Math.max(
            -100,
            (targetVillage.relations[sourceVillage.id] || 0) - 20
          );
          this.game.addChronicleEntry(
            `${sourceVillage.name} sends threats toward ${targetVillage.name}! Relations worsen.`
          );
          break;
        }
        case 'observe':
          this.game.explorationSystem?.dispatchScout(sourceVillage, targetVillage, 'observe');
          this.game.addChronicleEntry(
            `${sourceVillage.name} sends scouts toward ${targetVillage.name}.`,
            'normal',
            sourceVillage.id
          );
          break;
        case 'raid':
          // Raid is started immediately when queued; nothing further here
          break;
        default:
          break;
      }

      // Consume processed event
      this.game.diplomaticEvents.splice(i, 1);
    }
  }

  /**
   * Daily unique-pair war escalation and raid cooldown ticks.
   */
  evaluateWarEscalation() {
    if (this.game.villages.length < 2) return;

    for (let i = 0; i < this.game.villages.length; i++) {
      for (let j = i + 1; j < this.game.villages.length; j++) {
        const village = this.game.villages[i];
        const otherVillage = this.game.villages[j];
        const relation = village.relations[otherVillage.id] || 0;
        const pairKey = [village.id, otherVillage.id].sort().join('_');

        if (
          village.atWarWith.includes(otherVillage.id) ||
          otherVillage.atWarWith.includes(village.id)
        ) {
          if (relation >= CONSTANTS.VILLAGE_RELATION.HOSTILE_THRESHOLD) {
            this.endWar(village.id, otherVillage.id);
          }
          continue;
        }

        if (relation < CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD) {
          if (!this.game.hostileDaysCount[pairKey]) {
            this.game.hostileDaysCount[pairKey] = 0;
          }
          this.game.hostileDaysCount[pairKey]++;

          if (
            this.game.hostileDaysCount[pairKey] >=
            CONSTANTS.DIPLOMACY.HOSTILE_WAR_THRESHOLD_DAYS
          ) {
            if (Math.random() < 0.3) {
              this.triggerWar(village.id, otherVillage.id);
            }
          }
        } else {
          this.game.hostileDaysCount[pairKey] = 0;
        }
      }
    }

    for (const village of this.game.villages) {
      if (village.raidCooldown > 0) {
        village.raidCooldown--;
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DiplomacySystem };
}
