import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { UNITS, type GameState } from '../../game';
import { fleetMapPosition, shipMapPosition } from './geometry';

export const SHIP_EXPLOSION_DURATION_MS = 900;

interface ShipSnapshot {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface ShipExplosion extends ShipSnapshot {
  effectId: number;
}

const playerShipSnapshots = (state: GameState) => {
  const snapshots = new Map<string, ShipSnapshot>();
  state.planets.forEach(planet => planet.orbitUnits.forEach((ship, index) => {
    if (ship.faction !== 'player') return;
    const position = shipMapPosition(planet, ship, index);
    snapshots.set(ship.id, { id: ship.id, label: UNITS[ship.kind].label, ...position });
  }));
  state.fleets.forEach((fleet, index) => {
    if (fleet.faction !== 'player') return;
    const position = fleetMapPosition(fleet, state.planets);
    snapshots.set(fleet.unit.id, {
      id: fleet.unit.id,
      label: UNITS[fleet.unit.kind].label,
      x: position.x + index % 4 * 18,
      y: position.y + Math.floor(index / 4) * 18,
    });
  });
  return snapshots;
};

const allShipIds = (state: GameState) => new Set([
  ...state.planets.flatMap(planet => planet.orbitUnits.map(ship => ship.id)),
  ...state.fleets.map(fleet => fleet.unit.id),
]);

export function ShipExplosionLayer({ state }: { state: GameState }) {
  const previousRef = useRef<{ elapsed: number; ships: Map<string, ShipSnapshot> } | undefined>(undefined);
  const nextEffectIdRef = useRef(1);
  const expiryTimersRef = useRef(new Map<number, number>());
  const [explosions, setExplosions] = useState<ShipExplosion[]>([]);

  useEffect(() => {
    const ships = playerShipSnapshots(state);
    const previous = previousRef.current;
    if (previous && state.elapsed > previous.elapsed) {
      const survivingIds = allShipIds(state);
      const destroyed = [...previous.ships.values()].filter(ship => !survivingIds.has(ship.id));
      if (destroyed.length) {
        const effects = destroyed.map(ship => ({ ...ship, effectId: nextEffectIdRef.current++ }));
        setExplosions(current => [...current, ...effects]);
        effects.forEach(effect => {
          const timer = window.setTimeout(() => {
            setExplosions(current => current.filter(candidate => candidate.effectId !== effect.effectId));
            expiryTimersRef.current.delete(effect.effectId);
          }, SHIP_EXPLOSION_DURATION_MS);
          expiryTimersRef.current.set(effect.effectId, timer);
        });
      }
    }
    previousRef.current = { elapsed: state.elapsed, ships };
  }, [state]);

  useEffect(() => () => {
    expiryTimersRef.current.forEach(timer => window.clearTimeout(timer));
    expiryTimersRef.current.clear();
  }, []);

  return <div className="ship-explosion-layer" aria-live="polite">
    {explosions.map(explosion => <div key={explosion.effectId} className="ship-explosion" role="img" aria-label={`${explosion.label} destroyed`} style={{ left: explosion.x, top: explosion.y }}>
      <i className="ship-explosion-core" aria-hidden="true" />
      {Array.from({ length: 8 }, (_, index) => <i key={index} className="ship-explosion-debris" aria-hidden="true" style={{
        '--explosion-angle': `${index * 45}deg`,
        '--explosion-distance': `${24 + index % 3 * 6}px`,
      } as CSSProperties} />)}
    </div>)}
  </div>;
}
