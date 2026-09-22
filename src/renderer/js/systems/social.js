// Simville Social System — inter/intra villager relationship dynamics
// Implements SOCIAL_DYNAMICS_PLAN.md phases 1–6 (orchestrated by Game).

/**
 * Owns daily deepen, typed interactions, gossip opinions, folk diplomacy,
 * conquest trauma memory, cliques, and ritual attendance side effects.
 */
class SocialSystem {
  /**
   * @param {object} game - Host Game instance
   */
  constructor(game) {
    // Back-reference for villagers, villages, chronicle, and tribe helpers
    this.game = game;
    // Day of last LLM village-relation nudge (folk diplomacy supplement)
    this.lastLlmRelationDay = 0;
  }

  /** Current in-game day number (1-based). */
  getDay() {
    return this.game.timeState?.day || 1;
  }

  /** Relationship constant bag with safe fallbacks. */
  rel() {
    return CONSTANTS.RELATIONSHIP || {};
  }

  /** Secret-dynamics constant bag. */
  secretDyn() {
    return CONSTANTS.SECRET_DYNAMICS || {};
  }

  /**
   * Record meaningful social contact between two villagers (both directions).
   * @param {object} a
   * @param {object} b
   * @param {number} [day]
   */
  recordMutualContact(a, b, day = this.getDay()) {
    if (!a || !b || a.id === b.id) return;
    a.recordSocialContact?.(b.id, day);
    b.recordSocialContact?.(a.id, day);
  }

  /**
   * Days since last mutual contact (Infinity if never).
   * @param {object} a
   * @param {object} b
   * @returns {number}
   */
  daysSinceContact(a, b) {
    const day = this.getDay();
    const aDay = a.lastSocialContact?.[b.id];
    const bDay = b.lastSocialContact?.[a.id];
    if (aDay == null && bDay == null) return Infinity;
    const last = Math.max(aDay ?? 0, bDay ?? 0);
    return Math.max(0, day - last);
  }

  /**
   * Ensure cross-tribe first contact uses a cautious prior instead of 0.
   * @param {object} from
   * @param {object} to
   */
  ensureCrossTribePrior(from, to) {
    if (!from || !to || this.game.areSameTribe?.(from, to)) return;
    if (from.relationships?.[to.id] !== undefined) return;
    const prior = this.rel().CROSS_TRIBE_PRIOR ?? -8;
    from.relationships[to.id] = prior;
  }

  /**
   * Directed relationship mutation (from → to).
   * @param {object} from
   * @param {object} to
   * @param {number} delta
   */
  modifyDirected(from, to, delta) {
    if (!from || !to || !Number.isFinite(delta) || delta === 0) return;
    this.ensureCrossTribePrior(from, to);
    from.modifyRelationship(to, delta);
  }

  /**
   * Mutual relationship mutation (same delta both ways).
   * @param {object} a
   * @param {object} b
   * @param {number} delta
   */
  modifyMutual(a, b, delta) {
    this.modifyDirected(a, b, delta);
    this.modifyDirected(b, a, delta);
  }

  /**
   * Bond summary for UI / gates.
   * @param {object} a
   * @param {object} b
   * @returns {{ aToB: number, bToA: number, mutual: number, typeA: string, typeB: string }}
   */
  getBondSummary(a, b) {
    const aToB = a.getRelationship(b);
    const bToA = b.getRelationship(a);
    return {
      aToB,
      bToA,
      mutual: (aToB + bToA) / 2,
      typeA: a.getRelationshipType(aToB),
      typeB: b.getRelationshipType(bToA)
    };
  }

  /** Baseline drift target for a directed edge. */
  baselineFor(from, to, isFamily, isPartner) {
    const R = this.rel();
    if (isPartner) return R.PARTNER_BASELINE_SCORE ?? 50;
    if (isFamily) return R.FAMILY_BASELINE_SCORE ?? 40;
    return R.BASELINE_SCORE ?? 0;
  }

  /**
   * Drift one directed score toward baseline by neglect amount.
   * @returns {number} new delta to apply
   */
  neglectDelta(current, baseline, decay) {
    if (current === baseline) return 0;
    const step = Math.min(Math.abs(current - baseline), decay);
    return current > baseline ? -step : step;
  }

