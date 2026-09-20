// Simville pixel-art helpers: bitmap font and resource/structure icons.
// Canvas 2D only — no external font files required.

/** Tiny 3x5 glyph atlas for HUD labels and world name tags. */
class PixelFont {
  // Each glyph is 3 columns of bit flags for 5 rows (bits 0..4 top→bottom)
  static GLYPHS = {
    '0': [7, 5, 5, 5, 7],
    '1': [2, 6, 2, 2, 7],
    '2': [7, 1, 7, 4, 7],
    '3': [7, 1, 7, 1, 7],
    '4': [5, 5, 7, 1, 1],
    '5': [7, 4, 7, 1, 7],
    '6': [7, 4, 7, 5, 7],
    '7': [7, 1, 2, 2, 2],
    '8': [7, 5, 7, 5, 7],
    '9': [7, 5, 7, 1, 7],
    A: [2, 5, 7, 5, 5],
    B: [6, 5, 6, 5, 6],
    C: [7, 4, 4, 4, 7],
    D: [6, 5, 5, 5, 6],
    E: [7, 4, 6, 4, 7],
    F: [7, 4, 6, 4, 4],
    G: [7, 4, 5, 5, 7],
    H: [5, 5, 7, 5, 5],
    I: [7, 2, 2, 2, 7],
    J: [1, 1, 1, 5, 7],
    K: [5, 5, 6, 5, 5],
    L: [4, 4, 4, 4, 7],
    M: [5, 7, 5, 5, 5],
    N: [5, 7, 7, 5, 5],
    O: [7, 5, 5, 5, 7],
    P: [7, 5, 7, 4, 4],
    Q: [7, 5, 5, 7, 1],
    R: [7, 5, 6, 5, 5],
    S: [7, 4, 7, 1, 7],
    T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7],
    V: [5, 5, 5, 5, 2],
    W: [5, 5, 5, 7, 5],
    X: [5, 5, 2, 5, 5],
    Y: [5, 5, 2, 2, 2],
    Z: [7, 1, 2, 4, 7],
    ' ': [0, 0, 0, 0, 0],
    '-': [0, 0, 7, 0, 0],
    '.': [0, 0, 0, 0, 2],
    "'": [2, 2, 0, 0, 0],
    '!': [2, 2, 2, 0, 2]
  };

  /** Measure pixel width of a string at a given scale. */
  static measure(text, scale = 1) {
    const chars = String(text || '').toUpperCase();
    return chars.length * (3 * scale + scale);
  }

  /** Draw uppercase bitmap text centered or left-aligned. */
  static draw(ctx, text, x, y, options = {}) {
    const scale = Math.max(1, Math.floor(options.scale || 1));
    const color = options.color || '#ffffff';
    const align = options.align || 'left';
    const chars = String(text || '').toUpperCase();
    const width = PixelFont.measure(chars, scale);
    let cursorX = align === 'center' ? x - width / 2 : x;
    const cursorY = y;

    ctx.fillStyle = color;
    for (const ch of chars) {
      const rows = PixelFont.GLYPHS[ch] || PixelFont.GLYPHS['.'];
      for (let row = 0; row < 5; row++) {
        const bits = rows[row];
        for (let col = 0; col < 3; col++) {
          if (bits & (4 >> col)) {
            ctx.fillRect(cursorX + col * scale, cursorY + row * scale, scale, scale);
          }
        }
      }
      cursorX += 3 * scale + scale;
    }
  }
}

/** Procedural 8x8-style resource icons drawn with rects (no emoji). */
class PixelIcons {
  static drawResource(ctx, type, cx, cy, size) {
    const s = Math.max(4, size);
    const x = cx - s / 2;
    const y = cy - s / 2;
    ctx.save();

    switch (type) {
      case CONSTANTS.RESOURCE.WOOD:
        ctx.fillStyle = '#6b3f1d';
        ctx.fillRect(x + s * 0.35, y + s * 0.15, s * 0.3, s * 0.7);
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(x + s * 0.15, y, s * 0.7, s * 0.4);
        break;
      case CONSTANTS.RESOURCE.FOOD:
        ctx.fillStyle = '#e53935';
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.05, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#43a047';
        ctx.fillRect(cx - s * 0.05, y, s * 0.12, s * 0.25);
        break;
      case CONSTANTS.RESOURCE.WATER:
        ctx.fillStyle = '#42a5f5';
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 0.15);
        ctx.lineTo(x + s * 0.85, y + s * 0.7);
        ctx.lineTo(x + s * 0.15, y + s * 0.7);
        ctx.closePath();
        ctx.fill();
        break;
      case CONSTANTS.RESOURCE.STONE:
        ctx.fillStyle = '#9e9e9e';
        ctx.fillRect(x + s * 0.15, y + s * 0.3, s * 0.7, s * 0.45);
        ctx.fillStyle = '#757575';
        ctx.fillRect(x + s * 0.25, y + s * 0.2, s * 0.35, s * 0.2);
        break;
      case CONSTANTS.RESOURCE.HERBS:
        ctx.fillStyle = '#66bb6a';
        ctx.fillRect(cx - s * 0.08, y + s * 0.2, s * 0.16, s * 0.55);
        ctx.fillRect(x + s * 0.15, y + s * 0.35, s * 0.3, s * 0.12);
        ctx.fillRect(cx + s * 0.05, y + s * 0.45, s * 0.3, s * 0.12);
        break;
      case CONSTANTS.RESOURCE.CLAY:
        ctx.fillStyle = '#a1887f';
        ctx.fillRect(x + s * 0.2, y + s * 0.25, s * 0.6, s * 0.5);
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(x + s * 0.3, y + s * 0.15, s * 0.4, s * 0.15);
        break;
      case CONSTANTS.RESOURCE.FISH:
        ctx.fillStyle = '#29b6f6';
        ctx.beginPath();
        ctx.ellipse(cx - s * 0.05, cy, s * 0.32, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.2, cy);
        ctx.lineTo(cx + s * 0.45, cy - s * 0.2);
        ctx.lineTo(cx + s * 0.45, cy + s * 0.2);
        ctx.closePath();
        ctx.fill();
        break;
      case CONSTANTS.RESOURCE.THATCH:
        ctx.fillStyle = '#c0a060';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(x + s * 0.15 + i * s * 0.18, y + s * 0.2, s * 0.1, s * 0.55);
        }
        break;
      case CONSTANTS.RESOURCE.RARE_MATERIALS:
        ctx.fillStyle = '#ab47bc';
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 0.1);
        ctx.lineTo(x + s * 0.8, cy);
        ctx.lineTo(cx, y + s * 0.9);
        ctx.lineTo(x + s * 0.2, cy);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.fillStyle = '#fff59d';
        ctx.fillRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5);
    }

    ctx.restore();
  }
}

