import { useEffect, useRef, useState } from 'react';
import {
  AEGIS_SHIELD_PROJECTION_RANGE, BUILDINGS, COVENANT_ASSEMBLY_REPAIR_RANGE, COVENANT_FOUNDRY_REPAIR_RANGE, GRAVITY_WELL_RADIUS, UNITS, carrierFighterCount, localPlanetConnections, orbitalCombatShots, ownerLabel, spaceYards,
  unitRange, type GameState, type Planet, type TitanUpgradeId,
} from '../../game';
import { factionName, fleetPhaseLabel, planetDisplayColor } from '../shared/presentation';
import { ShipImage, shipDisplaySize } from '../shared/ShipImage';
import { ORBITAL_PROJECTILE_SIZE, WeaponFire } from '../shared/WeaponFire';
import {
  DEFAULT_GALAXY_CAMERA, cameraDepth, clampCameraPitch, galaxyCameraBounds, projectGalaxyPoint, unprojectGalaxyPoint,
  type GalaxyCamera,
} from './camera';
import { CarrierFighterWing } from './CarrierFighterWing';
import { FleetSelectionHud } from './FleetSelectionHud';
import { ShipCanvasLayer, inspectableShipAtPoint } from './ShipCanvasLayer';
import {
  GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH, defenseMapPosition, fleetHeading, fleetMapPosition, orbitShipHeading, pointInViewport, shipMapPosition, yardMapPosition,
} from './geometry';
import { useGalaxyViewport } from './useGalaxyViewport';

const planetFactionBadge = (owner: Planet['owner']) => owner === 'player' ? 'YOU' : owner === 'enemy' ? 'RIVAL A' : owner === 'rival2' ? 'RIVAL B' : owner === 'rival3' ? 'RIVAL C' : 'NEUTRAL';

const KEYBOARD_PAN_STEP = 22;
const PLANET_HIT_SIZE = 190;

