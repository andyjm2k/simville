// Simville visual effects: season palettes, terrain cache, lighting, particles.
// Keeps Canvas 2D compatible and gated by graphics quality toggles.

/** Remap biome ground colors for seasonal atmosphere without full-screen washes. */
class SeasonPalette {
  // Multipliers applied to RGB channels per season name
  static MODIFIERS = {
    'Wet Season': { r: 0.85, g: 1.12, b: 1.08 },
    'Dry Season': { r: 1.12, g: 1.05, b: 0.82 },
    'Harvest Season': { r: 1.18, g: 1.1, b: 0.75 },
    'Deep Dry': { r: 1.15, g: 0.88, b: 0.72 }
  };

  /** Parse #rrggbb into [r,g,b] integers. */
  static parseHex(hex) {
    const value = String(hex || '#333333').replace('#', '');
    return [
      parseInt(value.slice(0, 2), 16) || 0,
      parseInt(value.slice(2, 4), 16) || 0,
      parseInt(value.slice(4, 6), 16) || 0
    ];
  }

  /** Format RGB integers back to #rrggbb. */
  static toHex(r, g, b) {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Return season-adjusted biome fill color. */
  static remapBiomeColor(hex, seasonName) {
    const mod = SeasonPalette.MODIFIERS[seasonName];
    if (!mod) return hex;
    const [r, g, b] = SeasonPalette.parseHex(hex);
    return SeasonPalette.toHex(r * mod.r, g * mod.g, b * mod.b);
  }

  /** Soft full-screen season tint alpha overlay color (kept subtle). */
  static overlayColor(season) {
    if (!season?.color) return null;
    return `${season.color}12`;
  }
}

/**
 * Offscreen terrain cache: biome fills, micro-detail, neighbor edge blend.
 * Rebuilt on world/season change; blit each frame under dynamic props.
 */
class TerrainCache {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.dirty = true;
    this.cacheKey = null;
    this.tilePx = CONSTANTS.WORLD.TILE_SIZE;
  }

  /** Mark cache invalid so the next blit rebuilds. */
  invalidate() {
    this.dirty = true;
    this.cacheKey = null;
  }

  /** Stable key for world size, seed, and season. */
  buildKey(world, seasonName) {
    return `${world.size}:${world.seed}:${seasonName || 'none'}`;
  }

