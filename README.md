# Galactic Empires

play the game here https://bishoppawn1.github.io/galactic_empires/

A React, TypeScript, and Vite strategy prototype with deterministic game rules and automated UI/rules tests.

Play the current build at [bishoppawn1.github.io/galactic_empires](https://bishoppawn1.github.io/galactic_empires/).

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

## Deployment

Pushes to `main` run the test and production build, then publish `dist/` to GitHub Pages. The deployment can also be started manually from the repository's Actions tab.
