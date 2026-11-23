# simville

A simulated island world where LLMs drive village actions and the island grows and evolves as the village prospers — an experiment in local LLMs driving complex ecosystem simulations in a gaming environment.

## Docs

| Doc | Purpose |
|-----|---------|
| [`SPEC.md`](./SPEC.md) | Product / systems specification |
| [`SOCIAL_DYNAMICS_PLAN.md`](./SOCIAL_DYNAMICS_PLAN.md) | Phased plan & spec for villager inter/intra social dynamics |
| [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) | Historical refactor phases |

## Visual simulation

The world view is **HTML5 Canvas 2D** (Electron). Recent polish focuses on engagement without WebGL:

| System | Module | Notes |
|--------|--------|------|
| Season ground remaps + terrain atlas | `visual-fx.js` (`TerrainCache`, `SeasonPalette`) | Rebuilt on world/season change; blit each frame |
| Day/night + fire cutouts | `visual-fx.js` (`LightingLayer`) | Honors Settings → Lighting; night punches light holes |
| Rain / dust particles | `visual-fx.js` (`ParticleSystem`) | Capped pools; Settings → Particles |
| Water shimmer, fire smoke, well ripples | `visual-fx.js` (`AmbientFX`) | Visible tiles / structures only |
| Procedural villager sprites | `pixel-art.js` (`VillagerSpriteFactory`) | Cached idle/walk/work/sleep frames + LOD |
| Pixel font + resource icons | `pixel-art.js` (`PixelFont`, `PixelIcons`) | Labels/icons without emoji clutter |

Graphics toggles live under **Settings** (`lighting`, `particles`, labels, speech bubbles) and apply immediately to the running game.

## Development

```bash
npm install
npm start          # Electron app
npm run test:unit  # Vitest unit tests only (tests/unit)
npm run test:qa    # Vitest QA tests only (tests/qa)
npm test           # Vitest unit + QA, then the standalone systems suites
npm run benchmark -- --days 10 --seed 42 --agent-b-type baseline  # headless benchmark run
```
