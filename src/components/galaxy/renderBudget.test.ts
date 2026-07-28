import { describe, expect, it } from 'vitest';
import { createInitialState, UNITS, type Unit } from '../../game';
import {
  LARGE_FLEET_RENDER_THRESHOLD, canvasPixelScale, evenlySampleVisuals, usesLargeFleetRenderBudget,
} from './renderBudget';

const ship = (id: string): Unit => ({
  id,
  kind: 'escortFrigate',
  faction: 'player',
  hp: UNITS.escortFrigate.hp,
  maxHp: UNITS.escortFrigate.hp,
  shields: UNITS.escortFrigate.shields,
  maxShields: UNITS.escortFrigate.shields,
});

describe('large-fleet render budget', () => {
  it('activates from visible ships without changing the game state', () => {
    const state = createInitialState();
    state.planets[0].orbitUnits = Array.from({ length: LARGE_FLEET_RENDER_THRESHOLD }, (_, index) => ship(`render-${index}`));
    const snapshot = structuredClone(state);

    expect(usesLargeFleetRenderBudget(state)).toBe(true);
    expect(state).toEqual(snapshot);
  });

  it('matches the canvas backing resolution to screen scale at distant zoom', () => {
    expect(canvasPixelScale(.02, 2)).toBe(.02);
    expect(canvasPixelScale(.05, 2)).toBe(.05);
    expect(canvasPixelScale(1, 2)).toBe(1);
    expect(canvasPixelScale(1.5, 2)).toBe(1.25);
  });

  it('samples large visual collections evenly and deterministically', () => {
    const values = Array.from({ length: 100 }, (_, index) => index);
    expect(evenlySampleVisuals(values, 4)).toEqual([0, 25, 50, 75]);
    expect(evenlySampleVisuals(values, 100)).toBe(values);
  });
});
