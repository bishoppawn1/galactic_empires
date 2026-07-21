import { migrateGameState, type GameState } from '../game';

export const SAVE_KEY = 'galactic-empires-save-v5';
export const LEGACY_SAVE_KEY = 'galactic-empires-save-v4';

export function loadGame(): GameState | undefined {
  try {
    const saved = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    return saved ? migrateGameState(JSON.parse(saved)) : undefined;
  } catch {
    return undefined;
  }
}
