import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  GROUND_BATTLEFIELD_HEIGHT, GROUND_BATTLEFIELD_WIDTH, GROUND_UNIT_SIGHT_RANGE, UNITS,
  groundForestAtPosition, groundTerrainForPlanet,
  type GameState, type GroundBattle, type Unit,
} from '../../game';
import { GroundUnitImage } from '../shared/GroundUnitImage';
import { ShipImage } from '../shared/ShipImage';
import { GROUND_PROJECTILE_SIZE, WeaponFire } from '../shared/WeaponFire';

type SelectionBox = { left: number; top: number; width: number; height: number };
type DragSelection = {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  selectedAtStart: string[];
  moved: boolean;
};
type RecentManeuver = { time: number; battleX: number; battleY: number; selectionKey: string };

const GROUND_KEYBOARD_PAN_STEP = 24;
const FORCE_MOVE_DOUBLE_CLICK_MS = 500;
const FORCE_MOVE_SAME_SPOT_TOLERANCE = 1.5;
const MIN_GROUND_BATTLE_ZOOM = .04;
const MAX_GROUND_BATTLE_ZOOM = 1.25;

export const groundBattleFitZoom = (viewportWidth: number, viewportHeight: number) => Math.min(1, Math.max(
  MIN_GROUND_BATTLE_ZOOM,
  Math.floor(Math.min(viewportWidth / GROUND_BATTLEFIELD_WIDTH, viewportHeight / GROUND_BATTLEFIELD_HEIGHT) * 1000) / 1000,
));

