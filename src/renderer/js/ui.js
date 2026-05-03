// Simville UI Module

class UIManager {
  constructor() {
    this.elements = {};
    this.panels = {};
    this.activePanel = null;
    this.toastTimer = null;
    this.chroniclePage = 0;
    this.entriesPerPage = 10;
  }

  initialize() {
    // Cache DOM elements
    this.elements = {
      // HUD
      timeDisplay: document.getElementById('time-display'),
      seasonDisplay: document.getElementById('season-display'),
      speedDisplay: document.getElementById('speed-display'),
      btnPause: document.getElementById('btn-pause'),
      btnChronicle: document.getElementById('btn-chronicle'),
      btnBuild: document.getElementById('btn-build'),
      btnTech: document.getElementById('btn-tech'),
      btnSettings: document.getElementById('btn-settings'),

      // Resource bar
      resWood: document.getElementById('res-wood'),
      resFood: document.getElementById('res-food'),
      resWater: document.getElementById('res-water'),
      resStone: document.getElementById('res-stone'),
      resHerbs: document.getElementById('res-herbs'),
      resClay: document.getElementById('res-clay'),
      resFish: document.getElementById('res-fish'),
      resThatch: document.getElementById('res-thatch'),
      resRareMaterials: document.getElementById('res-rare'),
      resPopulation: document.getElementById('res-population'),

      // Panels
      villagerPanel: document.getElementById('villager-panel'),
      buildMenu: document.getElementById('build-menu'),
      chroniclePanel: document.getElementById('chronicle-panel'),
      settingsPanel: document.getElementById('settings-panel'),
      loadDialog: document.getElementById('load-dialog'),
      newWorldDialog: document.getElementById('newworld-dialog'),

      // Villager panel elements
      villagerName: document.getElementById('villager-name'),
      villagerPortrait: document.getElementById('villager-sprite'),
      villagerTitle: document.getElementById('villager-title'),
      villagerSkills: document.getElementById('villager-skills'),
      villagerStatus: document.getElementById('villager-status'),
      villagerMood: document.getElementById('villager-mood'),
      villagerEnergyBar: document.querySelector('#villager-needs .progress-bar.energy .progress-fill'),
      villagerHungerBar: document.querySelector('#villager-needs .progress-bar.hunger .progress-fill'),
      villagerSocialBar: document.querySelector('#villager-needs .progress-bar.social .progress-fill'),
      villagerActivityText: document.getElementById('villager-activity-text'),
      villagerInteractionList: document.getElementById('villager-interaction-list'),
      villagerFamilyList: document.getElementById('villager-family-list'),
      villagerGoalsList: document.getElementById('villager-goals-list'),
      villagerSecretsList: document.getElementById('villager-secrets-list'),
      secretsCount: document.getElementById('secrets-count'),
      villagerBackstoryText: document.getElementById('villager-backstory-text'),

      // Build menu
      buildGrid: document.getElementById('build-grid'),

      // Chronicle
      chronicleLegendaryList: document.getElementById('chronicle-legendary-list'),
      chronicleRuleList: document.getElementById('chronicle-rule-list'),
      chronicleEntryList: document.getElementById('chronicle-entry-list'),
      chroniclePage: document.getElementById('chronicle-page'),

      // Settings
      settingEndpoint: document.getElementById('setting-endpoint'),
      settingModel: document.getElementById('setting-model'),
      settingApiKey: document.getElementById('setting-apikey'),
      settingTokens: document.getElementById('setting-tokens'),
      settingTemperature: document.getElementById('setting-temperature'),
      tempValue: document.getElementById('temp-value'),
      connectionStatus: document.getElementById('connection-status'),
      settingDayLength: document.getElementById('setting-daylength'),
      settingWorldSize: document.getElementById('setting-worldsize'),
      settingLabels: document.getElementById('setting-labels'),
      settingBubbles: document.getElementById('setting-bubbles'),
      settingLighting: document.getElementById('setting-lighting'),
      settingParticles: document.getElementById('setting-particles'),

      // Save list
      saveList: document.getElementById('save-list'),

      // Toast
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toast-message')
    };

    // Set up event listeners
    this.setupEventListeners();

    // Initialize build menu
    this.initializeBuildMenu();
  }