/**
 * Build a cached procedural villager sprite (pixel person) for one pose.
 * Returns an offscreen canvas sized to baseSize x baseSize.
 */
class VillagerSpriteFactory {
  static BASE = 16;

  /** Cache key covering appearance + pose so frames reuse cleanly. */
  static cacheKey(parts) {
    return [
      parts.skinTone,
      parts.hairColor,
      parts.clothing,
      parts.lifeStage,
      parts.isChieftan ? 1 : 0,
      parts.direction,
      parts.animState,
      parts.animFrame
    ].join('|');
  }

  /** Map villager status/movement to animation state name. */
  static resolveAnimState(villager, sprite) {
    const status = villager.status;
    if (status === CONSTANTS.ACTIVITY.SLEEPING || status === CONSTANTS.ACTIVITY.RESTING) {
      return 'sleep';
    }
    const working = [
      CONSTANTS.ACTIVITY.WORKING,
      CONSTANTS.ACTIVITY.BUILDING,
      CONSTANTS.ACTIVITY.GATHERING,
      CONSTANTS.ACTIVITY.HUNTING,
      CONSTANTS.ACTIVITY.FISHING,
      CONSTANTS.ACTIVITY.FARMING
    ];
    if (working.includes(status)) return 'work';
    if (sprite.isMoving) return 'walk';
    return 'idle';
  }

  /** Draw one frame into a new canvas and return it. */
  static build(parts) {
    const size = VillagerSpriteFactory.BASE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const frame = parts.animFrame % 4;
    const bob = parts.animState === 'walk' ? (frame % 2) : (parts.animState === 'idle' ? (frame % 2) * 0 : 0);
    const leg = parts.animState === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
    const arm = parts.animState === 'work' ? (frame % 2 === 0 ? -1 : 1) : 0;

    // Facing nudge for east/west
    const face = parts.direction === 'west' ? -1 : parts.direction === 'east' ? 1 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(4, 13, 8, 2);

    const y0 = 1 + bob;
    // Legs
    ctx.fillStyle = parts.skinTone;
    if (parts.animState === 'sleep') {
      ctx.fillRect(3, 10, 10, 3);
    } else {
      ctx.fillRect(5 + leg + face, 10 + y0, 2, 4);
      ctx.fillRect(9 - leg + face, 10 + y0, 2, 4);
    }

    // Body
    ctx.fillStyle = parts.clothing;
    ctx.fillRect(4 + face, 6 + y0, 8, 5);

    // Head
    ctx.fillStyle = parts.skinTone;
    ctx.fillRect(5 + face, 2 + y0, 6, 5);

    // Hair
    ctx.fillStyle = parts.hairColor;
    ctx.fillRect(5 + face, 1 + y0, 6, 2);
    if (parts.direction === 'south' || parts.direction === 'east') {
      ctx.fillRect(10 + face, 3 + y0, 2, 2);
    }

    // Work arm / tool
    if (parts.animState === 'work') {
      ctx.fillStyle = parts.skinTone;
      ctx.fillRect(11 + face, 6 + y0 + arm, 2, 3);
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(12 + face, 4 + y0 + arm, 2, 4);
    }

    // Chieftan headdress
    if (parts.isChieftan) {
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(4 + face, y0, 8, 2);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(3 + face, y0 - 2, 2, 3);
      ctx.fillStyle = '#4ecdc4';
      ctx.fillRect(7 + face, y0 - 2, 2, 3);
      ctx.fillStyle = '#ffe66d';
      ctx.fillRect(11 + face, y0 - 2, 2, 3);
    }

    // Child shrink is handled by draw scale; elder gets a cane hint
    if (parts.lifeStage === 'Elder' && parts.animState !== 'sleep') {
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(12 + face, 7 + y0, 1, 6);
    }

    return canvas;
  }
}
