import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { MultiplayerLobby } from './components/campaign/MultiplayerLobby';
import { createInitialState, LANDING_APPROACH_SPEED, ORBITAL_DEFENSE_STATS, UNITS, type GameState, type Unit, type UnitKind } from './game';

const makeUnit = (id: string, kind: UnitKind, faction: 'player' | 'enemy'): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp, shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
});

function stateWithPlayerForces() {
  const state = createInitialState(); const terra = state.planets[0];
  terra.groundUnits = [makeUnit('u1', 'infantry', 'player'), makeUnit('u3', 'infantry', 'player'), makeUnit('u4', 'antiVehicle', 'player')];
  terra.orbitUnits = [
    { ...makeUnit('u2', 'transport', 'player'), orbitX: 0, orbitY: -180 },
    { ...makeUnit('u5', 'escortFrigate', 'player'), orbitX: 127, orbitY: -127 },
    { ...makeUnit('u6', 'missileFrigate', 'player'), orbitX: 180, orbitY: 0 },
  ];
  return state;
}

const saveState = (state: GameState) => localStorage.setItem('galactic-empires-save-v5', JSON.stringify(state));

describe('Galactic Empires interface', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('galactic-empires-save-v5', JSON.stringify(createInitialState()));
    vi.stubGlobal('confirm', () => true);
  });

  it('opens with campaign size and enemy difficulty controls when no save exists', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByRole('main', { name: 'New campaign setup' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expansive/ }));
    fireEvent.click(screen.getByRole('button', { name: /Admiral/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start single player/i }));
    expect(screen.getAllByText('Terra Nova').length).toBeGreaterThan(0);
    const saved = JSON.parse(localStorage.getItem('galactic-empires-save-v5')!);
    expect(saved.config).toEqual({ mapSize: 'large', difficulty: 'admiral' });
    expect(saved.planets).toHaveLength(15);
  });

  it('puts join game below multiplayer start and accepts a six-character lobby code', () => {
    localStorage.clear();
    render(<App />);
    const multiplayer = screen.getByRole('button', { name: /Start multiplayer/i });
    const join = screen.getByRole('button', { name: /Join game/i });
    expect(multiplayer.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(join);
    const code = screen.getByRole('textbox', { name: 'Lobby code' });
    fireEvent.change(code, { target: { value: 'ab-c23z' } });
    expect(code).toHaveValue('ABC23Z');
    expect(screen.getByRole('button', { name: 'CONNECT' })).toBeEnabled();
  });

  it('describes multiplayer as a two-empire versus match', () => {
    render(<MultiplayerLobby lobby={{ code: 'ABC234', config: { mapSize: 'small', difficulty: 'commander' }, players: [{ id: 'host', label: 'HOST COMMANDER', host: true }] }} isHost onStart={() => {}} onLeave={() => {}} />);
    expect(screen.getByText('OPPOSING COMMANDERS')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 ONLINE')).toBeInTheDocument();
    expect(screen.getByText('HUMAN RIVAL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /WAITING FOR RIVAL/i })).toBeDisabled();
    expect(screen.queryByText(/CO-OP/)).not.toBeInTheDocument();
  });

  it('shows the three resources and homeworld', () => {
    render(<App />);
    expect(screen.getByText('Metal')).toBeInTheDocument();
    expect(screen.getByText('Crystal')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getAllByText('Terra Nova').length).toBeGreaterThan(0);
  });

  it('uses explicit, redundant ownership markers for player and enemy planets', () => {
    render(<App />);
    const playerPlanet = screen.getByRole('button', { name: 'Terra Nova COLONY' });
    const enemyPlanet = screen.getByRole('button', { name: 'Cygnus Reach HOSTILE' });
    expect(playerPlanet).toHaveClass('player');
    expect(enemyPlanet).toHaveClass('enemy');
    expect(within(playerPlanet).getByText('YOU')).toBeInTheDocument();
    expect(within(enemyPlanet).getByText('ENEMY')).toBeInTheDocument();
    expect(playerPlanet.querySelector('.ownership-ring')).not.toBeNull();
    expect(enemyPlanet.querySelector('.ownership-ring')).not.toBeNull();

    const legend = screen.getByRole('region', { name: 'Planet ownership legend' });
    expect(within(legend).getByText('YOUR EMPIRE')).toBeInTheDocument();
    expect(within(legend).getByText('ENEMY EMPIRE')).toBeInTheDocument();
  });

  it('reports the small garrison defending an unclaimed planet', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Halcyon UNCHARTED' }));
    expect(screen.getByText('NEUTRAL GARRISON')).toBeInTheDocument();
    expect(screen.getByText(/independent defenders detected/)).toBeInTheDocument();
  });

  it('shows advanced units with their research and factory gates', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'forces' }));
    expect(screen.getByText('Plasma Tank', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Siege Walker', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Shock Troopers', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Railgun Tank', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Phase Destroyer', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Assault Carrier', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Battlecruiser', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getByText('Titan Dreadnought', { selector: '.unit-button b' })).toBeInTheDocument();
    expect(screen.getAllByText('RESEARCH REQUIRED').length).toBeGreaterThanOrEqual(8);
  });

  it('renders known hostile shipyards on the galaxy map', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'Enemy Space Yard 1 orbiting Cygnus Reach' })).toBeInTheDocument();
  });

  it('provides working map zoom controls', () => {
    render(<App />);
    expect(screen.getByText('100%', { selector: 'output' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('83%', { selector: 'output' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByText('100%', { selector: 'output' })).toBeInTheDocument();
  });

  it('recenters the galaxy camera when another planet is selected', () => {
    render(<App />);
    const viewport = document.querySelector('.galaxy-scroll') as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo });
    fireEvent.click(screen.getByRole('button', { name: 'Cygnus Reach HOSTILE' }));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
  });

  it('opens construction and displays building quantities and limits', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'construction' }));
    expect(screen.getByText('Build structures')).toBeInTheDocument();
    expect(screen.getByText('Metal Mine')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 5 BUILT/)).toBeInTheDocument();
  });

  it('renders every Space Yard in orbit and opens ship production from the yard', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Space Yard 1 orbiting Terra Nova — open ship production' }));
    expect(screen.getByRole('button', { name: 'forces' })).toHaveClass('active');
    expect(screen.getByText(/ORBITAL NETWORK ACTIVE/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'construction' }));
    const spaceYardCard = screen.getByText('Space Yard', { selector: '.card-copy b' }).closest('article');
    expect(spaceYardCard).not.toBeNull();
    fireEvent.click(within(spaceYardCard as HTMLElement).getByRole('button', { name: 'BUILD +1' }));
    expect(screen.getByRole('button', { name: 'Space Yard 2 orbiting Terra Nova — open ship production' })).toBeInTheDocument();
  });

  it('groups selected Space Yards and queues a ship separately at each one', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'construction' }));
    const spaceYardCard = screen.getByText('Space Yard', { selector: '.card-copy b' }).closest('article');
    expect(spaceYardCard).not.toBeNull();
    fireEvent.click(within(spaceYardCard as HTMLElement).getByRole('button', { name: 'BUILD +1' }));

    const firstYard = screen.getByRole('button', { name: 'Space Yard 1 orbiting Terra Nova — open ship production' });
    const secondYard = screen.getByRole('button', { name: 'Space Yard 2 orbiting Terra Nova — open ship production' });
    fireEvent.click(firstYard);
    fireEvent.click(secondYard, { shiftKey: true });
    expect(screen.getByText('2 SPACE YARDS GROUPED')).toBeInTheDocument();
    expect(firstYard).toHaveClass('selected');
    expect(secondYard).toHaveClass('selected');

    fireEvent.click(screen.getByText('Transport', { selector: '.unit-button b' }).closest('button')!);
    const yardQueues = document.querySelectorAll('.yard-queue-card');
    expect(yardQueues).toHaveLength(2);
    expect(within(yardQueues[0] as HTMLElement).getByText('1. Transport')).toBeInTheDocument();
    expect(within(yardQueues[1] as HTMLElement).getByText('1. Transport')).toBeInTheDocument();
  });

  it('auto-rotates single ship orders across every Space Yard', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'construction' }));
    const spaceYardCard = screen.getByText('Space Yard', { selector: '.card-copy b' }).closest('article')!;
    fireEvent.click(within(spaceYardCard).getByRole('button', { name: 'BUILD +1' }));
    fireEvent.click(screen.getByRole('button', { name: 'forces' }));
    expect(screen.getByText(/auto-distribution/)).toBeInTheDocument();

    const transportOrder = screen.getByText('Transport', { selector: '.unit-button b' }).closest('button')!;
    fireEvent.click(transportOrder);
    fireEvent.click(screen.getByText('Transport', { selector: '.unit-button b' }).closest('button')!);

    const yardQueues = document.querySelectorAll('.yard-queue-card');
    expect(yardQueues).toHaveLength(2);
    expect(within(yardQueues[0] as HTMLElement).getByText('1. Transport')).toBeInTheDocument();
    expect(within(yardQueues[1] as HTMLElement).getByText('1. Transport')).toBeInTheDocument();
    expect(screen.getByText('Transport auto-routed to Space Yard 2 at Terra Nova.')).toBeInTheDocument();
  });

  it('shows shorter ground-unit production time after another factory is built', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'forces' }));
    expect(screen.getByText('Infantry', { selector: '.unit-button b' }).closest('button')).toHaveTextContent('10s');

    fireEvent.click(screen.getByRole('button', { name: 'construction' }));
    const groundFactoryCard = screen.getByText('Ground Factory', { selector: '.card-copy b' }).closest('article');
    expect(groundFactoryCard).not.toBeNull();
    fireEvent.click(within(groundFactoryCard as HTMLElement).getByRole('button', { name: 'BUILD +1' }));
    fireEvent.click(screen.getByRole('button', { name: 'forces' }));

    expect(screen.getByText('Ground factories · 2 online · 2× speed')).toBeInTheDocument();
    expect(screen.getByText('Infantry', { selector: '.unit-button b' }).closest('button')).toHaveTextContent('5s');
  });

  it('supports additive fleet selection', () => {
    saveState(stateWithPlayerForces());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transport orbiting Terra Nova' }));
    fireEvent.click(screen.getByRole('button', { name: 'Escort Frigate orbiting Terra Nova' }), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Missile Frigate orbiting Terra Nova' }), { shiftKey: true });
    expect(screen.getByText('3 SHIPS SELECTED')).toBeInTheDocument();
  });

  it('lets a selected ship cross a phase lane by clicking the lane', () => {
    saveState(stateWithPlayerForces());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transport orbiting Terra Nova' }));

    const lane = screen.getByRole('button', { name: 'Cross phase lane from Terra Nova to Nyx' });
    fireEvent.click(lane);

    expect(screen.getByText('1 ship routed across 1 phase lane to Nyx.')).toBeInTheDocument();
    expect(document.querySelector('.transit-ship')).not.toBeNull();
    expect(screen.getAllByText(/CLEARING WELL/).length).toBeGreaterThan(0);
    expect(document.querySelector('.local-route.active')).not.toBeNull();
    expect(screen.queryByText('1 SHIP SELECTED')).not.toBeInTheDocument();
  });

  it('opens research as a top-level empire tab and renders prerequisite branches', () => {
    render(<App />);
    const empireViews = screen.getByRole('navigation', { name: 'Empire views' });
    fireEvent.click(within(empireViews).getByRole('button', { name: 'research' }));

    expect(screen.getByRole('main', { name: 'Research tech tree' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Technology tree' })).toBeInTheDocument();
    expect(document.querySelectorAll('.tech-node')).toHaveLength(9);
    expect(document.querySelectorAll('.tech-tier')).toHaveLength(4);
    expect(document.querySelector('[data-tech-id="heavyArmor"]')).toHaveAttribute('data-requires', 'groundWarfare');
    expect(document.querySelector('[data-tech-id="carrierOperations"]')).toHaveAttribute('data-requires', 'fleetLogistics');
    expect(document.querySelector('[data-tech-id="titanEngineering"]')).toHaveAttribute('data-requires', 'capitalShips');
    expect(document.querySelector('.expanded-tech-tree')).not.toBeNull();
    expect(screen.getByText('Titan Dreadnought')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Planet sections' })).not.toBeInTheDocument();
  });

  it('unlocks the next technology branches when their prerequisite is complete', () => {
    const state = createInitialState();
    state.planets[0].buildings.push({ id: 'research-lab-test', kind: 'researchLab' });
    state.completedResearch.push('advancedIndustry');
    localStorage.setItem('galactic-empires-save-v5', JSON.stringify(state));
    render(<App />);

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Empire views' })).getByRole('button', { name: 'research' }));
    for (const id of ['groundWarfare', 'fleetLogistics', 'orbitalEngineering', 'quantumExtraction']) {
      const node = document.querySelector(`[data-tech-id="${id}"]`) as HTMLElement;
      expect(within(node).getByRole('button', { name: 'RESEARCH' })).toBeEnabled();
    }
    for (const id of ['heavyArmor', 'capitalShips', 'titanEngineering']) {
      const node = document.querySelector(`[data-tech-id="${id}"]`) as HTMLElement;
      expect(within(node).getByRole('button', { name: 'PREREQUISITE' })).toBeDisabled();
    }
  });

  it('renders orbital defenses as installations in space', () => {
    const state = createInitialState(); const cygnus = state.planets.find(p => p.id === 'cygnus')!;
    cygnus.buildings.push({ id: 'test-defense', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields });
    saveState(state);
    render(<App />);
    expect(screen.getByRole('img', { name: 'Orbital Defense Platform 1 at Cygnus Reach' })).toBeInTheDocument();
  });

  it('shows orbital weapons fire and lets the player target an enemy platform', () => {
    const state = createInitialState(); const cygnus = state.planets.find(p => p.id === 'cygnus')!;
    cygnus.buildings.push({ id: 'test-defense', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields });
    cygnus.orbitUnits.push({ id: 'platform-attacker', kind: 'lightCruiser', faction: 'player', hp: 480, maxHp: 480, shields: 240, maxShields: 240 });
    localStorage.setItem('galactic-empires-save-v5', JSON.stringify(state));
    render(<App />);

    const platform = screen.getByRole('button', { name: 'Target enemy Orbital Defense Platform 1 at Cygnus Reach' });
    expect(document.querySelectorAll('.orbital-fire line')).toHaveLength(2);
    fireEvent.click(platform);
    expect(platform).toHaveClass('focused');
    expect(platform).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Priority target locked: orbital defense at Cygnus Reach.')).toBeInTheDocument();
  });

  it('shows escort frigates attacking hostile ships in orbit', () => {
    const state = stateWithPlayerForces(); const terra = state.planets.find(p => p.id === 'terra')!;
    const escort = terra.orbitUnits.find(unit => unit.kind === 'escortFrigate')!;
    terra.orbitUnits = [escort, { id: 'enemy-escort-ui', kind: 'escortFrigate', faction: 'enemy', hp: 260, maxHp: 260, shields: 130, maxShields: 130 }];
    localStorage.setItem('galactic-empires-save-v5', JSON.stringify(state));
    render(<App />);

    expect(document.querySelectorAll('.orbital-fire line.escort-attack')).toHaveLength(2);
  });

  it('starts non-instant movement toward an open point inside its gravity well', () => {
    saveState(stateWithPlayerForces());
    render(<App />);
    const transport = screen.getByRole('button', { name: 'Transport orbiting Terra Nova' });
    fireEvent.click(transport);

    const canvas = document.querySelector('.galaxy-canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas as HTMLElement, { clientX: 2666, clientY: 4928 });
    fireEvent.mouseUp(canvas as HTMLElement, { clientX: 2666, clientY: 4928 });

    expect(screen.getByText('1 ship maneuvering inside Terra Nova gravity well.')).toBeInTheDocument();
    expect(transport).toHaveStyle({ left: '2816px', top: '4748px' });
  });

  it('marks loaded phase arrivals and shows the landing interception countdown', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits.push({
      ...makeUnit('enemy-landing-transport', 'transport', 'enemy'), orbitX: 342, orbitY: 0, orbitTargetX: 0, orbitTargetY: 0,
      phaseArrival: true, pendingLanding: true, cargo: [makeUnit('enemy-cargo', 'infantry', 'enemy')], loadedUnitIds: ['enemy-cargo'],
    });
    saveState(state);
    render(<App />);
    const landingMarker = screen.getByRole('button', { name: 'Transport landing approach Terra Nova' });
    expect(landingMarker).toHaveClass('phase-arrival', 'landing-approach');
    expect(landingMarker).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'forces' }));
    expect(screen.getByText('HOSTILE TRANSPORT LANDING APPROACH')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${Math.ceil(342 / LANDING_APPROACH_SPEED)}s TO PLANET`))).toBeInTheDocument();
  });

  it('allows a player transport to remain selectable during its landing approach', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits.push({
      ...makeUnit('player-landing-transport', 'transport', 'player'), orbitX: 342, orbitY: 0, orbitTargetX: 0, orbitTargetY: 0,
      phaseArrival: true, pendingLanding: true, cargo: [makeUnit('player-cargo', 'infantry', 'player')], loadedUnitIds: ['player-cargo'],
    });
    saveState(state);
    render(<App />);
    const landingMarker = screen.getByRole('button', { name: 'Transport landing approach Terra Nova' });
    expect(landingMarker).toBeEnabled();
    fireEvent.click(landingMarker);
    expect(landingMarker).toHaveClass('selected');
  });

  it('clears ship selection when empty space outside the gravity well is clicked', () => {
    saveState(stateWithPlayerForces());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transport orbiting Terra Nova' }));
    expect(screen.getByText('1 SHIP SELECTED')).toBeInTheDocument();

    const canvas = document.querySelector('.galaxy-canvas')!;
    fireEvent.mouseDown(canvas, { clientX: 2200, clientY: 4928 });
    fireEvent.mouseUp(canvas, { clientX: 2200, clientY: 4928 });
    expect(screen.queryByText('1 SHIP SELECTED')).not.toBeInTheDocument();
  });

  it('shows spatial units and weapon ranges on the ground battlefield', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'terra', attackers: [{ ...makeUnit('attacker', 'infantry', 'player'), battleX: 20, battleY: 45 }], defenders: [{ ...makeUnit('defender', 'infantry', 'enemy'), battleX: 80, battleY: 55 }] }];
    localStorage.setItem('galactic-empires-save-v5', JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /GROUND BATTLE ACTIVE/ }));
    expect(screen.getByText(/Units advance automatically/)).toBeInTheDocument();
    expect(screen.getAllByText(/RNG 14/)).toHaveLength(2);
    expect(document.querySelectorAll('.range-ring')).toHaveLength(2);
    expect(screen.getByText(/2,600 × 1,600 TACTICAL ZONE/)).toBeInTheDocument();
    expect(document.querySelector('.battle-canvas')).not.toBeNull();
  });

  it('renders active Ground Defenses as fortified battlefield turrets', () => {
    const state = createInitialState();
    state.planets[0].buildings.push({ id: 'ground-defense-ui', kind: 'groundDefense' });
    state.battles = [{
      planetId: 'terra', attackerFaction: 'enemy',
      attackers: [{ ...makeUnit('attacker', 'infantry', 'enemy'), battleX: 20, battleY: 45 }],
      defenders: [{ ...makeUnit('ground-defense-ground-defense-ui', 'defenseTurret', 'player'), sourceBuildingId: 'ground-defense-ui', battleX: 88, battleY: 50 }],
      groundDefenseBuildingIds: ['ground-defense-ui'],
    }];
    saveState(state);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /GROUND BATTLE ACTIVE/ }));
    expect(screen.getByText('1 FORTIFIED DEFENSE ONLINE')).toBeInTheDocument();
    expect(screen.getByText(/Defense Turret · RNG 32/)).toBeInTheDocument();
    expect(document.querySelector('.battle-unit.fortification')).not.toBeNull();
  });
});
