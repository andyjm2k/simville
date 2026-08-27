/**
 * Global Vitest setup: browser API shims for headless renderer testing.
 */
import { vi } from 'vitest';

const noop = () => {};

const canvasContextMock = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '10px sans-serif',
  textAlign: 'left',
  globalAlpha: 1,
  fillRect: noop,
  strokeRect: noop,
  clearRect: noop,
  beginPath: noop,
  closePath: noop,
  moveTo: noop,
  lineTo: noop,
  arc: noop,
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
  measureText: () => ({ width: 0 })
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextMock);

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
}

if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

if (!globalThis.performance) {
  globalThis.performance = { now: () => Date.now() };
}
