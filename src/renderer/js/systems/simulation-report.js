// End-of-simulation statistics for when every villager has died.

class SimulationReport {
  /**
   * @param {object} game - Host game with villagers, villages, and timeState
   */
  constructor(game) {
    // Keep a reference so later ticks can read the live world
    this.game = game;
  }

  /**
   * Villagers who are still alive. A missing health value counts as alive.
   * Pass a village id to limit the list to one tribe.
   * @param {string|null} villageId
   * @returns {object[]}
   */
  livingVillagers(villageId = null) {
    const villagers = this.game?.villagers || [];
    return villagers.filter((villager) => {
      // Health at or below zero is dead even before the death event removes them
      if ((villager?.health ?? 100) <= 0) return false;
      if (villageId && villager.villageId !== villageId) return false;
      return true;
    });
  }

  /**
   * Living headcount for one tribe, or for every tribe when no id is given.
   * @param {string|null} villageId
   * @returns {number}
   */
  livingCount(villageId = null) {
    return this.livingVillagers(villageId).length;
  }

  /**
   * True when nobody is left to simulate.
   * An empty roster counts as extinct so a wiped tribe cannot keep the clock running.
   * @returns {boolean}
   */
  isExtinct() {
    const villagers = this.game?.villagers;
    if (!Array.isArray(villagers) || villagers.length === 0) return true;
    return villagers.every((villager) => (villager?.health ?? 100) <= 0);
  }

  /**
   * Raise each tribe's remembered high-water mark.
   * The peak never falls, so a later drop below the starting five stays visible.
   */
  recordPeaks() {
    const villages = this.game?.villages || [];
    villages.forEach((village) => {
      const count = this.livingCount(village.id);
      const peak = village.peakPopulation;
      if (!Number.isFinite(peak)) {
        // Older saves never stored a peak; the founding headcount is the floor
        const baseline = Number.isFinite(village.originalPopulation) ? village.originalPopulation : count;
        village.peakPopulation = Math.max(baseline, count);
        return;
      }
      if (count > peak) village.peakPopulation = count;
    });
  }

  /**
   * Rewrite each tribe's id list from people who are actually alive.
   * Stale ids were leaving the HUD pinned at the starting five after deaths.
   */
  syncRosters() {
    if (!Array.isArray(this.game?.villagers) || !Array.isArray(this.game?.villages)) return;
    this.game.villages.forEach((village) => {
      village.villagerIds = this.livingVillagers(village.id).map((villager) => villager.id);
    });
  }

  /**
   * One tribe's row for the end-of-run dashboard.
   * @param {object} village
   * @returns {object}
   */
  tribeSnapshot(village) {
    const stats = village?.chronicle?.stats || {};
    const resources = village?.resources || {};
    const technologies = Array.isArray(village?.techState?.researched) ? village.techState.researched : [];
    const entries = Array.isArray(village?.chronicle?.entries) ? village.chronicle.entries : [];
    const population = village ? this.livingCount(village.id) : 0;
    const peakPopulation = Number.isFinite(village?.peakPopulation) ? village.peakPopulation : population;

    return {
      id: village?.id || '',
      name: village?.name || 'Unknown tribe',
      color: typeof village?.getColor === 'function' ? village.getColor() : '#e8e8e8',
      population,
      peakPopulation,
      births: stats.births || 0,
      deaths: stats.deaths || 0,
      marriages: stats.marriages || 0,
      structuresBuilt: stats.structuresBuilt || 0,
      structures: (village?.structureIds || []).length,
      technologies: [...technologies],
      legends: (village?.chronicle?.legendary || []).length,
      resources: {
        food: Math.floor(resources.food || 0),
        wood: Math.floor(resources.wood || 0),
        water: Math.floor(resources.water || 0),
        stone: Math.floor(resources.stone || 0)
      },
      recentEvents: entries.slice(0, 3).map((entry) => ({
        day: entry?.day ?? '?',
        text: typeof entry?.text === 'string' ? entry.text : ''
      }))
    };
  }

  /**
   * Full picture of how the run went, for both tribes.
   * @returns {object}
   */
  buildSummary() {
    const time = this.game?.timeState || {};
    const tribes = (this.game?.villages || []).map((village) => this.tribeSnapshot(village));
    const sum = (key) => tribes.reduce((total, tribe) => total + (Number(tribe[key]) || 0), 0);

    return {
      day: time.day || 1,
      hours: time.hours || 0,
      season: time.season?.name || 'Unknown season',
      tribes,
      extinct: this.isExtinct(),
      totals: {
        population: this.livingCount(),
        peakPopulation: sum('peakPopulation'),
        births: sum('births'),
        deaths: sum('deaths'),
        marriages: sum('marriages'),
        structuresBuilt: sum('structuresBuilt'),
        structures: sum('structures'),
        technologies: tribes.reduce((total, tribe) => total + tribe.technologies.length, 0),
        legends: sum('legends')
      }
    };
  }

