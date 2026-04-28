// Simville World Generation Module

class World {
  constructor(size = 64) {
    this.size = size;
    this.tiles = [];
    this.resources = [];
    this.structures = [];
    this.seed = Date.now();
    this.villageCenter = { x: 0, y: 0 };
  }

  generate() {
    Utils.setSeed(this.seed);
    this.generateTerrain();
    this.generateResources();
    this.placeVillageCenter();
    return this;
  }

  generateTerrain() {
    this.tiles = [];

    // Generate broad, correlated climate fields. Biomes are selected from
    // height/moisture/temperature together so transitions form regions instead
    // of independent single-tile noise.
    const heightMap = [];
    const moistureMap = [];
    const temperatureMap = [];
    const center = (this.size - 1) / 2;
    const maxDist = Math.sqrt(center * center + center * center);

    for (let y = 0; y < this.size; y++) {
      heightMap[y] = [];
      moistureMap[y] = [];
      temperatureMap[y] = [];
      for (let x = 0; x < this.size; x++) {
        const nx = (x - center) / center;
        const ny = (y - center) / center;
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2) / maxDist;
        const islandFalloff = Utils.clamp(1 - Math.pow(dist, 2.2) * 1.55, 0, 1);

        const continental = Utils.perlin(x + this.seed * 0.01, y - this.seed * 0.01, 28, 5);
        const hills = Utils.perlin(x + 200, y - 200, 14, 3) * 0.25;
        const height = Utils.clamp(continental * 0.75 + hills + islandFalloff * 0.55 - 0.28, 0, 1);

        const moistureNoise = Utils.clamp(
          Utils.perlin(x - 500, y + 500, 24, 4) * 0.7 +
          Utils.perlin(x + 50, y + 50, 48, 2) * 0.3 +
          (1 - Math.abs(nx)) * 0.08,
          0,
          1
        );
        const moisture = Utils.clamp((moistureNoise - 0.5) * 2.1 + 0.5 + (1 - height) * 0.06, 0, 1);

        const temperature = Utils.clamp(
          1 - (y / this.size) * 0.35 -
          height * 0.25 +
          Utils.perlin(x + 900, y - 900, 36, 3) * 0.25,
          0,
          1
        );

        heightMap[y][x] = height;
        moistureMap[y][x] = moisture;
        temperatureMap[y][x] = temperature;
      }
    }

    const smoothedHeight = this.smoothMap(heightMap, 2);
    const smoothedMoisture = this.smoothMap(moistureMap, 2);
    const smoothedTemperature = this.smoothMap(temperatureMap, 1);

