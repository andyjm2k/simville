// Simville Village Class

class Village {
  constructor(data = {}) {
    this.id = data.id || Utils.generateId();
    this.name = data.name || this.generateVillageName();

    // Territory
    this.center = data.center || { x: 0, y: 0 };
    this.territoryRadius = data.territoryRadius || 12;

    // Resources (separate per village)
    this.resources = data.resources || {
      wood: 15,
      food: 12,
      water: 12,
      stone: 5,
      herbs: 2,
      clay: 5,
      fish: 0,
      thatch: 6,
      rareMaterials: 0
    };

    // Population (villager IDs, not full objects)
    this.villagerIds = data.villagerIds || [];

    // Government
    this.government = data.government || this.createDefaultGovernment();

    // Inter-village relations (other village ID -> relationship score)
    this.relations = data.relations || {};

    // Culture/Identity - different name pools per village
    this.culture = data.culture || this.createCulture();

    // War state
    this.atWarWith = data.atWarWith || [];
    this.raidCooldown = data.raidCooldown || 0;

    // Structures owned by this village
    this.structureIds = data.structureIds || [];

    // Per-village chronicle and technology (distinct tribe identity)
    this.chronicle = data.chronicle || this.createDefaultChronicle();
    this.techState = data.techState || this.createDefaultTechState();

    // Stable index for colors and UI (0 = first tribe, 1 = second, etc.)
    this.displayIndex = data.displayIndex ?? null;

    // Conquest baseline population
    this.originalPopulation = data.originalPopulation ?? null;
  }

  createDefaultChronicle() {
    return {
      legendary: [],
      entries: [],
      stats: {
        births: 0,
        deaths: 0,
        structuresBuilt: 0,
        marriages: 0
      }
    };
  }

  createDefaultTechState() {
    return {
      researched: [],
      currentResearch: null,
      researchSpeed: 1
    };
  }

  generateVillageName() {
    const prefixes = ['Elder', 'Storm', 'River', 'Stone', 'Iron', 'Golden', 'Shadow', 'Wind', 'Thunder', 'Dawn', 'Mist', 'Ember'];
    const suffixes = ['vale', 'hollow', 'fall', 'peak', 'ridge', 'glen', 'mere', 'fell', 'brook', 'watch', 'haven', 'crest'];
    return Utils.randomElement(prefixes) + Utils.randomElement(suffixes);
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

  createCulture() {
    // Different villages have slightly different name pools and traits
    const cultureTraits = [
      ['warrior', 'hunter', 'gatherer'],
      ['spiritual', 'storyteller', 'healer'],
      ['builder', 'craftsman', 'trader'],
      ['fisher', 'farmer', 'herder']
    ];
    const traits = Utils.randomElement(cultureTraits);
    return {
      traits: traits,
      namingStyle: traits[0]
    };
  }

  // Check if a position is within this village's territory
  isInTerritory(x, y) {
    return Utils.distance(x, y, this.center.x, this.center.y) <= this.territoryRadius;
  }

  // Get villagers from main villagers array (Game will hold actual villagers)
  getVillagers(allVillagers) {
    return allVillagers.filter(v => this.villagerIds.includes(v.id));
  }

  // Get chieftan
  getChieftan(allVillagers) {
    const villagers = this.getVillagers(allVillagers);
    return villagers.find(v => v.isChieftan);
  }

  // Calculate village strength for comparison/war
  calculateStrength(allVillagers) {
    const villagers = this.getVillagers(allVillagers);
    if (villagers.length === 0) return 0;

    let strength = 0;
    for (const v of villagers) {
      // Base strength from skills
      const skillSum = Object.values(v.skills).reduce((a, b) => a + b, 0);
      strength += skillSum;

      // Health factor
      strength += v.health * 0.1;

      // Adult bonus
      if (v.lifeStage === CONSTANTS.LIFE_STAGE.ADULT) {
        strength += 5;
      } else if (v.lifeStage === CONSTANTS.LIFE_STAGE.ELDER) {
        strength += 3;
      }

      // Chieftan bonus
      if (v.isChieftan) {
        strength += 15;
      }
    }

    // Structure bonus
    strength += this.structureIds.length * 3;

    // Resource plenty bonus
    const resourceSum = Object.values(this.resources).reduce((a, b) => a + b, 0);
    strength += resourceSum * 0.05;

    return strength;
  }

  // Get display color for this village
  getColor() {
    const colors = ['#4ecca3', '#e94560', '#45b7d1', '#f5a623'];
    if (this.displayIndex != null) {
      return colors[this.displayIndex % colors.length];
    }
    const hash = this.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  // Serialize for saving
  serialize() {
    return {
      id: this.id,
      name: this.name,
      center: { ...this.center },
      territoryRadius: this.territoryRadius,
      resources: { ...this.resources },
      villagerIds: [...this.villagerIds],
      government: { ...this.government },
      relations: { ...this.relations },
      culture: { ...this.culture },
      atWarWith: [...this.atWarWith],
      raidCooldown: this.raidCooldown,
      structureIds: [...this.structureIds],
      chronicle: JSON.parse(JSON.stringify(this.chronicle)),
      techState: JSON.parse(JSON.stringify(this.techState)),
      displayIndex: this.displayIndex,
      originalPopulation: this.originalPopulation
    };
  }

  static deserialize(data) {
    return new Village(data);
  }
}
