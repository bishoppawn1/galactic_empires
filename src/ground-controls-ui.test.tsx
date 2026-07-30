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
      movementSmoothingMs={320}
      onFocus={vi.fn()}
      onManeuver={onManeuver}
      onHold={onHold}
      onLoad={vi.fn()}
      onEvacuate={vi.fn()}
      onExit={vi.fn()}
    />);
    const battlefield = view.container.querySelector('.battlefield') as HTMLDivElement;
    expect(battlefield).toHaveClass('network-smoothed');
    expect(battlefield).toHaveAttribute('data-movement-smoothing-ms', '320');
    expect(battlefield.style.getPropertyValue('--movement-smoothing')).toBe('320ms');

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

  it('loads selected squads by right-clicking a transport and evacuates it with E', () => {
    const state = createInitialState();
    const squad = combatant('boarding-squad', 'player', 22);
    const transport: Unit = {
      id: 'ground-transport',
      kind: 'transport',
      faction: 'player',
      hp: UNITS.transport.hp,
      maxHp: UNITS.transport.hp,
      shields: UNITS.transport.shields,
      maxShields: UNITS.transport.shields,
      battleX: 18,
      battleY: 55,
      landedTransport: true,
      cargo: [combatant('loaded-squad', 'player', 20)],
      loadedUnitIds: ['loaded-squad'],
    };
    const battle: GroundBattle = {
      planetId: state.planets[0].id,
      attackers: [squad, transport],
      defenders: [combatant('hostile-squad', 'enemy', 80)],
    };
    state.battles = [battle];
    const onLoad = vi.fn();
    const onEvacuate = vi.fn();
    render(<GroundBattleView
      state={state}
      battle={battle}
      onFocus={vi.fn()}
      onManeuver={vi.fn()}
      onHold={vi.fn()}
      onLoad={onLoad}
      onEvacuate={onEvacuate}
      onExit={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Infantry boarding-squad' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Select Transport ground-transport' }));
    expect(onLoad).toHaveBeenCalledWith(battle.planetId, transport.id, [squad.id]);

    fireEvent.click(screen.getByRole('button', { name: 'Select Transport ground-transport' }));
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' });
    expect(onEvacuate).toHaveBeenCalledWith(battle.planetId, [transport.id]);
  });
});
