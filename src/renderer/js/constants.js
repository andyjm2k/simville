// Simville Constants

const CONSTANTS = {
  // Version
  VERSION: '1.0.0',

  // World
  WORLD: {
    DEFAULT_SIZE: 64,
    MIN_SIZE: 32,
    MAX_SIZE: 128,
    TILE_SIZE: 16,
    PIXEL_SCALE: 2
  },

  // Biomes
  BIOME: {
    OCEAN: 0,
    TROPICAL_RAINFOREST: 1,
    SAVANNA: 2,
    RIVER_DELTA: 3,
    DENSE_JUNGLE: 4,
    CLEARED_LAND: 5,
    VILLAGE_CENTER: 6
  },

  // Resources
  RESOURCE: {
    WOOD: 'wood',
    FOOD: 'food',
    WATER: 'water',
    STONE: 'stone',
    HERBS: 'herbs',
    CLAY: 'clay',
    FISH: 'fish',
    THATCH: 'thatch',
    RARE_MATERIALS: 'rareMaterials'
  },

  // Structures
  STRUCTURE: {
    HUT: { id: 'hut', name: 'Hut', wood: 20, clay: 10, thatch: 10, capacity: 2 },
    STORAGE: { id: 'storage', name: 'Storage Barn', wood: 30, clay: 15, capacity: 100 },
    FIRE: { id: 'fire', name: 'Communal Fire', stone: 10, wood: 5 },
    WATCHTOWER: { id: 'watchtower', name: 'Watchtower', wood: 25, stone: 15 },
    WELL: { id: 'well', name: 'Well', stone: 15, clay: 5 },
    FARM: { id: 'farm', name: 'Farm Plot', wood: 5 },
    WORKSHOP: { id: 'workshop', name: 'Workshop', wood: 35, stone: 20, efficiencyBonus: 0.25 },
    SHRINE: { id: 'shrine', name: 'Shrine', wood: 40, stone: 30, rareMaterials: 10 }
  },

  // Villager Life Stages
  LIFE_STAGE: {
    CHILD: { min: 0, max: 12, name: 'Child', canWork: false },
    YOUTH: { min: 13, max: 17, name: 'Youth', canWork: true, workLimit: 'simple' },
    ADULT: { min: 18, max: 50, name: 'Adult', canWork: true, workLimit: 'full' },
    ELDER: { min: 51, max: 999, name: 'Elder', canWork: true, workLimit: 'reduced', wisdomBonus: 0.2 }
  },

  // Skills
  SKILL: {
    GATHERING: { name: 'Gathering', icon: '🌾' },
    CRAFTING: { name: 'Crafting', icon: '🔨' },
    FARMING: { name: 'Farming', icon: '🌱' },
    FISHING: { name: 'Fishing', icon: '🎣' },
    HUNTING: { name: 'Hunting', icon: '🏹' },
    SOCIAL: { name: 'Social', icon: '💬' },
    LEADERSHIP: { name: 'Leadership', icon: '👑' }
  },

  // Activities
  ACTIVITY: {
    IDLE: 'idle',
    WORKING: 'working',
    SLEEPING: 'sleeping',
    EATING: 'eating',
    DRINKING: 'drinking',
    SOCIALIZING: 'socializing',
    BUILDING: 'building',
    GATHERING: 'gathering',
    HUNTING: 'hunting',
    FISHING: 'fishing',
    FARMING: 'farming',
    RESTING: 'resting',
    RITUAL: 'ritual'
  },

  // Time
  TIME: {
    DAWN_START: 6,
    MORNING_START: 8,
    AFTERNOON_START: 12,
    EVENING_START: 17,
    NIGHT_START: 20
  },

  // Seasons
  SEASON: {
    WET: { name: 'Wet Season', duration: 30, color: '#4a90d9', moodMod: 5 },
    DRY: { name: 'Dry Season', duration: 30, color: '#f5a623', moodMod: 0 },
    HARVEST: { name: 'Harvest Season', duration: 15, color: '#7ed321', moodMod: 20 },
    DEEP_DRY: { name: 'Deep Dry', duration: 15, color: '#d0021b', moodMod: -10 }
  },

  // Needs
  NEED: {
    HUNGER_DECAY: 5,
    THIRST_DECAY: 7,
    REST_DECAY: 3,
    SOCIAL_DECAY: 2
  },

  // Relationship bounds
  RELATIONSHIP: {
    MIN: -100,
    MAX: 100,
    ENEMY_THRESHOLD: -50,
    RIVAL_THRESHOLD: -25,
    FRIEND_THRESHOLD: 25,
    BEST_FRIEND_THRESHOLD: 75,
    SOULMATE_THRESHOLD: 90
  },

  // Ritual types
  RITUAL: {
    MORNING_BLESSING: {
      name: 'Morning Blessing',
      time: 'dawn',
      participants: 'all',
      duration: 5,
      moodBoost: 5,
      socialGain: 2,
      emoji: '🙏'
    },
    HARVEST_DANCE: {
      name: 'Harvest Dance',
      time: 'harvest_end',
      participants: 'all',
      duration: 15,
      moodBoost: 25,
      socialGain: 10,
      emoji: '💃'
    },
    COMING_OF_AGE: {
      name: 'Coming of Age',
      time: 'age_change',
      participants: 'family',
      duration: 10,
      moodBoost: 15,
      socialGain: 5,
      emoji: '🎊'
    },
    FUNERAL: {
      name: 'Funeral Rite',
      time: 'death',
      participants: 'all',
      duration: 20,
      moodBoost: -10,
      socialGain: 0,
      emoji: '🕯️'
    },
    NAME_CEREMONY: {
      name: 'Name Ceremony',
      time: 'birth',
      participants: 'family',
      duration: 8,
      moodBoost: 10,
      socialGain: 3,
      emoji: '👶'
    },
    MARRIAGE: {
      name: 'Marriage Ceremony',
      time: 'marriage',
      participants: 'all',
      duration: 12,
      moodBoost: 20,
      socialGain: 15,
      emoji: '💒'
    }
  },

  // Secret types
  SECRET: {
    HIDDEN_TALENT: 'hidden_talent',
    PAST_BETRAYAL: 'past_betrayal',
    FORBIDDEN_ROMANCE: 'forbidden_romance',
    HIDDEN_STASH: 'hidden_stash',
    ILLNESS: 'illness',
    ASPIRATION: 'aspiration',
    GRUDGE: 'grudge'
  },

  // Goal types
  GOAL: {
    ASPIRATION: 'aspiration',
    SKILL: 'skill',
    RELATIONSHIP: 'relationship',
    LEGACY: 'legacy',
    SOCIAL: 'social',
    SURVIVAL: 'survival'
  },

  // Speech bubble emojis
  EMOJI: {
    TALKING: '💬',
    LAUGHING: '😂',
    CRYING: '😢',
    ANGRY: '😠',
    LOVE: '😍',
    AGREEMENT: '🤝',
    SURPRISED: '😮',
    PONDERING: '🤔',
    FOOD: '🍖',
    TIRED: '😴',
    WORKING: '💪',
    FISHING: '🎣',
    HOME: '🏠',
    CHILD: '👶',
    RELIGIOUS: '🙏',
    CELEBRATION: '🎉'
  },

  // Personality trait ranges
  PERSONALITY: {
    SOCIABLE: { min: 0, max: 100, name: 'Sociable' },
    ACTIVE: { min: 0, max: 100, name: 'Active' },
    CURIOUS: { min: 0, max: 100, name: 'Curious' },
    EMPATHETIC: { min: 0, max: 100, name: 'Empathetic' },
    CONFIDENT: { min: 0, max: 100, name: 'Confident' }
  },

  // Name generation
  NAMES: {
    MALE: [
      'Toma', 'Kofi', 'Mali', 'Zuko', 'Riku', 'Nalo', 'Jaro', 'Kanu',
      'Tibo', 'Masa', 'Daku', 'Rani', 'Leko', 'Soru', 'Juki', 'Pako'
    ],
    FEMALE: [
      'Kana', 'Zira', 'Mala', 'Luna', 'Sari', 'Nia', 'Jela', 'Tiki',
      'Mira', 'Raka', 'Yara', 'Zuri', 'Lila', 'Kesi', 'Tula', 'Nomi'
    ],
    NONBINARY: [
      'Aiko', 'Kira', 'Melo', 'Sofi', 'Taji', 'Zepp'
    ]
  },

  // Technology tree
  TECH: {
    FIRE_MASTERY: {
      id: 'fire_mastery',
      name: 'Fire Mastery',
      description: 'Control of fire brings warmth, light, and cooked food.',
      tier: 1,
      prerequisites: [],
      unlocks: ['campfire', 'cooking', 'warmth'],
      researchTime: 3, // days
      icon: '🔥'
    },
    TOOL_CRAFTING: {
      id: 'tool_crafting',
      name: 'Tool Crafting',
      description: 'Shape stone and wood into useful implements.',
      tier: 1,
      prerequisites: [],
      unlocks: ['stone_axe', 'stone_knife', 'clubs'],
      researchTime: 4,
      icon: '🔨'
    },
    HUNTING_TECHNIQUES: {
      id: 'hunting_techniques',
      name: 'Hunting Techniques',
      description: 'Better methods for tracking and capturing prey.',
      tier: 1,
      prerequisites: [],
      unlocks: ['spears', 'traps', 'tracking'],
      researchTime: 5,
      icon: '🏹'
    },
    FISHING_METHODS: {
      id: 'fishing_methods',
      name: 'Fishing Methods',
      description: 'Techniques for catching fish from rivers and streams.',
      tier: 1,
      prerequisites: [],
      unlocks: ['fishing_spear', 'nets', 'fish_traps'],
      researchTime: 4,
      icon: '🎣'
    },
    SHELTER_BUILDING: {
      id: 'shelter_building',
      name: 'Shelter Building',
      description: 'Construct more durable and comfortable dwellings.',
      tier: 1,
      prerequisites: [],
      unlocks: ['better_huts', 'thatched_roofs', 'foundations'],
      researchTime: 5,
      icon: '🏠'
    },
    AGRICULTURE: {
      id: 'agriculture',
      name: 'Agriculture',
      description: 'Domestication of plants for sustainable food supply.',
      tier: 2,
      prerequisites: ['shelter_building'],
      unlocks: ['farming', 'irrigation', 'crop_rotation'],
      researchTime: 8,
      icon: '🌱'
    },
    POTTERY: {
      id: 'pottery',
      name: 'Pottery',
      description: 'Shape clay into vessels for storage and cooking.',
      tier: 2,
      prerequisites: ['fire_mastery'],
      unlocks: ['clay_pots', 'storage_jars', 'water_containers'],
      researchTime: 6,
      icon: '🏺'
    },
    MEDICINE: {
      id: 'medicine',
      name: 'Medicine',
      description: 'Knowledge of herbs and treatments for ailments.',
      tier: 2,
      prerequisites: ['tool_crafting'],
      unlocks: ['healing_herbs', 'bandages', 'remedies'],
      researchTime: 10,
      icon: '🌿'
    },
    ADVANCED_TOOLS: {
      id: 'advanced_tools',
      name: 'Advanced Tools',
      description: 'Refined techniques for crafting better equipment.',
      tier: 2,
      prerequisites: ['tool_crafting', 'fire_mastery'],
      unlocks: ['metalworking', 'sharpening', 'detailed_crafting'],
      researchTime: 12,
      icon: '⚒️'
    },
    WEAVER: {
      id: 'weaver',
      name: 'Weaving',
      description: 'Transform plant fibers into cloth and rope.',
      tier: 2,
      prerequisites: ['shelter_building'],
      unlocks: ['baskets', 'mats', 'rope', 'clothing'],
      researchTime: 7,
      icon: '🧶'
    },
    RITUALS_AND_TRADITIONS: {
      id: 'rituals_and_traditions',
      name: 'Rituals & Traditions',
      description: 'Structured ceremonies strengthen community bonds.',
      tier: 2,
      prerequisites: [],
      unlocks: ['tribal_gatherings', 'storytelling', 'music'],
      researchTime: 6,
      icon: '🙏'
    },
    WATER_MANAGEMENT: {
      id: 'water_management',
      name: 'Water Management',
      description: 'Control and distribution of water resources.',
      tier: 3,
      prerequisites: ['agriculture', 'pottery'],
      unlocks: ['wells', 'irrigation_ditches', 'aqueducts'],
      researchTime: 15,
      icon: '💧'
    },
    HUNTING_PARTNERS: {
      id: 'hunting_partners',
      name: 'Hunting Partners',
      description: 'Train animals to assist in hunting.',
      tier: 3,
      prerequisites: ['hunting_techniques', 'animal_taming'],
      unlocks: ['trained_hunters', 'tracking_animals'],
      researchTime: 18,
      icon: '🐕'
    },
    ANIMAL_TAMING: {
      id: 'animal_taming',
      name: 'Animal Taming',
      description: 'Domesticate animals for help and companionship.',
      tier: 3,
      prerequisites: ['hunting_techniques'],
      unlocks: ['livestock', 'guard_animals', 'work_animals'],
      researchTime: 14,
      icon: '🐾'
    },
    STORYKEEPING: {
      id: 'storykeeping',
      name: 'Storykeeping',
      description: 'Preserve knowledge through oral tradition and symbols.',
      tier: 3,
      prerequisites: ['rituals_and_traditions'],
      unlocks: ['chronicle_recording', 'symbolic_writing', 'genealogy'],
      researchTime: 12,
      icon: '📜'
    },
    ADVANCED_FARMING: {
      id: 'advanced_farming',
      name: 'Advanced Farming',
      description: 'Sophisticated agricultural techniques for greater yields.',
      tier: 3,
      prerequisites: ['agriculture', 'water_management'],
      unlocks: ['fertilizers', 'crop_rotation', 'seed_selection'],
      researchTime: 20,
      icon: '🌾'
    },
    SPIRITUAL_CONNECTIONS: {
      id: 'spiritual_connections',
      name: 'Spiritual Connections',
      description: 'Deeper understanding of the spiritual world.',
      tier: 4,
      prerequisites: ['storykeeping', 'rituals_and_traditions'],
      unlocks: ['shamanism', 'spirit_journeys', 'divination'],
      researchTime: 25,
      icon: '✨'
    },
    CONSTRUCTION_ADVANCES: {
      id: 'construction_advances',
      name: 'Construction Advances',
      description: 'Build larger and more complex structures.',
      tier: 4,
      prerequisites: ['advanced_tools', 'shelter_building'],
      unlocks: ['large_buildings', 'stonework', 'monuments'],
      researchTime: 22,
      icon: '🧱'
    },
    LEADERSHIP_AND_GOVERNANCE: {
      id: 'leadership_and_governance',
      name: 'Leadership & Governance',
      description: 'Structured leadership brings order to the village.',
      tier: 4,
      prerequisites: ['storykeeping', 'advanced_tools'],
      unlocks: ['council', 'laws', 'specialized_roles'],
      researchTime: 20,
      icon: '👑'
    },
    TRADE_KNOWLEDGE: {
      id: 'trade_knowledge',
      name: 'Trade Knowledge',
      description: 'Understanding of exchange and commerce.',
      tier: 4,
      prerequisites: ['storykeeping', 'pottery'],
      unlocks: ['trade_routes', 'currency', 'negotiation'],
      researchTime: 18,
      icon: '💰'
    }
  },

  // Colors
  COLORS: {
    SKIN_TONES: ['#8d5524', '#c68642', '#e0ac69', '#f1c27d'],
    HAIR_COLORS: ['#1a1a1a', '#4a3728', '#8b4513', '#d4a76a', '#c9c9c9'],
    BIOME: {
      0: '#1a3a5c', // Ocean
      1: '#228b22', // Tropical Rainforest
      2: '#c9b037', // Savanna
      3: '#4a7c59', // River Delta
      4: '#006400', // Dense Jungle
      5: '#8fbc8f', // Cleared Land
      6: '#8b7355'  // Village Center
    }
  },

  // Biome icons for tile rendering
  BIOME_ICON: {
    0: '🌊', // Ocean
    1: '🌴', // Tropical Rainforest
    2: '🌾', // Savanna
    3: '🌿', // River Delta
    4: '🌲', // Dense Jungle
    5: '🏞️', // Cleared Land
    6: '🏘️'  // Village Center
  },

  // Conversation/interaction proximity requirement
  INTERACTION: {
    PROXIMITY_REQUIRED: 4, // Villagers must be within 4 tiles to interact
    PROXIMITY_SPEECH_BUBBLE: 6 // Can see speech bubble from this distance
  }
};

// Freeze to prevent accidental modification
Object.freeze(CONSTANTS);
Object.freeze(CONSTANTS.WORLD);
Object.freeze(CONSTANTS.BIOME);
Object.freeze(CONSTANTS.RESOURCE);
Object.freeze(CONSTANTS.STRUCTURE);
Object.freeze(CONSTANTS.LIFE_STAGE);
Object.freeze(CONSTANTS.SKILL);
Object.freeze(CONSTANTS.ACTIVITY);
Object.freeze(CONSTANTS.TIME);
Object.freeze(CONSTANTS.SEASON);
Object.freeze(CONSTANTS.NEED);
Object.freeze(CONSTANTS.RELATIONSHIP);
Object.freeze(CONSTANTS.RITUAL);
Object.freeze(CONSTANTS.SECRET);
Object.freeze(CONSTANTS.GOAL);
Object.freeze(CONSTANTS.EMOJI);
Object.freeze(CONSTANTS.PERSONALITY);
Object.freeze(CONSTANTS.NAMES);
Object.freeze(CONSTANTS.COLORS);
Object.freeze(CONSTANTS.TECH);
Object.freeze(CONSTANTS.BIOME_ICON);
Object.freeze(CONSTANTS.INTERACTION);
