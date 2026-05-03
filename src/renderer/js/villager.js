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

    // Relationships
    this.relationships = data.relationships || {}; // { villagerName: score }
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

    // Life stage
    this.lifeStage = Utils.getLifeStage(this.age);

    // Roles
    this.isChieftan = data.isChieftan || false;
    this.title = data.title || this.determineTitle();
    this.villageId = data.villageId || null;

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
    // Update age (1 year per 90 days)
    // Not doing continuous aging, just stage transitions

    // Update needs
    this.updateNeeds(deltaTime);

    // Update status based on needs
    this.updateStatus();

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

  updateNeeds(deltaTime) {
    // Decay rates per game hour
    const hourFraction = deltaTime / (game?.timeState?.hourDuration || 600); // Assuming 10 min per hour

    if (this.status !== CONSTANTS.ACTIVITY.SLEEPING && this.status !== CONSTANTS.ACTIVITY.RESTING) {
      this.energy = Math.max(0, this.energy - CONSTANTS.NEED.REST_DECAY * hourFraction);
      this.hunger = Math.max(0, this.hunger - CONSTANTS.NEED.HUNGER_DECAY * hourFraction);
      this.thirst = Math.max(0, this.thirst - CONSTANTS.NEED.THIRST_DECAY * hourFraction);
      this.socialNeed = Math.max(0, this.socialNeed - CONSTANTS.NEED.SOCIAL_DECAY * hourFraction);
    } else {
      // Recover energy while resting
      this.energy = Math.min(100, this.energy + 20 * hourFraction);
      this.socialNeed = Math.min(100, this.socialNeed + 5 * hourFraction);
    }

    // Recover hunger when eating. Food is consumed in small portions so eating
    // cannot heal hunger for free.
    if (this.status === CONSTANTS.ACTIVITY.EATING && game?.resources?.food > 0) {
      const hungerBefore = this.hunger;
      const hungerGain = Math.min(100 - this.hunger, 35 * hourFraction);
      const foodNeeded = hungerGain / 25;
      const foodUsed = Math.min(game.resources.food, foodNeeded);
      game.resources.food = Math.max(0, game.resources.food - foodUsed);
      this.hunger = Math.min(100, hungerBefore + foodUsed * 25);
    }

    if (this.status === CONSTANTS.ACTIVITY.DRINKING && game?.resources?.water > 0) {
      const thirstBefore = this.thirst;
      const thirstGain = Math.min(100 - this.thirst, 45 * hourFraction);
      const waterNeeded = thirstGain / 35;
      const waterUsed = Math.min(game.resources.water, waterNeeded);
      game.resources.water = Math.max(0, game.resources.water - waterUsed);
      this.thirst = Math.min(100, thirstBefore + waterUsed * 35);
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

    if (this.health < 60 && this.hunger > 20 && this.thirst > 20 && game?.resources?.herbs > 0) {
      const healthGain = Math.min(100 - this.health, 8 * hourFraction);
      const herbsNeeded = healthGain / 20;
      const herbsUsed = Math.min(game.resources.herbs, herbsNeeded);
      game.resources.herbs = Math.max(0, game.resources.herbs - herbsUsed);
      this.health = Math.min(100, this.health + herbsUsed * 20);
    }
  }

  updateStatus() {
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

    if (this.thirst < 70 && game?.resources?.water > 0) {
      this.status = CONSTANTS.ACTIVITY.DRINKING;
      this.activity = 'Drinking from village water stores';
      return;
    }

    if (this.hunger < 65 && game?.resources?.food > 0) {
      this.status = CONSTANTS.ACTIVITY.EATING;
      this.activity = 'Eating from the village stores';
      return;
    }

    if (this.energy < 20) {
      this.status = CONSTANTS.ACTIVITY.RESTING;
      this.activity = 'Exhausted, needs rest';
      return;
    }

    if (this.thirst < 20) {
      this.status = CONSTANTS.ACTIVITY.GATHERING;
      this.activity = 'Very thirsty, seeking water';
      return;
    }

    if (this.hunger < 20) {
      this.status = CONSTANTS.ACTIVITY.GATHERING;
      this.activity = 'Very hungry, seeking food';
      return;
    }

    if (this.socialNeed < 20 && this.personality.sociable > 50) {
      this.status = CONSTANTS.ACTIVITY.SOCIALIZING;
      this.activity = 'Feeling lonely, seeking company';
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

    // Natural wandering behavior when idle or after reaching destination
    if (!this.isMoving) {
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
      if (world && !world.isWalkable(target.x, target.y)) {
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
          this.status = CONSTANTS.ACTIVITY.IDLE;
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

  startWandering(world) {
    const cx = Math.round(this.x);
    const cy = Math.round(this.y);

    for (let attempt = 0; attempt < 8; attempt++) {
      const radius = 3 + Math.floor(Math.random() * 3); // 3-5 tiles away
      const angle = Math.random() * Math.PI * 2;
      const tx = Math.round(cx + Math.cos(angle) * radius);
      const ty = Math.round(cy + Math.sin(angle) * radius);
      const tile = world.getWalkableTileNear(tx, ty, 2);
      if (tile && this.moveTo(tile.x, tile.y, world)) {
        return;
      }
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

  updateMood() {
    // Base mood from needs
    let mood = 50;

    // Hunger contribution
    mood += (this.hunger - 50) * 0.3;

    // Thirst contribution
    mood += (this.thirst - 50) * 0.25;

    // Energy contribution
    mood += (this.energy - 50) * 0.2;

    // Social contribution
    mood += (this.socialNeed - 50) * 0.2;

    // Relationship average
    if (Object.keys(this.relationships).length > 0) {
      const relAvg = Object.values(this.relationships).reduce((a, b) => a + b, 0) / Object.values(this.relationships).length;
      mood += relAvg * 0.1;
    }

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

  moveTo(x, y, world) {
    const destination = world.getWalkableTileNear(x, y, 3);
    if (!destination) return false;

    const path = world.getPath(Math.round(this.x), Math.round(this.y), destination.x, destination.y);
    if (path && path.length > 0) {
      this.path = path;
      this.isMoving = true;
      this.targetX = destination.x;
      this.targetY = destination.y;
      this.status = CONSTANTS.ACTIVITY.WORKING; // Moving for a purpose
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

  modifyRelationship(villagerName, delta) {
    const current = this.relationships[villagerName] || 0;
    this.relationships[villagerName] = Utils.clamp(current + delta, CONSTANTS.RELATIONSHIP.MIN, CONSTANTS.RELATIONSHIP.MAX);
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
      ritual: 'Participating in ritual'
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
      isChieftan: this.isChieftan,
      title: this.title,
      villageId: this.villageId,
      backstory: this.backstory,
      goals: this.goals,
      secrets: this.secrets,
      interactionLog: this.interactionLog,
      skinTone: this.skinTone,
      hairColor: this.hairColor,
      spriteVariant: this.spriteVariant
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
    this.spriteCache = new Map();
  }

  render(villager, camera, scale, showSpeechBubbles = true) {
    const ctx = this.ctx;
    const sprite = villager.getSpriteData();

    // Calculate screen position
    const screenX = sprite.x * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.x;
    const screenY = sprite.y * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.y;

    // Skip if off screen
    if (screenX < -32 || screenX > ctx.canvas.width + 32 ||
        screenY < -32 || screenY > ctx.canvas.height + 32) {
      return;
    }

    // Size based on life stage
    let size = 14;
    if (sprite.lifeStage === 'Child') size = 10;
    if (sprite.lifeStage === 'Elder') size = 13;
    if (sprite.isChieftan) size = 16;

    const drawSize = size * camera.zoom;

    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(screenX, screenY + drawSize * 0.4, drawSize * 0.4, drawSize * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body offset for animation
    let bobOffset = 0;
    if (sprite.isMoving) {
      bobOffset = Math.sin(sprite.animFrame * Math.PI / 2) * 2 * camera.zoom;
    }

    // Draw body (simple pixel person)
    ctx.fillStyle = sprite.skinTone;

    // Head
    ctx.fillRect(
      screenX - drawSize * 0.35 + bobOffset,
      screenY - drawSize * 0.8,
      drawSize * 0.7,
      drawSize * 0.5
    );

    // Body
    const bodyColor = this.getClothingColor(villager);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(
      screenX - drawSize * 0.4 + bobOffset,
      screenY - drawSize * 0.3,
      drawSize * 0.8,
      drawSize * 0.5
    );

    // Legs
    ctx.fillStyle = sprite.skinTone;
    const legSpread = sprite.isMoving ? Math.sin(sprite.animFrame * Math.PI / 2) * 3 * camera.zoom : 0;
    ctx.fillRect(
      screenX - drawSize * 0.3 + bobOffset + legSpread,
      screenY + drawSize * 0.2,
      drawSize * 0.25,
      drawSize * 0.25
    );
    ctx.fillRect(
      screenX - drawSize * 0.05 + bobOffset - legSpread,
      screenY + drawSize * 0.2,
      drawSize * 0.25,
      drawSize * 0.25
    );

    // Hair
    ctx.fillStyle = sprite.hairColor;
    ctx.fillRect(
      screenX - drawSize * 0.35 + bobOffset,
      screenY - drawSize * 0.85,
      drawSize * 0.7,
      drawSize * 0.15
    );

    // Chieftan crown/feathers
    if (sprite.isChieftan) {
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(
        screenX - drawSize * 0.4 + bobOffset,
        screenY - drawSize * 1.0,
        drawSize * 0.8,
        drawSize * 0.15
      );
      // Feather plumes
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(
        screenX - drawSize * 0.5 + bobOffset,
        screenY - drawSize * 1.2,
        drawSize * 0.15,
        drawSize * 0.3
      );
      ctx.fillStyle = '#4ecdc4';
      ctx.fillRect(
        screenX - drawSize * 0.1 + bobOffset,
        screenY - drawSize * 1.2,
        drawSize * 0.15,
        drawSize * 0.3
      );
      ctx.fillStyle = '#ffe66d';
      ctx.fillRect(
        screenX + bobOffset,
        screenY - drawSize * 1.2,
        drawSize * 0.15,
        drawSize * 0.3
      );
    }

    // Draw speech bubble if present
    if (showSpeechBubbles && villager.speechBubble) {
      this.renderSpeechBubble(ctx, villager.speechBubble, screenX, screenY - drawSize * 1.3);
    }
  }

  getClothingColor(villager) {
    // Base clothing on title/role
    if (villager.isChieftan) return '#8b4513'; // Brown leather
    if (villager.title.includes('Hunter')) return '#228b22'; // Green
    if (villager.title.includes('Fisher')) return '#1e90ff'; // Blue
    if (villager.title.includes('Craftsman')) return '#daa520'; // Golden
    if (villager.title.includes('Elder')) return '#9370db'; // Purple

    // Base on personality for variety
    if (villager.personality.sociable > 70) return '#ff6b6b'; // Red for outgoing
    if (villager.personality.active > 70) return '#f7dc6f'; // Yellow for active

    return '#6c5b7b'; // Default purple-ish
  }

  renderSpeechBubble(ctx, bubble, x, y) {
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bubble background
    const text = bubble.emoji;
    const metrics = ctx.measureText(text);
    const width = metrics.width + 20;
    const height = 28;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 8);
    ctx.fill();

    // Bubble pointer
    ctx.beginPath();
    ctx.moveTo(x - 4, y + height / 2);
    ctx.lineTo(x, y + height / 2 + 8);
    ctx.lineTo(x + 4, y + height / 2);
    ctx.fill();

    // Emoji
    ctx.fillStyle = '#333';
    ctx.fillText(text, x, y);
  }

  // Render villager label (name)
  renderLabel(villager, camera, scale, showLabels = true) {
    if (!showLabels) return;

    const ctx = this.ctx;
    const screenX = villager.x * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.x;
    const screenY = villager.y * CONSTANTS.WORLD.TILE_SIZE * scale * camera.zoom - camera.y;

    const labelY = screenY + 20 * camera.zoom;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(screenX - 30, labelY - 8, 60, 14);

    // Text
    ctx.font = `${10 * camera.zoom}px Arial`;
    ctx.fillStyle = villager.isChieftan ? '#ffd700' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(villager.name, screenX, labelY);
  }
}
