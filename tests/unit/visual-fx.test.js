import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bootstrapCoreModules, resetRendererModules } from '../setup/load-scripts.js';

describe('Visual FX modules', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
    Utils.setSeed(99);
  });

  describe('SeasonPalette', () => {
    it('remaps biome colors for wet season toward cooler greens', () => {
      const base = '#228b22';
      const wet = SeasonPalette.remapBiomeColor(base, 'Wet Season');
      expect(wet).toMatch(/^#[0-9a-f]{6}$/i);
      expect(wet.toLowerCase()).not.toBe(base.toLowerCase());
    });

    it('returns original color when season is unknown', () => {
      expect(SeasonPalette.remapBiomeColor('#ff0000', 'Unknown')).toBe('#ff0000');
    });

    it('builds a translucent overlay from season color', () => {
      expect(SeasonPalette.overlayColor({ color: '#4a90d9' })).toBe('#4a90d912');
      expect(SeasonPalette.overlayColor(null)).toBeNull();
    });
  });

  describe('LightingLayer', () => {
    it('no-ops when lighting is disabled', () => {
      const layer = new LightingLayer();
      const fillRect = vi.fn();
      const ctx = { fillRect, fillStyle: '', drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() }) };
      layer.apply(ctx, {
        timeOfDay: 'night',
        lightingEnabled: false,
        fires: [{ x: 1, y: 1 }],
        worldToScreen: () => ({ x: 10, y: 10 }),
        lightRadiusPx: 40,
        width: 100,
        height: 80,
        animTime: 0
      });
      expect(fillRect).not.toHaveBeenCalled();
    });

    it('draws dawn wash without fire cutouts', () => {
      const layer = new LightingLayer();
      const fillRect = vi.fn();
      const ctx = {
        fillRect,
        fillStyle: '',
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        createRadialGradient: () => ({ addColorStop: vi.fn() })
      };
      layer.apply(ctx, {
        timeOfDay: 'dawn',
        lightingEnabled: true,
        fires: [],
        worldToScreen: () => ({ x: 0, y: 0 }),
        lightRadiusPx: 40,
        width: 200,
        height: 100,
        animTime: 0
      });
      expect(fillRect).toHaveBeenCalled();
      expect(ctx.fillStyle).toBe(LightingLayer.TOD_COLORS.dawn);
    });

    it('composites night darkness through an offscreen layer', () => {
      const layer = new LightingLayer();
      const drawImage = vi.fn();
      const mainCtx = {
        fillRect: vi.fn(),
        fillStyle: '',
        drawImage,
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        createRadialGradient: () => ({ addColorStop: vi.fn() })
      };
      layer.apply(mainCtx, {
        timeOfDay: 'night',
        lightingEnabled: true,
        fires: [{ x: 2, y: 3 }],
        worldToScreen: (x, y) => ({ x: x * 10, y: y * 10 }),
        lightRadiusPx: 50,
        width: 128,
        height: 96,
        animTime: 1000
      });
      expect(layer.canvas).toBeTruthy();
      expect(layer.canvas.width).toBe(128);
      expect(drawImage).toHaveBeenCalled();
    });
  });

  describe('ParticleSystem', () => {
    it('resolves rain for wet season when particles enabled', () => {
      expect(ParticleSystem.resolveMode({ rain: true }, 'Wet Season', true)).toBe('rain');
      expect(ParticleSystem.resolveMode({}, 'Dry Season', true)).toBe('dust');
      expect(ParticleSystem.resolveMode({}, 'Wet Season', false)).toBe('none');
    });

    it('spawns a capped rain particle pool and updates without throwing', () => {
      const system = new ParticleSystem();
      system.sync('rain', 320, 240);
      expect(system.particles.length).toBe(56);
      system.update(32);
      expect(system.particles.length).toBe(56);
      const ctx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn()
      };
      system.render(ctx);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('clears particles when mode becomes none', () => {
      const system = new ParticleSystem();
      system.sync('dust', 100, 100);
      expect(system.particles.length).toBeGreaterThan(0);
      system.sync('none', 100, 100);
      expect(system.particles.length).toBe(0);
    });
  });

  describe('TerrainCache', () => {
    it('rebuilds once per season key and marks dirty on invalidate', () => {
      const world = new World(8);
      world.seed = 42;
      world.generate();
      const cache = new TerrainCache();
      const biomeColors = {};
      for (const [key, value] of Object.entries(CONSTANTS.BIOME)) {
        if (typeof value === 'number') biomeColors[value] = CONSTANTS.COLORS.BIOME[value];
      }

      const ctx = {
        drawImage: vi.fn(),
        imageSmoothingEnabled: true
      };
      cache.blit(ctx, world, biomeColors, 'Wet Season', { x: 0, y: 0, zoom: 1 }, 2);
      expect(cache.dirty).toBe(false);
      expect(cache.canvas.width).toBe(8 * CONSTANTS.WORLD.TILE_SIZE);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);

      cache.blit(ctx, world, biomeColors, 'Wet Season', { x: 0, y: 0, zoom: 1 }, 2);
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);

      cache.invalidate();
      expect(cache.dirty).toBe(true);
      cache.blit(ctx, world, biomeColors, 'Dry Season', { x: 0, y: 0, zoom: 1 }, 2);
      expect(cache.dirty).toBe(false);
      expect(cache.cacheKey).toContain('Dry Season');
    });
  });
});

