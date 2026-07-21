import { useEffect, useRef, useState } from 'react';
import {
  BUILDINGS, GRAVITY_WELL_RADIUS, UNITS, localPlanetConnections, orbitalCombatShots, orbitalDefenseOffset, ownerLabel, spaceYards,
  type Fleet, type GameState, type Planet, type Unit,
} from '../../game';
import { factionName, fleetPhaseLabel } from '../shared/presentation';
import { ShipImage } from '../shared/ShipImage';
import { FleetSelectionHud } from './FleetSelectionHud';

const planetFactionBadge = (owner: Planet['owner']) => owner === 'player' ? 'YOU' : owner === 'enemy' ? 'RIVAL A' : owner === 'rival2' ? 'RIVAL B' : owner === 'rival3' ? 'RIVAL C' : 'NEUTRAL';

const CANVAS_WIDTH = 12800;
const CANVAS_HEIGHT = 8800;
const KEYBOARD_PAN_STEP = 22;
const PLANET_HIT_SIZE = 160;

const systemBorderPoint = (from: Planet, to: Planet) => {
  const fromX = CANVAS_WIDTH * from.x / 100, fromY = CANVAS_HEIGHT * from.y / 100;
  const dx = CANVAS_WIDTH * (to.x - from.x) / 100, dy = CANVAS_HEIGHT * (to.y - from.y) / 100;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = GRAVITY_WELL_RADIUS - 18;
  return { x: fromX + dx / distance * radius, y: fromY + dy / distance * radius };
};

const fleetMapPosition = (fleet: Fleet, planets: Planet[]) => {
  const from = planets.find(planet => planet.id === fleet.originId)!;
  const to = planets.find(planet => planet.id === fleet.destinationId)!;
  const phase = fleet.phase ?? 'tunnel';
  const originBorder = systemBorderPoint(from, to);
  const destinationBorder = systemBorderPoint(to, from);
  const start = phase === 'exiting'
    ? { x: CANVAS_WIDTH * from.x / 100 + (fleet.departureX ?? 0), y: CANVAS_HEIGHT * from.y / 100 + (fleet.departureY ?? 0) }
    : originBorder;
  const end = phase === 'tunnel' ? destinationBorder : originBorder;
  const progress = fleet.travelTime ? Math.min(1, fleet.progress / fleet.travelTime) : 1;
  return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, phase };
};