  /**
   * Daily pair pass: neglect + capped passive deepen (Phases 1–2, 5–6).
   */
  deepenDailyRelationships() {
    const villagers = this.game.villagers || [];
    const R = this.rel();
    const windowDays = R.CONTACT_WINDOW_DAYS ?? 3;
    const decay = R.NEGLECT_DECAY_PER_DAY ?? 0.35;
    const friendCap = R.FRIEND_PASSIVE_CAP ?? R.FRIEND_THRESHOLD ?? 25;

    for (let i = 0; i < villagers.length; i++) {
      for (let j = i + 1; j < villagers.length; j++) {
        const a = villagers[i];
        const b = villagers[j];
        if (!this.game.canVillagersSocialize(a, b)) continue;

        const isFamily = this.game.areCloseFamily(a, b);
        const isPartner = a.partnerId === b.id || b.partnerId === a.id;
        const since = this.daysSinceContact(a, b);
        const sameTribe = this.game.areSameTribe(a, b);
        const hostileFriction = this.crossTribeHostileFriction(a, b);

        // Directed update for each side
        this.deepenDirectedEdge(a, b, {
          isFamily, isPartner, since, windowDays, decay, friendCap,
          sameTribe, hostileFriction, R
        });
        this.deepenDirectedEdge(b, a, {
          isFamily, isPartner, since, windowDays, decay, friendCap,
          sameTribe, hostileFriction, R
        });
      }
    }
  }

  /** Apply neglect or deepen for from → to. */
  deepenDirectedEdge(from, to, ctx) {
    const { isFamily, isPartner, since, windowDays, decay, friendCap, hostileFriction, R } = ctx;
    this.ensureCrossTribePrior(from, to);
    const current = from.getRelationship(to);
    const baseline = this.baselineFor(from, to, isFamily, isPartner);

    // Neglect when contact is stale or never happened
    if (since > windowDays) {
      const delta = this.neglectDelta(current, baseline, decay);
      this.modifyDirected(from, to, delta);
      return;
    }

    // Recent contact: compute passive deepen delta
    let delta = 0.25;
    if (isFamily) delta += R.FAMILY_PASSIVE_BIAS ?? 0.35;
    if (isPartner) delta += R.PARTNER_PASSIVE_BONUS ?? 1.2;
    if (Utils.distance(from.x, from.y, to.x, to.y) <= 5) delta += 0.45;
    if (from.status === CONSTANTS.ACTIVITY.SOCIALIZING || to.status === CONSTANTS.ACTIVITY.SOCIALIZING) {
      delta += 0.55;
    }

    const empathy = ((from.personality?.empathetic || 50) + (to.personality?.empathetic || 50)) / 2;
    const sociable = ((from.personality?.sociable || 50) + (to.personality?.sociable || 50)) / 2;
    delta += (empathy - 50) / 80 + (sociable - 50) / 100;

    if (from.mood < -20) delta -= 0.8;
    if (from.hunger < 25 || (from.thirst ?? 100) < 25) delta -= 0.7;

    // Clique modifiers (same tribe only)
    if (ctx.sameTribe && from.cliqueId && to.cliqueId) {
      if (from.cliqueId === to.cliqueId) delta *= R.CLIQUE_IN_MULT ?? 1.25;
      else delta *= R.CLIQUE_OUT_MULT ?? 0.85;
    }

    // Hostile cross-tribe friction
    if (hostileFriction) {
      delta *= R.HOSTILE_DEEPEN_MULT ?? 0.25;
      delta -= R.HOSTILE_FRICTION ?? 0.4;
    }

    // Friend passive cap for non-partners
    if (!isPartner && current >= friendCap && delta > 0) {
      delta = 0;
    }
    // Partners deepen more slowly past friend cap toward soulmate
    if (isPartner && current >= friendCap && delta > 0) {
      delta *= R.PARTNER_DEEPEN_RATE ?? 0.35;
    }

    this.modifyDirected(from, to, delta);
  }

