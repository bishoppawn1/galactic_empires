# Galactic Empires

A React, TypeScript, and Vite strategy prototype with deterministic game rules and automated UI/rules tests.

## Project map

- `src/app/` — application state, persistence, and top-level orchestration
- `src/components/` — UI grouped by campaign, galaxy, planet, research, battle, layout, and shared presentation concerns
- `src/game/` — simulation types, definitions, navigation, and the deterministic engine
- `src/styles/` — application styles
- `src/test/` — shared test setup
- `src/App.tsx` and `src/game.ts` — compatibility entry points for stable imports

## Commands

- `npm run dev` — start the local game
- `npm test` — run all tests
- `npm run build` — type-check and build the production bundle
- `npm run check` — run tests and build together