export function GalaxyMap({ state, selectedId, selectedShipIds, selectedYardIds, onSelect, onOrderToPlanet, onSelectShip, onSelectSpaceYard, onGroupSelect, onManeuver, onTargetDefense, onUpgradeTitan }: {
  state: GameState; selectedId: string; selectedShipIds: string[]; selectedYardIds: string[]; onSelect: (id: string) => void;
  onOrderToPlanet: (id: string) => void;
  onSelectShip: (planetId: string, unitId: string, additive: boolean) => void; onGroupSelect: (ids: string[]) => void;
  onSelectSpaceYard: (planetId: string, yardId: string, additive: boolean) => void;
  onManeuver: (planetId: string, x: number, y: number) => void;
  onTargetDefense: (planetId: string, defenseId: string) => void;
  onUpgradeTitan?: (planetId: string, unitId: string, upgradeId: TitanUpgradeId) => void;
}) {
  const connections = localPlanetConnections(state.planets);
  const ownershipCounts = {
    player: state.planets.filter(planet => planet.owner === 'player').length,
    enemy: state.planets.filter(planet => planet.owner === 'enemy').length,
    rival2: state.planets.filter(planet => planet.owner === 'rival2').length,
    rival3: state.planets.filter(planet => planet.owner === 'rival3').length,
    neutral: state.planets.filter(planet => planet.owner === null).length,
  };
  const pressedPanKeysRef = useRef(new Set<string>());
  const cameraDragRef = useRef<{ x: number; y: number; camera: GalaxyCamera } | undefined>(undefined);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>();
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number }>();
  const [camera3D, setCamera3D] = useState(false);
  const [camera, setCamera] = useState<GalaxyCamera>(DEFAULT_GALAXY_CAMERA);
  const [zoom, setZoom] = useState(1);
  const { scrollRef, viewportBounds, scheduleViewportMeasure } = useGalaxyViewport(zoom);
  const renderBounds = camera3D ? undefined : viewportBounds;
  useEffect(() => {
    const viewport = scrollRef.current; if (!viewport) return;
    const initialPlanet = state.planets.find(planet => planet.id === selectedId) ?? state.planets[0];
    const point = { x: GALAXY_CANVAS_WIDTH * initialPlanet.x / 100, y: GALAXY_CANVAS_HEIGHT * initialPlanet.y / 100 };
    const focus = camera3D ? projectGalaxyPoint(point, camera) : point;
    const left = Math.max(0, focus.x * zoom - viewport.clientWidth / 2);
    const top = Math.max(0, focus.y * zoom - viewport.clientHeight / 2);
    if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, top });
    else { viewport.scrollLeft = left; viewport.scrollTop = top; }
    scheduleViewportMeasure();
  }, [selectedId, camera3D, camera.pitch, camera.yaw]);
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
  const interruptibleFleets = state.fleets.filter(fleet => fleet.faction === 'player' && (fleet.phase === 'exiting' || fleet.phase === 'charging'));
  const selectedOriginIds = new Set(selectedShipIds.flatMap(id => {
    const orbit = state.planets.find(planet => planet.orbitUnits.some(unit => unit.id === id && unit.faction === 'player'));
    const fleet = interruptibleFleets.find(candidate => candidate.unit.id === id);
    return orbit ? [orbit.id] : fleet ? [fleet.originId] : [];
  }));
  const selectedOriginId = selectedOriginIds.size === 1 ? [...selectedOriginIds][0] : undefined;
  const selectedOrigin = selectedShipIds.length ? state.planets.find(planet => planet.id === selectedOriginId) : undefined;
  const orbitShips = state.planets.flatMap(planet => planet.orbitUnits);
  const selectedShips = selectedShipIds.flatMap(id => {
    const ship = orbitShips.find(unit => unit.id === id) ?? state.fleets.find(fleet => fleet.unit.id === id)?.unit;
    return ship ? [ship] : [];
  });
  const gatePosition = (origin: Planet, destination: Planet) => {
    const originX = GALAXY_CANVAS_WIDTH * origin.x / 100, originY = GALAXY_CANVAS_HEIGHT * origin.y / 100;
    const dx = GALAXY_CANVAS_WIDTH * (destination.x - origin.x) / 100, dy = GALAXY_CANVAS_HEIGHT * (destination.y - origin.y) / 100;
    const distance = Math.hypot(dx, dy), offset = GRAVITY_WELL_RADIUS + 100;
    return { x: originX + dx / distance * offset, y: originY + dy / distance * offset };
  };
  const marquee = dragStart && dragEnd ? { left: Math.min(dragStart.x, dragEnd.x), top: Math.min(dragStart.y, dragEnd.y), width: Math.abs(dragEnd.x - dragStart.x), height: Math.abs(dragEnd.y - dragStart.y) } : undefined;
  const pointOnGalaxy = (canvas: HTMLElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    if (!camera3D) return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    const bounds = galaxyCameraBounds(camera);
    return unprojectGalaxyPoint({
      x: (clientX - rect.left) / zoom + bounds.minX,
      y: (clientY - rect.top) / zoom + bounds.minY,
    }, camera);
  };
  const resetCamera = () => {
    setCamera3D(false);
    setCamera(DEFAULT_GALAXY_CAMERA);
    cameraDragRef.current = undefined;
  };
  return <main className={`galaxy ${camera3D ? 'view-3d' : 'view-2d'} ${selectedOrigin ? 'issuing-order' : ''} ${selectedYardIds.length ? 'selecting-yards' : ''}`} aria-label="Galaxy map" onWheel={event => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); changeZoom(zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX - rect.left, event.clientY - rect.top); }}>
    <div className="galaxy-scroll" ref={scrollRef}>
      <div className="galaxy-canvas" style={{
        zoom,
        ...(camera3D ? {
          transform: `rotateZ(${camera.yaw}deg) rotateX(${camera.pitch}deg)`,
          transformOrigin: '50% 50%',
          '--camera-counter-scale': 1 / cameraDepth(camera.pitch),
        } : {}),
      } as React.CSSProperties} onClickCapture={event => {
        const target = event.target as Element;
        if (target.closest('.orbit-ship,.transit-ship,.orbit-yard,.orbital-defense,.phase-gate')) return;
        const point = pointOnGalaxy(event.currentTarget, event.clientX, event.clientY);
        const hit = inspectableShipAtPoint(state, point.x, point.y);
        if (!hit) return;
        event.preventDefault(); event.stopPropagation();
        onSelectShip(hit.planetId, hit.unitId, false);
      }} onContextMenu={event => {
        event.preventDefault();
        if (!selectedOrigin) return;
        const point = pointOnGalaxy(event.currentTarget, event.clientX, event.clientY);
        const x = point.x - GALAXY_CANVAS_WIDTH * selectedOrigin.x / 100;
        const y = point.y - GALAXY_CANVAS_HEIGHT * selectedOrigin.y / 100;
        if (Math.hypot(x, y) <= GRAVITY_WELL_RADIUS) onManeuver(selectedOrigin.id, x, y);
      }} onAuxClick={event => { if (event.button === 1) event.preventDefault(); }} onMouseDown={event => {
        if (event.button === 1 && camera3D) {
          event.preventDefault();
          cameraDragRef.current = { x: event.clientX, y: event.clientY, camera };
          return;
        }
        if (event.button !== 0 || (event.target as Element).closest('button')) return;
        const point = pointOnGalaxy(event.currentTarget, event.clientX, event.clientY);
        setDragStart(point); setDragEnd(point);
      }} onMouseMove={event => {
        const cameraDrag = cameraDragRef.current;
        if (cameraDrag) {
          setCamera({
            yaw: cameraDrag.camera.yaw + (event.clientX - cameraDrag.x) * .12,
            pitch: clampCameraPitch(cameraDrag.camera.pitch - (event.clientY - cameraDrag.y) * .12),
          });
          return;
        }
        if (!dragStart) return;
        setDragEnd(pointOnGalaxy(event.currentTarget, event.clientX, event.clientY));
      }} onMouseUp={event => {
        if (event.button === 1) { cameraDragRef.current = undefined; return; }
        if (event.button !== 0) return;
        if (!dragStart || !dragEnd) return;
        const distance = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
        if (distance > 8) {
          const left = Math.min(dragStart.x, dragEnd.x), right = Math.max(dragStart.x, dragEnd.x), top = Math.min(dragStart.y, dragEnd.y), bottom = Math.max(dragStart.y, dragEnd.y);
          const orbitItems = state.planets.flatMap(p => p.orbitUnits.map((ship, index) => ({ ship, ...shipMapPosition(p, ship, index) })));
          const fleetItems = interruptibleFleets.map(fleet => ({ ship: fleet.unit, ...fleetMapPosition(fleet, state.planets) }));
          const ids = [...orbitItems, ...fleetItems].filter(item => item.ship.faction === 'player' && !item.ship.phaseArrival && item.x >= left && item.x <= right && item.y >= top && item.y <= bottom).map(item => item.ship.id);
          onGroupSelect(ids);
        } else if (selectedShipIds.length) {
          if (selectedOrigin) {
            const localX = dragEnd.x - GALAXY_CANVAS_WIDTH * selectedOrigin.x / 100;
            const localY = dragEnd.y - GALAXY_CANVAS_HEIGHT * selectedOrigin.y / 100;
            if (Math.hypot(localX, localY) > GRAVITY_WELL_RADIUS) onGroupSelect([]);
          }
        }
        setDragStart(undefined); setDragEnd(undefined);
      }} onMouseLeave={() => { cameraDragRef.current = undefined; setDragStart(undefined); setDragEnd(undefined); }}>
        <div className="nebula nebula-a" /><div className="nebula nebula-b" />
        <svg className="routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {connections.map(({ from, to }) => {
            const active = state.fleets.some(fleet => (fleet.originId === from.id && fleet.destinationId === to.id) || (fleet.originId === to.id && fleet.destinationId === from.id));
            return <line key={`${from.id}-${to.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`local-route ${active ? 'active' : ''}`} />;
          })}
        </svg>
        {!camera3D && <ShipCanvasLayer state={state} bounds={renderBounds} zoom={zoom} selectedShipIds={selectedShipIds} />}
        <svg className="orbital-fire" viewBox={`0 0 ${GALAXY_CANVAS_WIDTH} ${GALAXY_CANVAS_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          {state.planets.flatMap(p => {
            const defenses = p.buildings.filter(building => building.kind === 'spaceDefense');
            const shipIndexes = new Map(p.orbitUnits.map((ship, index) => [ship.id, index]));
            const shipsById = new Map(p.orbitUnits.map(ship => [ship.id, ship]));
            const mapPosition = (id: string, type: 'ship' | 'defense' | 'battery') => {
              if (type === 'battery') return { x: GALAXY_CANVAS_WIDTH * p.x / 100, y: GALAXY_CANVAS_HEIGHT * p.y / 100 };
              if (type === 'defense') {
                const index = defenses.findIndex(defense => defense.id === id);
                return index < 0 ? undefined : defenseMapPosition(p, index, defenses.length);
              }
              const ship = shipsById.get(id);
              return ship ? shipMapPosition(p, ship, shipIndexes.get(id) ?? 0) : undefined;
            };
            const combatShots = orbitalCombatShots(p);
            const carrierShotTotals = new Map<string, number>();
            combatShots.forEach(shot => {
              const firingShip = shot.attackerType === 'ship' ? shipsById.get(shot.attackerId) : undefined;
              const carrier = firingShip && UNITS[firingShip.kind].fighterWing ? firingShip : undefined;
              if (carrier) carrierShotTotals.set(carrier.id, (carrierShotTotals.get(carrier.id) ?? 0) + 1);
            });
            const carrierShotIndexes = new Map<string, number>();
            const allFighterSorties = combatShots.flatMap(shot => {
              const firingShip = shot.attackerType === 'ship' ? shipsById.get(shot.attackerId) : undefined;
              const carrier = firingShip && UNITS[firingShip.kind].fighterWing ? firingShip : undefined;
              if (!carrier) return [];
              const source = mapPosition(shot.attackerId, 'ship'), target = mapPosition(shot.targetId, shot.targetType);
              if (!source || !target) return [];
              const sortieCount = carrierShotTotals.get(carrier.id) ?? 1;
              const sortieIndex = carrierShotIndexes.get(carrier.id) ?? 0;
              carrierShotIndexes.set(carrier.id, sortieIndex + 1);
              const wingCount = carrierFighterCount(carrier);
              const allocated = Math.floor(wingCount / sortieCount) + (sortieIndex < wingCount % sortieCount ? 1 : 0);
              return allocated > 0 ? [{ shot, carrier, source, target, allocated }] : [];
            });
            const firingShots = combatShots.filter(shot => {
              const firingShip = shot.attackerType === 'ship' ? shipsById.get(shot.attackerId) : undefined;
              return !firingShip || (!UNITS[firingShip.kind].fighterWing && (typeof firingShip.weaponFlash !== 'number' || firingShip.weaponFlash > 0));
            });
            return [
              ...allFighterSorties.map(({ shot, carrier, source, target, allocated }) => <CarrierFighterWing key={`${shot.attackerId}-fighters-${shot.targetId}`} id={`${carrier.id}-${shot.targetId}`} faction={carrier.faction} count={allocated} elapsed={state.elapsed} source={source} target={target} />),
              ...firingShots.flatMap((shot, index) => {
                const firingShip = shot.attackerType === 'ship' ? shipsById.get(shot.attackerId) : undefined;
                const source = mapPosition(shot.attackerId, shot.attackerType);
                const target = mapPosition(shot.targetId, shot.targetType);
                if (!source || !target) return [];
                const projectiles = firingShip ? UNITS[firingShip.kind].weapon.projectiles : 1;
                return <WeaponFire key={`${shot.attackerId}-fires-${shot.targetId}`} id={`${shot.attackerId}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} effect={shot.weaponEffect} projectiles={projectiles} faction={shot.faction} size={ORBITAL_PROJECTILE_SIZE} className={`${shot.attackerType === 'ship' ? 'ship-fire' : 'installation-fire'} ${shot.attackerType === 'battery' ? 'battery-fire' : ''}`} />;
              }),
            ];
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
          return <button key={p.id} aria-label={`${p.name} ${ownerLabel(p.owner)}`} className={`planet-node ${selectedId === p.id ? 'selected' : ''} ${p.owner ?? 'neutral'}`} style={{ left: `${p.x}%`, top: `${p.y}%`, '--planet': planetDisplayColor(p), '--gravity-well-size': `${GRAVITY_WELL_RADIUS * 2}px`, '--gravity-well-offset': `${PLANET_HIT_SIZE / 2 - GRAVITY_WELL_RADIUS}px` } as React.CSSProperties} onClick={event => { event.stopPropagation(); onSelect(p.id); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onOrderToPlanet(p.id); }}>
            {(battle || hostileOrbit) && <span className="battle-pulse">⚔</span>}<span className="orbit-zone" /><span className="ownership-ring" /><span className="orbit-ring" /><span className="planet-sphere" />
            <span className="faction-badge">{planetFactionBadge(p.owner)}</span><span className="planet-name">{p.name}</span><span className="planet-status">{factionName(p.owner)}</span>{!!p.orbitUnits.length && <span className="orbit-count">◈ {p.orbitUnits.length}</span>}
          </button>;
        })}
        {state.planets.flatMap(p => {
          if (!p.owner) return [];
          const yards = spaceYards(p);
          return yards.map((yard, index) => {
            const position = yardMapPosition(p, index, yards.length);
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
            const position = defenseMapPosition(p, index, defenses.length);
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
        {state.planets.flatMap(p => p.orbitUnits.flatMap((ship, index) => {
          const selectable = ship.faction === 'player';
          if (!camera3D && !selectable && !ship.pendingLanding && !ship.pendingEmbark) return [];
          const position = shipMapPosition(p, ship, index);
          if (!selectable && !selectedShipIds.includes(ship.id) && !pointInViewport(renderBounds, position.x, position.y, shipDisplaySize(ship.kind))) return [];
          const capacity = UNITS[ship.kind].capacity;
          const approach = ship.pendingLanding ? ' landing approach' : ship.pendingEmbark ? ' embark approach' : ship.phaseArrival ? ' phase arrival' : ship.docked ? ' docked at' : ' orbiting';
          const cargoCount = ship.cargo?.length ?? 0;
          const weapon = UNITS[ship.kind].weapon;
          const displaySize = shipDisplaySize(ship.kind);
          const ability = UNITS[ship.kind].ability;
          const repairRange = ability?.kind === 'assemblyLine' ? COVENANT_ASSEMBLY_REPAIR_RANGE : ability?.kind === 'foundryAura' ? COVENANT_FOUNDRY_REPAIR_RANGE : 0;
          return <button key={ship.id} aria-label={`${UNITS[ship.kind].label}${approach} ${p.name}`} title={`${weapon.label} · ${weapon.projectiles} projectile${weapon.projectiles === 1 ? '' : 's'} · ${weapon.cooldown}s reload${ability ? ` · ${ability.label}: ${ability.description}` : ''}`} className={`orbit-ship ${ship.faction} ${ship.phaseArrival ? 'phase-arrival' : ''} ${ship.pendingLanding ? 'landing-approach' : ''} ${ship.pendingEmbark ? 'embark-approach' : ''} ${ship.docked ? 'docked' : ''} ${selectedShipIds.includes(ship.id) ? 'selected' : ''}`} style={{ left: position.x, top: position.y, '--ship-heading': `${orbitShipHeading(ship)}deg`, '--ship-display-size': `${displaySize}px`, '--ship-label-offset': `${displaySize / 2 + 8}px` } as React.CSSProperties} onClick={event => { event.stopPropagation(); onSelectShip(p.id, ship.id, selectable && event.shiftKey); }}><i className="ship-range-ring" style={{ '--ship-range': `${unitRange(ship) * 2}px` } as React.CSSProperties} />{ability?.kind === 'shieldProjection' && <i className="ship-ability-ring" aria-label="Shield Projection radius" style={{ '--ship-ability-range': `${AEGIS_SHIELD_PROJECTION_RANGE * 2}px` } as React.CSSProperties} />}{repairRange > 0 && <i className="ship-ability-ring covenant-repair" aria-label={`${ability!.label} radius`} style={{ '--ship-ability-range': `${repairRange * 2}px` } as React.CSSProperties} />}{selectable && <i className="ship-control-frame" aria-hidden="true" />}<ShipImage kind={ship.kind} volumetric={camera3D} />{capacity && <small className={`transport-capacity ${cargoCount >= capacity ? 'full' : ''}`} aria-label={`Cargo ${cargoCount} of ${capacity}`}>{ship.pendingLanding ? 'LANDING · ' : ship.pendingEmbark ? 'EMBARKING · ' : ship.docked ? 'DOCKED · ' : ''}{cargoCount}/{capacity}</small>}</button>;
        }))}
        {state.fleets.flatMap((fleet, index) => {
          if (!camera3D && fleet.faction !== 'player') return [];
          const position = fleetMapPosition(fleet, state.planets);
          const x = position.x + (index % 4) * 18, y = position.y + Math.floor(index / 4) * 18;
          const displaySize = shipDisplaySize(fleet.unit.kind);
          const selectable = fleet.faction === 'player' && (position.phase === 'exiting' || position.phase === 'charging');
          const inspectable = camera3D && fleet.faction !== 'player';
          const origin = state.planets.find(planet => planet.id === fleet.originId)!;
          const destination = state.planets.find(planet => planet.id === fleet.destinationId)!;
          const className = `transit-ship ${fleet.faction} ${position.phase} ${selectable ? 'interruptible' : 'committed'} ${selectedShipIds.includes(fleet.unit.id) ? 'selected' : ''}`;
          const style = { left: x, top: y, '--ship-heading': `${fleetHeading(fleet, state.planets)}deg`, '--ship-display-size': `${displaySize}px`, '--ship-label-offset': `${displaySize / 2 + 7}px` } as React.CSSProperties;
          const content = <><ShipImage kind={fleet.unit.kind} volumetric={camera3D} /><i className="ship-control-frame" aria-hidden="true" /></>;
          return selectable || inspectable
            ? <button key={fleet.id} aria-label={selectable ? `${UNITS[fleet.unit.kind].label} ${fleetPhaseLabel(fleet).toLowerCase()} from ${origin.name} toward ${destination.name} — jump can be canceled` : `Inspect ${factionName(fleet.faction)} ${UNITS[fleet.unit.kind].label} in phase transit from ${origin.name} toward ${destination.name}`} aria-pressed={selectedShipIds.includes(fleet.unit.id)} className={className} style={style} onClick={event => { event.stopPropagation(); onSelectShip(origin.id, fleet.unit.id, selectable && event.shiftKey); }}>{content}</button>
            : <div key={fleet.id} role="img" aria-label={`${UNITS[fleet.unit.kind].label} in phase transit from ${origin.name} toward ${destination.name}`} className={className} style={style}>{content}</div>;
        })}
        {marquee && <div className="selection-marquee" style={marquee} />}
      </div>
    </div>
    <div className="zoom-controls" aria-label="Map controls"><span className="map-pan-hint">WASD PAN</span><button onClick={() => changeZoom(zoom / 1.2)} aria-label="Zoom out">−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => changeZoom(zoom * 1.2)} aria-label="Zoom in">+</button><button onClick={() => changeZoom(1)} aria-label="Reset zoom">1:1</button></div>
    <div className={`camera-controls camera-controls-left ${camera3D ? 'active' : ''}`} aria-label="Camera view controls">
      <button className="camera-mode-toggle" aria-label="Toggle 3D view" aria-pressed={camera3D} title={camera3D ? 'Switch to top-down 2D view' : 'Switch to 3D view'} onClick={() => setCamera3D(active => !active)}>{camera3D ? '2D VIEW' : '3D VIEW'}</button>
      {camera3D && <div className="camera-orbit-controls">
        <button aria-label="Rotate camera left" onClick={() => setCamera(current => ({ ...current, yaw: current.yaw - 10 }))}>↶</button>
        <label>PITCH <input aria-label="Camera pitch" type="range" min="20" max="70" value={camera.pitch} onChange={event => setCamera(current => ({ ...current, pitch: Number(event.target.value) }))} /></label>
        <button aria-label="Rotate camera right" onClick={() => setCamera(current => ({ ...current, yaw: current.yaw + 10 }))}>↷</button>
        <button className="camera-top-button" aria-label="Reset camera to top view" onClick={resetCamera}>TOP</button>
      </div>}
      {camera3D && <small>MIDDLE-DRAG TO ORBIT</small>}
    </div>
    <FleetSelectionHud state={state} ships={selectedShips} onUpgradeTitan={(unitId, upgradeId) => {
      const orbit = state.planets.find(planet => planet.orbitUnits.some(ship => ship.id === unitId));
      const fleet = state.fleets.find(candidate => candidate.unit.id === unitId);
      const planetId = orbit?.id ?? fleet?.originId;
      if (planetId) onUpgradeTitan?.(planetId, unitId, upgradeId);
    }} />
    {selectedYardIds.length > 0 && <div className="fleet-command-hint yard-command-hint">{selectedYardIds.length} SPACE YARD{selectedYardIds.length === 1 ? '' : 'S'} {selectedYardIds.length > 1 ? 'GROUPED' : 'INSPECTED'} <span>{selectedYardIds.length > 1 ? 'Each order builds once at every grouped yard' : 'Orders still auto-rotate · Shift-click another yard for grouped production'}</span></div>}
    <div className="map-key" role="region" aria-label="Planet ownership legend"><span className="player"><i className="key-dot player" /><b>YOUR EMPIRE</b><strong>{ownershipCounts.player}</strong></span><span className="enemy"><i className="key-dot enemy" /><b>RIVAL A</b><strong>{ownershipCounts.enemy}</strong></span>{state.additionalEmpires?.rival2 && <span className="rival2"><i className="key-dot rival2" /><b>RIVAL B</b><strong>{ownershipCounts.rival2}</strong></span>}{state.additionalEmpires?.rival3 && <span className="rival3"><i className="key-dot rival3" /><b>RIVAL C</b><strong>{ownershipCounts.rival3}</strong></span>}<span className="neutral"><i className="key-dot neutral" /><b>NEUTRAL</b><strong>{ownershipCounts.neutral}</strong></span></div>
  </main>;
}
