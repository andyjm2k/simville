// Simville Main Game Module

class Game {
  constructor() {
    this.canvas = null;
    this.world = null;
    this.worldRenderer = null;
    this.villagerRenderer = null;
    this.ui = null;

    this.villagers = [];
    this.resources = this.getDefaultResources();
    this.constructionProjects = [];
    this.government = this.createDefaultGovernment();

    this.timeState = {
      day: 1,
      hours: 6.0,
      season: CONSTANTS.SEASON.WET,
      dayInSeason: 1,
      hourDuration: 10000, // ms per game hour
      dayDuration: 0
    };

    this.simSpeed = 1;
    this.paused = true;
    this.lastTick = 0;
    this.tickAccumulator = 0;
    this.tickInterval = 5000; // LLM tick every 5 seconds
    this.tickCount = 0; // Track total ticks for chronicle generation
    this.isGeneratingActions = false;
    this.lastAutoSaveDay = 0;
    this.survivalAccumulator = 0;
    this.survivalInterval = 2000;
    this.constructionAccumulator = 0;
    this.constructionInterval = 1000;
    this.goalAccumulator = 0;
    this.goalInterval = 6000;
    this.techDecisionAccumulator = 0;
    this.techDecisionInterval = 30000; // Ask LLM about tech research every 30 seconds

    this.chronicle = {
      legendary: [],
      entries: [],
      stats: {
        births: 0,
        deaths: 0,
        structuresBuilt: 0,
        marriages: 0
      }
    };

    // Technology research state
    this.techState = {
      researched: [],
      currentResearch: null,
      researchSpeed: 1
    };

    this.graphicsSettings = {
      showLabels: true,
      showSpeechBubbles: true,
      lighting: true,
      particles: true
    };

    this.selectedVillager = null;
    this.isDragging = false;
    this.lastMousePos = { x: 0, y: 0 };
    this.cameraTarget = null; // Villager to track with camera

    // Event queue for chronicle
    this.eventQueue = [];
  }

