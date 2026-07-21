import { useEffect, useRef } from 'react';
import { UNITS, type GameState, type GroundBattle, type Unit } from '../../game';
import { GroundUnitImage } from '../shared/GroundUnitImage';

export function GroundBattleView({ state, battle, onFocus, onExit }: { state: GameState; battle: GroundBattle; onFocus: (planetId: string, targetId: string) => void; onExit: () => void }) {
  const planet = state.planets.find(p => p.id === battle.planetId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left: 0, top: 320 });
    else { viewport.scrollLeft = 0; viewport.scrollTop = 320; }
  }, [battle.planetId]);
  const nearest = (unit: Unit, enemies: Unit[], preferredId?: string) => enemies.find(enemy => enemy.id === preferredId) ?? enemies.reduce<Unit | undefined>((best, enemy) => !best || Math.hypot((enemy.battleX ?? 0) - (unit.battleX ?? 0), (enemy.battleY ?? 0) - (unit.battleY ?? 0)) < Math.hypot((best.battleX ?? 0) - (unit.battleX ?? 0), (best.battleY ?? 0) - (unit.battleY ?? 0)) ? enemy : best, undefined);
  const attackerFaction = battle.attackerFaction ?? battle.attackers[0]?.faction ?? 'player';
  const defenderFaction = battle.defenders[0]?.faction ?? (attackerFaction === 'player' ? 'enemy' : 'player');
  const activeDefenses = [...battle.attackers, ...battle.defenders].filter(unit => unit.sourceBuildingId).length;
  const shots = [...battle.attackers.map(unit => ({ unit, target: nearest(unit, battle.defenders, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction })), ...battle.defenders.map(unit => ({ unit, target: nearest(unit, battle.attackers, unit.faction === 'player' ? battle.focusTargetId : undefined), faction: unit.faction }))].filter(({ unit, target }) => target && Math.hypot((target.battleX ?? 0) - (unit.battleX ?? 0), (target.battleY ?? 0) - (unit.battleY ?? 0)) <= UNITS[unit.kind].range);
  const combatant = (unit: Unit, index: number) => unit.faction !== 'player'
    ? <button key={unit.id} className={`battle-unit ${unit.faction} ${unit.sourceBuildingId ? 'fortification' : ''} ${battle.focusTargetId === unit.id ? 'focused' : ''}`} onClick={() => onFocus(battle.planetId, unit.id)} style={{ '--delay': `${index * .15}s`, '--battle-x': `${unit.battleX ?? 88}%`, '--battle-y': `${unit.battleY ?? 50}%`, '--range-size': `${UNITS[unit.kind].range * 18}px` } as React.CSSProperties}><span className="range-ring" /><UnitCore unit={unit} /><small>{battle.focusTargetId === unit.id ? 'FOCUS TARGET' : `${UNITS[unit.kind].label} · RNG ${UNITS[unit.kind].range}`}</small></button>
    : <BattleUnit key={unit.id} unit={unit} index={index} />;
  return <div className="battlefield">
    <button className="back-arrow" onClick={onExit} aria-label="Return to galaxy">←</button>
    <div className="battle-hud"><small>GROUND ENGAGEMENT // {planet.name.toUpperCase()}</small><b>{battle.attackers.length} ATTACKERS <span>VS</span> {battle.defenders.length} DEFENDERS</b><p>Units advance automatically, hold at weapon range, and fire. Select an enemy to focus allied targeting.</p>{activeDefenses > 0 && <em>{activeDefenses} FORTIFIED DEFENSE{activeDefenses === 1 ? '' : 'S'} ONLINE</em>}</div>
    <div className="battle-scroll" ref={scrollRef} aria-label="Scrollable ground battlefield">
      <div className="battle-canvas">
        <div className="terrain-grid" />
        <svg className="battle-fire" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{shots.map(({ unit, target, faction }) => <line key={unit.id} x1={unit.battleX} y1={unit.battleY} x2={target!.battleX} y2={target!.battleY} className={faction} />)}</svg>
        <div className={`army attackers ${attackerFaction}`}>{battle.attackers.map(combatant)}</div>
        <div className="front-line"><i /><span>CONTESTED ZONE</span><i /></div>
        <div className={`army defenders ${defenderFaction}`}>{battle.defenders.map(combatant)}</div>
      </div>
    </div>
    <div className="battle-scale">2,600 × 1,600 TACTICAL ZONE <span>DRAG SCROLLBARS TO REPOSITION CAMERA</span></div>
    <div className="battle-help">← EXIT BATTLEFIELD <span>Battle continues while viewing the galaxy map · Scroll to survey the full combat zone</span></div>
  </div>;
}

function BattleUnit({ unit, index }: { unit: Unit; index: number }) {
  return <div className={`battle-unit ${unit.sourceBuildingId ? 'fortification' : ''}`} style={{ '--delay': `${index * .15}s`, '--battle-x': `${unit.battleX ?? 12}%`, '--battle-y': `${unit.battleY ?? 50}%`, '--range-size': `${UNITS[unit.kind].range * 18}px` } as React.CSSProperties}><span className="range-ring" /><UnitCore unit={unit} /><small>{UNITS[unit.kind].label} · RNG {UNITS[unit.kind].range}</small></div>;
}

function UnitCore({ unit }: { unit: Unit }) {
  return <div className="unit-core"><GroundUnitImage kind={unit.kind} /><div className="hp"><i style={{ width: `${Math.max(0, unit.hp / unit.maxHp * 100)}%` }} /></div><div className="shield"><i style={{ width: `${Math.max(0, unit.shields / unit.maxShields * 100)}%` }} /></div></div>;
}
