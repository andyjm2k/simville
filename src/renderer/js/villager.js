// Simville Villager Module

class Villager {
  constructor(data = {}) {
    // Identity
    this.id = data.id || Utils.generateId();
    this.name = data.name || Utils.generateName(data.gender || 'male');
    this.age = data.age ?? Utils.randomInt(18, 45);
    this.gender = data.gender || Utils.randomElement(['male', 'female', 'nonbinary']);

    // Position & Movement
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.targetX = this.x;
    this.targetY = this.y;
    this.path = [];
    this.speed = 0.15; // Tiles per game second (increased for better visibility)
    this.direction = 'south';

    // Attributes
    this.personality = data.personality || Utils.generatePersonality();
    this.skills = data.skills || Utils.generateSkills();
    this.health = data.health ?? 100;
    this.hunger = data.hunger ?? 100;
    this.thirst = data.thirst ?? 100;
    this.energy = data.energy ?? 100;
    this.socialNeed = data.socialNeed ?? 80;
    this.mood = data.mood ?? 50;
    this.causeOfDeath = data.causeOfDeath || null;

    // Status
    this.status = data.status || CONSTANTS.ACTIVITY.IDLE;
    this.activity = data.activity || 'Idle';
    this.activityDuration = data.activityDuration || 0;
    this.socialPartnerId = data.socialPartnerId || null;

    // Relationships are directed: relationships[otherId] = how I feel about them (-100…100)
    this.relationships = data.relationships || {};
    this.partnerId = data.partnerId || null;
    this.partnerName = data.partnerName || null;
    this.parentIds = data.parentIds || [];
    this.parentNames = data.parentNames || [];
    this.childrenIds = data.childrenIds || [];
    this.childrenNames = data.childrenNames || [];
    this.expectingChild = data.expectingChild || null;
    this.lastChildDay = data.lastChildDay || 0;
    this.lastPartnershipDay = data.lastPartnershipDay || 0;
    this.affairPartnerId = data.affairPartnerId || null;
    // Day of last meaningful social contact per other villager id (Phase 1)
    this.lastSocialContact = data.lastSocialContact || {};
    // Soft status score for social goals / partner preference (Phase 6)
    this.prestige = data.prestige ?? null;
    // Ephemeral clique id recomputed daily (Phase 6)
    this.cliqueId = data.cliqueId || null;
    // Map of otherId → day when conquest trauma was applied (Phase 5)
    this.warTraumaTargets = data.warTraumaTargets || {};

    // Life stage / aging
    this.lifeStage = Utils.getLifeStage(this.age);
    this.ageProgress = data.ageProgress || 0;
    this.needInterruptCooldown = data.needInterruptCooldown || 0;

    // Roles
    this.isChieftan = data.isChieftan || false;
    this.title = data.title || this.determineTitle();
    this.villageId = data.villageId || null;
    // Fill prestige from role when missing (legacy saves)
    if (this.prestige == null) {
      this.prestige = typeof SocialSystem !== 'undefined'
        ? SocialSystem.defaultPrestige(this)
        : (this.isChieftan ? 60 : 25);
    }

    // Backstory
    this.backstory = data.backstory || '';

    // Goals & Secrets
    this.goals = data.goals || [];
    this.secrets = data.secrets || [];

    // Speech bubble
    this.speechBubble = null;
    this.speechBubbleTimer = 0;

    // Wandering behavior
    this.wanderTarget = null;
    this.wanderTimer = 0;
    this.wanderInterval = 3000; // ms between wandering decisions

    // Cross-map scouting (wilderness only; never rival village cores)
    this.isScouting = data.isScouting || false;
    this.scoutMission = data.scoutMission || null;

    // Personal place memory and locality (spatial awareness)
    this.knownPlaces = Array.isArray(data.knownPlaces) ? data.knownPlaces : [];
    this.locality = data.locality || null;
    this._lastObserveAt = 0;
    this._lastLocalityTile = null;
    this._repathAttempts = 0;
    this._pendingPlaceTarget = null;

    // Interaction log
    this.interactionLog = [];

    // Current action from LLM
    this.currentAction = null;

    // Visual
    this.skinTone = data.skinTone || Utils.randomElement(CONSTANTS.COLORS.SKIN_TONES);
    this.hairColor = data.hairColor || Utils.randomElement(CONSTANTS.COLORS.HAIR_COLORS);
    this.spriteVariant = data.spriteVariant ?? Utils.randomInt(0, 3);

    // Animation
    this.animFrame = 0;
    this.animTimer = 0;
    this.isMoving = false;
  }

  determineTitle() {
    if (this.isChieftan) return 'Chieftan';
    const stage = Utils.getLifeStage(this.age);
    if (stage === CONSTANTS.LIFE_STAGE.CHILD) return 'Child';
    if (stage === CONSTANTS.LIFE_STAGE.YOUTH) return 'Youth';
    if (stage === CONSTANTS.LIFE_STAGE.ELDER) return 'Elder';

    // Check for special roles based on skills
    const maxSkill = Math.max(...Object.values(this.skills));
    if (this.skills.leadership === maxSkill && maxSkill >= 7) return 'Elder Advisor';
    if (this.skills.hunting === maxSkill && maxSkill >= 7) return 'Head Hunter';
    if (this.skills.fishing === maxSkill && maxSkill >= 7) return 'Master Fisher';
    if (this.skills.crafting === maxSkill && maxSkill >= 7) return 'Master Craftsman';

    return 'Tribesman';
  }