  /** Ensure backing canvas matches world pixel size. */
  ensureCanvas(world) {
    const width = world.size * this.tilePx;
    const height = world.size * this.tilePx;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** Sample neighbor biome for cheap edge blending. */
  neighborMix(world, x, y, biomeColors, seasonName, baseColor) {
    const neighbors = [
      world.getTile(x + 1, y),
      world.getTile(x - 1, y),
      world.getTile(x, y + 1),
      world.getTile(x, y - 1)
    ];
    let mixed = baseColor;
    for (const tile of neighbors) {
      if (!tile || tile.biome === world.getTile(x, y)?.biome) continue;
      const other = SeasonPalette.remapBiomeColor(biomeColors[tile.biome] || '#333', seasonName);
      const [r1, g1, b1] = SeasonPalette.parseHex(mixed);
      const [r2, g2, b2] = SeasonPalette.parseHex(other);
      mixed = SeasonPalette.toHex(
        r1 * 0.85 + r2 * 0.15,
        g1 * 0.85 + g2 * 0.15,
        b1 * 0.85 + b2 * 0.15
      );
      break;
    }
    return mixed;
  }

  /** Draw speckles / canopy dots into a single tile cell. */
  paintMicroDetail(ctx, x, y, biome, tilePx, seed) {
    if (biome === CONSTANTS.BIOME.OCEAN) return;
    const variation = Utils.noise2D(x + seed, y + seed);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + variation * 0.08})`;
    ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);

    // Sparse darker speckles for ground texture
    const speckles = biome === CONSTANTS.BIOME.DENSE_JUNGLE ? 5 : 3;
    for (let i = 0; i < speckles; i++) {
      const n = Utils.noise2D(x * 13 + i + seed, y * 17 + i);
      if (n < 0.35) continue;
      const px = Math.floor(x * tilePx + (n * 11) % (tilePx - 2));
      const py = Math.floor(y * tilePx + ((n * 29) % (tilePx - 2)));
      ctx.fillStyle = biome === CONSTANTS.BIOME.SAVANNA
        ? 'rgba(90, 70, 30, 0.25)'
        : 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(px, py, 1, 1);
    }

    // Canopy hint for forest biomes
    if (biome === CONSTANTS.BIOME.TROPICAL_RAINFOREST || biome === CONSTANTS.BIOME.DENSE_JUNGLE) {
      ctx.fillStyle = 'rgba(10, 60, 20, 0.35)';
      const cx = x * tilePx + 4 + Math.floor((variation + 1) * 3);
      const cy = y * tilePx + 3;
      ctx.fillRect(cx, cy, 5, 4);
      ctx.fillRect(cx + 1, cy - 2, 3, 2);
    }
  }

  /** Rebuild the full terrain atlas when dirty or key changes. */
  rebuild(world, biomeColors, seasonName) {
    this.ensureCanvas(world);
    const ctx = this.ctx;
    const tilePx = this.tilePx;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const tile = world.getTile(x, y);
        if (!tile) continue;
        const base = biomeColors[tile.biome] || '#333';
        const remapped = SeasonPalette.remapBiomeColor(base, seasonName);
        const fill = this.neighborMix(world, x, y, biomeColors, seasonName, remapped);
        ctx.fillStyle = fill;
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
        this.paintMicroDetail(ctx, x, y, tile.biome, tilePx, world.seed);
      }
    }

    this.dirty = false;
    this.cacheKey = this.buildKey(world, seasonName);
  }

  /** Ensure cache is current, then blit scaled into the main world view. */
  blit(ctx, world, biomeColors, seasonName, camera, pixelScale) {
    const key = this.buildKey(world, seasonName);
    if (this.dirty || this.cacheKey !== key || !this.canvas) {
      this.rebuild(world, biomeColors, seasonName);
    }

    const scale = camera.zoom * pixelScale;
    const drawW = world.size * this.tilePx * scale;
    const drawH = world.size * this.tilePx * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, -camera.x, -camera.y, drawW, drawH);
  }
}

/**
 * Night darkness with fire cutouts on an offscreen layer so terrain stays intact.
 */
class LightingLayer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  ensureSize(width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** Time-of-day wash colors (applied when lighting enabled). */
  static TOD_COLORS = {
    dawn: 'rgba(255, 150, 100, 0.18)',
    morning: 'rgba(255, 255, 200, 0.08)',
    afternoon: 'rgba(255, 255, 255, 0.03)',
    evening: 'rgba(255, 100, 50, 0.22)',
    night: 'rgba(12, 14, 40, 0.58)'
  };

  /**
   * Apply lighting overlays. When lightingEnabled is false, no-op.
   * Night uses destination-out cutouts for fire illumination.
   */
  apply(mainCtx, options) {
    const {
      timeOfDay,
      lightingEnabled,
      fires = [],
      worldToScreen,
      lightRadiusPx,
      width,
      height,
      animTime = 0
    } = options;

    if (!lightingEnabled || !timeOfDay) return;

    const wash = LightingLayer.TOD_COLORS[timeOfDay];
    if (wash && timeOfDay !== 'night') {
      mainCtx.fillStyle = wash;
      mainCtx.fillRect(0, 0, width, height);
      return;
    }

    if (timeOfDay !== 'night') return;

    this.ensureSize(width, height);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = LightingLayer.TOD_COLORS.night;
    ctx.fillRect(0, 0, width, height);

    // Punch transparent holes where fires illuminate
    ctx.globalCompositeOperation = 'destination-out';
    fires.forEach((fire, index) => {
      const screen = worldToScreen(fire.x + 0.5, fire.y + 0.5);
      const flicker = 1 + Math.sin(animTime / 180 + index) * 0.08;
      const radius = lightRadiusPx * flicker;
      const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
      gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
    mainCtx.drawImage(this.canvas, 0, 0);

    // Warm glow on top of punched darkness
    fires.forEach((fire, index) => {
      const screen = worldToScreen(fire.x + 0.5, fire.y + 0.5);
      const flicker = 1 + Math.sin(animTime / 140 + index * 1.7) * 0.1;
      const radius = lightRadiusPx * 0.85 * flicker;
      const glow = mainCtx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
      glow.addColorStop(0, 'rgba(255, 190, 90, 0.28)');
      glow.addColorStop(0.5, 'rgba(255, 140, 40, 0.12)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      mainCtx.fillStyle = glow;
      mainCtx.beginPath();
      mainCtx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      mainCtx.fill();
    });
  }
}

/**
 * Capped particle system for rain (wet) and dust (dry / deep dry).
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.mode = 'none';
    this.width = 0;
    this.height = 0;
  }

  /** Choose weather particle mode from season + toggles. */
  static resolveMode(weather, seasonName, particlesEnabled) {
    if (!particlesEnabled) return 'none';
    if (weather?.rain || seasonName === CONSTANTS.SEASON.WET.name) return 'rain';
    if (seasonName === CONSTANTS.SEASON.DEEP_DRY.name || seasonName === CONSTANTS.SEASON.DRY.name) {
      return 'dust';
    }
    return 'none';
  }

  /** Rebuild particle pool when mode or viewport size changes. */
  sync(mode, width, height) {
    const sizeChanged = this.width !== width || this.height !== height;
    if (mode === this.mode && !sizeChanged && this.particles.length) return;
    this.mode = mode;
    this.width = width;
    this.height = height;
    this.particles = [];
    if (mode === 'none') return;

    const count = mode === 'rain' ? 56 : 28;
    for (let i = 0; i < count; i++) {
      this.particles.push(this.spawnParticle(mode, true));
    }
  }

  spawnParticle(mode, randomY = false) {
    if (mode === 'rain') {
      return {
        x: Math.random() * this.width,
        y: randomY ? Math.random() * this.height : -10,
        vx: -0.6 - Math.random() * 0.4,
        vy: 4 + Math.random() * 3,
        len: 8 + Math.random() * 6,
        splash: 0
      };
    }
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: 0.3 + Math.random() * 0.5,
      vy: -0.15 + Math.random() * 0.3,
      life: 0.4 + Math.random() * 0.6,
      size: 1 + Math.random() * 1.5
    };
  }

  /** Advance particles; dtMs is frame delta in milliseconds. */
  update(dtMs) {
    if (this.mode === 'none') return;
    const step = Math.min(dtMs, 50) / 16.67;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (this.mode === 'rain') {
        if (p.splash > 0) {
          p.splash -= step;
          if (p.splash <= 0) this.particles[i] = this.spawnParticle('rain');
          continue;
        }
        p.x += p.vx * step;
        p.y += p.vy * step;
        if (p.y > this.height) {
          p.splash = 4;
          p.y = this.height - 1;
        } else if (p.x < -20) {
          this.particles[i] = this.spawnParticle('rain');
        }
      } else {
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.life -= 0.008 * step;
        if (p.life <= 0 || p.x > this.width + 10) {
          this.particles[i] = this.spawnParticle('dust', true);
        }
      }
    }
  }

  /** Draw active particles onto the main canvas. */
  render(ctx) {
    if (this.mode === 'none' || !this.particles.length) return;

    if (this.mode === 'rain') {
      ctx.fillStyle = 'rgba(74, 144, 217, 0.1)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = 'rgba(190, 220, 255, 0.45)';
      ctx.lineWidth = 1;
      for (const p of this.particles) {
        if (p.splash > 0) {
          ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 + (4 - p.splash) * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(190, 220, 255, 0.45)';
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.len);
        ctx.stroke();
      }
      return;
    }

    // Dust motes for dry seasons
    for (const p of this.particles) {
      ctx.fillStyle = `rgba(210, 180, 120, ${0.15 + p.life * 0.25})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }
}

