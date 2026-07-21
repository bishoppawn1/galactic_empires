# Agent Guide

## Project

Galactic Empires is a React + TypeScript + Vite strategy prototype. Stable public imports remain available through `src/game.ts` and `src/App.tsx`, while implementation code is organized into focused folders.

## Code map

- `src/game/types.ts` — simulation types and state contracts
- `src/game/definitions.ts` — buildings, units, research, and shared constants
- `src/game/units/` — faction-specific unit rosters and combat definitions
- `src/game/navigation.ts` — route calculation and formatting helpers
- `src/game/ai/` — focused deterministic planning for AI fleet operations
- `src/game/ground/` — ground-battle positioning and collision rules
- `src/game/engine.ts` — deterministic state creation, commands, combat, AI, and ticking
- `src/app/` — top-level UI orchestration, view types, and save migration
- `src/components/` — feature UI grouped by campaign, planet, research, battle, layout, and shared helpers
- `src/components/galaxy/` — galaxy-map UI, viewport geometry/culling, and batched large-fleet canvas rendering
- `src/assets/aegis/` — Aegis ground and ship artwork, separated by unit domain
- `src/styles/` — application presentation
- `src/test/` — shared test setup

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