  update(deltaTime, world, villagers) {
    // Age ~1 year per 90 game days
    if (game?.timeState) {
      const yearsPerMs = (1 / 90) / (game.timeState.dayDuration || 600000);
      this.ageProgress = (this.ageProgress || 0) + deltaTime * yearsPerMs;
      if (this.ageProgress >= 1) {
        const years = Math.floor(this.ageProgress);
        this.age += years;
        this.ageProgress -= years;
      }
    }

    if (this.needInterruptCooldown > 0) {
      this.needInterruptCooldown = Math.max(0, this.needInterruptCooldown - deltaTime);
    }

    // Update needs
    this.updateNeeds(deltaTime, villagers);

    // Update status based on needs
    this.updateStatus(villagers);

    // Update movement
    this.updateMovement(deltaTime, world);

    // Update animation
    this.updateAnimation(deltaTime);

    // Update speech bubble
    this.updateSpeechBubble(deltaTime);

    // Update activity duration
    if (this.activityDuration > 0) {
      this.activityDuration -= deltaTime;
      if (this.activityDuration <= 0) {
        this.status = CONSTANTS.ACTIVITY.IDLE;
        this.activity = 'Idle';
        this.activityDuration = 0;
      }
    }

    // Update mood based on needs and relationships
    this.updateMood();

    // Update life stage
    const newStage = Utils.getLifeStage(this.age);
    if (newStage.name !== this.lifeStage.name) {
      this.lifeStage = newStage;
      this.title = this.determineTitle();
      return { type: 'life_stage_change', villager: this };
    }

    return null;
  }

  updateNeeds(deltaTime, villagers = []) {
    // Decay rates per game hour
    const hourFraction = deltaTime / (game?.timeState?.hourDuration || 600); // Assuming 10 min per hour
    const isEatingOrDrinking =
      this.status === CONSTANTS.ACTIVITY.EATING ||
      this.status === CONSTANTS.ACTIVITY.DRINKING;
    const isResting =
      this.status === CONSTANTS.ACTIVITY.SLEEPING ||
      this.status === CONSTANTS.ACTIVITY.RESTING;

    if (!isResting) {
      this.energy = Math.max(0, this.energy - CONSTANTS.NEED.REST_DECAY * hourFraction);
      // Exempt eating/drinking from hunger/thirst decay (avoid double-hit while recovering)
      if (!isEatingOrDrinking) {
        this.hunger = Math.max(0, this.hunger - CONSTANTS.NEED.HUNGER_DECAY * hourFraction);
        this.thirst = Math.max(0, this.thirst - CONSTANTS.NEED.THIRST_DECAY * hourFraction);
      }
    } else {
      // Recover energy while resting
      this.energy = Math.min(100, this.energy + 20 * hourFraction);
    }

    // Social restores only while chatting in range; sleeping no longer fills the bar
    const socialPartner = this.getNearbySocialPartner(villagers);
    if (this.status === CONSTANTS.ACTIVITY.SOCIALIZING && socialPartner) {
      const recovery = CONSTANTS.NEED.SOCIAL_RECOVERY || 28;
      this.socialNeed = Math.min(100, this.socialNeed + recovery * hourFraction);
      if (!this.socialPartnerId) this.socialPartnerId = socialPartner.id;
    } else if (isResting) {
      this.socialNeed = Math.max(0, this.socialNeed - CONSTANTS.NEED.SOCIAL_DECAY * 0.25 * hourFraction);
    } else {
      this.socialNeed = Math.max(0, this.socialNeed - CONSTANTS.NEED.SOCIAL_DECAY * hourFraction);
    }

    // Recover hunger when eating. Food is consumed in small portions so eating
    // cannot heal hunger for free.
    if (this.status === CONSTANTS.ACTIVITY.EATING && game?.getResources) {
      const resources = game.getResources(this.villageId);
      if ((resources.food || 0) > 0) {
        const hungerBefore = this.hunger;
        const hungerGain = Math.min(100 - this.hunger, 35 * hourFraction);
        const foodNeeded = hungerGain / 25;
        const foodUsed = Math.min(resources.food, foodNeeded);
        resources.food = Math.max(0, resources.food - foodUsed);
        this.hunger = Math.min(100, hungerBefore + foodUsed * 25);
      }
    }

    if (this.status === CONSTANTS.ACTIVITY.DRINKING && game?.getResources) {
      const resources = game.getResources(this.villageId);
      if ((resources.water || 0) > 0) {
        const thirstBefore = this.thirst;
        const thirstGain = Math.min(100 - this.thirst, 45 * hourFraction);
        const waterNeeded = thirstGain / 35;
        const waterUsed = Math.min(resources.water, waterNeeded);
        resources.water = Math.max(0, resources.water - waterUsed);
        this.thirst = Math.min(100, thirstBefore + waterUsed * 35);
      }
    }

    // Health effects
    if (this.hunger <= 0 || this.thirst <= 0 || this.energy <= 0) {
      this.health = Math.max(0, this.health - 5 * hourFraction);
      if (this.health <= 0 && !this.causeOfDeath) {
        if (this.hunger <= 0 && this.thirst <= 0) {
          this.causeOfDeath = 'perished from starvation and dehydration';
        } else if (this.hunger <= 0) {
          this.causeOfDeath = 'perished from starvation';
        } else if (this.thirst <= 0) {
          this.causeOfDeath = 'perished from dehydration';
        } else if (this.energy <= 0) {
          this.causeOfDeath = 'succumbed to exhaustion';
        }
      }
    }

    // Natural health recovery
    if (this.hunger > 50 && this.thirst > 50 && this.energy > 50 && this.health < 100) {
      this.health = Math.min(100, this.health + 1 * hourFraction);
    }

    if (this.health < 60 && this.hunger > 20 && this.thirst > 20 && game?.getResources) {
      const resources = game.getResources(this.villageId);
      if ((resources.herbs || 0) > 0) {
        const healthGain = Math.min(100 - this.health, 8 * hourFraction);
        const herbsNeeded = healthGain / 20;
        const herbsUsed = Math.min(resources.herbs, herbsNeeded);
        resources.herbs = Math.max(0, resources.herbs - herbsUsed);
        this.health = Math.min(100, this.health + herbsUsed * 20);
      }
    }
  }