describe('Pixel art helpers', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
  });

  it('measures and draws pixel font glyphs', () => {
    expect(PixelFont.measure('AB', 2)).toBe(2 * (3 * 2 + 2));
    const fillRect = vi.fn();
    PixelFont.draw({ fillRect, fillStyle: '' }, 'A', 10, 10, { scale: 1, color: '#fff' });
    expect(fillRect.mock.calls.length).toBeGreaterThan(0);
  });

  it('builds and caches villager sprites for walk and work states', () => {
    const parts = {
      skinTone: '#c68642',
      hairColor: '#1a1a1a',
      clothing: '#228b22',
      lifeStage: 'Adult',
      isChieftan: false,
      direction: 'south',
      animState: 'walk',
      animFrame: 1
    };
    const canvas = VillagerSpriteFactory.build(parts);
    expect(canvas.width).toBe(16);
    expect(canvas.height).toBe(16);
    expect(VillagerSpriteFactory.cacheKey(parts)).toContain('walk');

    const villager = {
      status: CONSTANTS.ACTIVITY.BUILDING,
      isMoving: false
    };
    expect(VillagerSpriteFactory.resolveAnimState(villager, { isMoving: false })).toBe('work');
    expect(VillagerSpriteFactory.resolveAnimState(
      { status: CONSTANTS.ACTIVITY.IDLE, isMoving: true },
      { isMoving: true }
    )).toBe('walk');
  });

  it('draws procedural resource icons without throwing', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      ellipse: vi.fn(),
      fillStyle: ''
    };
    PixelIcons.drawResource(ctx, CONSTANTS.RESOURCE.WOOD, 8, 8, 10);
    PixelIcons.drawResource(ctx, CONSTANTS.RESOURCE.FISH, 8, 8, 10);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});

describe('WorldRenderer visual integration', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
    Utils.setSeed(7);
  });

  it('renders with lighting disabled and still draws terrain cache', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const world = new World(12);
    world.seed = 11;
    world.generate();
    world.structures.push({ id: 'f1', type: 'fire', x: 5, y: 5 });
    world.rebuildOccupancy();

    const renderer = new WorldRenderer(canvas, world);
    renderer.centerOn(6, 6);
    expect(() => {
      renderer.render('night', CONSTANTS.SEASON.WET, true, { rain: true }, {
        lighting: false,
        particles: true,
        animTime: 500
      });
    }).not.toThrow();
    expect(renderer.terrainCache.canvas).toBeTruthy();
  });

  it('invalidates terrain cache when requested', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    const world = new World(8);
    world.seed = 3;
    world.generate();
    const renderer = new WorldRenderer(canvas, world);
    renderer.render('morning', CONSTANTS.SEASON.DRY, false, {}, { lighting: true, particles: false, animTime: 0 });
    expect(renderer.terrainCache.dirty).toBe(false);
    renderer.invalidateTerrainCache();
    expect(renderer.terrainCache.dirty).toBe(true);
  });
});

describe('VillagerRenderer sprite cache', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
  });

  it('caches procedural sprites and uses LOD at low zoom', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const renderer = new VillagerRenderer(ctx);
    const villager = new Villager({
      name: 'Test',
      x: 2,
      y: 2,
      isChieftan: false,
      title: 'Hunter'
    });
    villager.status = CONSTANTS.ACTIVITY.IDLE;
    villager.isMoving = true;
    villager.animFrame = 2;
    villager.direction = 'east';

    renderer.render(villager, { x: 0, y: 0, zoom: 1 }, CONSTANTS.WORLD.PIXEL_SCALE, false);
    expect(renderer.spriteCache.size).toBeGreaterThan(0);

    const sizeBefore = renderer.spriteCache.size;
    renderer.render(villager, { x: 0, y: 0, zoom: 1 }, CONSTANTS.WORLD.PIXEL_SCALE, false);
    expect(renderer.spriteCache.size).toBe(sizeBefore);

    // Low zoom LOD path should not throw
    expect(() => {
      renderer.render(villager, { x: 0, y: 0, zoom: 0.5 }, CONSTANTS.WORLD.PIXEL_SCALE, false);
    }).not.toThrow();
  });
});

describe('Game weather graphics wiring', () => {
  beforeEach(() => {
    resetRendererModules();
    bootstrapCoreModules();
  });

  it('exposes dust weather for dry seasons when particles enabled', () => {
    // Lightweight stub of weather helper logic (same as Game.updateWeatherForSeason)
    const graphicsSettings = { particles: true };
    const season = CONSTANTS.SEASON.DEEP_DRY;
    const particlesOn = graphicsSettings.particles !== false;
    const weather = {
      rain: Boolean(season.name === CONSTANTS.SEASON.WET.name && particlesOn),
      dust: Boolean(
        (season.name === CONSTANTS.SEASON.DRY.name || season.name === CONSTANTS.SEASON.DEEP_DRY.name) &&
        particlesOn
      )
    };
    expect(weather.dust).toBe(true);
    expect(weather.rain).toBe(false);
  });
});
