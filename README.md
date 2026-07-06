# Decanta: Water Sort

A polished water-sort puzzle game for the browser. Pour colored liquids between
glass tubes until every tube holds a single color. Built as an installable PWA,
mobile-first, and fully playable on desktop.

**▶ Play online: https://alliterhorst.github.io/decanta-water-sort/**

## Features

- **Journey mode** with three difficulty presets (Zen, Balanced, Extreme) and a
  smooth progression curve.
- **Daily challenge** — a fresh deterministic puzzle every day.
- **Boss encounters** that shuffle the board on a timer.
- **Cosmetic shop** — unlock backgrounds and tube styles with coins earned by
  playing. No pay-to-win, no dark patterns.
- **Internationalization** — English, Spanish, and Brazilian Portuguese, auto
  detected from the browser (falls back to Brazilian Portuguese).
- **Real audio** — public-domain music tracks (loudness-normalized) and recorded
  water sound effects.
- **Installable PWA** — offline-capable app shell, fullscreen support, and an
  auto-update flow.

## Tech stack

- **[PixiJS v8](https://pixijs.com/)** — WebGL rendering of the tubes, liquid, and
  pour animations.
- **[React 19](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/)** —
  the DOM overlay UI (menu, HUD, modals).
- **[GSAP](https://gsap.com/)** — animation timelines for the pour cinematics.
- **[Vite](https://vitejs.dev/) + [Vitest](https://vitest.dev/)** — build tooling
  and unit tests.
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — service worker and
  manifest generation.

The game logic lives in `src/core/` as a pure, render-agnostic engine (state,
solver, level generator) with its own unit tests. Rendering lives in
`src/render/`, the UI in `src/ui/`, and internationalization in `src/i18n/`.

## Getting started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Run the unit tests
npm test

# Type-check and build for production
npm run build

# Preview the production build
npm run preview
```

## Project structure

```
src/
  core/     Pure game engine: state, solver, level generator, types (+ tests)
  render/   PixiJS scene: tubes, liquid, pour animation, interaction
  ui/       React components: menu, HUD, shop, settings, modals
  game/     Game data: modes, bosses, economy, levels, persistence
  audio/    Audio engine: background music + water sound effects
  i18n/     Internationalization: dictionaries and language detection
  lib/      Small helpers: fullscreen, PWA registration
public/
  audio/    Music and sound-effect assets
  icons/    App icons
```

## License

Released under the [MIT License](LICENSE).