  updateStatus(villagers = []) {
    // Determine status based on needs
    if (this.health <= 0) {
      this.status = CONSTANTS.ACTIVITY.IDLE; // Death handled elsewhere
      return;
    }

    if (this.status === CONSTANTS.ACTIVITY.DRINKING && this.thirst >= 85) {
      this.status = CONSTANTS.ACTIVITY.IDLE;
      this.activity = 'Idle';
    }

    if (this.status === CONSTANTS.ACTIVITY.EATING && this.hunger >= 85) {
      this.status = CONSTANTS.ACTIVITY.IDLE;
      this.activity = 'Idle';
    }

    const socialSatisfied = CONSTANTS.NEED.SOCIAL_SATISFIED || 75;
    if (this.status === CONSTANTS.ACTIVITY.SOCIALIZING && this.socialNeed >= socialSatisfied) {
      this.status = CONSTANTS.ACTIVITY.IDLE;
      this.activity = 'Idle';
      this.socialPartnerId = null;
    }

    const criticalHunger = this.hunger < 25;
    const criticalThirst = this.thirst < 25;

    // Keep scouts on mission unless they are starving or collapsing
    if (this.isScouting && !criticalHunger && !criticalThirst && this.energy >= 20) {
      this.status = CONSTANTS.ACTIVITY.SCOUTING;
      return;
    }
    const busyWorkStatuses = [
      CONSTANTS.ACTIVITY.WORKING,
      CONSTANTS.ACTIVITY.GATHERING,
      CONSTANTS.ACTIVITY.BUILDING,
      CONSTANTS.ACTIVITY.FARMING,
      CONSTANTS.ACTIVITY.HUNTING,
      CONSTANTS.ACTIVITY.FISHING,
      CONSTANTS.ACTIVITY.SOCIALIZING,
      CONSTANTS.ACTIVITY.RITUAL,
      CONSTANTS.ACTIVITY.SCOUTING
    ];
    const midDurationWork = this.activityDuration > 0 && busyWorkStatuses.includes(this.status);

    // Don't clobber mid-duration LLM/work unless critically hungry/thirsty
    if (midDurationWork && !criticalHunger && !criticalThirst) {
      return;
    }

    // Cooldown after interrupting LLM work for needs
    if (this.needInterruptCooldown > 0 && !criticalHunger && !criticalThirst) {
      return;
    }

    const resources = game?.getResources?.(this.villageId) || game?.resources || {};

    if (this.thirst < 70 && (resources.water || 0) > 0) {
      if (midDurationWork) this.needInterruptCooldown = 30000;
      this.status = CONSTANTS.ACTIVITY.DRINKING;
      this.activity = 'Drinking from village water stores';
      return;
    }

    if (this.hunger < 65 && (resources.food || 0) > 0) {
      if (midDurationWork) this.needInterruptCooldown = 30000;
      this.status = CONSTANTS.ACTIVITY.EATING;
      this.activity = 'Eating from the village stores';
      return;
    }

    if (this.energy < 20) {
      if (midDurationWork) this.needInterruptCooldown = 30000;
      this.status = CONSTANTS.ACTIVITY.RESTING;
      this.activity = 'Exhausted, needs rest';
      return;
    }

    if (this.thirst < 20) {
      if (midDurationWork) this.needInterruptCooldown = 30000;
      this.status = CONSTANTS.ACTIVITY.GATHERING;
      this.activity = 'Very thirsty, seeking water';
      return;
    }

    if (this.hunger < 20) {
      if (midDurationWork) this.needInterruptCooldown = 30000;
      this.status = CONSTANTS.ACTIVITY.GATHERING;
      this.activity = 'Very hungry, seeking food';
      return;
    }

    const lonelyThreshold = CONSTANTS.NEED.SOCIAL_LONELY || 20;
    const seekThreshold = CONSTANTS.NEED.SOCIAL_SEEK || 40;
    const sociable = this.personality?.sociable ?? 50;
    const lonely = this.socialNeed < lonelyThreshold ||
      (this.socialNeed < seekThreshold && sociable > 50);

    if (this.isScouting) return;

    if (lonely) {
      // Stay in an in-progress meetup instead of repathing every tick (the social loop)
      if (this.status === CONSTANTS.ACTIVITY.SOCIALIZING) {
        const partner = this.getAssignedSocialPartner(villagers);
        if (this.isMoving || this.getNearbySocialPartner(villagers)) return;
        if (partner?.isMoving && partner.socialPartnerId === this.id) return;
      }
      if (game?.beginSocializing) {
        game.beginSocializing(this);
      } else {
        this.status = CONSTANTS.ACTIVITY.SOCIALIZING;
        this.activity = 'Feeling lonely, seeking company';
      }
      return;
    }
  }

