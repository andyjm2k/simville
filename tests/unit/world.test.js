import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules } from '../setup/load-scripts.js';

describe('World', () => {
  beforeEach(() => {
    bootstrapCoreModules();
    Utils.setSeed(2024);
  });

  it('generates terrain tiles for the configured map size', () => {
    const world = new World(32);
    world.seed = 1001;
    world.generate();

    expect(world.tiles).toHaveLength(32);
    expect(world.tiles[0]).toHaveLength(32);
    expect(world.tiles[0][0]).toHaveProperty('biome');
    expect(world.tiles[0][0]).toHaveProperty('walkable');
  });

  it('places two village centers during generation', () => {
    const world = new World(64);
    world.seed = 555;
    world.generate();
    expect(world.villageCenters).toHaveLength(2);
    expect(world.villageCenter).toEqual(world.villageCenters[0]);
  });

  it('finds a walkable path between nearby tiles', () => {
    const world = new World(16);
    world.seed = 42;
    world.generate();

    let start = null;
    let end = null;

    for (let y = 1; y < world.size - 1 && !start; y++) {
      for (let x = 1; x < world.size - 1; x++) {
        if (world.isWalkable(x, y)) {
          start = { x, y };
          break;
        }
      }
    }

    for (let y = world.size - 2; y > 0 && !end; y--) {
      for (let x = world.size - 2; x > 0; x--) {
        if (world.isWalkable(x, y) && (x !== start.x || y !== start.y)) {
          end = { x, y };
          break;
        }
      }
    }

    const path = world.getPath(start.x, start.y, end.x, end.y);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual(end);
  });

  it('round-trips serialize and deserialize', () => {
    const world = new World(24);
    world.seed = 8080;
    world.generate();

    const restored = World.deserialize(world.serialize());
    expect(restored.size).toBe(world.size);
    expect(restored.seed).toBe(world.seed);
    expect(restored.villageCenters).toEqual(world.villageCenters);
    expect(restored.resources.length).toBe(world.resources.length);
  });
});