  async initialize() {
    // Initialize LLM
    await llm.initialize();

    // Initialize UI
    this.ui = new UIManager();
    this.ui.initialize();

    // Get canvas
    this.canvas = document.getElementById('game-canvas');
    this.worldRenderer = new WorldRenderer(this.canvas, null);
    this.villagerRenderer = new VillagerRenderer(this.canvas.getContext('2d'));

    // Set up canvas events
    this.setupCanvasEvents();

    // Set up menu events from main process
    this.setupMenuEvents();

    // Handle resize
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();

    // Try to load config for graphics settings
    await this.loadConfigSettings();

    // Start with new world
    console.log('initialize: Before newWorld');
    this.newWorld();
    console.log('initialize: After newWorld, villagers:', this.villagers.length);

    // Start game loop
    this.lastTick = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  async loadConfigSettings() {
    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.getAllConfig();
        if (config.graphics) {
          this.graphicsSettings = { ...this.graphicsSettings, ...config.graphics };
        }
        if (config.simulation) {
          this.timeState.hourDuration = (config.simulation.dayLengthMinutes * 60 * 1000) / 24;
          this.timeState.dayDuration = config.simulation.dayLengthMinutes * 60 * 1000;
        }
      } else {
        const config = Utils.loadFromStorage('config');
        if (config?.graphics) {
          this.graphicsSettings = { ...this.graphicsSettings, ...config.graphics };
        }
        if (config?.simulation) {
          this.timeState.hourDuration = (config.simulation.dayLengthMinutes * 60 * 1000) / 24;
          this.timeState.dayDuration = config.simulation.dayLengthMinutes * 60 * 1000;
        }
      }
    } catch (e) {
      console.warn('Could not load config settings:', e);
    }
  }

  setupCanvasEvents() {
    // Mouse drag for panning
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        this.worldRenderer.pan(dx, dy);
        this.lastMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    // Click for selecting villagers
    this.canvas.addEventListener('click', (e) => {
      if (this.isDragging) return;

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldPos = this.worldRenderer.screenToWorld(x, y);

      // Find villager at position
      const clickedVillager = this.villagers.find(v => {
        const dist = Utils.distance(v.x, v.y, worldPos.x, worldPos.y);
        return dist < 0.5;
      });

      if (clickedVillager) {
        this.selectedVillager = clickedVillager;
        // Zoom in on the villager
        this.worldRenderer.zoom(1); // Zoom in
        // Track the villager (center camera on them)
        this.worldRenderer.centerOn(clickedVillager.x, clickedVillager.y);
        // Set camera to follow mode
        this.cameraTarget = clickedVillager;
        this.ui.showVillagerPanel(clickedVillager);
      } else {
        this.selectedVillager = null;
        this.cameraTarget = null;
        this.ui.closePanel('villager-panel');
      }
    });

    // Zoom with scroll wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.worldRenderer.zoom(delta);
    });

    // Context menu (right click)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Could show villager actions menu here
    });
  }

  setupMenuEvents() {
    if (!window.electronAPI) return;

    window.electronAPI.onMenuNewWorld(() => {
      this.ui.togglePanel('newworld-dialog');
    });

    window.electronAPI.onMenuSave(async () => {
      await this.saveGame();
    });

    window.electronAPI.onMenuLoad(() => {
      this.ui.showLoadDialog();
    });

    window.electronAPI.onMenuSettings(() => {
      this.ui.showSettings();
    });

    window.electronAPI.onMenuTogglePause(() => {
      this.togglePause();
    });

    window.electronAPI.onMenuSpeed((speed) => {
      this.simSpeed = speed;
    });

    window.electronAPI.onMenuChronicle(() => {
      this.ui.showChronicle(this.chronicle);
    });

    window.electronAPI.onMenuVillagers(() => {
      // Show villagers list
      if (this.villagers.length > 0) {
        this.selectedVillager = this.villagers[0];
        this.ui.showVillagerPanel(this.selectedVillager);
      }
    });

    window.electronAPI.onMenuToggleLabels(() => {
      this.graphicsSettings.showLabels = !this.graphicsSettings.showLabels;
    });

    window.electronAPI.onMenuToggleBubbles(() => {
      this.graphicsSettings.showSpeechBubbles = !this.graphicsSettings.showSpeechBubbles;
    });
  }

  handleResize() {
    this.worldRenderer.resize();
  }

  getDefaultResources() {
    return {
      wood: 30,
      food: 24,
      water: 24,
      stone: 10,
      herbs: 5,
      clay: 10,
      fish: 0,
      thatch: 12,
      rareMaterials: 0
    };
  }

  normalizeResources(resources = {}) {
    return { ...this.getDefaultResources(), ...resources };
  }

  createDefaultGovernment() {
    return {
      form: 'chieftain_council',
      rules: [],
      compliance: 100,
      lastRuleDay: 0,
      ruleHistory: []
    };
  }

  normalizeGovernment(government = {}) {
    const base = this.createDefaultGovernment();
    const normalized = { ...base, ...government };
    normalized.rules = (government.rules || []).map(rule => this.normalizeRule(rule));
    normalized.ruleHistory = government.ruleHistory || [];
    normalized.compliance = Utils.clamp(Number(normalized.compliance) || 100, 0, 100);
    normalized.lastRuleDay = Number(normalized.lastRuleDay) || 0;
    return normalized;
  }

  normalizeRule(rule = {}) {
    return {
      id: rule.id || Utils.generateId(),
      title: rule.title || 'Village Rule',
      edict: rule.edict || rule.description || 'The village will act with shared purpose.',
      category: this.normalizeRuleCategory(rule.category || rule.effect || rule.focus),
      effect: this.normalizeRuleEffect(rule.effect || rule.category || rule.focus),
      createdDay: rule.createdDay || this.timeState?.day || 1,
      createdBy: rule.createdBy || this.villagers?.find(v => v.isChieftan)?.name || 'Chieftan',
      durationDays: Utils.clamp(Number(rule.durationDays) || 12, 3, 30),
      active: rule.active !== false,
      compliance: Utils.clamp(Number(rule.compliance) || 100, 0, 100)
    };
  }

  normalizeRuleCategory(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('food') || text.includes('hunt') || text.includes('farm')) return 'food';
    if (text.includes('water')) return 'water';
    if (text.includes('build') || text.includes('construct')) return 'building';
    if (text.includes('rest') || text.includes('curfew')) return 'rest';
    if (text.includes('harmony') || text.includes('social') || text.includes('peace')) return 'harmony';
    if (text.includes('care') || text.includes('child') || text.includes('elder')) return 'care';
    return 'general';
  }

  normalizeRuleEffect(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('water')) return 'water_priority';
    if (text.includes('build') || text.includes('construct')) return 'construction_duty';
    if (text.includes('farm')) return 'farm_first';
    if (text.includes('food') || text.includes('hunt')) return 'food_reserve';
    if (text.includes('rest') || text.includes('curfew')) return 'rest_curfew';
    if (text.includes('harmony') || text.includes('social') || text.includes('peace')) return 'harmony_oath';
    if (text.includes('care') || text.includes('child') || text.includes('elder')) return 'care_duty';
    return 'shared_duty';
  }

  getActiveRules() {
    if (!this.government) this.government = this.createDefaultGovernment();
    this.government.rules.forEach(rule => {
      if (this.timeState.day - rule.createdDay >= rule.durationDays) {
        rule.active = false;
      }
    });
    return this.government.rules.filter(rule => rule.active);
  }

  hasActiveRuleEffect(effect) {
    return this.getActiveRules().some(rule => rule.effect === effect);
  }

  updateRuleCompliance() {
    const rules = this.getActiveRules();
    if (!rules.length) return;

    rules.forEach(rule => {
      const followed = this.measureRuleCompliance(rule);
      rule.compliance = Utils.clamp(rule.compliance * 0.7 + followed * 0.3, 0, 100);
    });

    this.government.compliance = Math.round(
      rules.reduce((sum, rule) => sum + rule.compliance, 0) / rules.length
    );

    if (this.timeState.day % 5 === 0) {
      const state = this.government.compliance >= 75 ? 'strong' :
        this.government.compliance >= 45 ? 'uneven' : 'weak';
      this.addChronicleEntry(`The village's obedience to the fireside rules is ${state}.`);
    }
  }

  measureRuleCompliance(rule) {
    switch (rule.effect) {
      case 'food_reserve':
      case 'farm_first':
        return (this.resources.food || 0) >= this.villagers.length * 4 ? 90 : 45;
      case 'water_priority':
        return (this.resources.water || 0) >= this.villagers.length * 4 ? 90 : 45;
      case 'construction_duty':
        return this.constructionProjects.length > 0 || this.timeState.day - rule.createdDay < 2 ? 85 : 55;
      case 'rest_curfew':
        return this.villagers.filter(v => v.energy > 35).length / Math.max(1, this.villagers.length) * 100;
      case 'harmony_oath':
      case 'care_duty':
        return this.villagers.filter(v => v.socialNeed > 35 && v.mood > -20).length / Math.max(1, this.villagers.length) * 100;
      default:
        return this.villagers.filter(v => v.mood > -30).length / Math.max(1, this.villagers.length) * 100;
    }
  }

  ensureVillageResourceAccess() {
    const required = [
      { type: CONSTANTS.RESOURCE.WATER, radius: 8, amount: 45, maxAmount: 50, regrowRate: 0.06 },
      { type: CONSTANTS.RESOURCE.FOOD, radius: 8, amount: 25, maxAmount: 30, regrowRate: 0.05 },
      { type: CONSTANTS.RESOURCE.WOOD, radius: 10, amount: 35, maxAmount: 40, regrowRate: 0.02 },
      { type: CONSTANTS.RESOURCE.THATCH, radius: 10, amount: 24, maxAmount: 25, regrowRate: 0.04 },
      { type: CONSTANTS.RESOURCE.CLAY, radius: 12, amount: 18, maxAmount: 25, regrowRate: 0.01 },
      { type: CONSTANTS.RESOURCE.STONE, radius: 12, amount: 20, maxAmount: 25, regrowRate: 0 }
    ];

    required.forEach(resourceDef => {
      const existing = this.world.getResourcesInRadius(
        this.world.villageCenter.x,
        this.world.villageCenter.y,
        resourceDef.radius
      ).some(resource => resource.type === resourceDef.type && !resource.depleted);

      if (!existing) {
        this.addWorldResourceNearVillage(resourceDef);
      }
    });
  }

  addWorldResourceNearVillage(resourceDef) {
    for (let radius = 3; radius <= 8; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const x = this.world.villageCenter.x + dx;
          const y = this.world.villageCenter.y + dy;
          const tile = this.world.getTile(x, y);
          if (!tile || !tile.walkable) continue;
          if (this.world.getResourceAt(x, y) || this.world.getStructureAt(x, y)) continue;

          this.world.resources.push({
            id: Utils.generateId(),
            type: resourceDef.type,
            x,
            y,
            amount: resourceDef.amount,
            maxAmount: resourceDef.maxAmount,
            regrowRate: resourceDef.regrowRate,
            depleted: false
          });
          return true;
        }
      }
    }
    return false;
  }

  newWorld() {
    console.log('newWorld: Starting');
    // Generate new world
    this.world = new World(64);
    this.world.generate();
    this.ensureVillageResourceAccess();
    this.worldRenderer.world = this.world;
    this.worldRenderer.camera.zoom = 1;
    this.selectedVillager = null;
    this.cameraTarget = null;

    // Create initial villagers
    this.createInitialVillagers();
    this.initializeVillageRelationships();
    console.log('newWorld: After createInitialVillagers, villagers:', this.villagers.length);
    for (const v of this.villagers) {
      console.log('  ', v.name, 'at', v.x.toFixed(2), v.y.toFixed(2));
    }

    // Create starting structures
    this.createStartingStructures();

    // Reset time
    this.timeState = {
      day: 1,
      hours: 6.0,
      season: CONSTANTS.SEASON.WET,
      dayInSeason: 1,
      hourDuration: this.timeState.hourDuration || 10000,
      dayDuration: this.timeState.dayDuration || 600000
    };

    // Reset resources
    this.resources = this.getDefaultResources();
    this.constructionProjects = [];
    this.constructionAccumulator = 0;
    this.goalAccumulator = 0;
    this.government = this.createDefaultGovernment();

    // Reset chronicle
    this.chronicle = {
      legendary: [],
      entries: [],
      stats: {
        births: 0,
        deaths: 0,
        structuresBuilt: 0,
        marriages: 0
      }
    };

    // Add first chronicle entry
    this.addChronicleEntry('The village of Simville has been founded. Under the leadership of the first chieftan, the settlers begin building their new home.');

    // Center camera on village
    this.worldRenderer.centerOn(this.world.villageCenter.x, this.world.villageCenter.y);

    // Unpause
    this.paused = false;

    // Initial LLM generation for backstories
    this.generateInitialBackstories();

    this.ui.showToast('Welcome to Simville!');
  }

  async generateInitialBackstories() {
    console.log('generateInitialBackstories: Starting with', this.villagers.length, 'villagers');
    for (const villager of this.villagers) {
      try {
        console.log('generateInitialBackstories: Processing', villager.name);
        if (!villager.backstory) {
          villager.backstory = llm.generateFallbackBackstory(villager);
          this.refreshSelectedVillagerNarrative(villager);
        }

        const generatedBackstory = await llm.generateBackstory(villager);
        if (generatedBackstory) {
          villager.backstory = generatedBackstory;
          this.refreshSelectedVillagerNarrative(villager);
        }
        console.log('  Got backstory for', villager.name, '- length:', villager.backstory?.length);
        villager.goals = this.normalizeGoals(await llm.generateGoals(villager), villager);
        this.refreshSelectedVillagerNarrative(villager);
        console.log('  Got goals for', villager.name);

        // Generate a secret for some villagers
        if (Math.random() < 0.4) {
          const otherVillagers = this.villagers.filter(v => v.id !== villager.id);
          const secret = await llm.generateSecret(villager, otherVillagers);
          if (secret) {
            villager.secrets.push(secret);
            this.refreshSelectedVillagerNarrative(villager);
          }
        }
        console.log('  After processing, villagers.length:', this.villagers.length);
      } catch (error) {
        console.error('Failed to generate backstory for', villager.name, error);
        // Use fallback values to prevent game state corruption
        villager.backstory = villager.backstory || llm.generateFallbackBackstory(villager);
        villager.goals = this.normalizeGoals(villager.goals?.length ? villager.goals : this.getFallbackGoals(villager), villager);
        this.refreshSelectedVillagerNarrative(villager);
      }
    }
    console.log('generateInitialBackstories: Done, final villagers.length:', this.villagers.length);
  }

  refreshSelectedVillagerNarrative(villager) {
    if (this.selectedVillager !== villager) return;

    const panel = this.ui?.elements?.villagerPanel;
    if (!panel || panel.classList.contains('hidden')) return;

    if (this.ui.elements.villagerBackstoryText) {
      this.ui.elements.villagerBackstoryText.textContent = villager.backstory || 'No backstory available yet.';
    }

    if (this.ui.elements.villagerGoalsList) {
      this.ui.elements.villagerGoalsList.innerHTML = '';
      const activeGoals = villager.goals?.filter(g => !g.completed && !g.failed) || [];
      if (activeGoals.length === 0) {
        const li = document.createElement('li');
        li.className = 'goal-item';
        li.textContent = 'No active goals';
        this.ui.elements.villagerGoalsList.appendChild(li);
      } else {
        activeGoals.slice(0, 3).forEach(goal => {
          const li = document.createElement('li');
          li.className = 'goal-item';
          li.innerHTML = `
            <div>${goal.description}</div>
            <div class="goal-progress"><div class="goal-progress-fill" style="width: ${goal.progress}%"></div></div>
            <small>${goal.difficulty} | ${goal.progress}%</small>
          `;
          this.ui.elements.villagerGoalsList.appendChild(li);
        });
      }
    }

    if (this.ui.elements.secretsCount && this.ui.elements.villagerSecretsList) {
      const secrets = villager.secrets || [];
      this.ui.elements.secretsCount.textContent = `(${secrets.length})`;
      this.ui.elements.villagerSecretsList.innerHTML = '';
      if (secrets.length === 0) {
        const li = document.createElement('li');
        li.className = 'secret-item';
        li.textContent = 'No secrets... or are there?';
        this.ui.elements.villagerSecretsList.appendChild(li);
      } else {
        secrets.slice(0, 3).forEach(secret => {
          const li = document.createElement('li');
          li.className = 'secret-item';
          li.textContent = secret.revealed ? secret.description : '??? Hidden secret ???';
          this.ui.elements.villagerSecretsList.appendChild(li);
        });
      }
    }
  }

  normalizeGoals(goals = [], villager = null) {
    const validGoals = Array.isArray(goals) ? goals : [];
    return validGoals.map((goal, index) => ({
      id: goal.id || Utils.generateId(),
      type: this.normalizeGoalType(goal.type),
      description: this.formatVillagerFacingText(goal.description || 'Pursue a personal ambition'),
      difficulty: goal.difficulty || 'medium',
      progress: Utils.clamp(Number(goal.progress) || 0, 0, 100),
      completed: Boolean(goal.completed),
      failed: Boolean(goal.failed),
      target: this.resolveVillagerName(goal.target) || goal.target || null,
      targetName: this.resolveVillagerName(goal.targetName || goal.target) || goal.targetName || null,
      skill: this.normalizeSkillName(goal.skill || goal.focus || goal.target) || null,
      milestones: Array.isArray(goal.milestones) ? goal.milestones : [],
      lastPursuedDay: goal.lastPursuedDay || 0,
      pursuitCount: goal.pursuitCount || 0,
      reward: goal.reward || null,
      rewardApplied: Boolean(goal.rewardApplied),
      order: goal.order ?? index
    }));
  }

  getFallbackGoals(villager) {
    const strongestSkill = Object.entries(villager.skills || {})
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'gathering';
    return [{
      type: 'skill',
      skill: strongestSkill,
      description: `Improve ${strongestSkill} and become more useful to the village`,
      difficulty: 'medium',
      progress: 0,
      completed: false,
      failed: false,
      milestones: []
    }];
  }

  normalizeGoalType(type) {
    const text = String(type || 'aspiration').toLowerCase();
    if (['skill', 'relationship', 'legacy', 'social', 'survival', 'aspiration'].includes(text)) return text;
    if (text.includes('friend') || text.includes('romance')) return 'relationship';
    if (text.includes('craft') || text.includes('learn')) return 'skill';
    return 'aspiration';
  }

  normalizeSkillName(value) {
    if (!value) return null;
    const text = String(value).toLowerCase();
    return Object.keys(CONSTANTS.SKILL)
      .map(skill => skill.toLowerCase())
      .find(skill => text.includes(skill)) || null;
  }

  resolveVillagerName(value) {
    if (!value || !this.villagers) return null;
    const text = String(value);
    const byId = this.villagers.find(v => v.id === text);
    if (byId) return byId.name;
    const byName = this.villagers.find(v => v.name === text);
    return byName?.name || null;
  }

  formatVillagerFacingText(text) {
    if (text === null || text === undefined) return '';
    let output = String(text);
    if (!this.villagers?.length) return output;

    this.villagers.forEach(villager => {
      if (!villager.id || !output.includes(villager.id)) return;
      output = output.split(villager.id).join(villager.name);
    });
    return output;
  }

  sanitizeVillagerAction(action) {
    if (!action) return action;
    const sanitized = { ...action };
    if (sanitized.interactionTarget) {
      sanitized.interactionTarget = this.resolveVillagerName(sanitized.interactionTarget) || sanitized.interactionTarget;
    }
    if (sanitized.target) {
      sanitized.target = this.resolveVillagerName(sanitized.target) || sanitized.target;
    }
    ['activity', 'speechTheme', 'target', 'interactionTarget'].forEach(field => {
      if (sanitized[field]) sanitized[field] = this.formatVillagerFacingText(sanitized[field]);
    });
    return sanitized;
  }

  createInitialVillagers() {
    this.villagers = [];

    // Create chieftan
    const chieftan = new Villager({
      name: Utils.generateName('male'),
      age: Utils.randomInt(35, 50),
      gender: 'male',
      isChieftan: true,
      skills: {
        gathering: 6,
        crafting: 5,
        farming: 5,
        fishing: 4,
        hunting: 6,
        social: 8,
        leadership: 9
      },
      personality: {
        sociable: 70,
        active: 60,
        curious: 50,
        empathetic: 65,
        confident: 85
      }
    });

    chieftan.x = this.world.villageCenter.x + Utils.randomFloat(-1, 1);
    chieftan.y = this.world.villageCenter.y + Utils.randomFloat(-1, 1);

    this.villagers.push(chieftan);

    // Create 5 tribespeople
    const genders = ['male', 'female', 'female', 'male', 'nonbinary'];
    for (let i = 0; i < 5; i++) {
      const villager = new Villager({
        name: Utils.generateName(genders[i]),
        age: Utils.randomInt(18, 45),
        gender: genders[i]
      });

      villager.x = this.world.villageCenter.x + Utils.randomFloat(-2, 2);
      villager.y = this.world.villageCenter.y + Utils.randomFloat(-2, 2);

      this.villagers.push(villager);
    }
  }

  initializeVillageRelationships() {
    for (let i = 0; i < this.villagers.length; i++) {
      for (let j = i + 1; j < this.villagers.length; j++) {
        const a = this.villagers[i];
        const b = this.villagers[j];
        const base = Utils.randomInt(5, 18);
        const leadershipBonus = a.isChieftan || b.isChieftan ? 5 : 0;
        const warmth = Math.round(((a.personality?.empathetic || 50) + (b.personality?.empathetic || 50) - 100) / 12);
        const score = Utils.clamp(base + leadershipBonus + warmth, 0, 35);
        a.relationships[b.name] = score;
        b.relationships[a.name] = score;
      }
    }

    const adults = this.villagers
      .filter(v => v.age >= 18 && v.age <= 45)
      .sort((a, b) => (b.personality?.empathetic || 50) + (b.personality?.sociable || 50) -
        ((a.personality?.empathetic || 50) + (a.personality?.sociable || 50)));
    const paired = new Set();
    adults.forEach(a => {
      if (paired.has(a.id) || paired.size >= 4) return;
      const b = adults.find(other => other.id !== a.id && !paired.has(other.id));
      if (!b) return;
      const score = Utils.randomInt(50, 64);
      a.relationships[b.name] = Math.max(a.relationships[b.name] || 0, score);
      b.relationships[a.name] = Math.max(b.relationships[a.name] || 0, score);
      paired.add(a.id);
      paired.add(b.id);
    });
  }

  createStartingStructures() {
    // Starting hut
    this.world.addStructure({
      type: 'hut',
      x: this.world.villageCenter.x - 1,
      y: this.world.villageCenter.y,
      builtBy: this.villagers[0].id
    });

    // Starting fire
    this.world.addStructure({
      type: 'fire',
      x: this.world.villageCenter.x,
      y: this.world.villageCenter.y,
      builtBy: this.villagers[0].id
    });

    this.resources.wood -= 5; // Fire cost
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setSpeed(speed) {
    this.simSpeed = speed;
  }

  gameLoop(currentTime) {
    const deltaTime = currentTime - this.lastTick;
    this.lastTick = currentTime;

    if (!this.paused) {
      this.update(deltaTime);
    }

    this.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(deltaTime) {
    const scaledDelta = deltaTime * this.simSpeed;

    // Store previous time for transition detection
    const prevHours = this.timeState.hours;
    const prevDay = this.timeState.day;

    // Update time
    this.updateTime(scaledDelta);

    // Check for time-of-day transitions to add chronicle entries
    this.checkTimeOfDayTransition(prevHours);

    // Update villagers
    this.updateVillagers(scaledDelta);
    this.survivalAccumulator += scaledDelta;
    if (this.survivalAccumulator >= this.survivalInterval) {
      this.survivalAccumulator = 0;
      this.runSurvivalBehaviors();
    }

    this.constructionAccumulator += scaledDelta;
    if (this.constructionAccumulator >= this.constructionInterval) {
      this.processConstructionProjects(this.constructionAccumulator);
      this.constructionAccumulator = 0;
    }

    // Process technology research
    this.processTechResearch(scaledDelta);

    // Ask LLM for tech research decisions periodically
    this.techDecisionAccumulator += scaledDelta;
    if (this.techDecisionAccumulator >= this.techDecisionInterval) {
      this.techDecisionAccumulator = 0;
      this.requestTechDecision();
    }

    this.goalAccumulator += scaledDelta;
    if (this.goalAccumulator >= this.goalInterval) {
      this.processPersonalGoals();
      this.goalAccumulator = 0;
    }

    // LLM tick
    this.tickAccumulator += scaledDelta;
    if (this.tickAccumulator >= this.tickInterval) {
      this.tickAccumulator = 0;
      this.llmTick();
    }

    // Process event queue
    this.processEventQueue();

    // Update UI
    this.ui.updateHUD(this.timeState, this.resources, this.paused);
    this.ui.updateBuildMenu(this.resources);

    // Update chronicle panel if open (refresh entries)
    const chroniclePanel = document.getElementById('chronicle-panel');
    if (chroniclePanel && !chroniclePanel.classList.contains('hidden')) {
      this.ui.showChronicle(this.chronicle);
    }

    // Update selected villager panel
    if (this.selectedVillager) {
      this.ui.updateNeedsBars(this.selectedVillager);
      this.ui.updateFamilyList?.(this.selectedVillager);
    }

    // Check for villager deaths
    this.checkDeaths();

    // Auto-save once near the start of each in-game day.
    if (this.timeState.day !== this.lastAutoSaveDay &&
        Math.floor(this.timeState.hours) === 0 &&
        this.timeState.hours < 0.1) {
      this.lastAutoSaveDay = this.timeState.day;
      this.autoSave();
    }
  }

  checkTimeOfDayTransition(prevHours) {
    const timeOfDay = Utils.getTimeOfDay(this.timeState.hours);
    const prevTimeOfDay = Utils.getTimeOfDay(prevHours);

    if (timeOfDay !== prevTimeOfDay) {
      // Check for evening to trigger chieftan meeting
      if (timeOfDay === 'evening') {
        this.performChieftanMeeting();
      }
      const transitions = {
        'dawn': 'The first rays of sunlight pierce through the canopy, and the village stirs to life.',
        'morning': 'The village is bustling with activity as the morning warmth settles in.',
        'afternoon': 'The heat of the day reaches its peak. Some villagers seek shade while others continue their work.',
        'evening': 'Golden light bathes the village as work winds down and people gather.',
        'night': 'Darkness falls over Simville. The fire\'s glow is the heartbeat of the village.'
      };

      if (transitions[timeOfDay]) {
        this.addChronicleEntry(transitions[timeOfDay], 'normal');
      }
    }
  }

  updateTime(deltaTime) {
    const hoursPerMs = 1 / this.timeState.hourDuration;
    this.timeState.hours += deltaTime * hoursPerMs;

    // New day
    if (this.timeState.hours >= 24) {
      this.timeState.hours -= 24;
      this.timeState.day++;
      this.timeState.dayInSeason++;
      this.onNewDay();
    }

    // Season change
    const season = Utils.getSeason(this.timeState.day);
    if (season.name !== this.timeState.season.name) {
      this.timeState.season = season;
      this.timeState.dayInSeason = 1;
      this.addChronicleEntry(`The ${season.name} has begun.`);
    }
  }

  onNewDay() {
    this.regrowWorldResources();
    this.produceStructureResources();
    this.clampStoredResources();
    this.updateFamilySimulation();
    this.updateRuleCompliance();
    this.planAutonomousConstruction();

    // Daily chronicle summary
    const totalMood = this.villagers.reduce((sum, v) => sum + v.mood, 0);
    const avgMood = totalMood / this.villagers.length;
    const moodDesc = avgMood > 50 ? 'prosperous' : avgMood > 0 ? 'steady' : 'troubled';

    // Find most notable villager
    const chieftan = this.villagers.find(v => v.isChieftan);
    const notableVillager = this.villagers.reduce((prev, curr) =>
      curr.mood > prev.mood ? curr : prev, this.villagers[0]);

    this.addChronicleEntry(`Day ${this.timeState.day} dawns over a ${moodDesc} village. The people wake with hope.`);

    // Add resource status occasionally
    if (this.timeState.day % 3 === 0) {
      const foodStatus = this.resources.food < 10 ? 'is scarce' : 'is plentiful';
      this.addChronicleEntry(`The village granary ${foodStatus}. ${this.villagers.length} souls call Simville home.`);
    }

    if (this.timeState.day % 7 === 0 &&
        this.villagers.length + this.getExpectedBirthCount() >= this.getPopulationCapacity()) {
      this.addChronicleEntry('Families are filling the available huts. More housing will let the village keep growing.');
    }

    // Add villager highlight every 5 days
    if (this.timeState.day % 5 === 0 && notableVillager) {
      const mood = notableVillager.mood > 50 ? 'in high spirits' : notableVillager.mood > 0 ? 'content' : 'troubled';
      this.addChronicleEntry(`${notableVillager.name} has been seen ${mood} lately.`);
    }

    // Ritual: Morning blessing
    this.performRitual(CONSTANTS.RITUAL.MORNING_BLESSING);
  }

  updateFamilySimulation() {
    this.ageVillagersIfNeeded();
    this.deepenDailyRelationships();
    this.processPregnancies();
    this.processPartnerships();
    this.processNewPregnancies();
  }

  ageVillagersIfNeeded() {
    const daysPerYear = 30;
    if (this.timeState.day <= 1 || this.timeState.day % daysPerYear !== 0) return;

    this.villagers.forEach(villager => {
      const oldStage = villager.lifeStage;
      villager.age += 1;
      villager.lifeStage = Utils.getLifeStage(villager.age);
      villager.title = villager.determineTitle();

      if (oldStage.name !== villager.lifeStage.name) {
        this.addChronicleEntry(`${villager.name} has grown into ${villager.lifeStage.name.toLowerCase()}hood.`, 'normal');
        this.performRitual(CONSTANTS.RITUAL.COMING_OF_AGE);
      }
    });
  }

  deepenDailyRelationships() {
    for (let i = 0; i < this.villagers.length; i++) {
      for (let j = i + 1; j < this.villagers.length; j++) {
        const a = this.villagers[i];
        const b = this.villagers[j];
        if (this.areCloseFamily(a, b)) {
          this.modifyMutualRelationship(a, b, 0.6);
          continue;
        }

        let delta = 0.25;
        if (a.partnerId === b.id || b.partnerId === a.id) delta += 1.2;
        if (Utils.distance(a.x, a.y, b.x, b.y) <= 5) delta += 0.45;
        if (a.status === CONSTANTS.ACTIVITY.SOCIALIZING || b.status === CONSTANTS.ACTIVITY.SOCIALIZING) delta += 0.55;

        const empathy = ((a.personality?.empathetic || 50) + (b.personality?.empathetic || 50)) / 2;
        const sociable = ((a.personality?.sociable || 50) + (b.personality?.sociable || 50)) / 2;
        delta += (empathy - 50) / 80 + (sociable - 50) / 100;

        if (a.mood < -20 || b.mood < -20) delta -= 0.8;
        if (a.hunger < 25 || b.hunger < 25 || (a.thirst ?? 100) < 25 || (b.thirst ?? 100) < 25) delta -= 0.7;

        this.modifyMutualRelationship(a, b, delta);
      }
    }
  }

  processPartnerships() {
    if (!this.isVillageStableForFamilyGrowth(false)) return;

    const adults = this.villagers.filter(v => this.isEligibleForPartnership(v));
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        const a = adults[i];
        const b = adults[j];
        if (a.partnerId || b.partnerId || this.areCloseFamily(a, b)) continue;

        const relationship = this.getMutualRelationship(a, b);
        if (relationship < CONSTANTS.RELATIONSHIP.FRIEND_THRESHOLD + 15) continue;

        const chance = relationship >= 60 ? 1 : Math.min(0.45, 0.12 + (relationship - 40) / 120);
        if (Math.random() < chance) {
          this.eventQueue.push({ type: 'marriage', villager1: a, villager2: b });
          return;
        }
      }
    }
  }

  processNewPregnancies() {
    if (!this.isVillageStableForFamilyGrowth(true)) return;

    const couples = this.getFamilyEligibleCouples();

    for (const [a, b] of couples) {
      if (a.expectingChild || b.expectingChild) continue;
      const lastChildDay = Math.max(a.lastChildDay || 0, b.lastChildDay || 0);
      if (lastChildDay > 0 && this.timeState.day - lastChildDay < 12) continue;

      const relationship = this.getMutualRelationship(a, b);
      if (relationship < 55) continue;

      const isPartnered = a.partnerId === b.id || b.partnerId === a.id;
      const partnerBonus = isPartnered ? 0.16 : 0.06;
      const chance = isPartnered && relationship >= CONSTANTS.RELATIONSHIP.SOULMATE_THRESHOLD
        ? 1
        : Math.min(0.5, partnerBonus + (relationship - 55) / 120);
      if (Math.random() >= chance) continue;

      const carrier = this.choosePregnancyCarrier(a, b);
      const partner = carrier.id === a.id ? b : a;
      carrier.expectingChild = {
        partnerId: partner.id,
        partnerName: partner.name,
        startedDay: this.timeState.day,
        dueDay: this.timeState.day + Utils.randomInt(4, 7)
      };
      carrier.activity = `Expecting a child with ${partner.name}`;
      carrier.showSpeechBubble('👶', 'Expecting a child', 5000);
      this.addChronicleEntry(`${carrier.name} and ${partner.name} are expecting a child.`, 'celebration');
      return;
    }
  }

  getFamilyEligibleCouples() {
    const couples = [];
    const seen = new Set();

    this.villagers
      .filter(v => v.partnerId && this.isReproductiveAdult(v))
      .forEach(a => {
        const b = this.villagers.find(other => other.id === a.partnerId);
        if (!b || !this.isReproductiveAdult(b)) return;
        const key = [a.id, b.id].sort().join(':');
        if (seen.has(key)) return;
        seen.add(key);
        couples.push([a, b]);
      });

    const adults = this.villagers.filter(v => this.isReproductiveAdult(v));
    adults.forEach((a, index) => {
      adults.slice(index + 1).forEach(b => {
        const key = [a.id, b.id].sort().join(':');
        if (seen.has(key) || this.areCloseFamily(a, b)) return;
        if (this.getMutualRelationship(a, b) < CONSTANTS.RELATIONSHIP.BEST_FRIEND_THRESHOLD - 10) return;
        seen.add(key);
        couples.push([a, b]);
      });
    });

    return couples.sort((left, right) =>
      this.getMutualRelationship(right[0], right[1]) - this.getMutualRelationship(left[0], left[1])
    );
  }

  processPregnancies() {
    this.villagers.forEach(parent => {
      if (!parent.expectingChild || parent.expectingChild.dueDay > this.timeState.day) return;

      const partner = this.villagers.find(v => v.id === parent.expectingChild.partnerId);
      const baby = this.createBabyForParents(parent, partner);
      parent.expectingChild = null;
      parent.lastChildDay = this.timeState.day;
      if (partner) partner.lastChildDay = this.timeState.day;
      this.eventQueue.push({ type: 'birth', villager: baby });
    });
  }

  createBabyForParents(parentA, parentB = null) {
    const parents = [parentA, parentB].filter(Boolean);
    const gender = Utils.randomElement(['male', 'female', 'nonbinary']);
    const spawn = this.world.getWalkableTileNear(
      this.world.villageCenter.x + Utils.randomInt(-2, 2),
      this.world.villageCenter.y + Utils.randomInt(-2, 2),
      4
    ) || this.world.getTile(this.world.villageCenter.x, this.world.villageCenter.y);

    const baby = new Villager({
      name: this.generateUniqueVillagerName(gender),
      age: 0,
      gender,
      x: spawn?.x ?? this.world.villageCenter.x,
      y: spawn?.y ?? this.world.villageCenter.y,
      parentIds: parents.map(parent => parent.id),
      parentNames: parents.map(parent => parent.name),
      skills: {
        gathering: 0,
        crafting: 0,
        farming: 0,
        fishing: 0,
        hunting: 0,
        social: 1,
        leadership: 0
      },
      personality: this.inheritPersonality(parents),
      skinTone: Utils.randomElement(parents.map(parent => parent.skinTone).filter(Boolean)) || undefined,
      hairColor: Utils.randomElement(parents.map(parent => parent.hairColor).filter(Boolean)) || undefined,
      backstory: `Born in Simville on day ${this.timeState.day}.`
    });

    parents.forEach(parent => {
      parent.childrenIds = Array.from(new Set([...(parent.childrenIds || []), baby.id]));
      parent.childrenNames = Array.from(new Set([...(parent.childrenNames || []), baby.name]));
      parent.relationships[baby.name] = 100;
      baby.relationships[parent.name] = 100;
      parent.mood = Math.min(100, parent.mood + 12);
      parent.socialNeed = Math.min(100, parent.socialNeed + 10);
    });

    this.villagers
      .filter(v => v.parentIds?.some(parentId => baby.parentIds.includes(parentId)))
      .forEach(sibling => {
        sibling.relationships[baby.name] = 75;
        baby.relationships[sibling.name] = 75;
      });

    return baby;
  }

  inheritPersonality(parents) {
    const base = Utils.generatePersonality();
    if (parents.length === 0) return base;

    return Object.fromEntries(Object.keys(base).map(trait => {
      const inherited = parents.reduce((sum, parent) => sum + (parent.personality?.[trait] ?? base[trait]), 0) / parents.length;
      return [trait, Utils.clamp(Math.round(inherited + Utils.randomInt(-12, 12)), 0, 100)];
    }));
  }

  generateUniqueVillagerName(gender) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const name = Utils.generateName(gender);
      if (!this.villagers.some(v => v.name === name)) return name;
    }
    return `${Utils.generateName(gender)} ${this.timeState.day}`;
  }

  choosePregnancyCarrier(a, b) {
    const candidates = [a, b].filter(v => this.isReproductiveAdult(v));
    const female = candidates.find(v => v.gender === 'female');
    return female || Utils.randomElement(candidates);
  }

  isEligibleForPartnership(villager) {
    return villager.age >= 18 &&
      villager.age <= 60 &&
      !villager.partnerId &&
      villager.health > 45 &&
      villager.mood > -25;
  }

  isReproductiveAdult(villager) {
    return villager.age >= 18 &&
      villager.age <= 45 &&
      villager.health > 55 &&
      villager.mood > -10;
  }

  isVillageStableForFamilyGrowth(requireHousingRoom = true) {
    if (this.villagers.length < 2) return false;
    if (requireHousingRoom && this.villagers.length + this.getExpectedBirthCount() >= this.getPopulationCapacity()) {
      if (this.canAffordStructure(CONSTANTS.STRUCTURE.HUT)) {
        this.startConstructionProject('hut', { source: 'family_growth' });
      }
      return false;
    }

    const avgMood = this.villagers.reduce((sum, v) => sum + v.mood, 0) / this.villagers.length;
    const foodReserve = this.resources.food || 0;
    const waterReserve = this.resources.water || 0;
    return avgMood > 0 &&
      foodReserve >= this.villagers.length * 0.8 &&
      waterReserve >= this.villagers.length * 0.8;
  }

  getPopulationCapacity() {
    const hutCapacity = this.world?.structures
      ?.filter(structure => structure.type === 'hut')
      .reduce((sum, structure) => {
        const hut = CONSTANTS.STRUCTURE.HUT;
        return sum + (hut.capacity || 2);
      }, 0) || 0;
    const pendingHutCapacity = this.constructionProjects
      ?.filter(project => project.type === 'hut')
      .reduce((sum) => sum + (CONSTANTS.STRUCTURE.HUT.capacity || 2), 0) || 0;
    return 6 + hutCapacity + pendingHutCapacity;
  }

  getExpectedBirthCount() {
    const pregnancies = this.villagers.filter(v => v.expectingChild).length;
    const queuedBirths = this.eventQueue.filter(event => event.type === 'birth').length;
    return pregnancies + queuedBirths;
  }

  getMutualRelationship(a, b) {
    return ((a.relationships?.[b.name] || 0) + (b.relationships?.[a.name] || 0)) / 2;
  }

  modifyMutualRelationship(a, b, delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    a.modifyRelationship(b.name, delta);
    b.modifyRelationship(a.name, delta);
  }

  areCloseFamily(a, b) {
    const aParents = a.parentIds || [];
    const bParents = b.parentIds || [];
    return aParents.includes(b.id) ||
      bParents.includes(a.id) ||
      (a.childrenIds || []).includes(b.id) ||
      (b.childrenIds || []).includes(a.id) ||
      aParents.some(parentId => bParents.includes(parentId));
  }

  regrowWorldResources() {
    const seasonName = this.timeState.season?.name;
    const regrowMultiplier = seasonName === 'Wet Season' ? 1.25 :
      seasonName === 'Harvest Season' ? 1.4 :
      seasonName === 'Deep Dry' ? 0.5 :
      seasonName === 'Dry Season' ? 0.75 : 1;

    this.world.resources.forEach(r => {
      if (r.depleted && r.regrowRate > 0 && Math.random() < r.regrowRate * regrowMultiplier) {
        r.depleted = false;
        r.amount = Math.max(1, Math.floor(r.maxAmount * 0.25));
      }

      if (!r.depleted && r.regrowRate > 0) {
        r.amount = Math.min(r.maxAmount, r.amount + r.maxAmount * r.regrowRate * 10 * regrowMultiplier);
      }
    });
  }

  produceStructureResources() {
    const counts = this.world.structures.reduce((acc, structure) => {
      acc[structure.type] = (acc[structure.type] || 0) + 1;
      return acc;
    }, {});

    const seasonName = this.timeState.season?.name;
    const farmMultiplier = seasonName === 'Harvest Season' ? 1.5 :
      seasonName === 'Deep Dry' ? 0.5 :
      seasonName === 'Dry Season' ? 0.8 : 1;
    const wellMultiplier = seasonName === 'Deep Dry' ? 0.6 :
      seasonName === 'Dry Season' ? 0.8 : 1.1;

    if (counts.farm) {
      this.addResource(CONSTANTS.RESOURCE.FOOD, Math.round(counts.farm * 6 * farmMultiplier));
      this.addResource(CONSTANTS.RESOURCE.THATCH, Math.round(counts.farm * 2 * farmMultiplier));
    }

    if (counts.well) {
      this.addResource(CONSTANTS.RESOURCE.WATER, Math.round(counts.well * 18 * wellMultiplier));
    }

    if (counts.workshop) {
      this.addResource(CONSTANTS.RESOURCE.WOOD, counts.workshop);
      this.addResource(CONSTANTS.RESOURCE.STONE, counts.workshop);
    }
  }

  getStorageCapacity(resourceType = null) {
    const storageCount = this.world?.structures?.filter(s => s.type === 'storage').length || 0;
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

    return Object.fromEntries(Object.values(CONSTANTS.RESOURCE).map(resource => [
      resource,
      (baseCapacity[resource] || 50) + addedCapacity
    ]));
  }

  addResource(resourceType, amount) {
    if (!resourceType || !Number.isFinite(amount) || amount <= 0) return 0;

    this.resources = this.normalizeResources(this.resources);
    const capacity = this.getStorageCapacity(resourceType);
    const before = this.resources[resourceType] || 0;
    const after = Utils.clamp(before + amount, 0, capacity);
    this.resources[resourceType] = after;
    return after - before;
  }

  clampStoredResources() {
    this.resources = this.normalizeResources(this.resources);
    for (const resourceType of Object.values(CONSTANTS.RESOURCE)) {
      this.resources[resourceType] = Utils.clamp(
        this.resources[resourceType] || 0,
        0,
        this.getStorageCapacity(resourceType)
      );
    }
  }

  getStructureCosts(struct) {
    return Object.values(CONSTANTS.RESOURCE)
      .filter(resource => Number.isFinite(struct?.[resource]) && struct[resource] > 0)
      .map(resource => [resource, struct[resource]]);
  }

  canAffordStructure(struct) {
    this.resources = this.normalizeResources(this.resources);
    return this.getStructureCosts(struct)
      .every(([resource, amount]) => (this.resources[resource] || 0) >= amount);
  }

  consumeStructureCost(struct) {
    if (!this.canAffordStructure(struct)) return false;

    this.getStructureCosts(struct).forEach(([resource, amount]) => {
      this.resources[resource] -= amount;
    });
    return true;
  }

  updateVillagers(deltaTime) {
    for (const villager of this.villagers) {
      villager.update(deltaTime, this.world, this.villagers);
    }
  }

  processPersonalGoals() {
    if (!this.villagers.length) return;

    this.villagers.forEach(villager => {
      villager.goals = this.normalizeGoals(villager.goals, villager);
      const goal = villager.goals.find(g => !g.completed && !g.failed);
      if (!goal || !this.canPursuePersonalGoal(villager)) return;

      const alreadyPursuedToday = goal.lastPursuedDay === this.timeState.day;
      const shouldPursue = !alreadyPursuedToday || Math.random() < 0.08;
      if (!shouldPursue) return;

      this.pursuePersonalGoal(villager, goal);
    });
  }

  canPursuePersonalGoal(villager) {
    if (this.hasActiveRuleEffect('rest_curfew') && Utils.getTimeOfDay(this.timeState.hours) === 'night') {
      return false;
    }

    return villager.health > 35 &&
      villager.energy > 25 &&
      villager.hunger > 35 &&
      (villager.thirst ?? 100) > 35 &&
      villager.status !== CONSTANTS.ACTIVITY.SLEEPING &&
      villager.status !== CONSTANTS.ACTIVITY.EATING &&
      villager.status !== CONSTANTS.ACTIVITY.DRINKING &&
      villager.status !== CONSTANTS.ACTIVITY.BUILDING &&
      villager.currentAction?.survivalTask === undefined;
  }

  pursuePersonalGoal(villager, goal) {
    goal.lastPursuedDay = this.timeState.day;
    goal.pursuitCount = (goal.pursuitCount || 0) + 1;

    switch (goal.type) {
      case 'relationship':
      case 'social':
        this.pursueRelationshipGoal(villager, goal);
        break;
      case 'skill':
        this.pursueSkillGoal(villager, goal);
        break;
      case 'legacy':
      case 'aspiration':
        this.pursueAspirationGoal(villager, goal);
        break;
      case 'survival':
        this.pursueSurvivalGoal(villager, goal);
        break;
      default:
        this.pursueAspirationGoal(villager, goal);
        break;
    }
  }

  pursueRelationshipGoal(villager, goal) {
    const target = this.resolveGoalTargetVillager(villager, goal);
    if (!target) {
      this.advanceGoal(villager, goal, 3, 'Reflecting on village bonds');
      return;
    }

    goal.targetName = target.name;
    villager.status = CONSTANTS.ACTIVITY.SOCIALIZING;
    villager.activity = `Spending time with ${target.name} for goal`;
    villager.currentAction = { action: CONSTANTS.ACTIVITY.SOCIALIZING, goalId: goal.id, goalDescription: goal.description };
    villager.moveTo(target.x, target.y, this.world);
    villager.modifyRelationship(target.name, 2);
    target.modifyRelationship(villager.name, 1);
    villager.addInteraction('talk', target.name, `Worked on personal goal: ${goal.description}`);
    villager.showSpeechBubble('💬', `Talking with ${target.name}`, 3500);
    this.advanceGoal(villager, goal, 7, `Built a bond with ${target.name}`);
  }

  pursueSkillGoal(villager, goal) {
    const skill = goal.skill || this.inferGoalSkill(villager, goal);
    goal.skill = skill;
    const activityBySkill = {
      gathering: CONSTANTS.ACTIVITY.GATHERING,
      crafting: CONSTANTS.ACTIVITY.WORKING,
      farming: CONSTANTS.ACTIVITY.FARMING,
      fishing: CONSTANTS.ACTIVITY.FISHING,
      hunting: CONSTANTS.ACTIVITY.HUNTING,
      social: CONSTANTS.ACTIVITY.SOCIALIZING,
      leadership: CONSTANTS.ACTIVITY.WORKING
    };
    const labels = {
      gathering: 'practicing gathering',
      crafting: 'practicing craftwork',
      farming: 'tending crops',
      fishing: 'practicing fishing',
      hunting: 'tracking game',
      social: 'practicing conversation',
      leadership: 'studying village leadership'
    };

    villager.status = activityBySkill[skill] || CONSTANTS.ACTIVITY.WORKING;
    villager.activity = `${labels[skill] || 'practicing skills'} for personal goal`;
    villager.currentAction = { action: villager.status, goalId: goal.id, goalDescription: goal.description };
    this.moveVillagerForSkillPractice(villager, skill);
    villager.skills[skill] = Math.min(10, (villager.skills[skill] || 0) + 0.08);
    villager.showSpeechBubble('💪', labels[skill] || 'Practicing', 3000);
    this.advanceGoal(villager, goal, 6, `Practiced ${skill}`);
  }

  pursueAspirationGoal(villager, goal) {
    const wantsBuild = /build|construct|lead|project|legacy|respected/i.test(goal.description || '');
    if (wantsBuild && villager.lifeStage?.canWork !== false) {
      const existingProject = this.constructionProjects[0];
      if (existingProject) {
        existingProject.builderId = villager.id;
        villager.status = CONSTANTS.ACTIVITY.BUILDING;
        villager.activity = `Helping build ${existingProject.name} for personal goal`;
        villager.currentAction = { action: CONSTANTS.ACTIVITY.BUILDING, goalId: goal.id, goalDescription: goal.description };
        villager.moveTo(existingProject.x, existingProject.y, this.world);
        this.advanceGoal(villager, goal, 8, `Helped build ${existingProject.name}`);
        return;
      }

      const neededStructure = this.chooseNeededStructure();
      if (neededStructure && this.startConstructionProject(neededStructure, { source: 'goal', builderId: villager.id })) {
        this.advanceGoal(villager, goal, 10, `Started a ${neededStructure} project`);
        return;
      }
    }

    villager.status = CONSTANTS.ACTIVITY.WORKING;
    villager.activity = `Working toward goal: ${Utils.truncate(goal.description, 42)}`;
    villager.currentAction = { action: CONSTANTS.ACTIVITY.WORKING, goalId: goal.id, goalDescription: goal.description };
    villager.showSpeechBubble('🤔', 'Working on a personal goal', 3000);
    this.advanceGoal(villager, goal, 5, 'Made personal progress');
  }

  pursueSurvivalGoal(villager, goal) {
    if (this.assignFoodWork(villager) || this.assignWaterWork(villager)) {
      this.advanceGoal(villager, goal, 5, 'Helped village survival');
      return;
    }
    this.pursueAspirationGoal(villager, goal);
  }

  advanceGoal(villager, goal, amount, milestoneText) {
    goal.progress = Utils.clamp((Number(goal.progress) || 0) + amount, 0, 100);
    if (milestoneText) {
      goal.milestones = goal.milestones || [];
      if (!goal.milestones.includes(milestoneText)) goal.milestones.unshift(milestoneText);
      goal.milestones = goal.milestones.slice(0, 5);
    }

    if (goal.progress >= 100 && !goal.completed) {
      goal.completed = true;
      const rewardText = this.applyGoalReward(villager, goal);
      villager.showSpeechBubble('🎉', 'Goal achieved', 5000);
      this.addChronicleEntry(`${villager.name} fulfilled a personal goal: ${goal.description}${rewardText ? ` Reward: ${rewardText}.` : ''}`, 'celebration');
    }
  }

  applyGoalReward(villager, goal) {
    if (goal.rewardApplied) return goal.reward?.description || null;

    const rewardScale = this.getGoalRewardScale(goal);
    let rewardText = '';

    if (goal.type === 'skill') {
      const skill = goal.skill || this.inferGoalSkill(villager, goal);
      const gain = 0.6 * rewardScale;
      villager.skills[skill] = Math.min(10, (villager.skills[skill] || 0) + gain);
      villager.energy = Math.min(100, villager.energy + 6);
      rewardText = `${this.formatSkillName(skill)} improved`;
    } else if (goal.type === 'relationship' || goal.type === 'social') {
      const target = this.resolveGoalTargetVillager(villager, goal);
      const gain = Math.round(10 * rewardScale);
      if (target) {
        villager.modifyRelationship(target.name, gain);
        target.modifyRelationship(villager.name, Math.ceil(gain * 0.7));
        villager.socialNeed = Math.min(100, villager.socialNeed + 12);
        target.socialNeed = Math.min(100, target.socialNeed + 8);
        rewardText = `bond with ${target.name} strengthened`;
      } else {
        this.villagers
          .filter(other => other.id !== villager.id)
          .forEach(other => {
            villager.modifyRelationship(other.name, Math.ceil(gain * 0.35));
            other.modifyRelationship(villager.name, Math.ceil(gain * 0.2));
          });
        villager.socialNeed = Math.min(100, villager.socialNeed + 15);
        rewardText = 'village relationships strengthened';
      }
    } else if (goal.type === 'survival') {
      const skill = this.normalizeSkillName(goal.description) || 'gathering';
      villager.skills[skill] = Math.min(10, (villager.skills[skill] || 0) + 0.35 * rewardScale);
      villager.health = Math.min(100, villager.health + 8 * rewardScale);
      villager.hunger = Math.min(100, villager.hunger + 10);
      villager.thirst = Math.min(100, (villager.thirst ?? 100) + 10);
      rewardText = `${this.formatSkillName(skill)} and resilience improved`;
    } else {
      const skill = this.normalizeSkillName(goal.description) || 'leadership';
      villager.skills[skill] = Math.min(10, (villager.skills[skill] || 0) + 0.4 * rewardScale);
      villager.mood = Math.min(100, villager.mood + 10 * rewardScale);
      villager.energy = Math.min(100, villager.energy + 8);
      this.villagers
        .filter(other => other.id !== villager.id)
        .forEach(other => {
          villager.modifyRelationship(other.name, 2);
          other.modifyRelationship(villager.name, 1);
        });
      rewardText = `${this.formatSkillName(skill)} and confidence improved`;
    }

    villager.mood = Math.min(100, villager.mood + 8);
    goal.rewardApplied = true;
    goal.reward = {
      type: goal.type,
      description: rewardText,
      day: this.timeState.day
    };
    goal.milestones = goal.milestones || [];
    goal.milestones.unshift(`Reward earned: ${rewardText}`);
    goal.milestones = goal.milestones.slice(0, 5);
    villager.addInteraction('goal', 'Personal goal', rewardText);
    return rewardText;
  }

  getGoalRewardScale(goal) {
    const scales = {
      easy: 1,
      medium: 1.25,
      hard: 1.6,
      epic: 2
    };
    return scales[String(goal.difficulty || 'medium').toLowerCase()] || 1.25;
  }

  formatSkillName(skill) {
    return String(skill || 'skill').replace(/^\w/, char => char.toUpperCase());
  }

  resolveGoalTargetVillager(villager, goal) {
    const namedTarget = this.resolveVillagerName(goal.targetName || goal.target);
    const explicitTarget = namedTarget && this.villagers.find(v => v.name === namedTarget && v.id !== villager.id);
    if (explicitTarget) return explicitTarget;

    return this.villagers
      .filter(other => other.id !== villager.id)
      .sort((a, b) => (villager.relationships[b.name] || 0) - (villager.relationships[a.name] || 0))[0] || null;
  }

  inferGoalSkill(villager, goal) {
    const fromText = this.normalizeSkillName(goal.description);
    if (fromText) return fromText;
    return Object.entries(villager.skills || {})
      .sort((a, b) => a[1] - b[1])[0]?.[0] || 'gathering';
  }

  moveVillagerForSkillPractice(villager, skill) {
    const structureBySkill = {
      farming: 'farm',
      crafting: 'workshop',
      leadership: 'fire',
      social: 'fire'
    };
    const resourceBySkill = {
      gathering: CONSTANTS.RESOURCE.WOOD,
      fishing: CONSTANTS.RESOURCE.FISH,
      hunting: CONSTANTS.RESOURCE.FOOD
    };

    const structureType = structureBySkill[skill];
    const structure = structureType && this.world.structures.find(s => s.type === structureType);
    if (structure) {
      villager.moveTo(structure.x, structure.y, this.world);
      return;
    }

    const resourceType = resourceBySkill[skill];
    const resource = resourceType && this.findNearestResource(villager.x, villager.y, resourceType, 14);
    if (resource) {
      villager.moveTo(resource.x, resource.y, this.world);
      return;
    }

    const tile = this.world.getWalkableTileNear(this.world.villageCenter.x + Utils.randomInt(-4, 4), this.world.villageCenter.y + Utils.randomInt(-4, 4), 4);
    if (tile) villager.moveTo(tile.x, tile.y, this.world);
  }

  async llmTick() {
    // Skip if paused
    if (this.paused) return;

    // Increment tick count
    this.tickCount++;

    // Add periodic chronicle entries even without LLM
    if (this.tickCount % 10 === 0) {
      const timeOfDay = Utils.getTimeOfDay(this.timeState.hours);
      const greetings = {
        dawn: 'The village stirs as the sun rises.',
        morning: 'Villagers are busy with their tasks.',
        afternoon: 'The heat of midday settles over Simville.',
        evening: 'People gather as the day winds down.',
        night: 'The village sleeps under the stars.'
      };
      this.addChronicleEntry(greetings[timeOfDay] || 'Life continues in Simville.');
    }

    // Check if LLM is configured
    if (!llm.config?.llm?.apiKey) {
      // No API key - villagers use built-in wandering behavior
      this.showFallbackActionBubbles();

      // Generate some basic chronicle entries based on wandering
      if (this.tickCount % 15 === 0) {
        const villager = this.villagers[Math.floor(Math.random() * this.villagers.length)];
        if (villager) {
          const activities = [
            `${villager.name} walks through the village.`,
            `${villager.name} pauses to rest in the shade.`,
            `${villager.name} looks out over the village.`,
            `${villager.name} tends to their duties.`,
            `${villager.name} watches the children play.`
          ];
          this.addChronicleEntry(activities[Math.floor(Math.random() * activities.length)]);
        }
      }
      return;
    }

    if (this.isGeneratingActions) return;
    this.isGeneratingActions = true;

    // Build world state for LLM
    const worldState = {
      resources: { ...this.resources },
      structures: this.world.structures.map(s => ({ type: s.type, x: s.x, y: s.y })),
      population: this.villagers.length,
      day: this.timeState.day,
      timeOfDay: Utils.getTimeOfDay(this.timeState.hours),
      season: this.timeState.season.name
    };

    const timeState = {
      day: this.timeState.day,
      hours: this.timeState.hours,
      season: this.timeState.season,
      dayInSeason: this.timeState.dayInSeason
    };

    try {
      const actions = await llm.generateVillagerActions(this.villagers, worldState, timeState);

      // Track significant events for chronicle
      const notableEvents = [];

      // Apply actions to villagers
      for (const rawAction of actions) {
        const action = this.sanitizeVillagerAction(rawAction);
        const villager = this.villagers.find(v => v.id === action.villagerId || v.name === action.villagerName);
        if (villager) {
          if ((villager.thirst ?? 100) < 35 && this.resources.water > 0) {
            villager.status = CONSTANTS.ACTIVITY.DRINKING;
            villager.activity = 'Drinking from village water stores';
            villager.showSpeechBubble('💧', 'Drinking');
            continue;
          }

          if (villager.hunger < 35 && this.resources.food > 0) {
            villager.status = CONSTANTS.ACTIVITY.EATING;
            villager.activity = 'Eating from the village stores';
            villager.showSpeechBubble('🍖', 'Eating');
            continue;
          }

          villager.applyAction(action);

          // Handle movement
          if (action.moveTo) {
            villager.moveTo(action.moveTo.x, action.moveTo.y, this.world);
          }

          // Handle gathering -villagers find and harvest resources
          if (action.action === 'gathering') {
            const gathered = this.handleGathering(villager, action.resourceType || action.target);
            if (gathered > 0) {
              villager.showSpeechBubble('💪', 'Gathering resources');
            }
          }

          // Handle hunting - villagers hunt for food
          if (action.action === 'hunting') {
            const hunted = this.handleHunting(villager);
            if (hunted > 0) {
              notableEvents.push({
                text: `${villager.name} returns from hunting with food!`,
                type: 'normal'
              });
              villager.showSpeechBubble('🏹', 'Hunting');
            }
          }

          // Handle fishing
          if (action.action === 'fishing') {
            const fished = this.handleFishing(villager);
            if (fished > 0) {
              notableEvents.push({
                text: `${villager.name} caught fish at the river!`,
                type: 'normal'
              });
              villager.showSpeechBubble('🎣', 'Fishing');
            }
          }

          if (action.action === 'drinking') {
            villager.status = CONSTANTS.ACTIVITY.DRINKING;
            villager.activity = 'Drinking from village water stores';
            villager.showSpeechBubble('💧', action.speechTheme || 'Drinking');
          }

          if (action.action === 'building') {
            const requestedStructure = this.normalizeStructureType(action.structure || action.structureType || action.target) ||
              this.chooseNeededStructure();
            if (requestedStructure && this.startConstructionProject(requestedStructure, { source: 'villager', builderId: villager.id })) {
              notableEvents.push({
                text: `${villager.name} marked out ground for a new ${requestedStructure}.`,
                type: 'normal'
              });
            }
          }

          // Handle social interaction - record notable ones (only if within proximity)
          if (action.interactionTarget) {
            const target = this.villagers.find(v => v.name === action.interactionTarget);
            if (target) {
              // Check proximity - villagers must be within range to interact
              const dist = Utils.distance(villager.x, villager.y, target.x, target.y);
              if (dist > CONSTANTS.INTERACTION.PROXIMITY_REQUIRED) {
                // Too far away - cancel the interaction
                villager.showSpeechBubble('🚫', 'Too far to talk');
                return; // Skip this action entirely
              }

              const relChange = action.interactionType === 'argue' ? -5 : 3;
              villager.modifyRelationship(target.name, relChange);
              target.modifyRelationship(villager.name, relChange);

              // Show speech bubbles for interactions
              if (action.speechEmoji) {
                villager.showSpeechBubble(action.speechEmoji, action.speechTheme || 'Interacting');
              }

              // Record significant social events
              if (action.interactionType === 'argue') {
                notableEvents.push({
                  text: `${villager.name} and ${target.name} had a disagreement.`,
                  type: 'conflict'
                });
              } else if (action.interactionType === 'share') {
                notableEvents.push({
                  text: `${villager.name} shared something with ${target.name}.`,
                  type: 'normal'
                });
              } else if (action.interactionType === 'romance') {
                notableEvents.push({
                  text: `${villager.name} and ${target.name} shared a tender moment.`,
                  type: 'celebration'
                });
              } else if (action.interactionType === 'help') {
                notableEvents.push({
                  text: `${villager.name} helped ${target.name} with a task.`,
                  type: 'normal'
                });
              }
            }
          }

          // Record work activities occasionally
          if (action.action === 'building' && Math.random() < 0.3) {
            notableEvents.push({
              text: `${villager.name} is constructing something new for the village.`,
              type: 'normal'
            });
          }

          if (action.action === 'hunting' && Math.random() < 0.3) {
            notableEvents.push({
              text: `${villager.name} stalks prey in the jungle.`,
              type: 'normal'
            });
          }

          if (action.action === 'fishing' && Math.random() < 0.3) {
            notableEvents.push({
              text: `${villager.name} casts their net into the river.`,
              type: 'normal'
            });
          }
        }
      }

      // LLM-driven building decisions
      if (actions.buildSuggestion) {
        this.handleBuildSuggestion(actions.buildSuggestion);
      }

      // Add notable events to chronicle (limit to prevent spam)
      if (notableEvents.length > 0) {
        const event = notableEvents[Math.floor(Math.random() * notableEvents.length)];
        this.addChronicleEntry(event.text, event.type);
      }

      // Add periodic village status update (every ~10 ticks)
      if (this.tickCount % 10 === 0) {
        const timeOfDay = Utils.getTimeOfDay(this.timeState.hours);
        const greetings = {
          dawn: 'The village stirs as the sun rises.',
          morning: 'Villagers are busy with their tasks.',
          afternoon: 'The heat of midday settles over Simville.',
          evening: 'People gather as the day winds down.',
          night: 'The village sleeps under the stars.'
        };
        const greeting = greetings[timeOfDay] || 'Life continues in Simville.';
        this.addChronicleEntry(greeting);
      }

    } catch (e) {
      console.error('LLM tick failed:', e);
    } finally {
      this.isGeneratingActions = false;
    }
  }

  showFallbackActionBubbles() {
    const options = [
      { emoji: '💬', theme: 'Checking in' },
      { emoji: '🧺', theme: 'Gathering supplies' },
      { emoji: '🔥', theme: 'Tending the fire' },
      { emoji: '🌿', theme: 'Foraging nearby' },
      { emoji: '🛠️', theme: 'Working' },
      { emoji: '👀', theme: 'Watching the village' }
    ];

    this.villagers.forEach((villager, index) => {
      if (villager.speechBubbleTimer > 500) return;
      const option = options[(this.tickCount + index) % options.length];
      villager.showSpeechBubble(option.emoji, option.theme, this.tickInterval + 1000);
    });
  }

  runSurvivalBehaviors() {
    if (this.villagers.length === 0) return;

    const foodRuleMultiplier = this.hasActiveRuleEffect('food_reserve') || this.hasActiveRuleEffect('farm_first') ? 1.45 : 1;
    const waterRuleMultiplier = this.hasActiveRuleEffect('water_priority') ? 1.45 : 1;
    const foodReserveTarget = Math.max(25, this.villagers.length * 8 * foodRuleMultiplier);
    const waterReserveTarget = Math.max(25, this.villagers.length * 10 * waterRuleMultiplier);
    const needsFood = this.resources.food < foodReserveTarget ||
      this.villagers.some(v => v.hunger < 45);
    const needsWater = this.resources.water < waterReserveTarget ||
      this.villagers.some(v => (v.thirst ?? 100) < 50);
    const needsMaterials = this.needsConstructionMaterials();

    if (!needsFood && !needsWater && !needsMaterials) return;

    if (needsWater && this.resources.water < this.villagers.length) {
      this.addResource(CONSTANTS.RESOURCE.WATER, Math.ceil(this.villagers.length * 3));
    }

    if (needsFood && this.resources.food < Math.ceil(this.villagers.length / 2)) {
      this.addResource(CONSTANTS.RESOURCE.FOOD, Math.ceil(this.villagers.length * 1.5));
    }

    const workers = this.villagers
      .filter(v =>
        v.health > 0 &&
        v.energy > 25 &&
        v.lifeStage?.canWork !== false &&
        v.status !== CONSTANTS.ACTIVITY.EATING &&
        v.status !== CONSTANTS.ACTIVITY.SLEEPING &&
        v.status !== CONSTANTS.ACTIVITY.RESTING
      )
      .sort((a, b) => {
        const aSkill = Math.max(a.skills.gathering || 0, a.skills.hunting || 0, a.skills.fishing || 0);
        const bSkill = Math.max(b.skills.gathering || 0, b.skills.hunting || 0, b.skills.fishing || 0);
        return bSkill - aSkill;
      });

    const ruleWorkerBonus = this.hasActiveRuleEffect('food_reserve') || this.hasActiveRuleEffect('water_priority') ? 1 : 0;
    const maxWorkers = Math.min(workers.length, Math.max(1, Math.ceil(this.villagers.length / 2) + ruleWorkerBonus));
    workers.slice(0, maxWorkers).forEach((worker, index) => {
      if (needsWater && (index === 0 || (worker.thirst ?? 100) < 60)) {
        if (this.assignWaterWork(worker)) return;
      }

      if (needsFood && (index < 2 || worker.hunger < 60)) {
        if (this.assignFoodWork(worker)) return;
      }

      if (needsMaterials) {
        this.assignMaterialWork(worker);
      }
    });
  }

  needsConstructionMaterials() {
    const reserves = {
      wood: 20,
      stone: 15,
      clay: 12,
      thatch: 12,
      herbs: 5
    };

    return Object.entries(reserves).some(([resource, amount]) => (this.resources[resource] || 0) < amount);
  }

  assignWaterWork(villager) {
    if (villager.isMoving && villager.currentAction?.survivalTask === 'water') return true;

    const waterNode = this.findNearestResource(villager.x, villager.y, CONSTANTS.RESOURCE.WATER, 18);
    if (waterNode) {
      villager.currentAction = { action: CONSTANTS.ACTIVITY.GATHERING, survivalTask: 'water' };
      villager.status = CONSTANTS.ACTIVITY.GATHERING;
      villager.activity = 'Collecting water';
      villager.moveTo(waterNode.x, waterNode.y, this.world);

      if (Utils.distance(villager.x, villager.y, waterNode.x, waterNode.y) <= 1.5) {
        const gathered = this.harvestResourceNode(villager, waterNode, villager.skills.gathering || 1);
        if (gathered > 0) villager.showSpeechBubble('💧', `Collected ${gathered} water`);
      } else if (!villager.speechBubble) {
        villager.showSpeechBubble('💧', 'Collecting water', 2500);
      }
      return true;
    }

    const well = this.world.structures.find(s => s.type === 'well');
    if (well) {
      this.addResource(CONSTANTS.RESOURCE.WATER, Math.max(2, villager.skills.gathering || 1));
      villager.status = CONSTANTS.ACTIVITY.GATHERING;
      villager.activity = 'Drawing water from the well';
      villager.showSpeechBubble('💧', 'Drawing water', 2500);
      return true;
    }

    const collected = this.addResource(CONSTANTS.RESOURCE.WATER, 2);
    if (collected > 0) {
      villager.status = CONSTANTS.ACTIVITY.GATHERING;
      villager.activity = 'Collecting surface water';
      villager.energy = Math.max(0, villager.energy - 0.5);
      villager.showSpeechBubble('💧', 'Collecting water', 2500);
      return true;
    }
    return false;
  }

  assignMaterialWork(villager) {
    const priorities = [
      CONSTANTS.RESOURCE.WOOD,
      CONSTANTS.RESOURCE.THATCH,
      CONSTANTS.RESOURCE.CLAY,
      CONSTANTS.RESOURCE.STONE,
      CONSTANTS.RESOURCE.HERBS,
      CONSTANTS.RESOURCE.RARE_MATERIALS
    ];

    const targetType = priorities.find(resource => {
      const targetReserve = resource === CONSTANTS.RESOURCE.RARE_MATERIALS ? 2 : 18;
      return (this.resources[resource] || 0) < targetReserve &&
        this.findNearestResource(villager.x, villager.y, resource, 16);
    });
    if (!targetType) return;

    const node = this.findNearestResource(villager.x, villager.y, targetType, 16);
    if (!node) return;

    villager.currentAction = { action: CONSTANTS.ACTIVITY.GATHERING, survivalTask: 'materials' };
    villager.status = CONSTANTS.ACTIVITY.GATHERING;
    villager.activity = `Gathering ${targetType}`;
    villager.moveTo(node.x, node.y, this.world);

    if (Utils.distance(villager.x, villager.y, node.x, node.y) <= 1.5) {
      const gathered = this.harvestResourceNode(villager, node, villager.skills.gathering || 1);
      if (gathered > 0) villager.showSpeechBubble('🧺', `Gathered ${gathered} ${targetType}`);
    } else if (!villager.speechBubble) {
      villager.showSpeechBubble('🧺', `Gathering ${targetType}`, 2500);
    }
  }

  assignFoodWork(villager) {
    if (villager.isMoving && villager.currentAction?.survivalTask === 'food') return true;

    const foodNode = this.findNearestResource(villager.x, villager.y, CONSTANTS.RESOURCE.FOOD, 14);
    const fishNode = this.findNearestResource(villager.x, villager.y, CONSTANTS.RESOURCE.FISH, 14);

    if (foodNode) {
      villager.currentAction = { action: CONSTANTS.ACTIVITY.GATHERING, survivalTask: 'food' };
      villager.status = CONSTANTS.ACTIVITY.GATHERING;
      villager.activity = 'Gathering food';
      villager.moveTo(foodNode.x, foodNode.y, this.world);

      if (Utils.distance(villager.x, villager.y, foodNode.x, foodNode.y) <= 1.5) {
        const gathered = this.harvestFoodNode(villager, foodNode);
        if (gathered > 0) villager.showSpeechBubble('🍎', `Gathered ${gathered} food`);
      } else if (!villager.speechBubble) {
        villager.showSpeechBubble('🧺', 'Gathering food', 2500);
      }
      return true;
    }

    if (fishNode && (villager.skills.fishing || 0) >= 3) {
      villager.currentAction = { action: CONSTANTS.ACTIVITY.FISHING, survivalTask: 'food' };
      villager.status = CONSTANTS.ACTIVITY.FISHING;
      villager.activity = 'Fishing';
      villager.moveTo(fishNode.x, fishNode.y, this.world);

      if (Utils.distance(villager.x, villager.y, fishNode.x, fishNode.y) <= 1.5) {
        const fished = this.harvestFoodNode(villager, fishNode);
        if (fished > 0) villager.showSpeechBubble('🎣', `Caught ${fished} fish`);
      } else if (!villager.speechBubble) {
        villager.showSpeechBubble('🎣', 'Fishing', 2500);
      }
      return true;
    }

    if ((villager.skills.hunting || 0) >= 3) {
      const hunted = this.handleHunting(villager);
      villager.status = CONSTANTS.ACTIVITY.HUNTING;
      villager.activity = 'Hunting for food';
      villager.energy = Math.max(0, villager.energy - 1);
      if (hunted > 0) villager.showSpeechBubble('🏹', `Hunted ${hunted} food`);
      return true;
    }

    const foraged = this.addResource(CONSTANTS.RESOURCE.FOOD, Math.max(1, Math.floor((villager.skills.gathering || 1) / 2)));
    if (foraged > 0) {
      villager.status = CONSTANTS.ACTIVITY.GATHERING;
      villager.activity = 'Foraging for food';
      villager.energy = Math.max(0, villager.energy - 0.5);
      villager.addInteraction('gather', 'food', `Foraged ${foraged} food`);
      villager.showSpeechBubble('🍎', `Foraged ${foraged} food`, 2500);
      return true;
    }
    return false;
  }

  findNearestResource(x, y, type, radius = 10) {
    return this.world.getResourcesInRadius(x, y, radius)
      .filter(r => r.type === type && !r.depleted && r.amount > 0)
      .sort((a, b) => Utils.distance(a.x, a.y, x, y) - Utils.distance(b.x, b.y, x, y))[0] || null;
  }

  harvestFoodNode(villager, resource) {
    const skill = resource.type === CONSTANTS.RESOURCE.FISH
      ? villager.skills.fishing || 1
      : villager.skills.gathering || 1;
    const gathered = this.world.harvestResource(resource.id, Math.max(1, skill));

    if (gathered > 0) {
      this.addResource(CONSTANTS.RESOURCE.FOOD, gathered);
      if (resource.type === CONSTANTS.RESOURCE.FISH) {
        this.addResource(CONSTANTS.RESOURCE.FISH, gathered);
      }
      villager.addInteraction('gather', resource.type, `Gathered ${gathered} ${resource.type}`);
      villager.energy = Math.max(0, villager.energy - 0.5);
    }

    return gathered;
  }

  harvestResourceNode(villager, resource, skillLevel = 1) {
    const gathered = this.world.harvestResource(resource.id, Math.max(1, skillLevel));
    if (gathered <= 0) return 0;

    this.addResource(resource.type, gathered);
    villager.addInteraction('gather', resource.type, `Gathered ${gathered} ${resource.type}`);
    villager.energy = Math.max(0, villager.energy - 0.5);
    return gathered;
  }

  handleGathering(villager, resourceType) {
    resourceType = this.normalizeResourceType(resourceType) || CONSTANTS.RESOURCE.FOOD;
    // Find nearby resource of the specified type
    const nearby = this.world.getResourcesInRadius(villager.x, villager.y, 8);
    let resource = nearby.find(r => r.type === resourceType && !r.depleted);

    if (!resource) {
      resource = this.findNearestResource(villager.x, villager.y, resourceType, 18);
      if (resource) {
        villager.moveTo(resource.x, resource.y, this.world);
      }
      return 0;
    }

    if (resource) {
      const skillLevel = villager.skills.gathering || 1;
      const gathered = this.world.harvestResource(resource.id, skillLevel);

      if (gathered > 0) {
        // Move to the resource to gather it
        villager.moveTo(resource.x, resource.y, this.world);

        this.addResource(resourceType, gathered);
        if (resourceType === CONSTANTS.RESOURCE.FISH) {
          this.addResource(CONSTANTS.RESOURCE.FOOD, gathered);
        }
        villager.addInteraction('gather', resourceType, `Gathered ${gathered} ${resourceType}`);

        // Chronicle entry for significant gathers
        if (gathered >= 5) {
          this.addChronicleEntry(`${villager.name} gathered ${gathered} ${resourceType} from the ${resource.biome || 'wilderness'}.`);
        }

        return gathered;
      }
    }
    return 0;
  }

  normalizeResourceType(resourceType) {
    if (!resourceType) return null;
    const text = String(resourceType).toLowerCase().replace(/[\s_-]/g, '');
    const map = {
      wood: CONSTANTS.RESOURCE.WOOD,
      timber: CONSTANTS.RESOURCE.WOOD,
      food: CONSTANTS.RESOURCE.FOOD,
      fruit: CONSTANTS.RESOURCE.FOOD,
      berries: CONSTANTS.RESOURCE.FOOD,
      water: CONSTANTS.RESOURCE.WATER,
      stone: CONSTANTS.RESOURCE.STONE,
      herbs: CONSTANTS.RESOURCE.HERBS,
      herb: CONSTANTS.RESOURCE.HERBS,
      clay: CONSTANTS.RESOURCE.CLAY,
      fish: CONSTANTS.RESOURCE.FISH,
      thatch: CONSTANTS.RESOURCE.THATCH,
      grass: CONSTANTS.RESOURCE.THATCH,
      reeds: CONSTANTS.RESOURCE.THATCH,
      rarematerials: CONSTANTS.RESOURCE.RARE_MATERIALS,
      rarematerial: CONSTANTS.RESOURCE.RARE_MATERIALS,
      gems: CONSTANTS.RESOURCE.RARE_MATERIALS,
      gem: CONSTANTS.RESOURCE.RARE_MATERIALS
    };
    return map[text] || Object.values(CONSTANTS.RESOURCE).find(resource => resource.toLowerCase() === text) || null;
  }

  handleHunting(villager) {
    // Hunting yields food
    const skillLevel = villager.skills.hunting || 1;
    const hunted = Utils.randomInt(1, skillLevel * 2);

    if (hunted > 0) {
      this.addResource(CONSTANTS.RESOURCE.FOOD, hunted);
      villager.addInteraction('hunt', 'food', `Hunted ${hunted} food`);
    }
    return hunted;
  }

  handleFishing(villager) {
    // Find water source
    const nearby = this.world.getResourcesInRadius(villager.x, villager.y, 5);
    const waterResource = nearby.find(r => r.type === 'fish' && !r.depleted);

    if (waterResource) {
      const skillLevel = villager.skills.fishing || 1;
      const fished = this.world.harvestResource(waterResource.id, skillLevel);

      if (fished > 0) {
        villager.moveTo(waterResource.x, waterResource.y, this.world);
        this.addResource(CONSTANTS.RESOURCE.FISH, fished);
        this.addResource(CONSTANTS.RESOURCE.FOOD, fished); // Fish counts as food
        villager.addInteraction('fish', 'fish', `Caught ${fished} fish`);
        return fished;
      }
    }
    return 0;
  }

  handleBuildSuggestion(suggestion) {
    // LLM suggests building structures based on village needs
    if (!suggestion || !suggestion.structure) return;

    const structureTypes = ['hut', 'storage', 'fire', 'watchtower', 'well', 'farm', 'workshop', 'shrine'];
    if (!structureTypes.includes(suggestion.structure)) return;
    return this.startConstructionProject(suggestion.structure, { source: 'llm' });

    // Check if we can afford it
    const struct = CONSTANTS.STRUCTURE[suggestion.structure.toUpperCase()];
    if (!struct) return;

    if (!this.canAffordStructure(struct)) return;

    // Find a builder villager
    const builder = this.villagers.find(v => v.energy > 30 && v.status !== 'sleeping');
    if (!builder) return;

    // Build it
    const buildLoc = this.findBuildLocation();
    if (!buildLoc) return;

    if (!this.consumeStructureCost(struct)) return;

    // Create structure
    this.world.addStructure({
      type: struct.id,
      x: buildLoc.x,
      y: buildLoc.y,
      builtBy: builder.id
    });

    this.chronicle.stats.structuresBuilt++;
    this.addChronicleEntry(`${builder.name} led the construction of a new ${struct.name}!`);
    builder.showSpeechBubble('🏠', `Building ${struct.name}`);

    // Update UI
    this.ui.showToast(`${struct.name} built!`);
  }

  async performChieftanMeeting() {
    const chieftan = this.villagers.find(v => v.isChieftan);
    if (!chieftan) return;

    // Find communal fire location
    const fire = this.world.structures.find(s => s.type === 'fire');
    const meetingLocation = fire || { x: this.world.villageCenter.x, y: this.world.villageCenter.y };

    // Move chieftan to fire
    chieftan.moveTo(meetingLocation.x, meetingLocation.y, this.world);

    // Generate meeting guidance from LLM
    const meetingGuidance = await this.generateChieftanGuidance();

    // Record the meeting in chronicle
    this.addChronicleEntry(`As night falls, ${chieftan.name} gathers the tribe around the fire.`);

    // Chieftan gives speech bubble
    chieftan.showSpeechBubble('👑', 'Leading the tribe');

    // Apply guidance effects
    if (meetingGuidance) {
      if (meetingGuidance.focus === 'food') {
        this.addChronicleEntry(`${chieftan.name}'s words stir the hunters. The village will focus on gathering food.`);
        // Boost hunting motivation
        this.villagers.forEach(v => {
          if (v.skills.hunting >= 5) {
            v.mood = Math.min(100, v.mood + 5);
          }
        });
      } else if (meetingGuidance.focus === 'building') {
        this.addChronicleEntry(`${chieftan.name} speaks of progress. The village will prioritize construction.`);
        // Boost building motivation
        this.villagers.forEach(v => {
          if (v.skills.crafting >= 5) {
            v.mood = Math.min(100, v.mood + 5);
          }
        });
      } else if (meetingGuidance.focus === 'harmony') {
        this.addChronicleEntry(`${chieftan.name} speaks of unity. The tribe strengthen their bonds.`);
        // Boost social relationships
        this.villagers.forEach(v => {
          v.socialNeed = Math.min(100, v.socialNeed + 15);
        });
      } else if (meetingGuidance.focus === 'rest') {
        this.addChronicleEntry(`${chieftan.name} calls for rest. The tribe will conserve their strength.`);
        // Everyone recovers energy
        this.villagers.forEach(v => {
          v.energy = Math.min(100, v.energy + 10);
        });
      }

      if (meetingGuidance.rule) {
        this.enactChieftanRule(meetingGuidance.rule, chieftan, meetingGuidance.focus);
      } else if (this.shouldCreateFallbackRule()) {
        this.enactChieftanRule(this.createFallbackRule(meetingGuidance.focus), chieftan, meetingGuidance.focus);
      }
    }

    // Everyone gathers (move villagers towards fire if nearby)
    this.villagers.forEach(v => {
      if (v.id !== chieftan.id && v.status !== 'sleeping') {
        const dist = Utils.distance(v.x, v.y, meetingLocation.x, meetingLocation.y);
        if (dist < 10) {
          v.moveTo(meetingLocation.x + Utils.randomFloat(-2, 2), meetingLocation.y + Utils.randomFloat(-2, 2), this.world);
        }
        v.showSpeechBubble('🔥', 'Attending tribe meeting');
      }
    });
  }

  shouldCreateFallbackRule() {
    const daysSinceRule = this.timeState.day - (this.government?.lastRuleDay || 0);
    return daysSinceRule >= 4 && Math.random() < 0.55;
  }

  enactChieftanRule(ruleInput, chieftan, focus = 'harmony') {
    if (!ruleInput) return null;
    this.government = this.normalizeGovernment(this.government);

    const rule = this.normalizeRule({
      ...ruleInput,
      focus,
      createdBy: chieftan?.name || 'Chieftan',
      createdDay: this.timeState.day,
      active: true
    });

    const duplicate = this.government.rules.find(existing =>
      existing.active && existing.effect === rule.effect && existing.category === rule.category
    );
    if (duplicate) {
      duplicate.createdDay = this.timeState.day;
      duplicate.durationDays = Math.max(duplicate.durationDays, rule.durationDays);
      duplicate.compliance = Math.min(100, duplicate.compliance + 8);
      this.addChronicleEntry(`${chieftan.name} renews the rule: "${duplicate.edict}"`);
      return duplicate;
    }

    this.government.rules.unshift(rule);
    this.government.rules = this.government.rules.slice(0, 8);
    this.government.lastRuleDay = this.timeState.day;
    this.government.ruleHistory.unshift({ ...rule });
    this.government.ruleHistory = this.government.ruleHistory.slice(0, 30);

    this.applyImmediateRuleEffect(rule);
    this.addChronicleEntry(`${chieftan.name} sets a new fireside rule: "${rule.edict}"`, 'celebration');
    chieftan?.showSpeechBubble('Rule', rule.title, 6000);
    return rule;
  }

  createFallbackRule(focus = 'harmony') {
    const rules = {
      food: {
        title: 'Granary First',
        edict: 'Each able worker must help keep the granary filled before comfort is sought.',
        category: 'food',
        effect: 'food_reserve',
        durationDays: 10
      },
      building: {
        title: 'Hands To The Frame',
        edict: 'When a structure is planned, strong hands must answer the builder.',
        category: 'building',
        effect: 'construction_duty',
        durationDays: 8
      },
      harmony: {
        title: 'Peace At The Fire',
        edict: 'Quarrels must be cooled at the fire before the next dawn.',
        category: 'harmony',
        effect: 'harmony_oath',
        durationDays: 12
      },
      rest: {
        title: 'Night Quiet',
        edict: 'After nightfall, the village must favor rest unless hunger or thirst calls.',
        category: 'rest',
        effect: 'rest_curfew',
        durationDays: 8
      }
    };
    return rules[focus] || rules.harmony;
  }

  applyImmediateRuleEffect(rule) {
    switch (rule.effect) {
      case 'harmony_oath':
        this.villagers.forEach(v => {
          v.socialNeed = Math.min(100, v.socialNeed + 8);
          v.mood = Math.min(100, v.mood + 4);
        });
        break;
      case 'rest_curfew':
        this.villagers.forEach(v => {
          v.energy = Math.min(100, v.energy + 6);
        });
        break;
      case 'construction_duty':
        this.planAutonomousConstruction();
        break;
      default:
        break;
    }
  }

  async generateChieftanGuidance() {
    if (!llm.config?.llm?.apiKey) {
      // Fallback guidance without LLM
      const focuses = ['food', 'building', 'harmony', 'rest'];
      const focus = focuses[Math.floor(Math.random() * focuses.length)];
      return {
        focus,
        rule: this.shouldCreateFallbackRule() ? this.createFallbackRule(focus) : null
      };
    }

    try {
      const prompt = `The chieftan ${this.villagers.find(v => v.isChieftan)?.name || 'Kana'} must give guidance to the village.

Current state:
- Population: ${this.villagers.length} villagers
- Food: ${this.resources.food || 0}
- Wood: ${this.resources.wood || 0}
- Stone: ${this.resources.stone || 0}
- Village mood: ${this.villagers.reduce((sum, v) => sum + v.mood, 0) / this.villagers.length}
- Day: ${this.timeState.day}
- Structures: ${this.world.structures.length}
- Active rules: ${this.getActiveRules().map(rule => `${rule.title}: ${rule.edict}`).join('; ') || 'none'}

What should the village focus on tomorrow? Choose one:
- food: if food is low or hunters need motivation
- building: if new structures are needed
- harmony: if social tensions exist or morale is low
- rest: if villagers are tired

The chieftan may also create one temporary rule for the village to obey. Use a rule only if it would help the current situation or establish order.

Respond with JSON: {
  "focus": "food|building|harmony|rest",
  "reason": "brief explanation",
  "rule": null or {
    "title": "short rule name",
    "edict": "one sentence villagers can understand",
    "category": "food|water|building|rest|harmony|care|general",
    "effect": "food_reserve|water_priority|construction_duty|farm_first|rest_curfew|harmony_oath|care_duty|shared_duty",
    "durationDays": 3-30
  }
}`;

      const result = await llm.generate(prompt);
      if (result && result.focus) {
        return result;
      }
    } catch (e) {
      console.error('Chieftan guidance failed:', e);
    }

    return { focus: 'harmony' };
  }

  processEventQueue() {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      this.handleEvent(event);
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case 'birth':
        this.handleBirth(event.villager);
        break;
      case 'death':
        this.handleDeath(event.villager);
        break;
      case 'marriage':
        this.handleMarriage(event.villager1, event.villager2);
        break;
      case 'ritual':
        this.performRitual(event.ritual);
        break;
    }
  }

  async handleBirth(newVillager) {
    if (this.villagers.some(v => v.id === newVillager.id)) return;

    this.villagers.push(newVillager);
    this.chronicle.stats.births++;

    const parentNames = newVillager.parentNames?.join(' and ') || 'the village';
    this.addChronicleEntry(`${newVillager.name} has been born to ${parentNames}!`, 'celebration');
    newVillager.showSpeechBubble('👶', 'Newborn', 6000);
    newVillager.parentNames?.forEach(parentName => {
      const parent = this.villagers.find(v => v.name === parentName);
      parent?.showSpeechBubble('🎉', 'Welcomed a child', 6000);
    });

    // Name ceremony
    this.performRitual(CONSTANTS.RITUAL.NAME_CEREMONY);
  }

  handleDeath(villager) {
    this.chronicle.stats.deaths++;

    const isLegendary = villager.isChieftan || villager.mood > 80;
    const chronicleText = `${villager.name} has passed away. ${villager.isChieftan ? 'The village mourns its leader.' : 'They will be remembered.'}`;

    this.addChronicleEntry(chronicleText, isLegendary ? 'legendary' : 'normal');

    if (isLegendary) {
      this.addLegendaryEntry(`${villager.name}'s Legacy`, chronicleText);
    }

    const partner = this.villagers.find(v => v.id === villager.partnerId);
    if (partner) {
      partner.partnerId = null;
      partner.partnerName = null;
      if (partner.expectingChild?.partnerId === villager.id) {
        partner.expectingChild.partnerName = villager.name;
      }
    }

    // Remove from villagers
    const index = this.villagers.indexOf(villager);
    if (index > -1) {
      this.villagers.splice(index, 1);
    }

    // Funeral ritual
    this.performRitual(CONSTANTS.RITUAL.FUNERAL);
  }

  handleMarriage(villager1, villager2) {
    if (!villager1 || !villager2 || villager1.partnerId || villager2.partnerId) return;

    this.chronicle.stats.marriages++;
    villager1.partnerId = villager2.id;
    villager1.partnerName = villager2.name;
    villager1.lastPartnershipDay = this.timeState.day;
    villager2.partnerId = villager1.id;
    villager2.partnerName = villager1.name;
    villager2.lastPartnershipDay = this.timeState.day;
    villager1.relationships[villager2.name] = CONSTANTS.RELATIONSHIP.SOULMATE_THRESHOLD;
    villager2.relationships[villager1.name] = CONSTANTS.RELATIONSHIP.SOULMATE_THRESHOLD;
    villager1.showSpeechBubble('😍', `Joined with ${villager2.name}`, 6000);
    villager2.showSpeechBubble('😍', `Joined with ${villager1.name}`, 6000);

    this.addChronicleEntry(`${villager1.name} and ${villager2.name} have joined as one. The village celebrates their union!`, 'celebration');
    this.performRitual(CONSTANTS.RITUAL.MARRIAGE);
  }

  async performRitual(ritualDef) {
    const participants = this.villagers.filter(v => {
      if (ritualDef.participants === 'all') return v.status !== CONSTANTS.ACTIVITY.SLEEPING;
      if (ritualDef.participants === 'adults') {
        return v.lifeStage !== CONSTANTS.LIFE_STAGE.CHILD && v.lifeStage !== CONSTANTS.LIFE_STAGE.YOUTH;
      }
      return true;
    });

    // No participants - skip ritual
    if (participants.length === 0) return;

    // Apply ritual effects
    participants.forEach(v => {
      v.mood = Math.min(100, v.mood + ritualDef.moodBoost);

      // Social gains
      participants.forEach(other => {
        if (other.id !== v.id) {
          const current = v.relationships[other.name] || 0;
          v.relationships[other.name] = Math.min(100, current + ritualDef.socialGain);
        }
      });
    });

    // Generate ritual narrative
    const leader = participants.find(v => v.isChieftan) || participants[0];
    const narrative = await llm.generateRitualDialogue(ritualDef, leader, participants);

    // Show speech bubbles
    participants.slice(0, 5).forEach(v => {
      v.showSpeechBubble(ritualDef.emoji, ritualDef.name);
    });
  }

  checkDeaths() {
    const deadVillagers = this.villagers.filter(v => v.health <= 0);
    deadVillagers.forEach(v => {
      this.eventQueue.push({ type: 'death', villager: v });
    });
  }

  planAutonomousConstruction() {
    if (this.constructionProjects.length > 0 || !this.world) return;

    const structureId = this.chooseNeededStructure();
    if (structureId) {
      this.startConstructionProject(structureId, { source: 'autonomous' });
    }
  }

  chooseNeededStructure() {
    const counts = this.world.structures.reduce((acc, structure) => {
      acc[structure.type] = (acc[structure.type] || 0) + 1;
      return acc;
    }, {});

    const pendingCounts = this.constructionProjects.reduce((acc, project) => {
      acc[project.type] = (acc[project.type] || 0) + 1;
      return acc;
    }, {});

    const hasOrPending = type => (counts[type] || 0) + (pendingCounts[type] || 0);
    const priorities = [];

    if (this.villagers.length + this.getExpectedBirthCount() >= this.getPopulationCapacity()) {
      priorities.push('hut');
    }

    if (this.hasActiveRuleEffect('construction_duty')) {
      priorities.push('hut', 'farm', 'storage', 'workshop');
    }

    if ((this.resources.water || 0) < this.villagers.length * 8 && hasOrPending('well') < Math.max(1, Math.ceil(this.villagers.length / 8))) {
      priorities.push('well');
    }

    if ((this.resources.food || 0) < this.villagers.length * 8 && hasOrPending('farm') < Math.max(1, Math.ceil(this.villagers.length / 6))) {
      priorities.push('farm');
    }

    const capacity = this.getStorageCapacity();
    const storagePressure = Object.values(CONSTANTS.RESOURCE).some(resource =>
      (this.resources[resource] || 0) > (capacity[resource] || 1) * 0.82
    );
    if (storagePressure && hasOrPending('storage') < Math.max(1, Math.ceil(this.villagers.length / 10))) {
      priorities.push('storage');
    }

    if (this.timeState.day > 12 && hasOrPending('workshop') === 0) {
      priorities.push('workshop');
    }

    return priorities.find(id => {
      const struct = this.getStructureDefById(id);
      return struct && this.canAffordStructure(struct) && this.findBuildLocation(id);
    }) || null;
  }

  startConstructionProject(structureId, options = {}) {
    const struct = this.getStructureDefById(structureId);
    if (!struct) return false;

    if (this.constructionProjects.some(project => project.type === struct.id)) {
      if (options.source === 'manual') this.ui.showToast(`${struct.name} is already under construction.`, true);
      return false;
    }

    if (!this.canAffordStructure(struct)) {
      if (options.source === 'manual') this.ui.showToast(`Not enough resources for ${struct.name}.`, true);
      return false;
    }

    const buildLoc = this.findBuildLocation(struct.id);
    if (!buildLoc) {
      if (options.source === 'manual') this.ui.showToast('No valid build location found!', true);
      return false;
    }

    const builder = this.selectBuilder(options.builderId);
    if (!builder) {
      if (options.source === 'manual') this.ui.showToast('No available builder.', true);
      return false;
    }

    if (!this.consumeStructureCost(struct)) return false;

    const project = {
      id: Utils.generateId(),
      type: struct.id,
      name: struct.name,
      x: buildLoc.x,
      y: buildLoc.y,
      builderId: builder.id,
      progress: 0,
      workRequired: this.getStructureWorkRequired(struct),
      startedDay: this.timeState.day,
      source: options.source || 'autonomous'
    };

    this.constructionProjects.push(project);
    builder.status = CONSTANTS.ACTIVITY.BUILDING;
    builder.activity = `Building ${struct.name}`;
    builder.currentAction = { action: CONSTANTS.ACTIVITY.BUILDING, structure: struct.id };
    builder.moveTo(project.x, project.y, this.world);
    builder.showSpeechBubble('🏗️', `Building ${struct.name}`, 4000);

    this.addChronicleEntry(`${builder.name} has begun building a ${struct.name}.`);
    if (options.source === 'manual') this.ui.showToast(`${struct.name} construction started.`);
    return true;
  }

  processConstructionProjects(deltaTime) {
    if (!this.constructionProjects.length) return;

    const completed = [];
    this.constructionProjects.forEach(project => {
      let builder = this.villagers.find(v => v.id === project.builderId && v.health > 0);
      if (!builder || builder.lifeStage?.canWork === false) {
        builder = this.selectBuilder();
        project.builderId = builder?.id || null;
      }
      if (!builder) return;

      builder.status = CONSTANTS.ACTIVITY.BUILDING;
      builder.activity = `Building ${project.name}`;
      builder.currentAction = { action: CONSTANTS.ACTIVITY.BUILDING, structure: project.type };
      builder.moveTo(project.x, project.y, this.world);

      const distance = Utils.distance(builder.x, builder.y, project.x, project.y);
      if (distance <= 1.5) {
        const skill = Math.max(1, builder.skills.crafting || 1);
        project.progress += (deltaTime / 1000) * (1 + skill * 0.25);
        builder.energy = Math.max(0, builder.energy - 0.08 * (deltaTime / 1000));
        if (!builder.speechBubble && Math.random() < 0.08) {
          builder.showSpeechBubble('🔨', `Building ${project.name}`, 2500);
        }
      }

      if (project.progress >= project.workRequired) {
        completed.push(project);
      }
    });

    completed.forEach(project => this.completeConstructionProject(project));
  }

  completeConstructionProject(project) {
    const index = this.constructionProjects.findIndex(p => p.id === project.id);
    if (index === -1) return;

    this.constructionProjects.splice(index, 1);
    this.world.addStructure({
      type: project.type,
      x: project.x,
      y: project.y,
      builtBy: project.builderId
    });

    const builder = this.villagers.find(v => v.id === project.builderId);
    if (builder) {
      builder.status = CONSTANTS.ACTIVITY.IDLE;
      builder.activity = 'Finished construction';
      builder.currentAction = null;
      builder.showSpeechBubble('🏠', `${project.name} complete`, 5000);
    }

    this.chronicle.stats.structuresBuilt++;
    this.addChronicleEntry(`A new ${project.name} now stands in the village.`, 'celebration');
    this.ui.showToast(`${project.name} built!`);
  }

  selectBuilder(preferredBuilderId = null) {
    const candidates = this.villagers
      .filter(v =>
        v.health > 0 &&
        v.energy > 20 &&
        v.lifeStage?.canWork !== false &&
        v.status !== CONSTANTS.ACTIVITY.SLEEPING &&
        v.status !== CONSTANTS.ACTIVITY.EATING &&
        v.status !== CONSTANTS.ACTIVITY.DRINKING
      )
      .sort((a, b) => (b.skills.crafting || 0) - (a.skills.crafting || 0));

    if (preferredBuilderId) {
      const preferred = candidates.find(v => v.id === preferredBuilderId);
      if (preferred) return preferred;
    }

    return candidates[0] || null;
  }

  // Technology Research System
  processTechResearch(deltaTime) {
    if (!this.techState.currentResearch) return;

    const { techId, progress, startDay } = this.techState.currentResearch;
    const tech = CONSTANTS.TECH[techId];
    if (!tech) {
      this.techState.currentResearch = null;
      return;
    }

    // Calculate progress based on research speed and time
    const researchPerMs = (1 / (tech.researchTime * 24 * 60 * 60 * 1000)) * this.techState.researchSpeed;
    this.techState.currentResearch.progress += deltaTime * researchPerMs;

    // Check if research complete
    if (this.techState.currentResearch.progress >= 1) {
      this.completeTechResearch(tech);
    }
  }

  completeTechResearch(tech) {
    if (!this.techState.researched.includes(tech.id)) {
      this.techState.researched.push(tech.id);
    }
    this.techState.currentResearch = null;

    this.addChronicleEntry(`The village has discovered: ${tech.name}!`, 'celebration');
    this.ui.showToast(`New Technology: ${tech.name}!`);

    // Log the discovery in chronicle legendary
    this.chronicle.legendary.unshift({
      day: this.timeState.day,
      text: `Discovered ${tech.name}: ${tech.description}`
    });
  }

  async requestTechDecision() {
    // Skip if no LLM or paused
    if (this.paused || !llm.config?.llm?.apiKey) return;

    const worldState = {
      resources: { ...this.resources },
      structures: this.world.structures.map(s => ({ type: s.type, x: s.x, y: s.y })),
      population: this.villagers.length,
      day: this.timeState.day,
      timeOfDay: Utils.getTimeOfDay(this.timeState.hours),
      season: this.timeState.season.name
    };

    const timeState = {
      day: this.timeState.day,
      hours: this.timeState.hours,
      season: this.timeState.season,
      dayInSeason: this.timeState.dayInSeason
    };

    try {
      const decision = await llm.generateTechDecision(worldState, this.techState, timeState);

      if (!decision) return;

      // Log the decision reason
      if (decision.reason) {
        console.log(`Tech decision: ${decision.decision} - ${decision.reason}`);
      }

      // Handle the decision
      if (decision.decision === 'switch' && decision.techId) {
        // Switch to new technology, cancelling current research
        const oldResearch = this.techState.currentResearch?.techId;
        this.startTechResearch(decision.techId);
        if (oldResearch) {
          this.addChronicleEntry(`The village shifts focus from ${CONSTANTS.TECH[oldResearch]?.name || oldResearch} to ${CONSTANTS.TECH[decision.techId]?.name || decision.techId}.`);
        }
      } else if (decision.decision === 'start_new' && decision.techId && !this.techState.currentResearch) {
        // Start new research when nothing is ongoing
        this.startTechResearch(decision.techId);
        this.addChronicleEntry(`The village begins researching ${CONSTANTS.TECH[decision.techId]?.name || decision.techId}.`);
      } else if (decision.decision === 'continue' && this.techState.currentResearch) {
        // Continue current research - just log occasionally
        const tech = CONSTANTS.TECH[this.techState.currentResearch.techId];
        if (tech && Math.random() < 0.3) {
          const progress = Math.round(this.techState.currentResearch.progress * 100);
          this.addChronicleEntry(`The village continues researching ${tech.name} (${progress}% complete).`);
        }
      }
    } catch (error) {
      console.error('Tech decision error:', error);
    }
  }

  getAvailableTechs() {
    const available = [];
    for (const [key, tech] of Object.entries(CONSTANTS.TECH)) {
      if (this.techState.researched.includes(tech.id)) continue;
      if (this.techState.currentResearch?.techId === tech.id) continue;

      // Check prerequisites
      const prereqsMet = tech.prerequisites.every(p => this.techState.researched.includes(p));
      if (!prereqsMet) continue;

      available.push(tech);
    }
    return available;
  }

  startTechResearch(techId) {
    const tech = CONSTANTS.TECH[techId];
    if (!tech) return false;

    // Check if already researched
    if (this.techState.researched.includes(techId)) return false;

    // Check prerequisites
    const prereqsMet = tech.prerequisites.every(p => this.techState.researched.includes(p));
    if (!prereqsMet) return false;

    // Start new research (cancel any current)
    this.techState.currentResearch = {
      techId,
      progress: 0,
      startDay: this.timeState.day
    };

    this.addChronicleEntry(`Research has begun on ${tech.name}...`);
    return true;
  }

  getTechResearchProgress() {
    if (!this.techState.currentResearch) return null;
    const tech = CONSTANTS.TECH[this.techState.currentResearch.techId];
    return {
      tech,
      progress: this.techState.currentResearch.progress,
      percent: Math.round(this.techState.currentResearch.progress * 100)
    };
  }

  getResearchedTechs() {
    return this.techState.researched.map(id => CONSTANTS.TECH[id]).filter(Boolean);
  }

  hasTech(techId) {
    return this.techState.researched.includes(techId);
  }

  getStructureDefById(structureId) {
    return Object.values(CONSTANTS.STRUCTURE).find(s => s.id === structureId) ||
      CONSTANTS.STRUCTURE[String(structureId || '').toUpperCase()] ||
      null;
  }

  normalizeStructureType(value) {
    if (!value) return null;
    const text = String(value).toLowerCase().replace(/[^a-z]/g, '');
    const aliases = {
      huts: 'hut',
      house: 'hut',
      homes: 'hut',
      home: 'hut',
      barn: 'storage',
      storagebarn: 'storage',
      storehouse: 'storage',
      campfire: 'fire',
      communalfire: 'fire',
      tower: 'watchtower',
      lookout: 'watchtower',
      water: 'well',
      farmplot: 'farm',
      field: 'farm',
      fields: 'farm',
      crafting: 'workshop',
      craftshop: 'workshop',
      temple: 'shrine'
    };
    const normalized = aliases[text] || text;
    return Object.values(CONSTANTS.STRUCTURE).some(struct => struct.id === normalized)
      ? normalized
      : null;
  }

  getStructureWorkRequired(struct) {
    const costTotal = this.getStructureCosts(struct)
      .reduce((sum, [, amount]) => sum + amount, 0);
    return Math.max(18, 12 + costTotal * 0.6);
  }

  buildStructure(structureId) {
    return this.startConstructionProject(structureId, {
      source: 'manual',
      builderId: this.selectedVillager?.id
    });
  }

  findBuildLocation(structureId = null) {
    // Find walkable tile near village center
    const cx = this.world.villageCenter.x;
    const cy = this.world.villageCenter.y;

    for (let r = 1; r < 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tile = this.world.getTile(cx + dx, cy + dy);
          const x = cx + dx;
          const y = cy + dy;
          if (!tile || !tile.walkable) continue;
          if (this.world.getStructureAt(x, y)) continue;
          if (this.world.getResourceAt(x, y)) continue;
          if (this.constructionProjects.some(project => project.x === x && project.y === y)) continue;
          if (structureId === 'farm' && tile.biome === CONSTANTS.BIOME.OCEAN) continue;
          return { x, y };
        }
      }
    }
    return null;
  }

  addChronicleEntry(text, type = 'normal') {
    const entry = {
      text,
      day: this.timeState.day,
      type
    };

    this.chronicle.entries.unshift(entry);

    // Keep only last 100 entries
    if (this.chronicle.entries.length > 100) {
      this.chronicle.entries.pop();
    }
  }

  addLegendaryEntry(title, text) {
    this.chronicle.legendary.unshift({
      title,
      text,
      day: this.timeState.day
    });

    // Keep only last 20 legends
    if (this.chronicle.legendary.length > 20) {
      this.chronicle.legendary.pop();
    }
  }

  render() {
    const timeOfDay = Utils.getTimeOfDay(this.timeState.hours);

    // Smooth camera tracking of selected villager
    if (this.cameraTarget && this.villagers.includes(this.cameraTarget)) {
      const target = this.cameraTarget;
      const currentX = this.worldRenderer.camera.x + this.canvas.width / 2;
      const currentY = this.worldRenderer.camera.y + this.canvas.height / 2;
      const targetX = target.x * CONSTANTS.WORLD.TILE_SIZE * CONSTANTS.WORLD.PIXEL_SCALE * this.worldRenderer.camera.zoom;
      const targetY = target.y * CONSTANTS.WORLD.TILE_SIZE * CONSTANTS.WORLD.PIXEL_SCALE * this.worldRenderer.camera.zoom;

      // Smooth lerp towards target
      const lerpFactor = 0.1;
      const newCamX = currentX + (targetX - currentX) * lerpFactor;
      const newCamY = currentY + (targetY - currentY) * lerpFactor;

      this.worldRenderer.camera.x = newCamX - this.canvas.width / 2;
      this.worldRenderer.camera.y = newCamY - this.canvas.height / 2;
    }

    // Render world
    this.worldRenderer.render(
      timeOfDay,
      this.timeState.season,
      this.graphicsSettings.showLabels
    );

    this.constructionProjects.forEach(project => {
      this.worldRenderer.renderConstructionProject(project);
    });

    for (const villager of this.villagers) {
      this.villagerRenderer.render(
        villager,
        this.worldRenderer.camera,
        CONSTANTS.WORLD.PIXEL_SCALE,
        this.graphicsSettings.showSpeechBubbles
      );

      if (this.graphicsSettings.showLabels) {
        this.villagerRenderer.renderLabel(villager, this.worldRenderer.camera, CONSTANTS.WORLD.PIXEL_SCALE);
      }
    }

    // Render minimap
    const minimap = document.getElementById('minimap-canvas');
    if (minimap) {
      this.worldRenderer.renderMinimap(minimap, this.villagers, this.graphicsSettings.showLabels, this.constructionProjects);
    }
  }

  async saveGame() {
    const saveData = {
      version: CONSTANTS.VERSION,
      world: this.world.serialize(),
      villagers: this.villagers.map(v => v.serialize()),
      resources: this.resources,
      timeState: this.timeState,
      chronicle: this.chronicle,
      government: this.government,
      constructionProjects: this.constructionProjects,
      graphicsSettings: this.graphicsSettings,
      techState: this.techState,
      savedAt: Date.now()
    };

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.saveGame(saveData);
        if (result.success) {
          this.ui.showToast('Game saved!');
        } else {
          this.ui.showToast('Save failed: ' + result.error, true);
        }
      } else {
        Utils.saveToStorage('saves', [saveData]);
        this.ui.showToast('Game saved!');
      }
    } catch (e) {
      console.error('Save failed:', e);
      this.ui.showToast('Save failed!', true);
    }
  }

  async loadGame(saveData) {
    try {
      // Restore world
      this.world = World.deserialize(saveData.world);
      this.worldRenderer.world = this.world;
      this.worldRenderer.camera.zoom = 1;
      this.selectedVillager = null;
      this.cameraTarget = null;

      // Restore villagers
      this.villagers = saveData.villagers.map(v => Villager.deserialize(v));
      this.villagers.forEach(villager => {
        villager.goals = this.normalizeGoals(villager.goals, villager);
        villager.activity = this.formatVillagerFacingText(villager.activity);
      });

      // Restore resources
      this.resources = this.normalizeResources(saveData.resources);

      // Restore time
      this.timeState = saveData.timeState;

      // Restore chronicle
      this.chronicle = saveData.chronicle;
      this.government = this.normalizeGovernment(saveData.government);
      this.constructionProjects = saveData.constructionProjects || [];
      this.constructionAccumulator = 0;

      // Restore graphics settings
      if (saveData.graphicsSettings) {
        this.graphicsSettings = saveData.graphicsSettings;
      }

      // Restore tech state
      if (saveData.techState) {
        this.techState = saveData.techState;
      } else {
        this.techState = { researched: [], currentResearch: null, researchSpeed: 1 };
      }

      // Center camera
      this.worldRenderer.centerOn(this.world.villageCenter.x, this.world.villageCenter.y);

      this.ui.showToast('Game loaded!');
    } catch (e) {
      console.error('Load failed:', e);
      this.ui.showToast('Load failed!', true);
    }
  }

  autoSave() {
    // Silent auto-save
    this.saveGame();
  }
}

// Global game instance
let game = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  game = new Game();
  window.game = game;
  await game.initialize();
});