export function GalaxyMap({ state, selectedId, selectedShipIds, selectedYardIds, onSelect, onOrderToPlanet, onSelectShip, onSelectSpaceYard, onGroupSelect, onManeuver, onTargetDefense }: {
  state: GameState; selectedId: string; selectedShipIds: string[]; selectedYardIds: string[]; onSelect: (id: string) => void;
  onOrderToPlanet: (id: string) => void;
  onSelectShip: (planetId: string, unitId: string, additive: boolean) => void; onGroupSelect: (ids: string[]) => void;
  onSelectSpaceYard: (planetId: string, yardId: string, additive: boolean) => void;
  onManeuver: (planetId: string, x: number, y: number) => void;
  onTargetDefense: (planetId: string, defenseId: string) => void;
}) {
  const connections = localPlanetConnections(state.planets);
  const ownershipCounts = {
    player: state.planets.filter(planet => planet.owner === 'player').length,
    enemy: state.planets.filter(planet => planet.owner === 'enemy').length,
    rival2: state.planets.filter(planet => planet.owner === 'rival2').length,
    rival3: state.planets.filter(planet => planet.owner === 'rival3').length,
    neutral: state.planets.filter(planet => planet.owner === null).length,
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const pressedPanKeysRef = useRef(new Set<string>());
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>();
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number }>();
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const viewport = scrollRef.current; if (!viewport) return;
    const initialPlanet = state.planets.find(planet => planet.id === selectedId) ?? state.planets[0];
    const left = Math.max(0, CANVAS_WIDTH * initialPlanet.x / 100 * zoom - viewport.clientWidth / 2);
    const top = Math.max(0, CANVAS_HEIGHT * initialPlanet.y / 100 * zoom - viewport.clientHeight / 2);
    if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, top });
    else { viewport.scrollLeft = left; viewport.scrollTop = top; }
  }, [selectedId]);
  useEffect(() => {
    const panKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    const panViewport = (x: number, y: number) => {
      const viewport = scrollRef.current;
      if (!viewport || (!x && !y)) return;
      const magnitude = Math.max(1, Math.hypot(x, y));
      viewport.scrollLeft += x / magnitude * KEYBOARD_PAN_STEP;
      viewport.scrollTop += y / magnitude * KEYBOARD_PAN_STEP;
    };
    const panFromPressedKeys = () => {
      const keys = pressedPanKeysRef.current;
      panViewport(Number(keys.has('KeyD')) - Number(keys.has('KeyA')), Number(keys.has('KeyS')) - Number(keys.has('KeyW')));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!panKeys.has(event.code)) return;
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (!pressedPanKeysRef.current.has(event.code)) {
        pressedPanKeysRef.current.add(event.code);
        panFromPressedKeys();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!panKeys.has(event.code)) return;
      pressedPanKeysRef.current.delete(event.code);
      event.preventDefault();
    };
    const clearPanKeys = () => pressedPanKeysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearPanKeys);
    const timer = window.setInterval(() => {
      panFromPressedKeys();
    }, 16);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearPanKeys);
    };
  }, []);
  const changeZoom = (requested: number, anchorX?: number, anchorY?: number) => {
    const next = Math.min(1.5, Math.max(.25, Math.round(requested * 100) / 100));
    const viewport = scrollRef.current;
    if (!viewport || next === zoom) return;
    const x = anchorX ?? viewport.clientWidth / 2, y = anchorY ?? viewport.clientHeight / 2;
    const logicalX = (viewport.scrollLeft + x) / zoom, logicalY = (viewport.scrollTop + y) / zoom;
    setZoom(next);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = logicalX * next - x;
      viewport.scrollTop = logicalY * next - y;
    });
  };
  const shipPosition = (p: Planet, ship: Unit, index: number) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(3, p.orbitUnits.length));
    const radius = 155 + (index % 2) * 35;
    return { x: CANVAS_WIDTH * p.x / 100 + (ship.orbitX ?? Math.cos(angle) * radius), y: CANVAS_HEIGHT * p.y / 100 + (ship.orbitY ?? Math.sin(angle) * radius) };
  };
  const yardPosition = (p: Planet, index: number, count: number) => {
    const angle = Math.PI / 4 + index * (Math.PI * 2 / Math.max(1, count));
    const radius = 295 + (index % 2) * 28;
    return { x: CANVAS_WIDTH * p.x / 100 + Math.cos(angle) * radius, y: CANVAS_HEIGHT * p.y / 100 + Math.sin(angle) * radius };
  };
  const defensePosition = (p: Planet, index: number, count: number) => {
    const offset = orbitalDefenseOffset(index, count);
    return { x: CANVAS_WIDTH * p.x / 100 + offset.x, y: CANVAS_HEIGHT * p.y / 100 + offset.y };
  };
  const selectedOrigin = selectedShipIds.length ? state.planets.find(planet => selectedShipIds.every(id => planet.orbitUnits.some(unit => unit.id === id && unit.faction === 'player'))) : undefined;
  const orbitShips = state.planets.flatMap(planet => planet.orbitUnits);
  const selectedShips = selectedShipIds.flatMap(id => {
    const ship = orbitShips.find(unit => unit.id === id && unit.faction === 'player');
    return ship ? [ship] : [];
  });
  const gatePosition = (origin: Planet, destination: Planet) => {
    const originX = CANVAS_WIDTH * origin.x / 100, originY = CANVAS_HEIGHT * origin.y / 100;
    const dx = CANVAS_WIDTH * (destination.x - origin.x) / 100, dy = CANVAS_HEIGHT * (destination.y - origin.y) / 100;
    const distance = Math.hypot(dx, dy), offset = GRAVITY_WELL_RADIUS + 100;
    return { x: originX + dx / distance * offset, y: originY + dy / distance * offset };
  };
  const marquee = dragStart && dragEnd ? { left: Math.min(dragStart.x, dragEnd.x), top: Math.min(dragStart.y, dragEnd.y), width: Math.abs(dragEnd.x - dragStart.x), height: Math.abs(dragEnd.y - dragStart.y) } : undefined;
  return <main className={`galaxy ${selectedShipIds.length ? 'issuing-order' : ''} ${selectedYardIds.length ? 'selecting-yards' : ''}`} aria-label="Galaxy map" onWheel={event => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); changeZoom(zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX - rect.left, event.clientY - rect.top); }}>
    <div className="galaxy-scroll" ref={scrollRef}>
      <div className="galaxy-canvas" style={{ zoom } as React.CSSProperties} onContextMenu={event => {
        event.preventDefault();
        if (!selectedOrigin) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / zoom - CANVAS_WIDTH * selectedOrigin.x / 100;
        const y = (event.clientY - rect.top) / zoom - CANVAS_HEIGHT * selectedOrigin.y / 100;
        if (Math.hypot(x, y) <= GRAVITY_WELL_RADIUS) onManeuver(selectedOrigin.id, x, y);
      }} onMouseDown={event => { if (event.button !== 0 || (event.target as Element).closest('button')) return; const rect = event.currentTarget.getBoundingClientRect(); const point = { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }; setDragStart(point); setDragEnd(point); }} onMouseMove={event => { if (!dragStart) return; const rect = event.currentTarget.getBoundingClientRect(); setDragEnd({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }); }} onMouseUp={event => {
        if (event.button !== 0) return;
        if (!dragStart || !dragEnd) return;
        const distance = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
        if (distance > 8) {
          const left = Math.min(dragStart.x, dragEnd.x), right = Math.max(dragStart.x, dragEnd.x), top = Math.min(dragStart.y, dragEnd.y), bottom = Math.max(dragStart.y, dragEnd.y);
          const ids = state.planets.flatMap(p => p.orbitUnits.map((ship, index) => ({ ship, ...shipPosition(p, ship, index) }))).filter(item => item.ship.faction === 'player' && !item.ship.phaseArrival && item.x >= left && item.x <= right && item.y >= top && item.y <= bottom).map(item => item.ship.id);
          onGroupSelect(ids);
        } else if (selectedShipIds.length) {
          const origin = state.planets.find(p => selectedShipIds.every(id => p.orbitUnits.some(u => u.id === id)));
          if (origin) {
            const localX = dragEnd.x - CANVAS_WIDTH * origin.x / 100;
            const localY = dragEnd.y - CANVAS_HEIGHT * origin.y / 100;
            if (Math.hypot(localX, localY) > GRAVITY_WELL_RADIUS) onGroupSelect([]);
          }
        }
        setDragStart(undefined); setDragEnd(undefined);
      }} onMouseLeave={() => { setDragStart(undefined); setDragEnd(undefined); }}>
        <div className="nebula nebula-a" /><div className="nebula nebula-b" />
        <svg className="routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {connections.map(({ from, to }) => {
            const active = state.fleets.some(fleet => (fleet.originId === from.id && fleet.destinationId === to.id) || (fleet.originId === to.id && fleet.destinationId === from.id));
            return <line key={`${from.id}-${to.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`local-route ${active ? 'active' : ''}`} />;
          })}
        </svg>
        <svg className="orbital-fire" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          {state.planets.flatMap(p => {
            const defenses = p.buildings.filter(building => building.kind === 'spaceDefense');
            const mapPosition = (id: string, type: 'ship' | 'defense' | 'battery') => {
              if (type === 'battery') return { x: CANVAS_WIDTH * p.x / 100, y: CANVAS_HEIGHT * p.y / 100 };
              if (type === 'defense') {
                const index = defenses.findIndex(defense => defense.id === id);
                return index < 0 ? undefined : defensePosition(p, index, defenses.length);
              }
              const ship = p.orbitUnits.find(unit => unit.id === id);
              return ship ? shipPosition(p, ship, p.orbitUnits.findIndex(unit => unit.id === id)) : undefined;
            };
            return orbitalCombatShots(p).flatMap((shot, index) => {
              const source = mapPosition(shot.attackerId, shot.attackerType);
              const target = mapPosition(shot.targetId, shot.targetType);
              if (!source || !target) return [];
              return <line key={`${shot.attackerId}-fires-${shot.targetId}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`${shot.faction} ${shot.attackerType === 'ship' ? 'ship-fire' : 'installation-fire'} ${shot.attackerType === 'battery' ? 'battery-fire' : ''}`} style={{ '--fire-delay': `${index * .11}s` } as React.CSSProperties} />;
            });
          })}
        </svg>
        {selectedOrigin && connections.flatMap(({ from, to }) => {
          if (from.id !== selectedOrigin.id && to.id !== selectedOrigin.id) return [];
          const destination = from.id === selectedOrigin.id ? to : from;
          const position = gatePosition(selectedOrigin, destination);
          return <button key={`${from.id}-${to.id}`} className="phase-gate" style={{ left: position.x, top: position.y }} aria-label={`Cross phase lane from ${selectedOrigin.name} to ${destination.name}`} onClick={event => { event.stopPropagation(); onSelect(destination.id); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onOrderToPlanet(destination.id); }}><span>⇢</span><small>RIGHT-CLICK · {destination.name}</small></button>;
        })}
        {state.planets.map(p => {
          const battle = state.battles.some(b => b.planetId === p.id);
          const hostileOrbit = new Set(p.orbitUnits.filter(unit => unit.faction !== 'neutral').map(unit => unit.faction)).size > 1;
          return <button key={p.id} aria-label={`${p.name} ${ownerLabel(p.owner)}`} className={`planet-node ${selectedId === p.id ? 'selected' : ''} ${p.owner ?? 'neutral'}`} style={{ left: `${p.x}%`, top: `${p.y}%`, '--planet': p.color, '--gravity-well-size': `${GRAVITY_WELL_RADIUS * 2}px`, '--gravity-well-offset': `${PLANET_HIT_SIZE / 2 - GRAVITY_WELL_RADIUS}px` } as React.CSSProperties} onClick={event => { event.stopPropagation(); onSelect(p.id); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onOrderToPlanet(p.id); }}>
            {(battle || hostileOrbit) && <span className="battle-pulse">⚔</span>}<span className="orbit-zone" /><span className="ownership-ring" /><span className="orbit-ring" /><span className="planet-sphere" />
            <span className="faction-badge">{planetFactionBadge(p.owner)}</span><span className="planet-name">{p.name}</span><span className="planet-status">{factionName(p.owner)}</span>{!!p.orbitUnits.length && <span className="orbit-count">◈ {p.orbitUnits.length}</span>}
          </button>;
        })}
        {state.planets.flatMap(p => {
          if (!p.owner) return [];
          const yards = spaceYards(p);
          return yards.map((yard, index) => {
            const position = yardPosition(p, index, yards.length);
            const advanced = yard.kind === 'advancedSpaceFactory';
            const content = <><span>{advanced ? 'A' : 'Y'}{index + 1}</span><small>{p.owner !== 'player' ? `HOSTILE ${advanced ? 'ADV YARD' : 'YARD'}` : advanced ? 'ADV YARD' : 'SPACE YARD'}</small></>;
            const className = `orbit-yard ${p.owner} ${advanced ? 'advanced' : ''} ${selectedYardIds.includes(yard.id) ? 'selected' : ''}`;
            return p.owner === 'player'
              ? <button key={yard.id} aria-label={`${advanced ? 'Advanced Space Yard' : 'Space Yard'} ${index + 1} orbiting ${p.name} — open ship production`} aria-pressed={selectedYardIds.includes(yard.id)} className={className} style={{ left: position.x, top: position.y }} onClick={event => { event.stopPropagation(); onSelectSpaceYard(p.id, yard.id, event.shiftKey); }}>{content}</button>
              : <div key={yard.id} role="img" aria-label={`Enemy ${advanced ? 'Advanced Space Yard' : 'Space Yard'} ${index + 1} orbiting ${p.name}`} className={className} style={{ left: position.x, top: position.y }}>{content}</div>;
          });
        })}
        {state.planets.flatMap(p => {
          const defenses = p.buildings.filter(building => building.kind === 'spaceDefense');
          return defenses.map((defense, index) => {
            const position = defensePosition(p, index, defenses.length);
            const targetable = !!p.owner && p.owner !== 'player' && p.orbitUnits.some(ship => ship.faction === 'player');
            const focused = p.orbitFocusTargetId === defense.id;
            const content = <><span>⌾</span><i /><div className="defense-health"><b style={{ width: `${Math.max(0, defense.hp! / defense.maxHp! * 100)}%` }} /><em style={{ width: `${Math.max(0, defense.shields! / defense.maxShields! * 100)}%` }} /></div><small>{focused ? 'TARGET LOCK' : `DEF ${index + 1}`}</small></>;
            const className = `orbital-defense ${p.owner ?? 'neutral'} ${targetable ? 'targetable' : ''} ${focused ? 'focused' : ''}`;
            const style = { left: position.x, top: position.y };
            return targetable
              ? <button key={defense.id} aria-label={`Target enemy Orbital Defense Platform ${index + 1} at ${p.name}`} aria-pressed={focused} className={className} style={style} onClick={event => { event.stopPropagation(); onTargetDefense(p.id, defense.id); }}>{content}</button>
              : <div key={defense.id} role="img" aria-label={`Orbital Defense Platform ${index + 1} at ${p.name}`} className={className} style={style}>{content}</div>;
          });
        })}
        {state.planets.flatMap(p => p.orbitUnits.map((ship, index) => {
          const position = shipPosition(p, ship, index);
          const capacity = UNITS[ship.kind].capacity;
          const approach = ship.pendingLanding ? ' landing approach' : ship.pendingEmbark ? ' embark approach' : ship.phaseArrival ? ' phase arrival' : ship.docked ? ' docked at' : ' orbiting';
          const selectable = ship.faction === 'player';
          const cargoCount = ship.cargo?.length ?? 0;
          return <button key={ship.id} aria-label={`${UNITS[ship.kind].label}${approach} ${p.name}`} className={`orbit-ship ${ship.faction} ${ship.phaseArrival ? 'phase-arrival' : ''} ${ship.pendingLanding ? 'landing-approach' : ''} ${ship.pendingEmbark ? 'embark-approach' : ''} ${ship.docked ? 'docked' : ''} ${selectedShipIds.includes(ship.id) ? 'selected' : ''}`} style={{ left: position.x, top: position.y }} onClick={event => { event.stopPropagation(); if (selectable) onSelectShip(p.id, ship.id, event.shiftKey); }} disabled={!selectable}><i className="ship-range-ring" style={{ '--ship-range': `${UNITS[ship.kind].range * 2}px` } as React.CSSProperties} /><ShipImage kind={ship.kind} />{capacity && <small className={`transport-capacity ${cargoCount >= capacity ? 'full' : ''}`} aria-label={`Cargo ${cargoCount} of ${capacity}`}>{ship.pendingLanding ? 'LANDING · ' : ship.pendingEmbark ? 'EMBARKING · ' : ship.docked ? 'DOCKED · ' : ''}{cargoCount}/{capacity}</small>}</button>;
        }))}
        {state.fleets.map((fleet, index) => {
          const position = fleetMapPosition(fleet, state.planets);
          const x = position.x + (index % 4) * 18, y = position.y + Math.floor(index / 4) * 18;
          return <div className={`transit-ship ${fleet.faction} ${position.phase}`} style={{ left: x, top: y }} key={fleet.id}><ShipImage kind={fleet.unit.kind} /><small>{fleetPhaseLabel(fleet)} · {UNITS[fleet.unit.kind].label}</small></div>;
        })}
        {marquee && <div className="selection-marquee" style={marquee} />}
      </div>
    </div>
    <div className="zoom-controls" aria-label="Map controls"><span className="map-pan-hint">WASD PAN</span><button onClick={() => changeZoom(zoom / 1.2)} aria-label="Zoom out">−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => changeZoom(zoom * 1.2)} aria-label="Zoom in">+</button><button onClick={() => changeZoom(1)} aria-label="Reset zoom">1:1</button></div>
    <FleetSelectionHud ships={selectedShips} />
    {selectedYardIds.length > 0 && <div className="fleet-command-hint yard-command-hint">{selectedYardIds.length} SPACE YARD{selectedYardIds.length === 1 ? '' : 'S'} {selectedYardIds.length > 1 ? 'GROUPED' : 'INSPECTED'} <span>{selectedYardIds.length > 1 ? 'Each order builds once at every grouped yard' : 'Orders still auto-rotate · Shift-click another yard for grouped production'}</span></div>}
    <div className="map-key" role="region" aria-label="Planet ownership legend"><span className="player"><i className="key-dot player" /><b>YOUR EMPIRE</b><strong>{ownershipCounts.player}</strong></span><span className="enemy"><i className="key-dot enemy" /><b>RIVAL A</b><strong>{ownershipCounts.enemy}</strong></span>{state.additionalEmpires?.rival2 && <span className="rival2"><i className="key-dot rival2" /><b>RIVAL B</b><strong>{ownershipCounts.rival2}</strong></span>}{state.additionalEmpires?.rival3 && <span className="rival3"><i className="key-dot rival3" /><b>RIVAL C</b><strong>{ownershipCounts.rival3}</strong></span>}<span className="neutral"><i className="key-dot neutral" /><b>NEUTRAL</b><strong>{ownershipCounts.neutral}</strong></span></div>
  </main>;
}
