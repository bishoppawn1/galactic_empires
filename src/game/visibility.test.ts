import { describe, expect, it } from 'vitest';
import {
  UNITS, createInitialState, refreshPlanetIntel, visibleStateForPlayer,
  type Fleet, type GameState, type Unit, type UnitKind,
} from '../game';

const unit = (id: string, kind: UnitKind, faction: Unit['faction']): Unit => ({
  id,
  kind,
  faction,
  hp: UNITS[kind].hp,
  maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields,
  maxShields: UNITS[kind].shields,
});

const fleet = (id: string, destinationId: string, finalDestinationId = destinationId): Fleet => ({
  id,
  faction: 'enemy',
  originId: 'cygnus',
  destinationId,
  finalDestinationId,
  unit: unit(`${id}-ship`, 'escortFrigate', 'enemy'),
  progress: 1,
  travelTime: 10,
  phase: 'tunnel',
});

const planet = (state: GameState, id: string) => state.planets.find(candidate => candidate.id === id)!;

describe('fog of war', () => {
  it('presents an unscouted rival homeworld as a neutral system with no leaked forces or structures', () => {
    const canonical = createInitialState();
    const cygnus = planet(canonical, 'cygnus');
    cygnus.groundUnits = [unit('hidden-ground', 'infantry', 'enemy')];
    cygnus.orbitUnits = [unit('hidden-ship', 'missileFrigate', 'enemy')];

    const visible = planet(visibleStateForPlayer(canonical), 'cygnus');

    expect(visible).toMatchObject({ owner: null, intelStatus: 'unscouted' });
    expect(visible.buildings).toEqual([]);
    expect(visible.groundUnits).toEqual([]);
    expect(visible.orbitUnits).toEqual([]);
  });

  it('reveals a system while a friendly ship is present and retains only last-known planetary intelligence after it leaves', () => {
    let canonical = createInitialState();
    let cygnus = planet(canonical, 'cygnus');
    cygnus.groundUnits = [unit('known-ground', 'infantry', 'enemy')];
    cygnus.orbitUnits = [
      unit('scout', 'escortFrigate', 'player'),
      unit('known-ship', 'missileFrigate', 'enemy'),
    ];
    canonical = refreshPlanetIntel(canonical);

    const observed = planet(visibleStateForPlayer(canonical), 'cygnus');
    expect(observed.owner).toBe('enemy');
    expect(observed.intelStatus).toBe('current');
    expect(observed.groundUnits.map(candidate => candidate.id)).toEqual(['known-ground']);
    expect(observed.orbitUnits.map(candidate => candidate.id)).toEqual(['scout', 'known-ship']);

    cygnus = planet(canonical, 'cygnus');
    cygnus.orbitUnits = [unit('replacement-ship', 'destroyer', 'enemy')];
    cygnus.groundUnits.push(unit('unseen-reinforcement', 'lightTank', 'enemy'));
    canonical = refreshPlanetIntel(canonical);

    const stale = planet(visibleStateForPlayer(canonical), 'cygnus');
    expect(stale.owner).toBe('enemy');
    expect(stale.intelStatus).toBe('stale');
    expect(stale.groundUnits.map(candidate => candidate.id)).toEqual(['known-ground']);
    expect(stale.orbitUnits).toEqual([]);
  });

  it('keeps an unobserved conquest neutral until a friendly ship reaches the system', () => {
    let canonical = createInitialState();
    let nyx = planet(canonical, 'nyx');
    nyx.owner = 'enemy';
    nyx.groundUnits = [unit('occupier', 'infantry', 'enemy')];
    canonical = refreshPlanetIntel(canonical);

    let visible = planet(visibleStateForPlayer(canonical), 'nyx');
    expect(visible.owner).toBeNull();
    expect(visible.groundUnits).toEqual([]);

    nyx = planet(canonical, 'nyx');
    nyx.orbitUnits.push(unit('player-scout', 'escortFrigate', 'player'));
    canonical = refreshPlanetIntel(canonical);
    visible = planet(visibleStateForPlayer(canonical), 'nyx');

    expect(visible.owner).toBe('enemy');
    expect(visible.groundUnits.map(candidate => candidate.id)).toEqual(['occupier']);
  });

  it('shows hostile fleets only when they are inbound to a currently visible system', () => {
    const canonical = createInitialState();
    canonical.fleets = [
      fleet('attack-home', 'terra'),
      fleet('hidden-move', 'nyx'),
      fleet('routed-attack', 'nyx', 'terra'),
    ];

    const visible = visibleStateForPlayer(canonical);

    expect(visible.fleets.map(candidate => candidate.id)).toEqual(['attack-home', 'routed-attack']);
  });

  it('does not leak hidden planet events through the command log', () => {
    const canonical = createInitialState();
    canonical.messages = [
      'HOSTILE EXPANSION FLEET — Nyx targeted for colonization.',
      'HOSTILE STRIKE FLEET — warships advancing on Terra Nova.',
    ];

    expect(visibleStateForPlayer(canonical).messages).toEqual([
      'HOSTILE STRIKE FLEET — warships advancing on Terra Nova.',
    ]);
  });
});
