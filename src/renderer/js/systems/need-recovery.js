/**
 * Decides when a collapsing villager must finish drinking, eating, or resting
 * before the next gather or hunt assignment is allowed to change their status.
 * Gathering wood is not treated as drinking.
 */
class NeedRecovery {
  /** Critical floors and the bars that mean a forced drink, meal, or rest is finished. */
  static thresholds() {
    const need = (typeof CONSTANTS !== 'undefined' && CONSTANTS.NEED) || {};
    return {
      criticalThirst: need.CRITICAL_THIRST ?? 25,
      criticalHunger: need.CRITICAL_HUNGER ?? 25,
      criticalEnergy: need.CRITICAL_ENERGY ?? 15,
      drinkSatisfied: need.DRINK_SATISFIED ?? 85,
      eatSatisfied: need.EAT_SATISFIED ?? 85,
      restSatisfied: need.REST_SATISFIED ?? 60
    };
  }

  /**
   * Recovery that must finish before other work, or null when the LLM may assign labor.
   * Thirst is handled before hunger, and hunger before exhaustion.
   * @param {object} villager
   * @param {object} [resources]
   * @returns {{kind: string, mode: 'consume'|'collect'}|null}
   */
  static resolve(villager, resources = {}) {
    if (!villager || villager.health <= 0) return null;

    const limits = NeedRecovery.thresholds();
    const water = resources.water || 0;
    const food = resources.food || 0;
    const thirst = villager.thirst ?? 100;
    const hunger = villager.hunger ?? 100;
    const energy = villager.energy ?? 100;
    const status = villager.status;

    // Hold an in-progress drink until satisfied, and start one at the critical floor
    const wantsDrink = thirst < limits.criticalThirst ||
      (status === 'drinking' && thirst < limits.drinkSatisfied);
    if (wantsDrink) {
      return { kind: 'thirst', mode: water > 0 ? 'consume' : 'collect' };
    }

    const wantsEat = hunger < limits.criticalHunger ||
      (status === 'eating' && hunger < limits.eatSatisfied);
    if (wantsEat) {
      return { kind: 'hunger', mode: food > 0 ? 'consume' : 'collect' };
    }

    const wantsRest = energy < limits.criticalEnergy ||
      ((status === 'resting' || status === 'sleeping') && energy < limits.restSatisfied);
    if (wantsRest) {
      return { kind: 'energy', mode: 'consume' };
    }

    return null;
  }

  /**
   * True when the proposed action already performs this recovery.
   * A wood-gathering order does not satisfy thirst while water is in store.
   * @param {object} action
   * @param {{kind: string, mode: string}|null} recovery
   * @returns {boolean}
   */
  static allowsAction(action, recovery) {
    if (!recovery) return true;
    const name = action?.action;

    if (recovery.kind === 'thirst') {
      if (recovery.mode === 'consume') return name === 'drinking';
      return NeedRecovery.isWaterCollection(action);
    }

    if (recovery.kind === 'hunger') {
      if (recovery.mode === 'consume') return name === 'eating';
      return name === 'gathering' || name === 'hunting' || name === 'fishing';
    }

    if (recovery.kind === 'energy') {
      return name === 'resting' || name === 'sleeping';
    }

    return false;
  }

  /**
   * Gathering or fishing aimed at water, rather than wood, food, or stone.
   * @param {object} action
   * @returns {boolean}
   */
  static isWaterCollection(action) {
    const name = action?.action;
    if (name !== 'gathering' && name !== 'fishing') return false;
    const target = `${action.resourceType || ''} ${action.target || ''} ${action.survivalTask || ''}`.toLowerCase();
    return target.includes('water');
  }

  /**
   * Status label to hold while stores are being consumed.
   * @param {{kind: string, mode: string}|null} recovery
   * @returns {{status: string, activity: string}|null}
   */
  static consumeStatus(recovery) {
    if (!recovery || recovery.mode !== 'consume') return null;
    if (recovery.kind === 'thirst') return { status: 'drinking', activity: 'Drinking water' };
    if (recovery.kind === 'hunger') return { status: 'eating', activity: 'Eating' };
    if (recovery.kind === 'energy') return { status: 'resting', activity: 'Resting' };
    return null;
  }
}
