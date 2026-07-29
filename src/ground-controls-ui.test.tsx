import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroundBattleView } from './components/battle/GroundBattleView';
import { createInitialState, UNITS, type GroundBattle, type Unit } from './game';

const combatant = (id: string, faction: 'player' | 'enemy', battleX: number): Unit => ({
  id,
  kind: 'infantry',
  faction,
  hp: UNITS.infantry.hp,
  maxHp: UNITS.infantry.hp,
  shields: UNITS.infantry.shields,
  maxShields: UNITS.infantry.shields,
  battleX,
  battleY: 50,
});

describe('ground battle command gestures', () => {
  it('maps H to hold and a repeated right-click at one destination to forced movement', () => {
    const state = createInitialState();
    const battle: GroundBattle = {
      planetId: state.planets[0].id,
      attackers: [combatant('selected-squad', 'player', 20)],
      defenders: [combatant('hostile-squad', 'enemy', 80)],
    };
    state.battles = [battle];
    const onManeuver = vi.fn();
    const onHold = vi.fn();
    const view = render(<GroundBattleView
      state={state}
      battle={battle}
      onFocus={vi.fn()}
      onManeuver={onManeuver}
      onHold={onHold}
      onExit={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Infantry selected-squad' }));
    fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
    expect(onHold).toHaveBeenCalledWith(battle.planetId, ['selected-squad']);

    const canvas = view.container.querySelector('.battle-canvas') as HTMLDivElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}),
    });
    fireEvent.contextMenu(canvas, { clientX: 600, clientY: 240 });
    fireEvent.contextMenu(canvas, { clientX: 600, clientY: 240 });

    expect(onManeuver).toHaveBeenNthCalledWith(1, battle.planetId, ['selected-squad'], 60, 40, false);
    expect(onManeuver).toHaveBeenNthCalledWith(2, battle.planetId, ['selected-squad'], 60, 40, true);
  });
});