  /**
   * True when village relation is hostile (not necessarily at war).
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  crossTribeHostileFriction(a, b) {
    if (this.game.areSameTribe(a, b)) return false;
    const home = this.game.getVillage(a.villageId);
    const other = this.game.getVillage(b.villageId);
    if (!home || !other) return false;
    if (home.atWarWith?.includes(other.id)) return true;
    const relation = home.relations?.[other.id] ?? CONSTANTS.VILLAGE_RELATION.NEUTRAL;
    return relation < (CONSTANTS.VILLAGE_RELATION.HOSTILE_THRESHOLD ?? -30);
  }

  /**
   * Resolve typed interaction delta and apply directed/mutual effects.
   * @returns {{ delta: number, notable: object|null }}
   */
  applyInteractionEffects(actor, partner, interactionType) {
    const R = this.rel();
    const deltas = R.INTERACTION_DELTA || {};
    const type = interactionType || 'talk';
    const baseDelta = deltas[type] ?? deltas.talk ?? 1.5;
    let notable = null;

    this.recordMutualContact(actor, partner);

    if (type === 'argue') {
      this.modifyMutual(actor, partner, baseDelta);
      // Low-empathy arguers may seed a one-way grudge
      if ((actor.personality?.empathetic || 50) < 40 && Math.random() < 0.2) {
        this.seedGrudgeSecret(actor, partner);
      }
      notable = { text: `${actor.name} and ${partner.name} had a disagreement.`, type: 'conflict' };
    } else if (type === 'romance') {
      this.applyRomanceInteraction(actor, partner, baseDelta);
      notable = { text: `${actor.name} and ${partner.name} shared a tender moment.`, type: 'celebration' };
    } else if (type === 'gossip') {
      // Confiding bond with listener only (subject opinions handled in gossip spread)
      this.modifyMutual(actor, partner, baseDelta);
      notable = { text: `${actor.name} shared whispers with ${partner.name}.`, type: 'normal' };
    } else {
      // talk / share / help — mutual positive
      this.modifyMutual(actor, partner, baseDelta);
      if (type === 'share') {
        notable = { text: `${actor.name} shared something with ${partner.name}.`, type: 'normal' };
      } else if (type === 'help') {
        notable = { text: `${actor.name} helped ${partner.name} with a task.`, type: 'normal' };
      }
    }

    return { delta: baseDelta, notable };
  }

  /** Romance with requited/unrequited + spouse jealousy. */
  applyRomanceInteraction(actor, partner, baseDelta) {
    const R = this.rel();
    const friendThresh = R.FRIEND_THRESHOLD ?? 25;
    const partnerTowardActor = partner.getRelationship(actor);
    const requited = partnerTowardActor >= friendThresh;

    if (requited) {
      this.modifyMutual(actor, partner, baseDelta);
    } else {
      // Unrequited: only actor warms; target cools slightly
      this.modifyDirected(actor, partner, baseDelta);
      this.modifyDirected(partner, actor, -1);
    }

    // Jealousy if actor is married to someone else
    if (actor.partnerId && actor.partnerId !== partner.id) {
      const spouse = this.game.villagers.find(v => v.id === actor.partnerId);
      if (spouse) {
        actor.mood = Utils.clamp((actor.mood || 0) - 3, -100, 100);
        spouse.mood = Utils.clamp((spouse.mood || 0) - 3, -100, 100);
        this.modifyDirected(spouse, actor, -2);
        this.modifyDirected(spouse, partner, -3);
        this.modifyDirected(actor, spouse, -1);
      }
    }
  }

  /** Optionally attach a grudge secret after a heated argument. */
  seedGrudgeSecret(owner, target) {
    if (!owner.secrets) owner.secrets = [];
    const exists = owner.secrets.some(s =>
      s.type === CONSTANTS.SECRET.GRUDGE && !s.revealed &&
      (s.target === target.id || s.target === target.name)
    );
    if (exists) return;
    owner.secrets.push({
      type: CONSTANTS.SECRET.GRUDGE,
      description: `${owner.name} nurses a quiet grudge against ${target.name}.`,
      secrecyLevel: 3,
      discoveryTriggers: ['high_relationship', 'crisis_event'],
      target: target.id,
      revealed: false,
      discoveredBy: [],
      publicKnowledge: false,
      suppressed: false
    });
  }