    for (let y = 0; y < this.size; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.size; x++) {
        const height = smoothedHeight[y][x];
        const moisture = smoothedMoisture[y][x];
        const temperature = smoothedTemperature[y][x];
        const biome = this.determineBiome(height, moisture, temperature, x, y);
        this.tiles[y][x] = {
          x,
          y,
          biome,
          height,
          moisture,
          temperature,
          walkable: biome !== CONSTANTS.BIOME.OCEAN,
          visible: true,
          explored: false
        };
      }
    }

    this.smoothBiomes(3);
    this.removeBiomeSpeckles(2);
    this.ensureLandmassConnectivity();

    for (let i = 0; i < this.size; i++) {
      this.tiles[0][i].biome = CONSTANTS.BIOME.OCEAN;
      this.tiles[this.size - 1][i].biome = CONSTANTS.BIOME.OCEAN;
      this.tiles[i][0].biome = CONSTANTS.BIOME.OCEAN;
      this.tiles[i][this.size - 1].biome = CONSTANTS.BIOME.OCEAN;
      this.tiles[0][i].walkable = false;
      this.tiles[this.size - 1][i].walkable = false;
      this.tiles[i][0].walkable = false;
      this.tiles[i][this.size - 1].walkable = false;
    }
  }

  smoothMap(source, passes = 1) {
    let current = source;
    for (let pass = 0; pass < passes; pass++) {
      const next = [];
      for (let y = 0; y < this.size; y++) {
        next[y] = [];
        for (let x = 0; x < this.size; x++) {
          let total = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const value = current[y + dy]?.[x + dx];
              if (value === undefined) continue;
              total += value;
              count++;
            }
          }
          next[y][x] = total / count;
        }
      }
      current = next;
    }
    return current;
  }

  determineBiome(height, moisture, temperature, x, y) {
    const isEdge = x <= 1 || y <= 1 || x >= this.size - 2 || y >= this.size - 2;
    if (isEdge || height < 0.32) {
      return CONSTANTS.BIOME.OCEAN;
    }

    const riverField = Math.abs(Utils.perlin(x + this.seed * 0.02, y - this.seed * 0.02, 34, 3) - 0.5);
    if (height < 0.48 && moisture > 0.55 && riverField < 0.035) {
      return CONSTANTS.BIOME.RIVER_DELTA;
    }

    if (moisture > 0.7 && temperature > 0.55) {
      return CONSTANTS.BIOME.DENSE_JUNGLE;
    }

    if (moisture > 0.58 && temperature > 0.45) {
      return CONSTANTS.BIOME.TROPICAL_RAINFOREST;
    }

    if (moisture < 0.48 && height > 0.43) {
      return CONSTANTS.BIOME.CLEARED_LAND;
    }

    return CONSTANTS.BIOME.SAVANNA;
  }

  smoothBiomes(passes = 2) {
    for (let pass = 0; pass < passes; pass++) {
      const replacements = [];
      for (let y = 1; y < this.size - 1; y++) {
        for (let x = 1; x < this.size - 1; x++) {
          const tile = this.tiles[y][x];
          if (!tile || tile.biome === CONSTANTS.BIOME.OCEAN) continue;

          const counts = {};
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const neighbor = this.tiles[y + dy]?.[x + dx];
              if (!neighbor || neighbor.biome === CONSTANTS.BIOME.OCEAN) continue;
              counts[neighbor.biome] = (counts[neighbor.biome] || 0) + 1;
            }
          }

          const [dominantBiome, count] = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])[0] || [];
          if (dominantBiome !== undefined && count >= 5 && Number(dominantBiome) !== tile.biome) {
            replacements.push({ x, y, biome: Number(dominantBiome) });
          }
        }
      }

      replacements.forEach(({ x, y, biome }) => {
        this.tiles[y][x].biome = biome;
        this.tiles[y][x].walkable = biome !== CONSTANTS.BIOME.OCEAN;
      });
    }
  }

  removeBiomeSpeckles(passes = 1) {
    for (let pass = 0; pass < passes; pass++) {
      const replacements = [];
      for (let y = 1; y < this.size - 1; y++) {
        for (let x = 1; x < this.size - 1; x++) {
          const tile = this.tiles[y][x];
          if (!tile || tile.biome === CONSTANTS.BIOME.OCEAN || tile.biome === CONSTANTS.BIOME.VILLAGE_CENTER) continue;

          const counts = {};
          let sameNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const neighbor = this.tiles[y + dy]?.[x + dx];
              if (!neighbor || neighbor.biome === CONSTANTS.BIOME.OCEAN || neighbor.biome === CONSTANTS.BIOME.VILLAGE_CENTER) continue;
              counts[neighbor.biome] = (counts[neighbor.biome] || 0) + 1;
              if (neighbor.biome === tile.biome) sameNeighbors++;
            }
          }

          const [dominantBiome, dominantCount] = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])[0] || [];
          const isLonelyTile = sameNeighbors === 0;
          const isWeakNonRiverPatch = tile.biome !== CONSTANTS.BIOME.RIVER_DELTA && sameNeighbors <= 1;
          if (dominantBiome !== undefined && (isLonelyTile || (isWeakNonRiverPatch && dominantCount >= 4))) {
            replacements.push({ x, y, biome: Number(dominantBiome) });
          }
        }
      }

      replacements.forEach(({ x, y, biome }) => {
        this.tiles[y][x].biome = biome;
        this.tiles[y][x].walkable = biome !== CONSTANTS.BIOME.OCEAN;
      });
    }
  }

  ensureLandmassConnectivity() {
    const visited = new Set();
    const components = [];

    for (let y = 1; y < this.size - 1; y++) {
      for (let x = 1; x < this.size - 1; x++) {
        const key = `${x},${y}`;
        const tile = this.tiles[y][x];
        if (!tile?.walkable || visited.has(key)) continue;

        const component = [];
        const queue = [{ x, y }];
        visited.add(key);

        while (queue.length > 0) {
          const current = queue.shift();
          component.push(current);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = current.x + dx;
            const ny = current.y + dy;
            const nKey = `${nx},${ny}`;
            const neighbor = this.tiles[ny]?.[nx];
            if (!neighbor?.walkable || visited.has(nKey)) continue;
            visited.add(nKey);
            queue.push({ x: nx, y: ny });
          }
        }

        components.push(component);
      }
    }

    if (components.length <= 1) return;
    components.sort((a, b) => b.length - a.length);
    components.slice(1).forEach(component => {
      component.forEach(({ x, y }) => {
        this.tiles[y][x].biome = CONSTANTS.BIOME.OCEAN;
        this.tiles[y][x].walkable = false;
      });
    });
  }

  generateResources() {
    this.resources = [];

    for (let y = 2; y < this.size - 2; y++) {
      for (let x = 2; x < this.size - 2; x++) {
        const tile = this.tiles[y][x];
        if (!tile.walkable) continue;

        const biome = tile.biome;
        const rand = Utils.randomFloat(0, 1);

        // Generate resource nodes based on biome
        switch (biome) {
          case CONSTANTS.BIOME.TROPICAL_RAINFOREST:
            if (rand < 0.15) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.WOOD,
                x, y,
                amount: Utils.randomInt(10, 30),
                maxAmount: 30,
                regrowRate: 0.01,
                depleted: false
              });
            }
            if (rand < 0.08) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.HERBS,
                x, y,
                amount: Utils.randomInt(5, 15),
                maxAmount: 15,
                regrowRate: 0.02,
                depleted: false
              });
            }
            if (rand < 0.05) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.CLAY,
                x, y,
                amount: Utils.randomInt(8, 20),
                maxAmount: 20,
                regrowRate: 0.005,
                depleted: false
              });
            }
            break;

          case CONSTANTS.BIOME.DENSE_JUNGLE:
            if (rand < 0.2) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.WOOD,
                x, y,
                amount: Utils.randomInt(15, 40),
                maxAmount: 40,
                regrowRate: 0.008,
                depleted: false
              });
            }
            if (rand >= 0.2 && rand < 0.23) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.RARE_MATERIALS,
                x, y,
                amount: Utils.randomInt(1, 4),
                maxAmount: 4,
                regrowRate: 0,
                depleted: false
              });
            }
            if (rand < 0.06) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.HERBS,
                x, y,
                amount: Utils.randomInt(8, 20),
                maxAmount: 20,
                regrowRate: 0.015,
                depleted: false
              });
            }
            break;

          case CONSTANTS.BIOME.SAVANNA:
            if (rand < 0.08) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.STONE,
                x, y,
                amount: Utils.randomInt(12, 25),
                maxAmount: 25,
                regrowRate: 0,
                depleted: false
              });
            }
            if (rand < 0.1) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.FOOD,
                x, y,
                amount: Utils.randomInt(8, 18),
                maxAmount: 18,
                regrowRate: 0.03,
                depleted: false
              });
            }
            if (rand < 0.07) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.HERBS,
                x, y,
                amount: Utils.randomInt(5, 12),
                maxAmount: 12,
                regrowRate: 0.02,
                depleted: false
              });
            }
            if (rand >= 0.10 && rand < 0.20) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.THATCH,
                x, y,
                amount: Utils.randomInt(8, 18),
                maxAmount: 18,
                regrowRate: 0.04,
                depleted: false
              });
            }
            if (rand >= 0.20 && rand < 0.22) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.RARE_MATERIALS,
                x, y,
                amount: Utils.randomInt(1, 3),
                maxAmount: 3,
                regrowRate: 0,
                depleted: false
              });
            }
            break;

          case CONSTANTS.BIOME.RIVER_DELTA:
            if (rand < 0.25) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.FISH,
                x, y,
                amount: Utils.randomInt(15, 35),
                maxAmount: 35,
                regrowRate: 0.04,
                depleted: false
              });
            }
            if (rand < 0.2) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.CLAY,
                x, y,
                amount: Utils.randomInt(15, 30),
                maxAmount: 30,
                regrowRate: 0.01,
                depleted: false
              });
            }
            if (rand < 0.1) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.WATER,
                x, y,
                amount: Utils.randomInt(20, 50),
                maxAmount: 50,
                regrowRate: 0.05,
                depleted: false
              });
            }
            break;

          case CONSTANTS.BIOME.CLEARED_LAND:
            if (rand < 0.15) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.FOOD,
                x, y,
                amount: Utils.randomInt(10, 25),
                maxAmount: 25,
                regrowRate: 0.04,
                depleted: false
              });
            }
            if (rand < 0.05) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.HERBS,
                x, y,
                amount: Utils.randomInt(3, 10),
                maxAmount: 10,
                regrowRate: 0.03,
                depleted: false
              });
            }
            if (rand >= 0.15 && rand < 0.28) {
              this.resources.push({
                id: Utils.generateId(),
                type: CONSTANTS.RESOURCE.THATCH,
                x, y,
                amount: Utils.randomInt(10, 25),
                maxAmount: 25,
                regrowRate: 0.05,
                depleted: false
              });
            }
            break;
        }
      }
    }
  }

  placeVillageCenter() {
    // Find a good location for the village center (cleared land or savanna near water)
    let bestLocation = null;
    let bestScore = -Infinity;

    for (let y = 10; y < this.size - 10; y++) {
      for (let x = 10; x < this.size - 10; x++) {
        const tile = this.tiles[y][x];
        if (!tile.walkable) continue;
        if (tile.biome === CONSTANTS.BIOME.OCEAN || tile.biome === CONSTANTS.BIOME.DENSE_JUNGLE) continue;

        // Score based on nearby resources
        let score = 0;
        const nearbyResources = this.getResourcesInRadius(x, y, 5);
        score += nearbyResources.filter(r => r.type === CONSTANTS.RESOURCE.WOOD).length * 2;
        score += nearbyResources.filter(r => r.type === CONSTANTS.RESOURCE.WATER).length * 3;
        score += nearbyResources.filter(r => r.type === CONSTANTS.RESOURCE.FOOD).length * 2;

        // Prefer central locations
        const centerDist = Math.abs(x - this.size / 2) + Math.abs(y - this.size / 2);
        score -= centerDist * 0.1;

        // Check for nearby water
        const hasWater = nearbyResources.some(r => r.type === CONSTANTS.RESOURCE.WATER);
        if (hasWater) score += 5;

        if (score > bestScore) {
          bestScore = score;
          bestLocation = { x, y };
        }
      }
    }

    this.villageCenter = bestLocation || { x: Math.floor(this.size / 2), y: Math.floor(this.size / 2) };

    // Mark village center tiles
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = this.villageCenter.x + dx;
        const ty = this.villageCenter.y + dy;
        if (tx >= 0 && tx < this.size && ty >= 0 && ty < this.size) {
          this.tiles[ty][tx].biome = CONSTANTS.BIOME.VILLAGE_CENTER;
          this.tiles[ty][tx].walkable = true;
        }
      }
    }
  }

  getTile(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      return null;
    }
    return this.tiles[y]?.[x];
  }

  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    return Boolean(tile?.walkable);
  }

  getWalkableTileNear(x, y, radius = 3) {
    x = Math.round(x);
    y = Math.round(y);
    for (let d = 0; d <= radius; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
          const tile = this.getTile(x + dx, y + dy);
          if (tile && tile.walkable) {
            return tile;
          }
        }
      }
    }
    return null;
  }

  getResourcesInRadius(x, y, radius) {
    return this.resources.filter(r => {
      const dist = Utils.distance(r.x, r.y, x, y);
      return dist <= radius;
    });
  }

  getResourceAt(x, y) {
    return this.resources.find(r => r.x === x && r.y === y && !r.depleted);
  }

  harvestResource(resourceId, amount = 1) {
    const resource = this.resources.find(r => r.id === resourceId);
    if (!resource) return 0;

    const harvested = Math.min(resource.amount, amount);
    if (resource.type === CONSTANTS.RESOURCE.WATER) {
      resource.amount = Math.max(resource.maxAmount * 0.25, resource.amount - harvested * 0.25);
      return harvested;
    }

    resource.amount -= harvested;

    if (resource.amount <= 0) {
      resource.depleted = true;
    }

    return harvested;
  }

  addStructure(structure) {
    this.structures.push({
      id: Utils.generateId(),
      ...structure,
      builtAt: game ? game.timeState.day : 1
    });
  }

  getStructureAt(x, y) {
    return this.structures.find(s => s.x === x && s.y === y);
  }

  getStructuresInRadius(x, y, radius) {
    return this.structures.filter(s => Utils.distance(s.x, s.y, x, y) <= radius);
  }

  // Get a complete walkable path between two points.
  getPath(startX, startY, endX, endY) {
    const start = this.getWalkableTileNear(startX, startY, 2);
    const end = this.getWalkableTileNear(endX, endY, 3);
    if (!start || !end) return null;
    if (start.x === end.x && start.y === end.y) return [];

    const queue = [{ x: start.x, y: start.y }];
    const visited = new Set([`${start.x},${start.y}`]);
    const cameFrom = new Map();
    let found = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.x === end.x && current.y === end.y) {
        found = true;
        break;
      }

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || !this.isWalkable(nx, ny)) continue;

        visited.add(key);
        cameFrom.set(key, current);
        queue.push({ x: nx, y: ny });
      }
    }

    if (!found) return null;

    const path = [];
    let current = { x: end.x, y: end.y };
    while (current.x !== start.x || current.y !== start.y) {
      path.unshift(current);
      current = cameFrom.get(`${current.x},${current.y}`);
      if (!current) return null;
    }

    return path;
  }

  // Check if path is blocked
  isPathBlocked(startX, startY, endX, endY) {
    const path = this.getPath(startX, startY, endX, endY);
    return path === null;
  }

  // Serialize for saving
  serialize() {
    return {
      size: this.size,
      tiles: this.tiles,
      resources: this.resources,
      structures: this.structures,
      seed: this.seed,
      villageCenter: this.villageCenter
    };
  }

  // Deserialize from save
  static deserialize(data) {
    const world = new World(data.size);
    world.tiles = data.tiles;
    world.resources = data.resources;
    world.structures = data.structures || [];
    world.seed = data.seed;
    world.villageCenter = data.villageCenter;
    return world;
  }
}