  setupEventListeners() {
    // Close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.dataset.close;
        this.closePanel(panelId);
      });
    });

    // Close panels on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllPanels();
      }
      if (e.key === ' ' && !this.isInputFocused()) {
        e.preventDefault();
        game?.togglePause();
      }
      if (e.key === 'b' || e.key === 'B') {
        if (!this.isInputFocused()) {
          this.togglePanel('build-menu');
        }
      }
      if (e.key === 'l' || e.key === 'L') {
        if (!this.isInputFocused()) {
          if (game?.chronicle) {
            this.showChronicle(game.chronicle);
          }
        }
      }
      if (e.key === 't' || e.key === 'T') {
        if (!this.isInputFocused()) {
          this.showTechPanel();
        }
      }
    });

    // HUD buttons
    this.elements.btnPause?.addEventListener('click', () => game?.togglePause());
    this.elements.btnChronicle?.addEventListener('click', () => {
      if (game?.chronicle) {
        this.showChronicle(game.chronicle);
      }
    });
    this.elements.btnBuild?.addEventListener('click', () => this.togglePanel('build-menu'));
    this.elements.btnSettings?.addEventListener('click', () => this.showSettings());
    this.elements.btnTech?.addEventListener('click', () => this.showTechPanel());

    // Temperature slider
    this.elements.settingTemperature?.addEventListener('input', (e) => {
      this.elements.tempValue.textContent = e.target.value;
    });

    // Settings buttons
    document.getElementById('btn-test-connection')?.addEventListener('click', () => this.testConnection());
    document.getElementById('btn-settings-save')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-settings-cancel')?.addEventListener('click', () => this.closePanel('settings-panel'));

    // Chronicle navigation
    document.getElementById('btn-chronicle-prev')?.addEventListener('click', () => this.prevChroniclePage());
    document.getElementById('btn-chronicle-next')?.addEventListener('click', () => this.nextChroniclePage());

    // New world dialog
    document.getElementById('btn-newworld-confirm')?.addEventListener('click', () => {
      this.closePanel('newworld-dialog');
      game?.newWorld();
    });

    // Build menu clicks
    this.elements.buildGrid?.addEventListener('click', (e) => {
      const buildItem = e.target.closest('.build-item');
      if (buildItem && !buildItem.classList.contains('disabled')) {
        const structureId = buildItem.dataset.structure;
        game?.buildStructure(structureId);
        this.closePanel('build-menu');
      }
    });
  }

  isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  }

  initializeBuildMenu() {
    const structures = Object.values(CONSTANTS.STRUCTURE);
    this.elements.buildGrid.innerHTML = '';

    structures.forEach(struct => {
      const item = document.createElement('div');
      item.className = 'build-item';
      item.dataset.structure = struct.id;

      const costs = this.getStructureCosts(struct)
        .map(([resource, amount]) => `${amount}${this.getResourceAbbrev(resource)}`);

      item.innerHTML = `
        <div class="build-item-name">${struct.name}</div>
        <div class="build-item-cost">${costs.join(' ')}</div>
        ${struct.capacity ? `<div class="build-item-effect">+${struct.capacity} capacity</div>` : ''}
        ${struct.efficiencyBonus ? `<div class="build-item-effect">+${struct.efficiencyBonus * 100}% efficiency</div>` : ''}
      `;

      this.elements.buildGrid.appendChild(item);
    });
  }

  togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    if (panel.classList.contains('hidden')) {
      this.closeAllPanels();
      panel.classList.remove('hidden');
      this.activePanel = panelId;
    } else {
      panel.classList.add('hidden');
      this.activePanel = null;
    }
  }

  closePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('hidden');
      if (this.activePanel === panelId) {
        this.activePanel = null;
      }
    }
  }

  closeAllPanels() {
    document.querySelectorAll('.panel, .dialog').forEach(panel => {
      panel.classList.add('hidden');
    });
    this.activePanel = null;
  }

  showToast(message, isError = false, duration = 3000) {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.classList.remove('hidden', 'error');
    if (isError) {
      this.elements.toast.classList.add('error');
    }

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.elements.toast.classList.add('hidden');
    }, duration);
  }

  updateHUD(timeState, resources, paused, villages = []) {
    // Time display
    const timeStr = Utils.formatTime(timeState.hours);
    this.elements.timeDisplay.textContent = `Day ${timeState.day}, ${timeStr}`;

    // Season display
    const season = Utils.getSeason(timeState.day);
    const dayInSeason = Utils.getDayInSeason(timeState.day);
    this.elements.seasonDisplay.textContent = `${season.name} (${dayInSeason}/${season.duration})`;

    // Speed display
    const speed = game?.simSpeed || 1;
    this.elements.speedDisplay.textContent = `Speed: ${speed}x`;

    // Pause button
    this.elements.btnPause.textContent = paused ? '▶' : '⏸';

    // Resources
    this.elements.resWood.textContent = this.formatResourceAmount(resources.wood);
    this.elements.resFood.textContent = this.formatResourceAmount(resources.food);
    this.elements.resWater.textContent = this.formatResourceAmount(resources.water);
    this.elements.resStone.textContent = this.formatResourceAmount(resources.stone);
    this.elements.resHerbs.textContent = this.formatResourceAmount(resources.herbs);
    this.elements.resClay.textContent = this.formatResourceAmount(resources.clay);
    if (this.elements.resFish) this.elements.resFish.textContent = this.formatResourceAmount(resources.fish);
    if (this.elements.resThatch) this.elements.resThatch.textContent = this.formatResourceAmount(resources.thatch);
    if (this.elements.resRareMaterials) this.elements.resRareMaterials.textContent = this.formatResourceAmount(resources.rareMaterials);
    this.elements.resPopulation.textContent = window.game?.villagers?.length || 0;

    // Update population to show both villages combined if applicable
    if (villages.length > 1) {
      const totalPop = villages.reduce((sum, v) => sum + (v.villagerIds?.length || 0), 0);
      this.elements.resPopulation.textContent = totalPop;
    }
  }

  formatResourceAmount(value) {
    return Math.max(0, Math.floor(value || 0));
  }

  showVillagerPanel(villager) {
    if (!villager) {
      this.closePanel('villager-panel');
      return;
    }

    this.elements.villagerName.textContent = `${villager.name} (${villager.gender}, ${villager.age})`;
    this.elements.villagerTitle.textContent = villager.title;

    // Portrait emoji
    let portraitEmoji = '👤';
    if (villager.isChieftan) portraitEmoji = '👑';
    else if (villager.lifeStage.name === 'Child') portraitEmoji = '👶';
    else if (villager.lifeStage.name === 'Elder') portraitEmoji = '👴';
    else if (villager.gender === 'female') portraitEmoji = '👩';
    else if (villager.gender === 'male') portraitEmoji = '👨';
    this.elements.villagerPortrait.textContent = portraitEmoji;

    // Skills - show top 3
    this.elements.villagerSkills.innerHTML = '';
    const topSkills = Object.entries(villager.skills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    topSkills.forEach(([skill, value]) => {
      const badge = document.createElement('span');
      badge.className = 'skill-badge';
      const skillInfo = CONSTANTS.SKILL[skill.toUpperCase()];
      badge.textContent = `${skillInfo?.icon || ''} ${value}`;
      this.elements.villagerSkills.appendChild(badge);
    });

    // Status with activity description
    const activityText = this.formatVillagerDisplayText(villager.currentAction?.activity || villager.activity || 'Idle');
    this.elements.villagerStatus.innerHTML = `Status: <span>${villager.status}</span><br><small>${activityText}</small>`;

    // Mood
    const moodInfo = Utils.getMoodDescription(villager.mood);
    this.elements.villagerMood.innerHTML = `Mood: <span class="mood-value ${moodInfo.class}">${moodInfo.text} (${villager.mood})</span>`;

    // Partnership info
    if (villager.partnerId) {
      const partner = window.game?.villagers?.find(v => v.id === villager.partnerId);
      if (partner) {
        const affair = villager.affairPartnerId ? ' 💔' : ' 💑';
        this.elements.villagerMood.innerHTML += `<br><small>Partner: ${partner.name}${affair}</small>`;
      }
    } else {
      this.elements.villagerMood.innerHTML += `<br><small>Single</small>`;
    }

    // Needs bars
    this.updateNeedsBars(villager);

    // Current Activity with speech bubble if present
    let activityDisplay = this.formatVillagerDisplayText(villager.activity || 'Idle');
    if (villager.speechBubble) {
      activityDisplay = `${villager.speechBubble.emoji} ${this.formatVillagerDisplayText(villager.speechBubble.theme || villager.activity)}`;
    }
    this.elements.villagerActivityText.textContent = activityDisplay;

    // Recent Interactions - show last 8
    this.elements.villagerInteractionList.innerHTML = '';
    const recentInteractions = villager.interactionLog.slice(0, 8);
    if (recentInteractions.length === 0) {
      const li = document.createElement('li');
      li.className = 'interaction-item';
      li.textContent = 'No recent interactions';
      this.elements.villagerInteractionList.appendChild(li);
    } else {
      recentInteractions.forEach(interaction => {
        const li = document.createElement('li');
        li.className = 'interaction-item';

        const emoji = {
          talk: '💬',
          argue: '😠',
          share: '🤝',
          help: '💪',
          romance: '😍',
          gossip: '🐦',
          gather: '🌾',
          hunt: '🏹',
          fish: '🎣',
          build: '🔨'
        }[interaction.type] || '💬';

        const target = this.formatVillagerDisplayText(interaction.target);
        const description = this.formatVillagerDisplayText(interaction.description);
        li.innerHTML = `<span>${emoji}</span> <strong>${target}:</strong> ${Utils.truncate(description, 35)}`;
        this.elements.villagerInteractionList.appendChild(li);
      });
    }

    this.updateFamilyList(villager);

    // Goals - show active goals
    this.elements.villagerGoalsList.innerHTML = '';
    const activeGoals = villager.goals?.filter(g => !g.completed && !g.failed) || [];
    if (activeGoals.length === 0) {
      const li = document.createElement('li');
      li.className = 'goal-item';
      li.textContent = 'No active goals';
      this.elements.villagerGoalsList.appendChild(li);
    } else {
      activeGoals.slice(0, 3).forEach(goal => {
        const li = document.createElement('li');
        li.className = 'goal-item';
        li.innerHTML = `
          <div>${this.formatVillagerDisplayText(goal.description)}</div>
          <div class="goal-progress"><div class="goal-progress-fill" style="width: ${goal.progress}%"></div></div>
          <small>${goal.difficulty} | ${goal.progress}%</small>
        `;
        this.elements.villagerGoalsList.appendChild(li);
      });
    }

    // Secrets - show hidden ones too (mystery)
    const secrets = villager.secrets || [];
    this.elements.secretsCount.textContent = `(${secrets.length})`;
    this.elements.villagerSecretsList.innerHTML = '';
    if (secrets.length === 0) {
      const li = document.createElement('li');
      li.className = 'secret-item';
      li.textContent = 'No secrets... or are there?';
      this.elements.villagerSecretsList.appendChild(li);
    } else {
      secrets.slice(0, 3).forEach(secret => {
        const li = document.createElement('li');
        li.className = 'secret-item';
        li.textContent = secret.revealed ? secret.description : '??? Hidden secret ???';
        this.elements.villagerSecretsList.appendChild(li);
      });
    }

    // Backstory
    this.elements.villagerBackstoryText.textContent = villager.backstory || 'No backstory available yet.';

    this.togglePanel('villager-panel');
  }

  updateFamilyList(villager) {
    const list = this.elements.villagerFamilyList;
    if (!list) return;

    list.innerHTML = '';
    const items = [];
    if (villager.partnerName) items.push(`Partner: ${villager.partnerName}`);
    if (villager.expectingChild) items.push(`Expecting child: due day ${villager.expectingChild.dueDay}`);
    if (villager.parentNames?.length) items.push(`Parents: ${villager.parentNames.join(' and ')}`);
    if (villager.childrenNames?.length) items.push(`Children: ${villager.childrenNames.join(', ')}`);

    const closeBonds = Object.entries(villager.relationships || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, score]) => `${name}: ${villager.getRelationshipType(score)} (${Math.round(score)})`);
    if (closeBonds.length) items.push(`Closest bonds: ${closeBonds.join(', ')}`);

    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'interaction-item';
      li.textContent = 'No close family bonds yet';
      list.appendChild(li);
      return;
    }

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'interaction-item';
      li.textContent = item;
      list.appendChild(li);
    });
  }

  formatVillagerDisplayText(text) {
    if (window.game?.formatVillagerFacingText) {
      return window.game.formatVillagerFacingText(text);
    }
    return text === null || text === undefined ? '' : String(text);
  }

  updateNeedsBars(villager) {
    this.ensureNeedsBars();

    const energyFill = document.querySelector('#villager-needs .progress-bar.energy .progress-fill');
    const hungerFill = document.querySelector('#villager-needs .progress-bar.hunger .progress-fill');
    const thirstFill = document.querySelector('#villager-needs .progress-bar.thirst .progress-fill');
    const socialFill = document.querySelector('#villager-needs .progress-bar.social .progress-fill');

    if (energyFill) energyFill.style.width = `${villager.energy}%`;
    if (hungerFill) hungerFill.style.width = `${villager.hunger}%`;
    if (thirstFill) thirstFill.style.width = `${villager.thirst ?? 100}%`;
    if (socialFill) socialFill.style.width = `${villager.socialNeed}%`;
  }

  ensureNeedsBars() {
    const container = document.getElementById('villager-needs');
    if (!container || container.dataset.initialized === 'true') return;

    container.innerHTML = `
      <div class="need-row">Energy<div class="progress-bar energy"><div class="progress-fill energy"></div></div></div>
      <div class="need-row">Food<div class="progress-bar hunger"><div class="progress-fill hunger"></div></div></div>
      <div class="need-row">Water<div class="progress-bar thirst"><div class="progress-fill thirst"></div></div></div>
      <div class="need-row">Social<div class="progress-bar social"><div class="progress-fill social"></div></div></div>
    `;
    container.dataset.initialized = 'true';
  }

  updateVillagerPanel(villager) {
    if (!villager) return;
    const panel = document.getElementById('villager-panel');
    if (!panel || panel.classList.contains('hidden')) return;

    // Update status and activity
    const activityText = this.formatVillagerDisplayText(villager.currentAction?.activity || villager.activity || 'Idle');
    this.elements.villagerStatus.innerHTML = `Status: <span>${villager.status}</span><br><small>${activityText}</small>`;

    // Update mood
    const moodInfo = Utils.getMoodDescription(villager.mood);
    let moodHtml = `Mood: <span class="mood-value ${moodInfo.class}">${moodInfo.text} (${villager.mood})</span>`;

    // Partnership info
    if (villager.partnerId) {
      const partner = window.game?.villagers?.find(v => v.id === villager.partnerId);
      if (partner) {
        const affair = villager.affairPartnerId ? ' 💔' : ' 💑';
        moodHtml += `<br><small>Partner: ${partner.name}${affair}</small>`;
      }
    } else {
      moodHtml += `<br><small>Single</small>`;
    }
    this.elements.villagerMood.innerHTML = moodHtml;

    // Update needs bars
    this.updateNeedsBars(villager);

    // Update current Activity with speech bubble if present
    let activityDisplay = this.formatVillagerDisplayText(villager.activity || 'Idle');
    if (villager.speechBubble) {
      activityDisplay = `${villager.speechBubble.emoji} ${this.formatVillagerDisplayText(villager.speechBubble.theme || villager.activity)}`;
    }
    this.elements.villagerActivityText.textContent = activityDisplay;
  }

  updateBuildMenu(resources) {
    const items = this.elements.buildGrid.querySelectorAll('.build-item');
    items.forEach(item => {
      const structId = item.dataset.structure;
      const struct = Object.values(CONSTANTS.STRUCTURE).find(s => s.id === structId);
      if (!struct) return;

      const canAfford = this.getStructureCosts(struct)
        .every(([resource, amount]) => (resources[resource] || 0) >= amount);

      item.classList.toggle('disabled', !canAfford);
    });
  }

  getStructureCosts(struct) {
    return Object.values(CONSTANTS.RESOURCE)
      .filter(resource => Number.isFinite(struct[resource]) && struct[resource] > 0)
      .map(resource => [resource, struct[resource]]);
  }

  getResourceAbbrev(resource) {
    const labels = {
      wood: 'W',
      food: 'F',
      water: 'Wa',
      stone: 'S',
      herbs: 'H',
      clay: 'C',
      fish: 'Fi',
      thatch: 'T',
      rareMaterials: 'R'
    };
    return labels[resource] || resource.slice(0, 1).toUpperCase();
  }

  showChronicle(chronicle) {
    if (!chronicle) return;

    const entries = chronicle.entries || [];
    const totalPages = Math.max(1, Math.ceil(entries.length / this.entriesPerPage));
    this.chroniclePage = Utils.clamp(this.chroniclePage, 0, totalPages - 1);

    // Legendary entries
    this.elements.chronicleLegendaryList.innerHTML = '';
    const legendaryEntries = chronicle.legendary || [];
    if (legendaryEntries.length === 0) {
      const li = document.createElement('li');
      li.className = 'chronicle-entry';
      li.textContent = 'No legends have been recorded yet.';
      this.elements.chronicleLegendaryList.appendChild(li);
    }

    legendaryEntries.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'legendary-item';
      li.textContent = `★ ${entry.title} (Day ${entry.day})`;
      this.elements.chronicleLegendaryList.appendChild(li);
    });

    if (this.elements.chronicleRuleList) {
      this.elements.chronicleRuleList.innerHTML = '';
      const activeRules = window.game?.getActiveRules?.() || [];
      if (activeRules.length === 0) {
        const li = document.createElement('li');
        li.className = 'chronicle-entry';
        li.textContent = 'No fireside rules are active.';
        this.elements.chronicleRuleList.appendChild(li);
      }

      activeRules.forEach(rule => {
        const li = document.createElement('li');
        li.className = 'chronicle-entry';
        const daysLeft = Math.max(0, rule.durationDays - (window.game.timeState.day - rule.createdDay));
        li.innerHTML = `<span class="entry-day">${rule.title}</span>: ${rule.edict}<br><small>${rule.category} | ${Math.round(rule.compliance)}% compliance | ${daysLeft} days left</small>`;
        this.elements.chronicleRuleList.appendChild(li);
      });
    }

    // Regular entries
    this.elements.chronicleEntryList.innerHTML = '';
    const start = this.chroniclePage * this.entriesPerPage;
    const end = start + this.entriesPerPage;
    const pageEntries = entries.slice(start, end);

    if (pageEntries.length === 0) {
      const li = document.createElement('li');
      li.className = 'chronicle-entry';
      li.textContent = 'No chronicle entries have been written yet.';
      this.elements.chronicleEntryList.appendChild(li);
    }

    pageEntries.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'chronicle-entry';
      li.innerHTML = `<span class="entry-day">Day ${entry.day}</span>: ${entry.text}`;
      this.elements.chronicleEntryList.appendChild(li);
    });

    // Page indicator
    this.elements.chroniclePage.textContent = `Page ${this.chroniclePage + 1} of ${totalPages}`;

    const panel = this.elements.chroniclePanel;
    if (panel?.classList.contains('hidden')) {
      this.closeAllPanels();
      panel.classList.remove('hidden');
    }
    this.activePanel = 'chronicle-panel';
  }

  showTechPanel() {
    if (!game?.techState) return;

    const availableList = document.getElementById('tech-available-list');
    const researchedList = document.getElementById('tech-researched-list');
    const researchInfo = document.getElementById('tech-research-info');

    if (!availableList || !researchedList) return;

    // Current research
    const currentResearch = game.getTechResearchProgress();
    if (currentResearch) {
      researchInfo.innerHTML = `
        <div class="tech-item researching">
          <span class="tech-icon">${currentResearch.tech.icon}</span>
          <span class="tech-name">${currentResearch.tech.name}</span>
          <div class="tech-progress-bar">
            <div class="tech-progress-fill" style="width: ${currentResearch.percent}%"></div>
          </div>
          <span class="tech-progress-text">${currentResearch.percent}%</span>
        </div>
      `;
    } else {
      researchInfo.innerHTML = '<div class="tech-no-research">Not researching anything. Select a technology to research.</div>';
    }

    // Available technologies
    availableList.innerHTML = '';
    const available = game.getAvailableTechs();
    if (available.length === 0) {
      const li = document.createElement('div');
      li.className = 'tech-no-available';
      li.textContent = 'No new technologies available. Continue playing to discover more.';
      availableList.appendChild(li);
    } else {
      available.forEach(tech => {
        const item = document.createElement('div');
        item.className = 'tech-item available';
        item.dataset.techId = tech.id;

        const prereqNames = tech.prerequisites
          .map(p => CONSTANTS.TECH[p]?.name || p)
          .join(', ');

        item.innerHTML = `
          <span class="tech-icon">${tech.icon}</span>
          <div class="tech-info">
            <span class="tech-name">${tech.name}</span>
            <span class="tech-tier">Tier ${tech.tier}</span>
            <span class="tech-desc">${tech.description}</span>
            ${tech.prerequisites.length > 0 ? `<span class="tech-prereqs">Requires: ${prereqNames}</span>` : ''}
            <span class="tech-time">Research time: ${tech.researchTime} days</span>
          </div>
        `;

        item.addEventListener('click', () => {
          if (game.startTechResearch(tech.id)) {
            this.showTechPanel();
            game.ui.showToast(`Started researching ${tech.name}`);
          }
        });

        availableList.appendChild(item);
      });
    }

    // Researched technologies
    researchedList.innerHTML = '';
    const researched = game.getResearchedTechs();
    if (researched.length === 0) {
      const li = document.createElement('div');
      li.className = 'tech-no-researched';
      li.textContent = 'No technologies discovered yet.';
      researchedList.appendChild(li);
    } else {
      researched.forEach(tech => {
        const item = document.createElement('div');
        item.className = 'tech-item researched';
        item.innerHTML = `
          <span class="tech-icon">${tech.icon}</span>
          <div class="tech-info">
            <span class="tech-name">${tech.name}</span>
            <span class="tech-tier">Tier ${tech.tier}</span>
          </div>
        `;
        researchedList.appendChild(item);
      });
    }

    const panel = document.getElementById('tech-panel');
    if (panel?.classList.contains('hidden')) {
      this.closeAllPanels();
      panel.classList.remove('hidden');
    }
    this.activePanel = 'tech-panel';
  }

  prevChroniclePage() {
    if (this.chroniclePage > 0) {
      this.chroniclePage--;
      if (game?.chronicle) {
        this.showChronicle(game.chronicle);
      }
    }
  }

  nextChroniclePage() {
    const totalPages = Math.ceil((game?.chronicle?.entries?.length || 0) / this.entriesPerPage);
    if (this.chroniclePage < totalPages - 1) {
      this.chroniclePage++;
      if (game?.chronicle) {
        this.showChronicle(game.chronicle);
      }
    }
  }

  async showSettings() {
    // Load current config
    let config;
    if (window.electronAPI) {
      config = await window.electronAPI.getAllConfig();
    } else {
      config = Utils.loadFromStorage('config') || {};
    }

    // Populate form
    if (config.llm) {
      this.elements.settingEndpoint.value = config.llm.endpoint || '';
      this.elements.settingModel.value = config.llm.model || '';
      this.elements.settingApiKey.value = config.llm.apiKey || '';
      this.elements.settingTokens.value = config.llm.maxTokens || 500;
      this.elements.settingTemperature.value = config.llm.temperature || 0.8;
      this.elements.tempValue.textContent = config.llm.temperature || 0.8;
    }

    if (config.simulation) {
      this.elements.settingDayLength.value = config.simulation.dayLengthMinutes || 10;
      this.elements.settingWorldSize.value = config.simulation.worldSize || 64;
    }

    if (config.graphics) {
      this.elements.settingLabels.checked = config.graphics.showLabels ?? true;
      this.elements.settingBubbles.checked = config.graphics.showSpeechBubbles ?? true;
      this.elements.settingLighting.checked = config.graphics.lighting ?? true;
      this.elements.settingParticles.checked = config.graphics.particles ?? true;
    }

    this.elements.connectionStatus.textContent = '';

    this.togglePanel('settings-panel');
  }

  async testConnection() {
    const config = {
      endpoint: this.elements.settingEndpoint.value,
      model: this.elements.settingModel.value,
      apiKey: this.elements.settingApiKey.value,
      maxTokens: parseInt(this.elements.settingTokens.value) || 500,
      temperature: parseFloat(this.elements.settingTemperature.value) || 0.8
    };

    // Check if API key is empty
    if (!config.apiKey) {
      this.elements.connectionStatus.textContent = 'Please enter an API key first';
      this.elements.connectionStatus.className = 'error';
      return;
    }

    this.elements.connectionStatus.textContent = 'Testing connection...';
    this.elements.connectionStatus.className = '';

    const result = await llm.testConnection(config);

    if (result.success) {
      this.elements.connectionStatus.textContent = `✓ ${result.message}`;
      this.elements.connectionStatus.className = 'success';
    } else {
      this.elements.connectionStatus.textContent = `✗ ${result.error}`;
      this.elements.connectionStatus.className = 'error';
    }
  }

  async saveSettings() {
    const config = {
      llm: {
        endpoint: this.elements.settingEndpoint.value,
        model: this.elements.settingModel.value,
        apiKey: this.elements.settingApiKey.value,
        maxTokens: parseInt(this.elements.settingTokens.value) || 500,
        temperature: parseFloat(this.elements.settingTemperature.value) || 0.8
      },
      simulation: {
        dayLengthMinutes: parseInt(this.elements.settingDayLength.value) || 10,
        worldSize: parseInt(this.elements.settingWorldSize.value) || 64
      },
      graphics: {
        showLabels: this.elements.settingLabels.checked,
        showSpeechBubbles: this.elements.settingBubbles.checked,
        lighting: this.elements.settingLighting.checked,
        particles: this.elements.settingParticles.checked
      }
    };

    if (window.electronAPI) {
      await window.electronAPI.setConfig('llm', config.llm);
      await window.electronAPI.setConfig('simulation', config.simulation);
      await window.electronAPI.setConfig('graphics', config.graphics);
    } else {
      Utils.saveToStorage('config', config);
    }

    // Update LLM manager
    llm.updateConfig(config);

    this.closePanel('settings-panel');
    this.showToast('Settings saved!');
  }

  async showLoadDialog() {
    let saves;
    if (window.electronAPI) {
      saves = await window.electronAPI.listSaves();
    } else {
      saves = Utils.loadFromStorage('saves') || [];
    }

    this.elements.saveList.innerHTML = '';

    if (saves.length === 0) {
      this.elements.saveList.innerHTML = '<li class="save-item">No saves found</li>';
    } else {
      saves.forEach(save => {
        const li = document.createElement('li');
        li.className = 'save-item';
        const date = new Date(save.timestamp);
        li.textContent = `${save.filename} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        li.addEventListener('click', () => {
          document.querySelectorAll('.save-item').forEach(i => i.classList.remove('selected'));
          li.classList.add('selected');
        });
        li.addEventListener('dblclick', async () => {
          if (window.electronAPI) {
            const result = await window.electronAPI.loadGame(save.filename);
            if (result.success) {
              game?.loadGame(result.data);
              this.closePanel('load-dialog');
              this.showToast('Game loaded!');
            } else {
              this.showToast('Failed to load: ' + result.error, true);
            }
          }
        });
        this.elements.saveList.appendChild(li);
      });
    }

    this.togglePanel('load-dialog');
  }
}