  /**
   * Partner selection utility (lower score is better).
   * @param {object} villager
   * @param {object|null} preferred
   * @returns {object|null}
   */
  findSocialPartner(villager, preferred = null) {
    if (preferred && this.game.canVillagersSocialize(villager, preferred) && preferred.health > 0) {
      return preferred;
    }

    const R = this.rel();
    const candidates = this.game.villagers.filter(other =>
      other.health > 0 &&
      !other.isScouting &&
      this.game.canVillagersSocialize(villager, other) &&
      !this.game.isPartnerTooBusyToSocialize(other)
    );
    if (!candidates.length) return null;

    const existing = candidates.find(other => other.id === villager.socialPartnerId);
    if (existing) return existing;

    const incoming = candidates.find(other => other.socialPartnerId === villager.id);
    if (incoming) return incoming;

    const conflictSeeking = (villager.personality?.confident || 0) > 65 &&
      (villager.personality?.empathetic || 50) < 40 &&
      (villager.mood || 0) < 0;

    const goalTargetId = this.relationshipGoalTargetId(villager);

    return candidates.slice().sort((a, b) => {
      return this.partnerSortScore(villager, a, { conflictSeeking, goalTargetId, R }) -
        this.partnerSortScore(villager, b, { conflictSeeking, goalTargetId, R });
    })[0] || null;
  }

  /** Numeric sort key for social partner preference (lower = better). */
  partnerSortScore(self, other, ctx) {
    const { conflictSeeking, goalTargetId, R } = ctx;
    const dist = Utils.distance(self.x, self.y, other.x, other.y);
    const seek = CONSTANTS.NEED?.SOCIAL_SEEK || 40;
    const lonely = other.socialNeed < seek ? -(R.PARTNER_LONELY_BONUS ?? 8) : 0;
    const bond = self.getRelationship(other);
    const bondPull = -Math.min(R.PARTNER_BOND_PULL_MAX ?? 20, Math.max(0, bond) * 0.2);
    const spouse = self.partnerId === other.id ? -(R.PARTNER_SPOUSE_BONUS ?? 15) : 0;
    const family = this.game.areCloseFamily(self, other) ? -(R.PARTNER_FAMILY_BONUS ?? 10) : 0;
    const goal = goalTargetId === other.id ? -(R.PARTNER_GOAL_BONUS ?? 12) : 0;
    let enemy = 0;
    if (bond <= (R.RIVAL_THRESHOLD ?? -25)) {
      enemy = conflictSeeking ? -8 : (R.PARTNER_ENEMY_PENALTY ?? 25);
    }
    const prestigeDiff = ((other.prestige ?? 25) - (self.prestige ?? 25)) * (R.PARTNER_PRESTIGE_WEIGHT ?? 0.05);
    return dist + lonely + bondPull + spouse + family + goal + enemy - prestigeDiff;
  }

  /** Id of open relationship-goal target if any. */
  relationshipGoalTargetId(villager) {
    const goal = (villager.goals || []).find(g =>
      !g.completed && !g.failed && (g.type === 'relationship' || g.type === 'social') && g.targetName
    );
    if (!goal?.targetName) return null;
    const target = this.game.villagers.find(v =>
      v.name === goal.targetName || v.id === goal.targetName || v.id === goal.targetId
    );
    return target?.id || null;
  }

  /** True when villager personality seeks conflict partners. */
  isConflictSeeking(villager) {
    return (villager.personality?.confident || 0) > 65 &&
      (villager.personality?.empathetic || 50) < 40 &&
      (villager.mood || 0) < 0;
  }

  /**
   * Default prestige from role / life stage.
   * @param {object} villager
   * @returns {number}
   */
  static defaultPrestige(villager) {
    const R = CONSTANTS.RELATIONSHIP || {};
    if (villager.isChieftan) return R.PRESTIGE_CHIEFTAN ?? 60;
    if (villager.lifeStage === CONSTANTS.LIFE_STAGE.ELDER) return R.PRESTIGE_ELDER ?? 45;
    if (villager.lifeStage === CONSTANTS.LIFE_STAGE.YOUTH) return R.PRESTIGE_YOUTH ?? 10;
    if (villager.lifeStage === CONSTANTS.LIFE_STAGE.CHILD) return R.PRESTIGE_CHILD ?? 5;
    return R.PRESTIGE_ADULT ?? 25;
  }

  /** Daily social orchestration hook called from Game.onNewDay. */
  async onNewDay() {
    this.recomputeCliques?.();
    this.applyFolkDiplomacyDrift?.();
    await this.maybeApplyLlmRelationChanges?.();
  }

  /** Community methods (gossip/rituals/cliques) load from social-community.js */
}

if (typeof window !== 'undefined') {
  window.SocialSystem = SocialSystem;
}