  updateMovement(deltaTime, world) {
    if (world && !world.isWalkable(Math.round(this.x), Math.round(this.y))) {
      const safeTile = world.getWalkableTileNear(this.x, this.y, 4);
      if (safeTile) {
        this.x = safeTile.x;
        this.y = safeTile.y;
      }
      this.stopMoving();
      return;
    }

    // Throttled observation + locality while alive on the map
    this.maybeObserveAndLocalize(deltaTime);

    // Natural wandering behavior when idle or after reaching destination
    if (!this.isMoving) {
      if (this.isScouting || this.isNeedLockedActivity()) return;
      this.wanderTimer += deltaTime;
      if (this.wanderTimer >= this.wanderInterval) {
        this.wanderTimer = 0;
        // Decide to wander
        if (Math.random() < 0.3 && this.energy > 30) { // 30% chance, only if not tired
          this.startWandering(world);
        }
      }
      return;
    }

    // Move along path
    if (this.path.length > 0) {
      const target = this.path[0];
      const blocked = world && (
        !world.isWalkable(target.x, target.y)
        || (game?.canVillagerEnterTerritory && !game.canVillagerEnterTerritory(this, target.x, target.y))
      );
      if (blocked) {
        // Single repath toward the same goal before giving up
        if (this._repathAttempts < 1 && world?.getPath) {
          this._repathAttempts += 1;
          const retried = world.getPath(
            Math.round(this.x), Math.round(this.y),
            this.targetX, this.targetY,
            {
              canEnterTile: (tx, ty) => !game?.canVillagerEnterTerritory
                || game.canVillagerEnterTerritory(this, tx, ty)
            }
          );
          if (retried && retried.length > 0) {
            this.path = retried;
            return;
          }
        }
        this.stopMoving();
        return;
      }

      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.15) {
        // Reached waypoint
        this.path.shift();
        if (this.path.length === 0) {
          this.isMoving = false;
          this.x = target.x;
          this.y = target.y;
          this.onReachedDestination();
          if (!this.isNeedLockedActivity()) {
            this.status = CONSTANTS.ACTIVITY.IDLE;
          }
          return;
        }
      } else {
        // Move towards waypoint
        const speed = this.speed * deltaTime / 100;
        const adjustedSpeed = this.lifeStage === CONSTANTS.LIFE_STAGE.ELDER ? speed * 0.7 : speed;
        const nextX = this.x + (dx / dist) * adjustedSpeed;
        const nextY = this.y + (dy / dist) * adjustedSpeed;
        if (world && !world.isWalkable(Math.round(nextX), Math.round(nextY))) {
          this.stopMoving();
          return;
        }

        this.x = nextX;
        this.y = nextY;

        // Update direction
        if (Math.abs(dx) > Math.abs(dy)) {
          this.direction = dx > 0 ? 'east' : 'west';
        } else {
          this.direction = dy > 0 ? 'south' : 'north';
        }
      }
    } else {
      this.isMoving = false;
    }
  }

  /** Observe surroundings on an interval and refresh locality when the tile changes. */
  maybeObserveAndLocalize(deltaTime) {
    const pm = game?.placeMemory;
    if (!pm) return;
    const now = (this._lastObserveAt || 0) + deltaTime;
    this._lastObserveAt = now;
    const interval = CONSTANTS.PLACE_MEMORY?.OBSERVE_INTERVAL_MS || 1500;
    if (now >= interval) {
      this._lastObserveAt = 0;
      pm.observeSurroundings(this);
    }
    const tile = { x: Math.round(this.x), y: Math.round(this.y) };
    const last = this._lastLocalityTile;
    const step = CONSTANTS.PLACE_MEMORY?.LOCALITY_UPDATE_TILES || 2;
    if (!last || Utils.distance(tile.x, tile.y, last.x, last.y) >= step) {
      pm.updateLocality(this);
    }
  }

  /** Confirm pending place memory when a path completes. */
  onReachedDestination() {
    const pm = game?.placeMemory;
    if (!pm) return;
    pm.observeSurroundings(this);
    if (this._pendingPlaceTarget) {
      pm.confirmArrival(this, this._pendingPlaceTarget);
      this._pendingPlaceTarget = null;
    }
    pm.updateLocality(this);
  }

  startWandering(world) {
    if (this.isScouting) return;

    const village = game?.getVillage?.(this.villageId);
    const anchor = village?.center || { x: Math.round(this.x), y: Math.round(this.y) };
    const territoryRadius = village?.territoryRadius || CONSTANTS.VILLAGE.DEFAULT_RADIUS;
    const curious = (this.personality?.curious || 0) >= (CONSTANTS.EXPLORATION?.CURIOUS_THRESHOLD || 55);
    const exploreWilderness = curious &&
      this.energy > 40 &&
      Math.random() < (CONSTANTS.EXPLORATION?.WILDERNESS_WANDER_CHANCE || 0.28);

    for (let attempt = 0; attempt < 12; attempt++) {
      const extraRange = CONSTANTS.EXPLORATION?.WILDERNESS_WANDER_RANGE || 10;
      const maxRadius = exploreWilderness ? territoryRadius + extraRange : Math.max(3, territoryRadius - 1);
      const minRadius = exploreWilderness ? Math.max(3, territoryRadius - 1) : 2;
      const radius = minRadius + Math.random() * Math.max(1, maxRadius - minRadius);
      const angle = Math.random() * Math.PI * 2;
      const tx = Math.round(anchor.x + Math.cos(angle) * radius);
      const ty = Math.round(anchor.y + Math.sin(angle) * radius);
      const tile = world.getWalkableTileNear(tx, ty, 2);
      if (!tile) continue;
      if (!exploreWilderness && village && !village.isInTerritory(tile.x, tile.y)) continue;
      if (game?.canVillagerEnterTerritory && !game.canVillagerEnterTerritory(this, tile.x, tile.y)) continue;
      if (this.moveTo(tile.x, tile.y, world)) {
        if (exploreWilderness && village && !village.isInTerritory(tile.x, tile.y)) {
          this.activity = 'Exploring the wilds';
          this.showSpeechBubble('🔭', 'Exploring', 3000);
        }
        return;
      }
    }

    // Fallback: stay near village center
    if (village) {
      this.moveTo(
        village.center.x + Utils.randomFloat(-1.5, 1.5),
        village.center.y + Utils.randomFloat(-1.5, 1.5),
        world
      );
    }
  }

  updateAnimation(deltaTime) {
    this.animTimer += deltaTime;
    if (this.animTimer > 200) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 4;
    }
  }

  updateSpeechBubble(deltaTime) {
    if (this.speechBubbleTimer > 0) {
      this.speechBubbleTimer -= deltaTime;
      if (this.speechBubbleTimer <= 0) {
        this.speechBubble = null;
      }
    }
  }

  isNeedLockedActivity(status = this.status) {
    if (this.isScouting) return true;
    return [
      CONSTANTS.ACTIVITY.EATING,
      CONSTANTS.ACTIVITY.DRINKING,
      CONSTANTS.ACTIVITY.SLEEPING,
      CONSTANTS.ACTIVITY.RESTING,
      CONSTANTS.ACTIVITY.SOCIALIZING,
      CONSTANTS.ACTIVITY.RITUAL,
      CONSTANTS.ACTIVITY.SCOUTING
    ].includes(status);
  }

  getSocialRange() {
    return CONSTANTS.INTERACTION.SOCIAL_RANGE || CONSTANTS.INTERACTION.PROXIMITY_REQUIRED || 4;
  }

  isWithinSocialRange(other) {
    if (!other) return false;
    return Utils.distance(this.x, this.y, other.x, other.y) <= this.getSocialRange();
  }

  getAssignedSocialPartner(villagers = []) {
    if (!this.socialPartnerId) return null;
    return villagers.find(other => other.id === this.socialPartnerId && other.health > 0) || null;
  }

  getNearbySocialPartner(villagers = []) {
    const assigned = this.getAssignedSocialPartner(villagers);
    const host = (typeof game !== 'undefined' ? game : globalThis.game) || null;
    const canSocialize = (other) => !host?.canVillagersSocialize || host.canVillagersSocialize(this, other);
    if (assigned && this.isWithinSocialRange(assigned) && canSocialize(assigned)) {
      return assigned;
    }

    return villagers.find(other =>
      other.id !== this.id &&
      other.health > 0 &&
      this.isWithinSocialRange(other) &&
      canSocialize(other) &&
      (other.status === CONSTANTS.ACTIVITY.SOCIALIZING || other.socialPartnerId === this.id)
    ) || null;
  }

  updateMood() {
    // Base mood from needs
    let mood = 50;

    // Hunger contribution
    mood += (this.hunger - 50) * 0.3;

    // Thirst contribution
    mood += (this.thirst - 50) * 0.25;

    // Energy contribution
    mood += (this.energy - 50) * 0.2;

    // Social contribution — isolation should visibly depress mood
    mood += (this.socialNeed - 50) * 0.35;
    if (this.socialNeed < 35) {
      const isolation = 35 - this.socialNeed;
      const sociableFactor = 0.85 + ((this.personality?.sociable || 50) / 100) * 0.7;
      mood -= isolation * 1.15 * sociableFactor;
    }

    // Relationship contribution: top-K positives + rival/enemy average (Phase 4)
    mood += this.computeRelationshipMoodContribution();

    // Personality modifier
    if (this.personality.confident > 70) mood += 5;
    if (this.personality.confident < 30) mood -= 5;

    // Apply wisdom bonus for elders
    if (this.lifeStage === CONSTANTS.LIFE_STAGE.ELDER) {
      mood += 10;
    }

    // Season modifier
    if (game?.timeState?.season) {
      mood += game.timeState.season.moodMod * 0.1;
    }

    this.mood = Utils.clamp(Math.round(mood), -100, 100);
  }

  /**
   * Mood from strong bonds (top K) and rivals/enemies — not flat average of all.
   * @returns {number}
   */
  computeRelationshipMoodContribution() {
    const scores = Object.values(this.relationships || {});
    if (scores.length === 0) return 0;

    const R = CONSTANTS.RELATIONSHIP || {};
    const k = R.MOOD_REL_TOP_K ?? 3;
    const posW = R.MOOD_REL_POS_WEIGHT ?? 0.12;
    const negW = R.MOOD_REL_NEG_WEIGHT ?? 0.15;
    const rivalThresh = R.RIVAL_THRESHOLD ?? -25;
    const weights = [0.5, 0.3, 0.2];

    const sorted = scores.slice().sort((a, b) => b - a);
    const top = sorted.slice(0, k);
    let positive = 0;
    top.forEach((score, i) => {
      positive += score * (weights[i] ?? 0.1);
    });

    const negatives = scores.filter(s => s <= rivalThresh);
    const negativeAvg = negatives.length
      ? negatives.reduce((a, b) => a + b, 0) / negatives.length
      : 0;

    return positive * posW + negativeAvg * negW;
  }

  /**
   * Record meaningful social contact with another villager.
   * @param {string} otherId
   * @param {number} day
   */
  recordSocialContact(otherId, day) {
    if (!otherId) return;
    if (!this.lastSocialContact) this.lastSocialContact = {};
    this.lastSocialContact[otherId] = day;
  }

  moveTo(x, y, world, options = {}) {
    let destination = world.getWalkableTileNear(x, y, 3);
    if (!destination) return false;

    if (!options.allowCrossTerritory && game?.canVillagerEnterTerritory && !game.canVillagerEnterTerritory(this, destination.x, destination.y)) {
      const village = game.getVillage?.(this.villageId);
      if (!village) return false;

      // Prefer the village center first so redirects stay inside territory reliably
      destination = world.getWalkableTileNear(village.center.x, village.center.y, 3);
      if (!destination || !village.isInTerritory(destination.x, destination.y)) {
        destination = world.getWalkableTileNear(
          village.center.x + Utils.randomFloat(-2, 2),
          village.center.y + Utils.randomFloat(-2, 2),
          3
        );
      }
      if (!destination || !village.isInTerritory(destination.x, destination.y)) return false;
    }

    // Already standing on the allowed tile — treat as a successful stay/redirect
    if (Math.round(this.x) === destination.x && Math.round(this.y) === destination.y) {
      this.path = [];
      this.isMoving = false;
      this.targetX = destination.x;
      this.targetY = destination.y;
      return true;
    }

    // Territory-aware path: avoid closed foreign tiles unless explicitly allowed
    const pathOptions = {
      canEnterTile: (tx, ty) => {
        if (options.allowCrossTerritory) return true;
        if (!game?.canVillagerEnterTerritory) return true;
        return game.canVillagerEnterTerritory(this, tx, ty);
      }
    };
    const path = world.getPath(
      Math.round(this.x), Math.round(this.y),
      destination.x, destination.y,
      pathOptions
    );
    if (path && path.length > 0) {
      this.path = path;
      this.isMoving = true;
      this.targetX = destination.x;
      this.targetY = destination.y;
      this._repathAttempts = 0;
      if (options.placeEntry) this._pendingPlaceTarget = options.placeEntry;
      if (!this.isNeedLockedActivity()) {
        this.status = CONSTANTS.ACTIVITY.WORKING; // Moving for a purpose
      }
      return true;
    }
    return false;
  }

  stopMoving() {
    this.path = [];
    this.isMoving = false;
  }

  showSpeechBubble(emoji, theme, duration = 5000) {
    this.speechBubble = { emoji, theme };
    this.speechBubbleTimer = duration;
  }

  addInteraction(type, targetName, description) {
    this.interactionLog.unshift({
      type,
      target: targetName,
      description,
      day: game?.timeState?.day || 1,
      time: game?.timeState?.hours || 0
    });

    // Keep only last 10 interactions
    if (this.interactionLog.length > 10) {
      this.interactionLog.pop();
    }
  }

  resolveRelationshipKey(targetNameOrId) {
    if (targetNameOrId == null) return null;
    if (this.relationships[targetNameOrId] !== undefined) return targetNameOrId;

    const other = typeof targetNameOrId === 'object'
      ? targetNameOrId
      : game?.villagers?.find(v => v.id === targetNameOrId || v.name === targetNameOrId);

    if (other) {
      if (this.relationships[other.id] !== undefined) return other.id;
      if (this.relationships[other.name] !== undefined) return other.name;
      return other.id;
    }
    return targetNameOrId;
  }

  getRelationship(other) {
    if (!other) return 0;
    const key = this.resolveRelationshipKey(
      typeof other === 'object' ? other.id || other.name : other
    );
    if (key != null && this.relationships[key] !== undefined) {
      return this.relationships[key];
    }
    if (typeof other === 'object') {
      if (this.relationships[other.id] !== undefined) return this.relationships[other.id];
      if (this.relationships[other.name] !== undefined) return this.relationships[other.name];
    }
    return 0;
  }

  getRelationshipDisplayName(key) {
    const byId = game?.villagers?.find(v => v.id === key);
    if (byId) return byId.name;
    return key;
  }

  modifyRelationship(targetNameOrId, delta) {
    // Directed: updates how THIS villager feels about the target
    const other = typeof targetNameOrId === 'object'
      ? targetNameOrId
      : game?.villagers?.find(v => v.id === targetNameOrId || v.name === targetNameOrId);

    let key = targetNameOrId;
    if (other) {
      key = other.id;
      // Migrate legacy name-keyed score to id
      if (this.relationships[other.name] !== undefined && this.relationships[other.id] === undefined) {
        this.relationships[other.id] = this.relationships[other.name];
        delete this.relationships[other.name];
      }
    } else {
      key = this.resolveRelationshipKey(targetNameOrId);
    }

    const current = this.relationships[key] || 0;
    this.relationships[key] = Utils.clamp(current + delta, CONSTANTS.RELATIONSHIP.MIN, CONSTANTS.RELATIONSHIP.MAX);
  }

  getRelationshipType(otherScore) {
    if (otherScore >= CONSTANTS.RELATIONSHIP.SOULMATE_THRESHOLD) return 'Soulmate';
    if (otherScore >= CONSTANTS.RELATIONSHIP.BEST_FRIEND_THRESHOLD) return 'Best Friend';
    if (otherScore >= CONSTANTS.RELATIONSHIP.FRIEND_THRESHOLD) return 'Friend';
    if (otherScore <= CONSTANTS.RELATIONSHIP.ENEMY_THRESHOLD) return 'Enemy';
    if (otherScore <= CONSTANTS.RELATIONSHIP.RIVAL_THRESHOLD) return 'Rival';
    return 'Acquaintance';
  }

  applyAction(action) {
    if (!action) return;
    if (game?.sanitizeVillagerAction) {
      action = game.sanitizeVillagerAction(action);
    }

    this.currentAction = action;

    if (action.action) {
      this.status = action.action;
    }

    if (action.duration) {
      this.activityDuration = action.duration * 60; // Convert minutes to game seconds
    }

    if (action.speechEmoji) {
      this.showSpeechBubble(action.speechEmoji, action.speechTheme || '');
    }

    if (action.interactionTarget) {
      this.addInteraction(
        action.interactionType || 'talk',
        action.interactionTarget,
        action.speechTheme || 'Had a conversation'
      );
    }

    // Update activity description
    const activityDescriptions = {
      idle: 'Standing idle',
      working: 'Working',
      gathering: 'Gathering resources',
      building: 'Constructing something',
      farming: 'Working in the fields',
      hunting: 'Hunting',
      fishing: 'Fishing',
      socializing: 'Chatting with others',
      sleeping: 'Sleeping',
      eating: 'Eating',
      drinking: 'Drinking',
      resting: 'Resting',
      ritual: 'Participating in ritual',
      scouting: 'Scouting the wilds'
    };

    this.activity = activityDescriptions[action.action] || action.action;
    if (action.speechTheme) {
      this.activity += `: "${Utils.truncate(action.speechTheme, 30)}"`;
    }
  }

  updateGoalProgress(goalType, targetName, amount = 1) {
    this.goals.forEach(goal => {
      if (goal.type === goalType && !goal.completed && !goal.failed) {
        // Check if this progress matches the goal
        if (goal.target === targetName || goal.type === 'survival') {
          goal.progress = Math.min(100, goal.progress + amount);
        }
      }
    });
  }

  // Generate sprite data for rendering
  getSpriteData() {
    return {
      x: this.x,
      y: this.y,
      direction: this.direction,
      isMoving: this.isMoving,
      animFrame: this.animFrame,
      isChieftan: this.isChieftan,
      lifeStage: this.lifeStage.name,
      skinTone: this.skinTone,
      hairColor: this.hairColor,
      spriteVariant: this.spriteVariant
    };
  }

  // Serialize for saving
  serialize() {
    return {
      id: this.id,
      name: this.name,
      age: this.age,
      gender: this.gender,
      x: this.x,
      y: this.y,
      personality: this.personality,
      skills: this.skills,
      health: this.health,
      hunger: this.hunger,
      thirst: this.thirst,
      energy: this.energy,
      socialNeed: this.socialNeed,
      mood: this.mood,
      causeOfDeath: this.causeOfDeath,
      status: this.status,
      activity: this.activity,
      activityDuration: this.activityDuration,
      socialPartnerId: this.socialPartnerId,
      ageProgress: this.ageProgress,
      needInterruptCooldown: this.needInterruptCooldown,
      relationships: this.relationships,
      partnerId: this.partnerId,
      partnerName: this.partnerName,
      parentIds: this.parentIds,
      parentNames: this.parentNames,
      childrenIds: this.childrenIds,
      childrenNames: this.childrenNames,
      expectingChild: this.expectingChild,
      lastChildDay: this.lastChildDay,
      lastPartnershipDay: this.lastPartnershipDay,
      affairPartnerId: this.affairPartnerId,
      lastSocialContact: this.lastSocialContact,
      prestige: this.prestige,
      cliqueId: this.cliqueId,
      warTraumaTargets: this.warTraumaTargets,
      isChieftan: this.isChieftan,
      title: this.title,
      villageId: this.villageId,
      backstory: this.backstory,
      goals: this.goals,
      secrets: this.secrets,
      interactionLog: this.interactionLog,
      skinTone: this.skinTone,
      hairColor: this.hairColor,
      spriteVariant: this.spriteVariant,
      isScouting: this.isScouting,
      scoutMission: this.scoutMission,
      knownPlaces: this.knownPlaces || [],
      locality: this.locality || null
    };
  }

  // Create from serialized data
  static deserialize(data) {
    const v = new Villager(data);
    v.lifeStage = Utils.getLifeStage(data.age);
    v.villageId = data.villageId || null;
    return v;
  }
}

