# Agent Guide

## Project

Galactic Empires is a React + TypeScript + Vite strategy prototype. Game rules live in `src/game.ts`; UI orchestration lives in `src/App.tsx`; presentation lives in `src/styles.css`.

## Commands

- `npm run dev` — start the local game
- `npm test` — run the deterministic rules test suite
- `npm run build` — type-check and create the production bundle

## Working rules

- Keep simulation functions deterministic and immutable so they are easy to test.
- Add or update tests for resource, production, travel, combat, or research rule changes.
- Keep player-facing copy concise and in-world.
- Preserve the separation between the space map and planetary battlefield.
- Do not bypass `canAfford`, research gates, per-planet building maxima, automatic transport deployment, or recovery rules in UI code.
- Treat `spec.md` as the source of truth; update it when behavior changes.
- Commit and push every new change to the GitHub repository at `https://github.com/bishoppawn1/galactic_empires.git`.