  /**
   * Escape text that is interpolated into the dashboard markup.
   * @param {unknown} value
   * @returns {string}
   */
  escape(value) {
    if (typeof Utils !== 'undefined' && typeof Utils.escapeHtml === 'function') {
      return Utils.escapeHtml(value);
    }
    return String(value ?? '');
  }

  /**
   * Turn a tech id such as "tool_crafting" into readable words.
   * @param {string} techId
   * @returns {string}
   */
  formatTechName(techId) {
    const raw = String(techId || '').replace(/_/g, ' ').trim();
    return raw || 'Unknown technology';
  }

  /**
   * Markup for the extinction dashboard body.
   * @param {object} [summary]
   * @returns {string}
   */
  toHtml(summary = this.buildSummary()) {
    const safe = summary || { day: 1, hours: 0, season: 'Unknown season', tribes: [], totals: {} };
    const totals = safe.totals || {};
    const timeLabel = (typeof Utils !== 'undefined' && Utils.formatTime)
      ? Utils.formatTime(safe.hours || 0)
      : '';
    const when = `Day ${safe.day || 1}${timeLabel ? `, ${timeLabel}` : ''} · ${safe.season || 'Unknown season'}`;
    const tribeCards = (safe.tribes || []).map((tribe) => this.renderTribeCard(tribe)).join('');
    const cards = tribeCards || '<p class="extinction-empty">No tribes were founded.</p>';

    return `
      <p class="extinction-lead">Every villager has died. The simulation has stopped.</p>
      <p class="extinction-when">${this.escape(when)}</p>
      <div class="extinction-totals">
        ${this.renderTotal('Days survived', safe.day || 1)}
        ${this.renderTotal('Combined peak', totals.peakPopulation || 0)}
        ${this.renderTotal('Births', totals.births || 0)}
        ${this.renderTotal('Deaths', totals.deaths || 0)}
        ${this.renderTotal('Marriages', totals.marriages || 0)}
        ${this.renderTotal('Structures built', totals.structuresBuilt || 0)}
        ${this.renderTotal('Technologies', totals.technologies || 0)}
        ${this.renderTotal('Legends', totals.legends || 0)}
      </div>
      <div class="extinction-tribes">${cards}</div>
    `;
  }

  /**
   * One number in the totals strip.
   * @param {string} label
   * @param {number|string} value
   * @returns {string}
   */
  renderTotal(label, value) {
    return `<div class="extinction-total"><span>${this.escape(label)}</span><strong>${this.escape(value)}</strong></div>`;
  }

  /**
   * One tribe's card, including the peak so a drop below five is still explained.
   * @param {object} tribe
   * @returns {string}
   */
  renderTribeCard(tribe) {
    const techs = (tribe.technologies || []).map((techId) => this.escape(this.formatTechName(techId)));
    const techLine = techs.length ? techs.join(', ') : 'None discovered';
    const resources = tribe.resources || {};
    const events = (tribe.recentEvents || [])
      .filter((entry) => entry?.text)
      .map((entry) => `<li>Day ${this.escape(entry.day)}: ${this.escape(entry.text)}</li>`)
      .join('');
    const eventBlock = events
      ? `<ul class="extinction-events">${events}</ul>`
      : '<p class="extinction-events">No chronicle entries.</p>';

    return `
      <section class="extinction-tribe" style="border-color: ${this.escape(tribe.color || '#e8e8e8')}">
        <h3 style="color: ${this.escape(tribe.color || '#e8e8e8')}">${this.escape(tribe.name)}</h3>
        <p class="extinction-pop">Living <strong>${this.escape(tribe.population)}</strong> <span>peak ${this.escape(tribe.peakPopulation)}</span></p>
        <ul class="extinction-stats">
          <li>Births ${this.escape(tribe.births)}</li>
          <li>Deaths ${this.escape(tribe.deaths)}</li>
          <li>Marriages ${this.escape(tribe.marriages)}</li>
          <li>Structures ${this.escape(tribe.structures)} standing (${this.escape(tribe.structuresBuilt)} built)</li>
          <li>Legends ${this.escape(tribe.legends)}</li>
        </ul>
        <p class="extinction-resources">Stores: food ${this.escape(resources.food || 0)}, wood ${this.escape(resources.wood || 0)}, water ${this.escape(resources.water || 0)}, stone ${this.escape(resources.stone || 0)}</p>
        <p class="extinction-techs">Technologies: ${techLine}</p>
        ${eventBlock}
      </section>
    `;
  }
}