export function GroundBattleView({ state, battle, onFocus, onManeuver, onHold, onExit }: {
  state: GameState;
  battle: GroundBattle;
  onFocus: (planetId: string, targetId: string) => void;
  onManeuver: (planetId: string, unitIds: string[], battleX: number, battleY: number, forceMove: boolean) => void;
  onHold: (planetId: string, unitIds: string[]) => void;
  onExit: () => void;
}) {
  const planet = state.planets.find(p => p.id === battle.planetId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pressedPanKeysRef = useRef(new Set<string>());
  const dragSelectionRef = useRef<DragSelection | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const recentManeuverRef = useRef<RecentManeuver | undefined>(undefined);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const selectedUnitIdsRef = useRef(selectedUnitIds);
  const onHoldRef = useRef(onHold);
  selectedUnitIdsRef.current = selectedUnitIds;
  onHoldRef.current = onHold;
  const [selectionBox, setSelectionBox] = useState<SelectionBox>();
  const [fitZoom, setFitZoom] = useState(.2);
  const [battleZoom, setBattleZoom] = useState(.2);
  const allUnits = [...battle.attackers, ...battle.defenders];
  const selectedUnits = allUnits.filter(unit => unit.faction === 'player' && !unit.landedTransport && selectedUnitIds.includes(unit.id));
  const fitBattlefield = () => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const nextFit = groundBattleFitZoom(viewport.clientWidth || window.innerWidth, viewport.clientHeight || window.innerHeight);
    setFitZoom(nextFit);
    setBattleZoom(nextFit);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };
  useLayoutEffect(() => {
    fitBattlefield();
    window.addEventListener('resize', fitBattlefield);
    return () => window.removeEventListener('resize', fitBattlefield);
  }, [battle.planetId]);
  useEffect(() => {
    const panKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    const panFromPressedKeys = () => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const keys = pressedPanKeysRef.current;
      const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const y = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
      if (!x && !y) return;
      const magnitude = Math.max(1, Math.hypot(x, y));
      viewport.scrollLeft += x / magnitude * GROUND_KEYBOARD_PAN_STEP;
      viewport.scrollTop += y / magnitude * GROUND_KEYBOARD_PAN_STEP;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'KeyH') {
        const unitIds = selectedUnitIdsRef.current;
        if (!unitIds.length) return;
        event.preventDefault();
        if (!event.repeat) onHoldRef.current(battle.planetId, unitIds);
        return;
      }
      if (!panKeys.has(event.code)) return;
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
    const timer = window.setInterval(panFromPressedKeys, 16);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearPanKeys);
    };
  }, [battle.planetId]);
  useEffect(() => {
    const available = new Set(allUnits.filter(unit => unit.faction === 'player' && !unit.sourceBuildingId && !unit.landedTransport).map(unit => unit.id));
    setSelectedUnitIds(current => current.filter(id => available.has(id)));
  }, [battle.attackers.length, battle.defenders.length]);

  const nearest = (unit: Unit, enemies: Unit[], preferredId?: string) => enemies.find(enemy => enemy.id === preferredId) ?? enemies.reduce<Unit | undefined>((best, enemy) => !best || Math.hypot((enemy.battleX ?? 0) - (unit.battleX ?? 0), (enemy.battleY ?? 0) - (unit.battleY ?? 0)) < Math.hypot((best.battleX ?? 0) - (unit.battleX ?? 0), (best.battleY ?? 0) - (unit.battleY ?? 0)) ? enemy : best, undefined);
  const attackerFaction = battle.attackerFaction ?? battle.attackers[0]?.faction ?? 'player';
  const defenderFaction = battle.defenders[0]?.faction ?? (attackerFaction === 'player' ? 'enemy' : 'player');
  const terrain = useMemo(() => groundTerrainForPlanet(battle.planetId), [battle.planetId]);
  const friendlyUnits = allUnits.filter(unit => unit.faction === 'player');
  const visibleToPlayer = (unit: Unit) => unit.faction === 'player' || friendlyUnits.some(observer =>
    Math.hypot((unit.battleX ?? 0) - (observer.battleX ?? 0), (unit.battleY ?? 0) - (observer.battleY ?? 0))
      <= Math.max(GROUND_UNIT_SIGHT_RANGE, UNITS[observer.kind].range));
  const visibleHostiles = allUnits.filter(unit => unit.faction !== 'player' && visibleToPlayer(unit));
  const activeDefenses = allUnits.filter(unit => unit.sourceBuildingId && visibleToPlayer(unit)).length;
  const fogMaskId = `ground-fog-${battle.planetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const playerShips = planet.orbitUnits.filter(unit => unit.faction === 'player');
  const playerOrbitalSupport = allUnits.some(unit => unit.faction === 'player') && playerShips.length > 0
    && !planet.orbitUnits.some(unit => unit.faction !== 'player' && unit.faction !== 'neutral');
  const shots = [...battle.attackers.map(unit => ({ unit, target: nearest(unit, battle.defenders, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction })), ...battle.defenders.map(unit => ({ unit, target: nearest(unit, battle.attackers, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction }))].filter(({ unit, target }) => !unit.landedTransport && target && visibleToPlayer(unit) && visibleToPlayer(target) && (typeof unit.weaponFlash !== 'number' || unit.weaponFlash > 0) && Math.hypot((target.battleX ?? 0) - (unit.battleX ?? 0), (target.battleY ?? 0) - (unit.battleY ?? 0)) <= UNITS[unit.kind].range);
  const selectFriendly = (unit: Unit, additive: boolean) => {
    if (unit.sourceBuildingId || unit.landedTransport) return;
    setSelectedUnitIds(current => additive
      ? current.includes(unit.id) ? current.filter(id => id !== unit.id) : [...current, unit.id]
      : current.length === 1 && current[0] === unit.id ? [] : [unit.id]);
  };
  const selectionPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const logicalWidth = rect.width / battleZoom;
    const logicalHeight = rect.height / battleZoom;
    return {
      x: Math.max(0, Math.min(logicalWidth, (event.clientX - rect.left) / battleZoom)),
      y: Math.max(0, Math.min(logicalHeight, (event.clientY - rect.top) / battleZoom)),
      width: logicalWidth,
      height: logicalHeight,
    };
  };
  const changeBattleZoom = (requested: number) => {
    const next = Math.min(MAX_GROUND_BATTLE_ZOOM, Math.max(fitZoom, Math.round(requested * 1000) / 1000));
    const viewport = scrollRef.current;
    if (!viewport || next === battleZoom) return;
    const anchorX = viewport.clientWidth / 2;
    const anchorY = viewport.clientHeight / 2;
    const logicalX = (viewport.scrollLeft + anchorX) / battleZoom;
    const logicalY = (viewport.scrollTop + anchorY) / battleZoom;
    setBattleZoom(next);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = logicalX * next - anchorX;
      viewport.scrollTop = logicalY * next - anchorY;
    });
  };
  const finishDragSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragSelectionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      event.preventDefault();
      suppressClickRef.current = true;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragSelectionRef.current = undefined;
    setSelectionBox(undefined);
  };
  const combatant = (unit: Unit, index: number) => {
    const friendly = unit.faction === 'player';
    const selectable = friendly && !unit.sourceBuildingId && !unit.landedTransport;
    const selected = selectedUnitIds.includes(unit.id);
    const definition = UNITS[unit.kind];
    const action = selectable ? 'Select' : friendly ? 'Landed' : 'Target';
    const inForest = groundForestAtPosition(battle.planetId, { battleX: unit.battleX ?? 0, battleY: unit.battleY ?? 0 });
    const title = unit.landedTransport ? 'Stationary landed transport · cannot attack or receive movement orders' : definition.ability ? `${definition.ability.label}: ${definition.ability.description}` : definition.description;
    return <button key={unit.id} type="button" aria-label={`${action} ${definition.label} ${unit.id}`} aria-pressed={selectable ? selected : !friendly ? battle.focusTargetId === unit.id : undefined} title={`${title}${inForest ? ' · Forest cover reduces incoming damage by 30%' : ''}`} className={`battle-unit ${unit.faction} ${unit.sourceBuildingId ? 'fortification' : ''} ${unit.landedTransport ? 'grounded-transport' : ''} ${inForest ? 'in-forest' : ''} ${unit.battleHoldPosition ? 'holding' : ''} ${battle.focusTargetId === unit.id ? 'focused' : ''} ${selected ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } if (friendly) selectFriendly(unit, event.shiftKey); else onFocus(battle.planetId, unit.id); }} style={{ '--delay': `${index * .15}s`, '--battle-x': `${unit.battleX ?? (friendly ? 12 : 88)}%`, '--battle-y': `${unit.battleY ?? 50}%`, '--range-size': `${definition.range * 18}px` } as React.CSSProperties}>{!unit.landedTransport && <span className="range-ring" />}<UnitCore unit={unit} /><small>{battle.focusTargetId === unit.id ? 'FOCUS TARGET' : selected ? `SELECTED${inForest ? ' · COVER' : ''}${unit.battleHoldPosition ? ' · HOLDING' : ''}` : `${unit.landedTransport ? `${definition.label} · LANDED` : definition.label}${inForest ? ' · COVER' : ''}${unit.corrodedFor ? ' · CORRODED' : ''}${unit.battleHoldPosition ? ' · HOLDING' : ''}`}</small></button>;
  };
  return <div className="battlefield">
    <button className="back-arrow" onClick={onExit} aria-label="Return to galaxy">←</button>
    <div className="battle-hud"><small>GROUND ENGAGEMENT // {planet.name.toUpperCase()}</small><b>{friendlyUnits.length} FRIENDLY <span>VS</span> {visibleHostiles.length} CONTACT{visibleHostiles.length === 1 ? '' : 'S'}</b><p>Right-click to attack-move · double right-click to force movement · H to hold. Rocks block movement · Forests grant 30% cover · Sight reveals contacts.</p>{playerOrbitalSupport && <em>{playerShips.length} SHIP{playerShips.length === 1 ? '' : 'S'} PROVIDING ORBITAL FIRE · {playerShips.length} DAMAGE/S</em>}{activeDefenses > 0 && <em>{activeDefenses} FORTIFIED DEFENSE{activeDefenses === 1 ? '' : 'S'} ONLINE</em>}</div>
    <div className="battle-scroll" ref={scrollRef} aria-label="Scrollable ground battlefield">
      <div className="battle-stage" style={{ width: `${GROUND_BATTLEFIELD_WIDTH * battleZoom}px`, height: `${GROUND_BATTLEFIELD_HEIGHT * battleZoom}px` }}>
      <div className={`battle-canvas ${selectedUnits.length ? 'commanding-ground-units' : ''}`} style={{ '--battlefield-width': `${GROUND_BATTLEFIELD_WIDTH}px`, '--battlefield-height': `${GROUND_BATTLEFIELD_HEIGHT}px`, transform: `scale(${battleZoom})` } as React.CSSProperties} onPointerDown={event => {
        if (event.button !== 0) return;
        const point = selectionPoint(event);
        dragSelectionRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y, additive: event.shiftKey, selectedAtStart: selectedUnitIds, moved: false };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }} onPointerMove={event => {
        const drag = dragSelectionRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const point = selectionPoint(event);
        if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < 5) return;
        drag.moved = true;
        event.preventDefault();
        const left = Math.min(drag.startX, point.x);
        const top = Math.min(drag.startY, point.y);
        const width = Math.abs(point.x - drag.startX);
        const height = Math.abs(point.y - drag.startY);
        const boxedIds = allUnits.filter(unit => unit.faction === 'player' && !unit.sourceBuildingId && !unit.landedTransport).filter(unit => {
          const x = (unit.battleX ?? 12) / 100 * point.width;
          const y = (unit.battleY ?? 50) / 100 * point.height;
          return x >= left && x <= left + width && y >= top && y <= top + height;
        }).map(unit => unit.id);
        setSelectionBox({ left, top, width, height });
        setSelectedUnitIds(drag.additive ? [...new Set([...drag.selectedAtStart, ...boxedIds])] : boxedIds);
      }} onPointerUp={finishDragSelection} onPointerCancel={finishDragSelection} onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        setSelectedUnitIds([]);
      }} onContextMenu={event => {
        event.preventDefault();
        if (!selectedUnits.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const battleX = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
        const battleY = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
        const unitIds = selectedUnits.map(unit => unit.id);
        const selectionKey = [...unitIds].sort().join(':');
        const now = performance.now();
        const previous = recentManeuverRef.current;
        const forceMove = !!previous
          && now - previous.time <= FORCE_MOVE_DOUBLE_CLICK_MS
          && previous.selectionKey === selectionKey
          && Math.hypot(previous.battleX - battleX, previous.battleY - battleY) <= FORCE_MOVE_SAME_SPOT_TOLERANCE;
        recentManeuverRef.current = { time: now, battleX, battleY, selectionKey };
        onManeuver(battle.planetId, unitIds, battleX, battleY, forceMove);
      }}>
        <div className="terrain-grid" />
        <div className="battle-terrain-layer" aria-hidden="true">{terrain.map((piece, index) => <i key={`${piece.kind}-${index}`} className={`battle-terrain terrain-${piece.kind}`} style={{ '--terrain-x': `${piece.x}%`, '--terrain-y': `${piece.y}%`, '--terrain-size': `${piece.size}px`, '--terrain-rotation': `${piece.rotation}deg` } as React.CSSProperties} />)}</div>
        {selectionBox && <div className="battle-selection-box" style={selectionBox} aria-hidden="true" />}
        <svg className="battle-orders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{selectedUnits.filter(unit => typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number').map(unit => <g key={`order-${unit.id}`}><line x1={unit.battleX} y1={unit.battleY} x2={unit.battleTargetX} y2={unit.battleTargetY} /><circle cx={unit.battleTargetX} cy={unit.battleTargetY} r=".8" /></g>)}</svg>
        <svg className="battle-fire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{shots.map(({ unit, target, faction }) => <WeaponFire key={unit.id} id={unit.id} x1={unit.battleX!} y1={unit.battleY!} x2={target!.battleX!} y2={target!.battleY!} effect={UNITS[unit.kind].weapon.effect} projectiles={UNITS[unit.kind].weapon.projectiles} faction={faction} size={GROUND_PROJECTILE_SIZE} />)}</svg>
        <div className={`army attackers ${attackerFaction}`}>{battle.attackers.filter(visibleToPlayer).map(combatant)}</div>
        <div className="front-line"><i /><span>CONTESTED ZONE</span><i /></div>
        <div className={`army defenders ${defenderFaction}`}>{battle.defenders.filter(visibleToPlayer).map(combatant)}</div>
        <div className="forest-canopy-layer" aria-hidden="true">{terrain.filter(piece => piece.kind === 'forest').map((piece, index) => <i key={`forest-canopy-${index}`} className="terrain-forest forest-canopy" style={{ '--terrain-x': `${piece.x}%`, '--terrain-y': `${piece.y}%`, '--terrain-size': `${piece.size}px`, '--terrain-rotation': `${piece.rotation}deg` } as React.CSSProperties} />)}</div>
        <svg className="ground-fog" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><mask id={fogMaskId} maskUnits="userSpaceOnUse"><rect width="100" height="100" fill="white" />{friendlyUnits.map(unit => <circle key={`sight-${unit.id}`} cx={unit.battleX ?? 0} cy={unit.battleY ?? 0} r={Math.max(GROUND_UNIT_SIGHT_RANGE, UNITS[unit.kind].range)} fill="black" />)}</mask></defs>
          <rect width="100" height="100" mask={`url(#${fogMaskId})`} />
        </svg>
      </div>
      </div>
    </div>
    <div className="battle-camera-controls" role="group" aria-label="Ground map controls"><span>WASD PAN</span><button onClick={() => changeBattleZoom(battleZoom / 1.2)} aria-label="Ground zoom out">−</button><output>{Math.round(battleZoom * 100)}%</output><button onClick={() => changeBattleZoom(battleZoom * 1.2)} aria-label="Ground zoom in">+</button><button onClick={fitBattlefield} aria-label="Fit ground map">FIT</button></div>
    <div className="battle-selection-status">{selectedUnits.length ? `${selectedUnits.length} UNIT${selectedUnits.length === 1 ? '' : 'S'} SELECTED · H HOLD · DOUBLE RIGHT-CLICK FORCE MOVE` : 'DRAG-SELECT FRIENDLY TROOPS TO ISSUE ORDERS'}</div>
    <div className="battle-scale">{GROUND_BATTLEFIELD_WIDTH.toLocaleString()} × {GROUND_BATTLEFIELD_HEIGHT.toLocaleString()} TACTICAL ZONE <span>WASD PAN · +/− ZOOM · FIT FOR WHOLE MAP</span></div>
    <div className="battle-help">← EXIT BATTLEFIELD <span>Units retaliate when attacked · hold-position units fire without chasing</span></div>
  </div>;
}

function UnitCore({ unit }: { unit: Unit }) {
  return <div className="unit-core">{unit.landedTransport ? <ShipImage kind={unit.kind} className="landed-transport-image" /> : <GroundUnitImage kind={unit.kind} />}<div className="hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }} /></div><div className="shield"><i style={{ width: `${Math.max(0, unit.shields / unit.maxShields * 100)}%` }} /></div></div>;
}