/**
 * Ambient animated overlays for water shimmer and structure activity cues.
 */
class AmbientFX {
  /** Draw cheap water shimmer on visible ocean / delta tiles. */
  static drawWaterShimmer(ctx, world, camera, tileSize, pixelScale, animTime, startX, startY, endX, endY) {
    const scale = camera.zoom * pixelScale;
    const phase = animTime / 400;
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = world.getTile(x, y);
        if (!tile) continue;
        if (tile.biome !== CONSTANTS.BIOME.OCEAN && tile.biome !== CONSTANTS.BIOME.RIVER_DELTA) continue;
        const screenX = x * tileSize * scale - camera.x;
        const screenY = y * tileSize * scale - camera.y;
        const wave = (Math.sin(phase + x * 0.7 + y * 0.4) + 1) * 0.5;
        ctx.fillStyle = `rgba(180, 220, 255, ${0.04 + wave * 0.08})`;
        ctx.fillRect(screenX, screenY + wave * 2, tileSize * scale, Math.max(1, tileSize * scale * 0.2));
      }
    }
  }

  /** Smoke puff above fires for activity feel. */
  static drawFireSmoke(ctx, fireScreenX, fireScreenY, tileSize, animTime, index) {
    const t = animTime / 300 + index;
    for (let i = 0; i < 3; i++) {
      const rise = ((t + i * 0.4) % 3) * tileSize * 0.35;
      const drift = Math.sin(t + i) * tileSize * 0.12;
      const alpha = 0.18 - rise / (tileSize * 2);
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(80, 80, 90, ${alpha})`;
      const size = tileSize * (0.12 + i * 0.04);
      ctx.beginPath();
      ctx.arc(fireScreenX + drift, fireScreenY - rise, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Well water ripple rings. */
  static drawWellRipple(ctx, cx, cy, tileSize, animTime) {
    const pulse = (animTime / 500) % 1;
    ctx.strokeStyle = `rgba(100, 180, 220, ${0.35 - pulse * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, tileSize * 0.12 + pulse * tileSize * 0.12, tileSize * 0.08 + pulse * tileSize * 0.08, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