// World renderer
class WorldRenderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.tileSize = CONSTANTS.WORLD.TILE_SIZE;

    // Pre-calculate biome colors
    this.biomeColors = {};
    for (const [key, value] of Object.entries(CONSTANTS.BIOME)) {
      if (typeof value === 'number') {
        this.biomeColors[value] = CONSTANTS.COLORS.BIOME[value];
      }
    }

    // Lighting colors for time of day
    this.lightingColors = {
      dawn: 'rgba(255, 150, 100, 0.2)',
      morning: 'rgba(255, 255, 200, 0.1)',
      afternoon: 'rgba(255, 255, 255, 0.05)',
      evening: 'rgba(255, 100, 50, 0.25)',
      night: 'rgba(20, 20, 60, 0.5)'
    };
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight - 76; // Account for HUD and resource bar
  }

  centerOn(x, y) {
    const scale = this.tileSize * CONSTANTS.WORLD.PIXEL_SCALE * this.camera.zoom;
    this.camera.x = x * scale - this.canvas.width / 2;
    this.camera.y = y * scale - this.canvas.height / 2;
  }

  pan(dx, dy) {
    this.camera.x += dx;
    this.camera.y += dy;
  }

  zoom(delta) {
    const oldZoom = this.camera.zoom;
    this.camera.zoom = Utils.clamp(this.camera.zoom + delta, 0.5, 3);

    // Adjust camera to zoom towards center
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const zoomRatio = this.camera.zoom / oldZoom;
    this.camera.x = (this.camera.x + centerX) * zoomRatio - centerX;
    this.camera.y = (this.camera.y + centerY) * zoomRatio - centerY;
  }

  screenToWorld(screenX, screenY) {
    const x = (screenX + this.camera.x) / (this.tileSize * CONSTANTS.WORLD.PIXEL_SCALE * this.camera.zoom);
    const y = (screenY + this.camera.y) / (this.tileSize * CONSTANTS.WORLD.PIXEL_SCALE * this.camera.zoom);
    return { x, y };
  }

  worldToScreen(worldX, worldY) {
    const x = worldX * this.tileSize * CONSTANTS.WORLD.PIXEL_SCALE * this.camera.zoom - this.camera.x;
    const y = worldY * this.tileSize * CONSTANTS.WORLD.PIXEL_SCALE * this.camera.zoom - this.camera.y;
    return { x, y };
  }

  render(timeOfDay, season, showLabels = true) {
    const ctx = this.ctx;
    const scale = this.camera.zoom * CONSTANTS.WORLD.PIXEL_SCALE;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Calculate visible tile range
    const startX = Math.floor(this.camera.x / (this.tileSize * scale));
    const startY = Math.floor(this.camera.y / (this.tileSize * scale));
    const endX = Math.ceil((this.camera.x + this.canvas.width) / (this.tileSize * scale));
    const endY = Math.ceil((this.camera.y + this.canvas.height) / (this.tileSize * scale));

    // Render terrain
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = this.world.getTile(x, y);
        if (!tile) continue;

        const screenX = x * this.tileSize * scale - this.camera.x;
        const screenY = y * this.tileSize * scale - this.camera.y;
        const tileSize = this.tileSize * scale;

        // Base biome color
        ctx.fillStyle = this.biomeColors[tile.biome] || '#333';
        ctx.fillRect(screenX, screenY, tileSize, tileSize);

        // Add texture variation
        if (tile.biome !== CONSTANTS.BIOME.OCEAN) {
          const variation = Utils.noise2D(x + this.world.seed, y + this.world.seed) * 0.1;
          ctx.fillStyle = `rgba(255, 255, 255, ${variation})`;
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
        }

        // Draw biome icon on tile (on top of terrain but behind resources/structures for readability)
        const biomeIcon = CONSTANTS.BIOME_ICON[tile.biome];
        if (biomeIcon && tileSize >= 8) { // Only draw if tile is visible size
          ctx.font = `${Math.floor(tileSize * 0.65)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillText(biomeIcon, screenX + tileSize / 2, screenY + tileSize / 2);
        }

        // Resource indicators
        const resource = this.world.getResourceAt(x, y);
        if (resource && !resource.depleted) {
          this.renderResourceIndicator(ctx, resource, screenX, screenY, tileSize);
        }

        // Draw structure if present
        const structure = this.world.getStructureAt(x, y);
        if (structure) {
          this.renderStructure(ctx, structure, screenX, screenY, tileSize);
        }

        // Grid lines (debug)
        // ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        // ctx.strokeRect(screenX, screenY, tileSize, tileSize);
      }
    }

    // Apply lighting overlay based on time of day
    if (timeOfDay && this.lightingColors[timeOfDay]) {
      ctx.fillStyle = this.lightingColors[timeOfDay];
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Season tint
    if (season) {
      ctx.fillStyle = `${season.color}15`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Night darkness (apply to areas without fire light)
    if (timeOfDay === 'night') {
      // Create radial gradient from fires
      const fires = this.world.structures.filter(s => s.type === 'fire');
      fires.forEach(fire => {
        const screen = this.worldToScreen(fire.x, fire.y);
        const gradient = ctx.createRadialGradient(
          screen.x, screen.y, 0,
          screen.x, screen.y, 5 * this.tileSize * scale
        );
        gradient.addColorStop(0, 'rgba(255, 200, 100, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      });
    }
  }

  renderResourceIndicator(ctx, resource, screenX, screenY, tileSize) {
    const iconSize = tileSize * 0.6;
    const offsetX = (tileSize - iconSize) / 2;
    const offsetY = (tileSize - iconSize) / 2;

    ctx.globalAlpha = 0.7;

    // Draw resource icon based on type
    ctx.font = `${iconSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const icons = {
      [CONSTANTS.RESOURCE.WOOD]: '🪵',
      [CONSTANTS.RESOURCE.FOOD]: '🍎',
      [CONSTANTS.RESOURCE.WATER]: '💧',
      [CONSTANTS.RESOURCE.STONE]: '🪨',
      [CONSTANTS.RESOURCE.HERBS]: '🌿',
      [CONSTANTS.RESOURCE.CLAY]: '🏺',
      [CONSTANTS.RESOURCE.FISH]: '🐟',
      [CONSTANTS.RESOURCE.THATCH]: '🌾',
      [CONSTANTS.RESOURCE.RARE_MATERIALS]: '💎'
    };

    ctx.fillText(icons[resource.type] || '?', screenX + tileSize / 2, screenY + tileSize / 2);

    ctx.globalAlpha = 1;

    // Depletion indicator
    if (resource.amount < resource.maxAmount * 0.3) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(screenX, screenY + tileSize - 4, tileSize * (resource.amount / resource.maxAmount), 4);
    }
  }

  renderStructure(ctx, structure, screenX, screenY, tileSize) {
    const colors = {
      hut: '#8b5a2b',
      storage: '#b7833b',
      fire: '#e94524',
      watchtower: '#7d5635',
      well: '#4a90d9',
      farm: '#7ed321',
      workshop: '#6c6f75',
      shrine: '#6b5bd2'
    };
    const labels = {
      hut: 'H',
      storage: 'S',
      fire: 'F',
      watchtower: 'W',
      well: 'O',
      farm: 'P',
      workshop: 'T',
      shrine: '*'
    };
    const pad = tileSize * 0.14;
    const cx = screenX + tileSize / 2;
    const cy = screenY + tileSize / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(screenX + tileSize * 0.18, screenY + tileSize * 0.72, tileSize * 0.64, tileSize * 0.12);
    ctx.fillStyle = colors[structure.type] || '#d9c27d';
    ctx.strokeStyle = 'rgba(25, 20, 15, 0.9)';
    ctx.lineWidth = Math.max(1, tileSize * 0.06);

    if (structure.type === 'hut') {
      ctx.fillRect(screenX + pad, cy, tileSize - pad * 2, tileSize * 0.28);
      ctx.strokeRect(screenX + pad, cy, tileSize - pad * 2, tileSize * 0.28);
      ctx.beginPath();
      ctx.moveTo(cx, screenY + pad);
      ctx.lineTo(screenX + tileSize - pad, cy + tileSize * 0.04);
      ctx.lineTo(screenX + pad, cy + tileSize * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (structure.type === 'fire') {
      ctx.beginPath();
      ctx.moveTo(cx, screenY + pad);
      ctx.lineTo(cx + tileSize * 0.22, cy + tileSize * 0.22);
      ctx.lineTo(cx - tileSize * 0.22, cy + tileSize * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffbf33';
      ctx.beginPath();
      ctx.arc(cx, cy + tileSize * 0.22, tileSize * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else if (structure.type === 'well') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileSize * 0.28, tileSize * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#14384a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileSize * 0.16, tileSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (structure.type === 'farm') {
      ctx.fillRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2);
      ctx.strokeRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2);
      ctx.strokeStyle = '#efe08a';
      for (let i = 1; i <= 4; i++) {
        const y = screenY + pad + i * tileSize * 0.14;
        ctx.beginPath();
        ctx.moveTo(screenX + pad * 1.4, y);
        ctx.lineTo(screenX + tileSize - pad * 1.4, y);
        ctx.stroke();
      }
    } else {
      ctx.fillRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2);
      ctx.strokeRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2);
      ctx.fillStyle = '#fff8dc';
      ctx.font = `${Math.max(8, tileSize * 0.38)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[structure.type] || '?', cx, cy);
    }

    ctx.restore();
    return;

    const scale = this.tileSize * 0.8;

    ctx.font = `${scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const icons = {
      hut: '🏠',
      storage: '📦',
      fire: '🔥',
      watchtower: '🗼',
      well: '🪣',
      farm: '🌾',
      workshop: '🔧',
      shrine: '⛩️'
    };

    ctx.fillText(icons[structure.type] || '❓', screenX + tileSize / 2, screenY + tileSize / 2);
  }

  renderConstructionProject(project) {
    if (!project || !this.world) return;

    const ctx = this.ctx;
    const scale = this.camera.zoom * CONSTANTS.WORLD.PIXEL_SCALE;
    const tileSize = this.tileSize * scale;
    const screen = this.worldToScreen(project.x, project.y);
    const progress = Utils.clamp(project.progress / project.workRequired, 0, 1);

    ctx.save();
    ctx.fillStyle = 'rgba(255, 193, 7, 0.28)';
    ctx.strokeStyle = '#ffc107';
    ctx.lineWidth = Math.max(1, tileSize * 0.06);
    ctx.fillRect(screen.x + tileSize * 0.12, screen.y + tileSize * 0.12, tileSize * 0.76, tileSize * 0.76);
    ctx.strokeRect(screen.x + tileSize * 0.12, screen.y + tileSize * 0.12, tileSize * 0.76, tileSize * 0.76);

    ctx.strokeStyle = '#5a3a22';
    ctx.beginPath();
    ctx.moveTo(screen.x + tileSize * 0.22, screen.y + tileSize * 0.78);
    ctx.lineTo(screen.x + tileSize * 0.78, screen.y + tileSize * 0.22);
    ctx.moveTo(screen.x + tileSize * 0.22, screen.y + tileSize * 0.22);
    ctx.lineTo(screen.x + tileSize * 0.78, screen.y + tileSize * 0.78);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(screen.x + tileSize * 0.16, screen.y + tileSize * 0.82, tileSize * 0.68, Math.max(3, tileSize * 0.08));
    ctx.fillStyle = '#4ecca3';
    ctx.fillRect(screen.x + tileSize * 0.16, screen.y + tileSize * 0.82, tileSize * 0.68 * progress, Math.max(3, tileSize * 0.08));
    ctx.restore();
  }

  renderMinimap(minimapCanvas, villagers, showLabels = true, constructionProjects = []) {
    const ctx = minimapCanvas.getContext('2d');
    const scale = minimapCanvas.width / this.world.size;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Draw tiles
    for (let y = 0; y < this.world.size; y++) {
      for (let x = 0; x < this.world.size; x++) {
        const tile = this.world.tiles[y]?.[x];
        if (!tile) continue;

        ctx.fillStyle = this.biomeColors[tile.biome] || '#333';
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }

    // Draw structures
    this.world.structures.forEach(s => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * scale - 1, s.y * scale - 1, 3, 3);
    });

    constructionProjects.forEach(project => {
      ctx.fillStyle = '#ffc107';
      ctx.fillRect(project.x * scale - 1, project.y * scale - 1, 3, 3);
    });

    // Draw villagers
    villagers.forEach(v => {
      const isChieftan = v.isChieftan;
      ctx.fillStyle = isChieftan ? '#ffd700' : '#e94560';
      ctx.beginPath();
      ctx.arc(v.x * scale, v.y * scale, isChieftan ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw village center marker
    ctx.strokeStyle = '#4ecca3';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.world.villageCenter.x * scale - 3,
      this.world.villageCenter.y * scale - 3,
      7, 7
    );
  }
}
