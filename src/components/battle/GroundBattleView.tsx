import { useEffect, useRef, useState } from 'react';
import { UNITS, type GameState, type GroundBattle, type Unit } from '../../game';
import { GroundUnitImage } from '../shared/GroundUnitImage';
import { WeaponFire } from '../shared/WeaponFire';

type SelectionBox = { left: number; top: number; width: number; height: number };
type DragSelection = {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  selectedAtStart: string[];
  moved: boolean;
};

export function GroundBattleView({ state, battle, onFocus, onManeuver, onExit }: {
  state: GameState;
  battle: GroundBattle;
  onFocus: (planetId: string, targetId: string) => void;
  onManeuver: (planetId: string, unitIds: string[], battleX: number, battleY: number) => void;
  onExit: () => void;
}) {
  const planet = state.planets.find(p => p.id === battle.planetId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSelectionRef = useRef<DragSelection | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox>();
  const allUnits = [...battle.attackers, ...battle.defenders];
  const selectedUnits = allUnits.filter(unit => unit.faction === 'player' && selectedUnitIds.includes(unit.id));
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left: 0, top: 320 });
    else { viewport.scrollLeft = 0; viewport.scrollTop = 320; }
  }, [battle.planetId]);
  useEffect(() => {
    const available = new Set(allUnits.filter(unit => unit.faction === 'player' && !unit.sourceBuildingId).map(unit => unit.id));
    setSelectedUnitIds(current => current.filter(id => available.has(id)));
  }, [battle.attackers.length, battle.defenders.length]);

  const nearest = (unit: Unit, enemies: Unit[], preferredId?: string) => enemies.find(enemy => enemy.id === preferredId) ?? enemies.reduce<Unit | undefined>((best, enemy) => !best || Math.hypot((enemy.battleX ?? 0) - (unit.battleX ?? 0), (enemy.battleY ?? 0) - (unit.battleY ?? 0)) < Math.hypot((best.battleX ?? 0) - (unit.battleX ?? 0), (best.battleY ?? 0) - (unit.battleY ?? 0)) ? enemy : best, undefined);
  const attackerFaction = battle.attackerFaction ?? battle.attackers[0]?.faction ?? 'player';
  const defenderFaction = battle.defenders[0]?.faction ?? (attackerFaction === 'player' ? 'enemy' : 'player');
  const activeDefenses = allUnits.filter(unit => unit.sourceBuildingId).length;
  const shots = [...battle.attackers.map(unit => ({ unit, target: nearest(unit, battle.defenders, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction })), ...battle.defenders.map(unit => ({ unit, target: nearest(unit, battle.attackers, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction }))].filter(({ unit, target }) => target && (typeof unit.weaponFlash !== 'number' || unit.weaponFlash > 0) && Math.hypot((target.battleX ?? 0) - (unit.battleX ?? 0), (target.battleY ?? 0) - (unit.battleY ?? 0)) <= UNITS[unit.kind].range);
  const selectFriendly = (unit: Unit, additive: boolean) => {
    if (unit.sourceBuildingId) return;
    setSelectedUnitIds(current => additive
      ? current.includes(unit.id) ? current.filter(id => id !== unit.id) : [...current, unit.id]
      : current.length === 1 && current[0] === unit.id ? [] : [unit.id]);
  };
  const selectionPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      width: rect.width,
      height: rect.height,
    };
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
    const selected = selectedUnitIds.includes(unit.id);
    const definition = UNITS[unit.kind];
    return <button key={unit.id} type="button" aria-label={`${friendly ? 'Select' : 'Target'} ${definition.label} ${unit.id}`} aria-pressed={friendly ? selected : battle.focusTargetId === unit.id} title={definition.ability ? `${definition.ability.label}: ${definition.ability.description}` : definition.description} className={`battle-unit ${unit.faction} ${unit.sourceBuildingId ? 'fortification' : ''} ${battle.focusTargetId === unit.id ? 'focused' : ''} ${selected ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } if (friendly) selectFriendly(unit, event.shiftKey); else onFocus(battle.planetId, unit.id); }} style={{ '--delay': `${index * .15}s`, '--battle-x': `${unit.battleX ?? (friendly ? 12 : 88)}%`, '--battle-y': `${unit.battleY ?? 50}%`, '--range-size': `${definition.range * 18}px` } as React.CSSProperties}><span className="range-ring" /><UnitCore unit={unit} /><small>{battle.focusTargetId === unit.id ? 'FOCUS TARGET' : selected ? 'SELECTED' : `${definition.label}${unit.corrodedFor ? ' · CORRODED' : ''}`}</small></button>;
  };
  return <div className="battlefield">
    <button className="back-arrow" onClick={onExit} aria-label="Return to galaxy">←</button>
    <div className="battle-hud"><small>GROUND ENGAGEMENT // {planet.name.toUpperCase()}</small><b>{battle.attackers.length} ATTACKERS <span>VS</span> {battle.defenders.length} DEFENDERS</b><p>Select friendly troops by dragging over them, then right-click the ground to move. Shift adds units; troops automatically fire in range.</p>{activeDefenses > 0 && <em>{activeDefenses} FORTIFIED DEFENSE{activeDefenses === 1 ? '' : 'S'} ONLINE</em>}</div>
    <div className="battle-scroll" ref={scrollRef} aria-label="Scrollable ground battlefield">
      <div className={`battle-canvas ${selectedUnits.length ? 'commanding-ground-units' : ''}`} onPointerDown={event => {
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
        const boxedIds = allUnits.filter(unit => unit.faction === 'player' && !unit.sourceBuildingId).filter(unit => {
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
        onManeuver(battle.planetId, selectedUnits.map(unit => unit.id), battleX, battleY);
      }}>
        <div className="terrain-grid" />
        {selectionBox && <div className="battle-selection-box" style={selectionBox} aria-hidden="true" />}
        <svg className="battle-orders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{selectedUnits.filter(unit => typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number').map(unit => <g key={`order-${unit.id}`}><line x1={unit.battleX} y1={unit.battleY} x2={unit.battleTargetX} y2={unit.battleTargetY} /><circle cx={unit.battleTargetX} cy={unit.battleTargetY} r=".8" /></g>)}</svg>
        <svg className="battle-fire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{shots.map(({ unit, target, faction }) => <WeaponFire key={unit.id} id={unit.id} x1={unit.battleX!} y1={unit.battleY!} x2={target!.battleX!} y2={target!.battleY!} effect={UNITS[unit.kind].weapon.effect} projectiles={UNITS[unit.kind].weapon.projectiles} faction={faction} size={1.8} />)}</svg>
        <div className={`army attackers ${attackerFaction}`}>{battle.attackers.map(combatant)}</div>
        <div className="front-line"><i /><span>CONTESTED ZONE</span><i /></div>
        <div className={`army defenders ${defenderFaction}`}>{battle.defenders.map(combatant)}</div>
      </div>
    </div>
    <div className="battle-selection-status">{selectedUnits.length ? `${selectedUnits.length} UNIT${selectedUnits.length === 1 ? '' : 'S'} SELECTED · RIGHT-CLICK TO MOVE` : 'DRAG-SELECT FRIENDLY TROOPS TO ISSUE ORDERS'}</div>
    <div className="battle-scale">2,600 × 1,600 TACTICAL ZONE <span>DRAG SCROLLBARS TO REPOSITION CAMERA</span></div>
    <div className="battle-help">← EXIT BATTLEFIELD <span>Battle continues while viewing the galaxy map · Troops hold manual destinations and engage targets in range</span></div>
  </div>;
}

function UnitCore({ unit }: { unit: Unit }) {
  return <div className="unit-core"><GroundUnitImage kind={unit.kind} /><div className="hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }} /></div><div className="shield"><i style={{ width: `${Math.max(0, unit.shields / unit.maxShields * 100)}%` }} /></div></div>;
}
