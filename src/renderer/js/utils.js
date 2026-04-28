// Simville Utility Functions

const Utils = {
  // Seeded random number generator
  seed: 12345,

  seededRandom() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  },

  setSeed(seed) {
    this.seed = seed;
  },

  // Random integer between min and max (inclusive)
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Random float between min and max
  randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  },

  // Random element from array
  randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  // Shuffle array (Fisher-Yates)
  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },

  // Clamp value between min and max
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  // Linear interpolation
  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  // Distance between two points
  distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },

  // Manhattan distance
  manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
  },

  // Format time as HH:MM
  formatTime(hours) {
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  },

  // Format day and time
  formatDayTime(day, hours) {
    const season = this.getSeason(day);
    return `Day ${day}, ${this.formatTime(hours)} (${season.name})`;
  },

  // Get current season based on day
  getSeason(day) {
    const seasons = [CONSTANTS.SEASON.WET, CONSTANTS.SEASON.DRY, CONSTANTS.SEASON.HARVEST, CONSTANTS.SEASON.DEEP_DRY];
    const cycleLength = 30 + 30 + 15 + 15; // 90 days total
    const dayInCycle = ((day - 1) % cycleLength);

    if (dayInCycle < 30) return seasons[0];
    if (dayInCycle < 60) return seasons[1];
    if (dayInCycle < 75) return seasons[2];
    return seasons[3];
  },

  // Get day in current season
  getDayInSeason(day) {
    const cycleLength = 90;
    const dayInCycle = ((day - 1) % cycleLength);

    if (dayInCycle < 30) return dayInCycle + 1;
    if (dayInCycle < 60) return dayInCycle - 30 + 1;
    if (dayInCycle < 75) return dayInCycle - 60 + 1;
    return dayInCycle - 75 + 1;
  },

  // Get time of day period
  getTimeOfDay(hours) {
    if (hours >= 6 && hours < 8) return 'dawn';
    if (hours >= 8 && hours < 12) return 'morning';
    if (hours >= 12 && hours < 17) return 'afternoon';
    if (hours >= 17 && hours < 20) return 'evening';
    return 'night';
  },

  // Get life stage based on age
  getLifeStage(age) {
    if (age <= 12) return CONSTANTS.LIFE_STAGE.CHILD;
    if (age <= 17) return CONSTANTS.LIFE_STAGE.YOUTH;
    if (age <= 50) return CONSTANTS.LIFE_STAGE.ADULT;
    return CONSTANTS.LIFE_STAGE.ELDER;
  },

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // Deep clone object
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Capitalize first letter
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Truncate string
  truncate(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  },

  // Color interpolation
  lerpColor(color1, color2, t) {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);
    const r = Math.round(this.lerp(c1.r, c2.r, t));
    const g = Math.round(this.lerp(c1.g, c2.g, t));
    const b = Math.round(this.lerp(c1.b, c2.b, t));
    return `rgb(${r}, ${g}, ${b})`;
  },

  // Hex to RGB
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  },

  // Get contrast color (black or white)
  getContrastColor(hex) {
    const rgb = this.hexToRgb(hex);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  },

  // Ease functions
  ease: {
    inQuad(t) { return t * t; },
    outQuad(t) { return t * (2 - t); },
    inOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    inCubic(t) { return t * t * t; },
    outCubic(t) { return (--t) * t * t + 1; },
    inOutCubic(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; }
  },

  // Simple noise function (for terrain)
  noise2D(x, y, seed = 1) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  },

  // Perlin-like noise
  perlin(x, y, scale = 1, octaves = 4) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency / scale, y * frequency / scale) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  },

  // Save to local storage (fallback if electron APIs unavailable)
  saveToStorage(key, data) {
    try {
      localStorage.setItem(`simville_${key}`, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('LocalStorage save failed:', e);
      return false;
    }
  },

  // Load from local storage
  loadFromStorage(key) {
    try {
      const data = localStorage.getItem(`simville_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('LocalStorage load failed:', e);
      return null;
    }
  },

  // Generate villager name
  generateName(gender) {
    if (gender === 'male') return Utils.randomElement(CONSTANTS.NAMES.MALE);
    if (gender === 'female') return Utils.randomElement(CONSTANTS.NAMES.FEMALE);
    return Utils.randomElement(CONSTANTS.NAMES.NONBINARY);
  },

  // Generate personality
  generatePersonality() {
    return {
      sociable: this.randomInt(20, 80),
      active: this.randomInt(20, 80),
      curious: this.randomInt(20, 80),
      empathetic: this.randomInt(20, 80),
      confident: this.randomInt(20, 80)
    };
  },

  // Generate skills
  generateSkills() {
    return {
      gathering: this.randomInt(1, 5),
      crafting: this.randomInt(1, 5),
      farming: this.randomInt(1, 5),
      fishing: this.randomInt(1, 5),
      hunting: this.randomInt(1, 5),
      social: this.randomInt(1, 5),
      leadership: this.randomInt(1, 3)
    };
  },

  // Calculate mood description
  getMoodDescription(mood) {
    if (mood >= 75) return { text: 'Ecstatic', class: 'mood-positive' };
    if (mood >= 50) return { text: 'Happy', class: 'mood-positive' };
    if (mood >= 25) return { text: 'Content', class: 'mood-positive' };
    if (mood >= 0) return { text: 'Neutral', class: 'mood-neutral' };
    if (mood >= -25) return { text: 'Uneasy', class: 'mood-neutral' };
    if (mood >= -50) return { text: 'Sad', class: 'mood-negative' };
    return { text: 'Miserable', class: 'mood-negative' };
  }
};
