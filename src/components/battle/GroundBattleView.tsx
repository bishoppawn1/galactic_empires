import { useEffect, useRef, useState } from 'react';
import { UNITS, type GameState, type GroundBattle, type Unit } from '../../game';
import { GroundUnitImage } from '../shared/GroundUnitImage';

export function GroundBattleView({ state, battle, onFocus, onManeuver, onExit }: {
  state: GameState;
  battle: GroundBattle;
  onFocus: (planetId: string, targetId: string) => void;
  onManeuver: (planetId: string, unitIds: string[], battleX: number, battleY: number) => void;
  onExit: () => void;
}) {
  const planet = state.planets.find(p => p.id === battle.planetId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
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
  const combatant = (unit: Unit, index: number) => {
    const friendly = unit.faction === 'player';
    const selected = selectedUnitIds.includes(unit.id);
    return <button key={unit.id} type="button" aria-label={`${friendly ? 'Select' : 'Target'} ${UNITS[unit.kind].label} ${unit.id}`} aria-pressed={friendly ? selected : battle.focusTargetId === unit.id} className={`battle-unit ${unit.faction} ${unit.sourceBuildingId ? 'fortification' : ''} ${battle.focusTargetId === unit.id ? 'focused' : ''} ${selected ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); if (friendly) selectFriendly(unit, event.shiftKey); else onFocus(battle.planetId, unit.id); }} style={{ '--delay': `${index * .15}s`, '--battle-x': `${unit.battleX ?? (friendly ? 12 : 88)}%`, '--battle-y': `${unit.battleY ?? 50}%`, '--range-size': `${UNITS[unit.kind].range * 18}px` } as React.CSSProperties}><span className="range-ring" /><UnitCore unit={unit} /><small>{battle.focusTargetId === unit.id ? 'FOCUS TARGET' : selected ? 'SELECTED' : `${UNITS[unit.kind].label} · RNG ${UNITS[unit.kind].range} · ${UNITS[unit.kind].weapon.label}`}</small></button>;
  };
  return <div className="battlefield">
    <button className="back-arrow" onClick={onExit} aria-label="Return to galaxy">←</button>
    <div className="battle-hud"><small>GROUND ENGAGEMENT // {planet.name.toUpperCase()}</small><b>{battle.attackers.length} ATTACKERS <span>VS</span> {battle.defenders.length} DEFENDERS</b><p>Select friendly troops, Shift-click to form a group, then right-click the ground to move. Units automatically fire at hostiles in range.</p>{activeDefenses > 0 && <em>{activeDefenses} FORTIFIED DEFENSE{activeDefenses === 1 ? '' : 'S'} ONLINE</em>}</div>
    <div className="battle-scroll" ref={scrollRef} aria-label="Scrollable ground battlefield">
      <div className={`battle-canvas ${selectedUnits.length ? 'commanding-ground-units' : ''}`} onClick={() => setSelectedUnitIds([])} onContextMenu={event => {
        event.preventDefault();
        if (!selectedUnits.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const battleX = (event.clientX - rect.left) / rect.width * 100;
        const battleY = (event.clientY - rect.top) / rect.height * 100;
        onManeuver(battle.planetId, selectedUnits.map(unit => unit.id), battleX, battleY);
      }}>
        <div className="terrain-grid" />
        <svg className="battle-orders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{selectedUnits.filter(unit => typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number').map(unit => <g key={`order-${unit.id}`}><line x1={unit.battleX} y1={unit.battleY} x2={unit.battleTargetX} y2={unit.battleTargetY} /><circle cx={unit.battleTargetX} cy={unit.battleTargetY} r=".8" /></g>)}</svg>
        <svg className="battle-fire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{shots.map(({ unit, target, faction }) => <line key={unit.id} x1={unit.battleX} y1={unit.battleY} x2={target!.battleX} y2={target!.battleY} className={`${faction} weapon-${UNITS[unit.kind].weapon.effect}`} />)}</svg>
        <div className={`army attackers ${attackerFaction}`}>{battle.attackers.map(combatant)}</div>
        <div className="front-line"><i /><span>CONTESTED ZONE</span><i /></div>
        <div className={`army defenders ${defenderFaction}`}>{battle.defenders.map(combatant)}</div>
      </div>
    </div>
    <div className="battle-selection-status">{selectedUnits.length ? `${selectedUnits.length} UNIT${selectedUnits.length === 1 ? '' : 'S'} SELECTED · RIGHT-CLICK TO MOVE` : 'SELECT FRIENDLY TROOPS TO ISSUE ORDERS'}</div>
    <div className="battle-scale">2,600 × 1,600 TACTICAL ZONE <span>DRAG SCROLLBARS TO REPOSITION CAMERA</span></div>
    <div className="battle-help">← EXIT BATTLEFIELD <span>Battle continues while viewing the galaxy map · Troops hold manual destinations and engage targets in range</span></div>
  </div>;
}

function UnitCore({ unit }: { unit: Unit }) {
  return <div className="unit-core"><GroundUnitImage kind={unit.kind} /><div className="hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }} /></div><div className="shield"><i style={{ width: `${Math.max(0, unit.shields / unit.maxShields * 100)}%` }} /></div></div>;
}
