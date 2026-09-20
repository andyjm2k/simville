// Simville Social System — gossip, rituals, cliques, folk diplomacy (Phases 3/5/6)
// Extends SocialSystem.prototype; load after systems/social.js.

Object.assign(SocialSystem.prototype, {
  /**
   * Gossip spread with opinion feedback and publicKnowledge (Phase 3).
   */
  async processGossipSpread() {
    const dyn = this.secretDyn();
    const R = this.rel();

    for (const owner of this.game.villagers) {
      for (const secret of (owner.secrets || [])) {
        if (!secret.revealed || secret.publicKnowledge) continue;

        const discovered = secret.discoveredBy || [];
        const knowers = [owner, ...discovered
          .map(key => this.game.villagers.find(v => v.id === key || v.name === key))
          .filter(Boolean)];

        let candidates = this.game.getVillagersForVillage(owner.villageId).filter(v => {
          if (v.id === owner.id) return false;
          if ((v.personality?.sociable || 0) < 45) return false;
          if (discovered.includes(v.id) || discovered.includes(v.name)) return false;
          if (knowers.some(k => k.id === v.id)) return false;
          // Suppressed listeners do not re-spread
          if (secret.suppressedBy?.includes(v.id)) return false;
          return true;
        });
        if (candidates.length === 0) continue;

        // Prefer clique-mates of a knower
        const spreader = Utils.randomElement(knowers) || owner;
        if (spreader.cliqueId) {
          candidates = candidates.slice().sort((a, b) => {
            const aIn = a.cliqueId === spreader.cliqueId ? 0 : 1;
            const bIn = b.cliqueId === spreader.cliqueId ? 0 : 1;
            return aIn - bIn;
          });
        }

        let spreadChance = 0.45;
        if (spreader.cliqueId && candidates[0]?.cliqueId === spreader.cliqueId) {
          spreadChance += R.CLIQUE_GOSSIP_BONUS ?? 0.1;
        }
        if (Utils.randomFloat(0, 1) > spreadChance) continue;

        const count = Utils.randomInt(1, Math.min(2, candidates.length));
        const listeners = Utils.shuffle(candidates).slice(0, count);
        if (!secret.discoveredBy) secret.discoveredBy = [];

        for (const listener of listeners) {
          // Empathic suppression: learn but may refuse to spread further
          const empath = (listener.personality?.empathetic || 50) >= 70;
          const quiet = (listener.personality?.sociable || 50) < 50;
          if (empath && quiet && Math.random() < (dyn.EMPATH_SUPPRESS_CHANCE ?? 0.25)) {
            secret.discoveredBy.push(listener.id);
            secret.suppressedBy = secret.suppressedBy || [];
            secret.suppressedBy.push(listener.id);
            this.modifyDirected(listener, owner, 1);
            listener.showSpeechBubble?.('🤫', 'I will keep this quiet', 4000);
            owner.showSpeechBubble?.('🤝', `${listener.name} can be trusted`, 3500);
            continue;
          }

          secret.discoveredBy.push(listener.id);
          this.applyGossipOpinion(spreader, listener, owner, secret);

          let gossipText = null;
          try {
            gossipText = await llm.generateGossip(secret, spreader, owner);
          } catch (e) {
            gossipText = null;
          }
          if (!gossipText) {
            gossipText = `${spreader.name} shares whispers about ${owner.name} with ${listener.name}.`;
          }
          listener.showSpeechBubble?.('🗣️', Utils.truncate(gossipText, 40), 5000);
          this.game.addChronicleEntry(gossipText, 'normal', owner.villageId);
        }

        this.maybeMarkPublicKnowledge(owner, secret);
      }
    }
  },

  /** Apply directed opinion deltas when gossip is heard. */
  applyGossipOpinion(spreader, listener, owner, secret) {
    const dyn = this.secretDyn();
    const table = dyn.GOSSIP_OPINION || {};
    const opinion = table[secret.type] || { towardOwner: 1, towardTarget: 0 };
    let towardOwner = opinion.towardOwner || 0;
    let towardTarget = opinion.towardTarget || 0;

    // Empathy softens kind secrets' negatives; coldness amplifies scandals
    const empathy = listener.personality?.empathetic || 50;
    if (towardOwner < 0 && (secret.type === CONSTANTS.SECRET.ILLNESS || secret.type === CONSTANTS.SECRET.ASPIRATION)) {
      if (empathy >= 70) towardOwner *= 0.5;
    }
    if (towardOwner < 0 && (secret.type === CONSTANTS.SECRET.PAST_BETRAYAL ||
        secret.type === CONSTANTS.SECRET.FORBIDDEN_ROMANCE)) {
      if (empathy < 40) towardOwner *= 1.25;
    }

    // Weaponized gossip from grudging spreader
    const weaponized = (spreader.secrets || []).some(s =>
      s.type === CONSTANTS.SECRET.GRUDGE &&
      (s.target === owner.id || s.target === owner.name)
    );
    if (weaponized && towardOwner < 0) {
      towardOwner *= dyn.WEAPONIZE_MULT ?? 1.5;
    }

    this.modifyDirected(listener, owner, towardOwner);
    if (secret.target && towardTarget) {
      const target = this.game.villagers.find(v => v.id === secret.target || v.name === secret.target);
      if (target) this.modifyDirected(listener, target, towardTarget);
    }

    // Confiding bond between spreader and listener
    const gossipDelta = this.rel().INTERACTION_DELTA?.gossip ?? 1;
    this.modifyMutual(spreader, listener, gossipDelta);
    this.recordMutualContact(spreader, listener);
  },

  /** Promote secret to publicKnowledge when enough adults know. */
  maybeMarkPublicKnowledge(owner, secret) {
    if (secret.publicKnowledge) return;
    const dyn = this.secretDyn();
    const tribe = this.game.getVillagersForVillage(owner.villageId)
      .filter(v => v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD && v.health > 0);
    if (tribe.length === 0) return;

    const known = new Set(
      (secret.discoveredBy || [])
        .map(key => this.game.villagers.find(v => v.id === key || v.name === key)?.id)
        .filter(Boolean)
    );
    known.add(owner.id);

    const threshold = Math.ceil(tribe.length * (dyn.PUBLIC_THRESHOLD_FRACTION ?? 0.5));
    if (known.size < threshold) return;

    secret.publicKnowledge = true;
    const shockMood = dyn.PUBLIC_SHOCK_MOOD ?? -8;
    const shockRel = dyn.PUBLIC_SHOCK_OWNER_REL ?? -3;

    for (const adult of tribe) {
      if (!known.has(adult.id)) {
        secret.discoveredBy.push(adult.id);
        this.modifyDirected(adult, owner, shockRel);
        adult.mood = Utils.clamp((adult.mood || 0) + shockMood, -100, 100);
      }
    }

    // Prestige hit/boost for the owner of a public secret
    this.applyPublicSecretPrestige(owner, secret);

    this.game.addChronicleEntry(
      `Word of ${owner.name}'s secret has spread through the village: ${secret.description}`,
      'normal',
      owner.villageId
    );
  },

  /** Prestige adjustments when a secret becomes public. */
  applyPublicSecretPrestige(owner, secret) {
    const R = this.rel();
    if (secret.type === CONSTANTS.SECRET.HIDDEN_TALENT || secret.type === CONSTANTS.SECRET.ASPIRATION) {
      owner.prestige = Utils.clamp((owner.prestige ?? 25) + (R.PRESTIGE_PUBLIC_TALENT ?? 5), 0, 100);
    } else if (
      secret.type === CONSTANTS.SECRET.PAST_BETRAYAL ||
      secret.type === CONSTANTS.SECRET.HIDDEN_STASH ||
      secret.type === CONSTANTS.SECRET.FORBIDDEN_ROMANCE
    ) {
      owner.prestige = Utils.clamp((owner.prestige ?? 25) + (R.PRESTIGE_PUBLIC_SCANDAL ?? -8), 0, 100);
    }
  },

  /**
   * Folk diplomacy: personal cross-tribe bonds slowly drift village relations.
   */
  applyFolkDiplomacyDrift() {
    const villages = this.game.villages || [];
    if (villages.length < 2) return;
    const R = this.rel();
    const friendThresh = R.FRIEND_THRESHOLD ?? 25;
    const rivalThresh = R.RIVAL_THRESHOLD ?? -25;
    const clampAmt = R.FOLK_DRIFT_CLAMP ?? 0.5;
    const allianceCap = CONSTANTS.VILLAGE_RELATION.ALLIANCE_THRESHOLD ?? 70;
    const warFloor = CONSTANTS.VILLAGE_RELATION.WAR_THRESHOLD ?? -60;

    for (let i = 0; i < villages.length; i++) {
      for (let j = i + 1; j < villages.length; j++) {
        const v1 = villages[i];
        const v2 = villages[j];
        const known = v1.knownVillages?.includes(v2.id) || v2.knownVillages?.includes(v1.id);
        if (!known && !v1.hasTradePartner?.(v2.id)) continue;

        const positives = [];
        const negatives = [];
        const aList = this.game.getVillagersForVillage(v1.id);
        const bList = this.game.getVillagersForVillage(v2.id);

        for (const a of aList) {
          for (const b of bList) {
            if (!this.game.canVillagersSocialize(a, b) && !known) continue;
            const mutual = this.game.getMutualRelationship(a, b);
            if (mutual >= friendThresh) positives.push(mutual);
            if (mutual <= rivalThresh) negatives.push(mutual);
          }
        }

        const avgPos = positives.length ? positives.reduce((s, n) => s + n, 0) / positives.length : 0;
        const avgNeg = negatives.length
          ? Math.abs(negatives.reduce((s, n) => s + n, 0) / negatives.length)
          : 0;
        let drift = Utils.clamp(
          avgPos * (R.FOLK_DRIFT_POS ?? 0.02) - avgNeg * (R.FOLK_DRIFT_NEG ?? 0.03),
          -clampAmt,
          clampAmt
        );
        if (drift === 0) continue;

        const applyDrift = (from, to, d) => {
          const current = from.relations?.[to.id] ?? 0;
          // Folk drift alone cannot cross alliance or war thresholds
          let next = current + d;
          if (current < allianceCap) next = Math.min(next, allianceCap - 0.01);
          if (current > warFloor) next = Math.max(next, warFloor + 0.01);
          from.relations[to.id] = Utils.clamp(next, -100, 100);
        };
        applyDrift(v1, v2, drift);
        applyDrift(v2, v1, drift);
      }
    }
  },

  /**
   * Optional LLM village-relation nudge (clamped); never throws.
   */
  async maybeApplyLlmRelationChanges() {
    const interval = this.rel().LLM_RELATION_INTERVAL_DAYS ?? 5;
    const day = this.getDay();
    if (day - this.lastLlmRelationDay < interval) return;
    if ((this.game.villages || []).length < 2) return;
    this.lastLlmRelationDay = day;

    const clampN = this.rel().LLM_RELATION_DELTA_CLAMP ?? 5;
    const events = [];
    for (const village of this.game.villages) {
      const entries = this.game.getChronicle?.(village.id)?.entries || [];
      entries.slice(-5).forEach(e => {
        if (e?.text) events.push(e.text);
      });
    }
    if (events.length === 0) return;

    try {
      const changes = await llm.generateRelationChanges(this.game.villages, events.slice(-8));
      const v1 = this.game.villages[0];
      const v2 = this.game.villages[1];
      if (!v1 || !v2 || !changes) return;

      // generateRelationChanges returns { [v2.id]: absolute score } — convert to clamped delta
      if (typeof changes[v2.id] === 'number') {
        const current = v1.relations?.[v2.id] ?? 0;
        const desired = changes[v2.id];
        const delta = Utils.clamp(desired - current, -clampN, clampN);
        v1.relations[v2.id] = Utils.clamp(current + delta, -100, 100);
        v2.relations[v1.id] = Utils.clamp((v2.relations?.[v1.id] ?? 0) + delta, -100, 100);
      }
    } catch (e) {
      // Deterministic folk drift still applies; LLM failure is non-fatal
    }
  },

  /**
   * Conquest memory: trauma bias instead of deleting relationship keys.
   * @param {object[]} priorWinners
   * @param {object[]} losers
   */
  applyConquestMemory(priorWinners, losers) {
    const R = this.rel();
    const day = this.getDay();
    const tMin = R.CONQUEST_TRAUMA_MIN ?? 20;
    const tMax = R.CONQUEST_TRAUMA_MAX ?? 40;
    const grudgeChance = R.CONQUEST_GRUDGE_CHANCE ?? 0.4;

    for (const winner of priorWinners) {
      for (const loser of losers) {
        const trauma = Utils.randomFloat(tMin, tMax);
        // Winners take slightly milder hit toward former enemies
        const wScore = winner.getRelationship(loser);
        const lScore = loser.getRelationship(winner);
        winner.relationships[loser.id] = Utils.clamp(wScore - trauma * 0.75, R.MIN ?? -100, R.MAX ?? 100);
        loser.relationships[winner.id] = Utils.clamp(lScore - trauma, R.MIN ?? -100, R.MAX ?? 100);

        winner.warTraumaTargets = winner.warTraumaTargets || {};
        loser.warTraumaTargets = loser.warTraumaTargets || {};
        winner.warTraumaTargets[loser.id] = day;
        loser.warTraumaTargets[winner.id] = day;

        if (Math.random() < grudgeChance) {
          this.seedGrudgeSecret(loser, winner);
        }
        if (Math.random() < grudgeChance * 0.5) {
          this.seedGrudgeSecret(winner, loser);
        }
      }
    }
  },

  /**
   * Block partnership when war trauma cooldown is active between the pair.
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  hasWarRomanceCooldown(a, b) {
    const cooldown = this.rel().WAR_ROMANCE_COOLDOWN_DAYS ?? 20;
    const day = this.getDay();
    const aDay = a.warTraumaTargets?.[b.id];
    const bDay = b.warTraumaTargets?.[a.id];
    if (aDay != null && day - aDay < cooldown) return true;
    if (bDay != null && day - bDay < cooldown) return true;
    return false;
  },

  /**
   * Ritual attendance: attendees gain bonds; absentees take shame (Phase 6).
   * @param {object} ritualDef
   * @param {string|null} villageId
   * @param {object|null} deceased - for funeral family handling
   */
  performRitualWithAttendance(ritualDef, villageId = null, deceased = null) {
    if (!ritualDef) return;

    const pool = this.game.villagers.filter(v => {
      if (villageId && v.villageId !== villageId) return false;
      if (v.health <= 0) return false;
      if (ritualDef.participants === 'adults') {
        return v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD &&
          v.lifeStage !== CONSTANTS.LIFE_STAGE.YOUTH;
      }
      if (ritualDef.participants === 'family' && deceased) {
        return this.game.areCloseFamily(v, deceased) || v.isChieftan;
      }
      return true;
    });

    const village = villageId ? this.game.getVillage(villageId) : null;
    const attendees = [];
    const absentees = [];

    for (const v of pool) {
      const sleeping = v.status === CONSTANTS.ACTIVITY.SLEEPING;
      const scouting = !!v.isScouting;
      const offTerritory = village && !village.isInTerritory(Math.round(v.x), Math.round(v.y));
      if (sleeping || scouting || offTerritory) absentees.push(v);
      else attendees.push(v);
    }

    if (this.game.benchmarkMode) {
      attendees.forEach(v => {
        v.mood = Math.min(100, (v.mood || 0) + (ritualDef.moodBoost || 0));
      });
      return;
    }

    const R = this.rel();
    const socialGain = ritualDef.socialGain || 0;
    const isFuneral = ritualDef === CONSTANTS.RITUAL.FUNERAL || ritualDef.name === 'Funeral Rite';

    attendees.forEach(v => {
      v.mood = Utils.clamp((v.mood || 0) + (ritualDef.moodBoost || 0), -100, 100);
      attendees.forEach(other => {
        if (other.id === v.id) return;
        this.modifyDirected(v, other, socialGain);
        this.recordMutualContact(v, other);
      });
    });

    // Extra funeral bonding among close family of the deceased
    if (isFuneral && deceased) {
      const family = attendees.filter(v => this.game.areCloseFamily(v, deceased));
      const extra = R.FUNERAL_FAMILY_EXTRA ?? 6;
      for (let i = 0; i < family.length; i++) {
        for (let j = i + 1; j < family.length; j++) {
          this.modifyMutual(family[i], family[j], extra);
        }
      }
    }

    const leaders = attendees.filter(v =>
      v.isChieftan || v.lifeStage === CONSTANTS.LIFE_STAGE.ELDER
    );
    leaders.forEach(leader => {
      leader.prestige = Utils.clamp(
        (leader.prestige ?? 25) + (R.PRESTIGE_RITUAL_LEAD ?? 1),
        0,
        100
      );
    });

    absentees.forEach(v => {
      const familyGrief = isFuneral && deceased && this.game.areCloseFamily(v, deceased);
      if (familyGrief) {
        v.mood = Utils.clamp(
          (v.mood || 0) + (R.FUNERAL_FAMILY_ABSENT_MOOD ?? -15),
          -100,
          100
        );
        return;
      }
      v.mood = Utils.clamp((v.mood || 0) + (R.RITUAL_SKIP_MOOD ?? -10), -100, 100);
      leaders.forEach(leader => {
        this.modifyDirected(v, leader, R.RITUAL_SKIP_TO_LEADER ?? -5);
        this.modifyDirected(leader, v, R.RITUAL_LEADER_TO_SKIP ?? -2);
      });
    });

    this.game.addChronicleEntry(
      `${ritualDef.emoji || ''} ${ritualDef.name} brings the people of ${village?.name || 'the village'} together.`,
      ritualDef.moodBoost >= 0 ? 'celebration' : 'normal',
      villageId
    );
  },

  /**
   * Recompute informal cliques per tribe (union-find on top friend links).
   */
  recomputeCliques() {
    const R = this.rel();
    const minSize = R.CLIQUE_MIN_SIZE ?? 3;
    const linkCount = R.CLIQUE_FRIEND_LINKS ?? 2;
    const friendThresh = R.FRIEND_THRESHOLD ?? 25;

    for (const village of this.game.villages || []) {
      const adults = this.game.getVillagersForVillage(village.id)
        .filter(v => v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD && v.health > 0);
      adults.forEach(v => { v.cliqueId = null; });

      const parent = new Map(adults.map(v => [v.id, v.id]));
      const find = (id) => {
        while (parent.get(id) !== id) {
          parent.set(id, parent.get(parent.get(id)));
          id = parent.get(id);
        }
        return id;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };

      for (const v of adults) {
        const top = Object.entries(v.relationships || {})
          .filter(([, score]) => score >= friendThresh)
          .sort((a, b) => b[1] - a[1])
          .slice(0, linkCount);
        for (const [otherId] of top) {
          const other = adults.find(o => o.id === otherId);
          if (!other) continue;
          // Require reciprocal friend link for clique edge
          if ((other.getRelationship(v) || 0) >= friendThresh) {
            union(v.id, other.id);
          }
        }
      }

      const groups = new Map();
      for (const v of adults) {
        const root = find(v.id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(v);
      }

      let cliqueIndex = 0;
      for (const members of groups.values()) {
        if (members.length < minSize) continue;
        const cliqueId = `${village.id}-c${cliqueIndex++}`;
        members.forEach(m => { m.cliqueId = cliqueId; });
      }
    }
  }

});

if (typeof window !== 'undefined') {
  window.SocialSystem = SocialSystem;
}