// Villager renderer
class VillagerRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    // Cached procedural 16x16 sprites keyed by appearance + pose
    this.spriteCache = new Map();
    this.maxCacheEntries = 256;
  }

  /** Clear sprite cache (e.g. after graphics reset). */
  clearSpriteCache() {
    this.spriteCache.clear();
  }

  /** Fetch or build a cached sprite canvas for the current pose. */
  getCachedSprite(parts) {
    const key = VillagerSpriteFactory.cacheKey(parts);
    if (this.spriteCache.has(key)) return this.spriteCache.get(key);
    const canvas = VillagerSpriteFactory.build(parts);
    if (this.spriteCache.size >= this.maxCacheEntries) {
      const firstKey = this.spriteCache.keys().next().value;
      this.spriteCache.delete(firstKey);
    }
    this.spriteCache.set(key, canvas);
    return canvas;
  }

  render(villager, camera, scale, showSpeechBubbles = true) {
    const ctx = this.ctx;
    const sprite = villager.getSpriteData();

    // Integer screen positions keep pixel art crisp under zoom
    const screenX = Math.floor(sprite.x * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.x);
    const screenY = Math.floor(sprite.y * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.y);

    // Skip if off screen
    if (screenX < -32 || screenX > ctx.canvas.width + 32 ||
        screenY < -32 || screenY > ctx.canvas.height + 32) {
      return;
    }

    // LOD: far zoom draws a tribe-colored diamond instead of full sprite
    if (camera.zoom < 0.65) {
      const village = (typeof game !== 'undefined' ? game : globalThis.game)?.getVillage?.(villager.villageId);
      ctx.fillStyle = village?.getColor?.() || '#e94560';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY - 3);
      ctx.lineTo(screenX + 3, screenY);
      ctx.lineTo(screenX, screenY + 3);
      ctx.lineTo(screenX - 3, screenY);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const clothing = this.getClothingColor(villager);
    const animState = VillagerSpriteFactory.resolveAnimState(villager, sprite);
    const parts = {
      skinTone: sprite.skinTone,
      hairColor: sprite.hairColor,
      clothing,
      lifeStage: sprite.lifeStage,
      isChieftan: sprite.isChieftan,
      direction: sprite.direction || 'south',
      animState,
      animFrame: sprite.animFrame || 0
    };

    const spriteCanvas = this.getCachedSprite(parts);
    let drawSize = 16 * camera.zoom;
    if (sprite.lifeStage === 'Child') drawSize *= 0.75;
    if (sprite.lifeStage === 'Elder') drawSize *= 0.95;
    if (sprite.isChieftan) drawSize *= 1.15;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      spriteCanvas,
      Math.floor(screenX - drawSize / 2),
      Math.floor(screenY - drawSize * 0.85),
      Math.floor(drawSize),
      Math.floor(drawSize)
    );

    // Selection / mood rim when selected
    const host = typeof game !== 'undefined' ? game : globalThis.game;
    if (host?.selectedVillager === villager) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.floor(screenX - drawSize / 2) - 1,
        Math.floor(screenY - drawSize * 0.85) - 1,
        Math.floor(drawSize) + 2,
        Math.floor(drawSize) + 2
      );
    }

    // Draw speech bubble if present
    if (showSpeechBubbles && villager.speechBubble) {
      this.renderSpeechBubble(ctx, villager.speechBubble, screenX, screenY - drawSize * 1.05);
    }
  }

  getClothingColor(villager) {
    const host = typeof game !== 'undefined' ? game : globalThis.game;
    const village = host?.getVillage?.(villager.villageId);
    const tribeTint = village?.getColor?.() || null;

    // Base clothing on title/role
    let baseColor = '#6c5b7b';
    if (villager.isChieftan) baseColor = '#8b4513';
    else if (villager.title.includes('Hunter')) baseColor = '#228b22';
    else if (villager.title.includes('Fisher')) baseColor = '#1e90ff';
    else if (villager.title.includes('Craftsman')) baseColor = '#daa520';
    else if (villager.title.includes('Elder')) baseColor = '#9370db';
    else if (villager.personality.sociable > 70) baseColor = '#ff6b6b';
    else if (villager.personality.active > 70) baseColor = '#f7dc6f';

    if (!tribeTint) return baseColor;
    return this.blendColors(baseColor, tribeTint, 0.35);
  }

  blendColors(colorA, colorB, ratio = 0.5) {
    const parse = (hex) => {
      const value = hex.replace('#', '');
      return [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16)
      ];
    };
    const [r1, g1, b1] = parse(colorA);
    const [r2, g2, b2] = parse(colorB);
    const mix = (a, b) => Math.round(a * (1 - ratio) + b * ratio);
    const r = mix(r1, r2);
    const g = mix(g1, g2);
    const b = mix(b1, b2);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  renderSpeechBubble(ctx, bubble, x, y) {
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bubble background
    const text = bubble.emoji;
    const metrics = ctx.measureText(text);
    const width = Math.max(24, metrics.width + 16);
    const height = 24;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(30, 30, 40, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
    } else {
      ctx.rect(x - width / 2, y - height / 2, width, height);
    }
    ctx.fill();
    ctx.stroke();

    // Bubble pointer
    ctx.beginPath();
    ctx.moveTo(x - 4, y + height / 2);
    ctx.lineTo(x, y + height / 2 + 6);
    ctx.lineTo(x + 4, y + height / 2);
    ctx.fill();

    // Emoji / icon text
    ctx.fillStyle = '#333';
    ctx.fillText(text, x, y);
  }

  // Render villager label (name) with pixel font
  renderLabel(villager, camera, scale, showLabels = true) {
    if (!showLabels) return;

    const ctx = this.ctx;
    const screenX = Math.floor(villager.x * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.x);
    const screenY = Math.floor(villager.y * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.y);
    const labelY = screenY + Math.floor(18 * camera.zoom);
    const host = typeof game !== 'undefined' ? game : globalThis.game;
    const color = villager.isChieftan
      ? '#ffd700'
      : (host?.getVillage?.(villager.villageId)?.getColor?.() || '#ffffff');

    const text = villager.name;
    const fontScale = Math.max(1, Math.floor(camera.zoom));
    const width = PixelFont.measure(text, fontScale);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(screenX - width / 2 - 3, labelY - 2, width + 6, 5 * fontScale + 4);
    PixelFont.draw(ctx, text, screenX, labelY, { scale: fontScale, color, align: 'center' });
  }
}
