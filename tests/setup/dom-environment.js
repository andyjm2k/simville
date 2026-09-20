/**
 * Global Vitest setup: browser API shims for headless renderer testing.
 */
import { vi } from 'vitest';

const noop = () => {};

function createGradientMock() {
  return {
    addColorStop: noop
  };
}

const canvasContextMock = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '10px sans-serif',
  textAlign: 'left',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  imageSmoothingEnabled: true,
  fillRect: noop,
  strokeRect: noop,
  clearRect: noop,
  beginPath: noop,
  closePath: noop,
  moveTo: noop,
  lineTo: noop,
  arc: noop,
  ellipse: noop,
  rect: noop,
  roundRect: noop,
  fill: noop,
  stroke: noop,
  fillText: noop,
  strokeText: noop,
  drawImage: noop,
  save: noop,
  restore: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
  setTransform: noop,
  setLineDash: noop,
  clip: noop,
  measureText: () => ({ width: 10 }),
  createRadialGradient: () => createGradientMock(),
  createLinearGradient: () => createGradientMock(),
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  putImageData: noop
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => {
  // Return a fresh mutable mock so tests can spy on draw calls
  return { ...canvasContextMock, canvas: { width: 1280, height: 720 } };
});

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
}

if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

if (!globalThis.performance) {
  globalThis.performance = { now: () => Date.now() };
}
