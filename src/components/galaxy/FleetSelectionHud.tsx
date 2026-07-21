import { UNITS, type Unit } from '../../game';
import { ShipImage, isSpaceUnit } from '../shared/ShipImage';

const statusPercent = (value: number, maximum: number) => maximum > 0
  ? Math.min(100, Math.max(0, value / maximum * 100))
  : 0;

export function FleetSelectionHud({ ships }: { ships: Unit[] }) {
  if (!ships.length) return null;
  const controllable = ships.every(ship => ship.faction === 'player');

  return <section className={`fleet-selection-hud ${controllable ? '' : 'hostile-inspection'}`} aria-label={controllable ? 'Selected ship status' : 'Inspected hostile ship status'}>
    <header>{controllable ? `${ships.length} SHIP${ships.length === 1 ? '' : 'S'} SELECTED` : `HOSTILE SHIP${ships.length === 1 ? '' : 'S'} INSPECTED`}</header>
    <div className="fleet-selection-list">
      {ships.map(ship => {
        const definition = UNITS[ship.kind];
        const label = definition.label;
        const title = definition.ability ? `${label} — ${definition.ability.label}: ${definition.ability.description}` : label;
        return <article className={`selected-ship-card ${ship.faction}`} role="group" aria-label={`${label} status`} title={title} key={ship.id}>
          <span className="selected-ship-icon" aria-hidden="true">{isSpaceUnit(ship.kind) && <ShipImage kind={ship.kind} />}</span>
          <div className="selected-ship-bars">
            <span className="selected-ship-health" role="meter" aria-label={`${label} hull`} aria-valuemin={0} aria-valuemax={ship.maxHp} aria-valuenow={Math.max(0, ship.hp)} title={`Hull ${Math.ceil(ship.hp)} / ${ship.maxHp}`}>
              <i style={{ width: `${statusPercent(ship.hp, ship.maxHp)}%` }} />
            </span>
            <span className="selected-ship-shields" role="meter" aria-label={`${label} shields`} aria-valuemin={0} aria-valuemax={ship.maxShields} aria-valuenow={Math.max(0, ship.shields)} title={`Shields ${Math.ceil(ship.shields)} / ${ship.maxShields}`}>
              <i style={{ width: `${statusPercent(ship.shields, ship.maxShields)}%` }} />
            </span>
          </div>
        </article>;
      })}
    </div>
    <small>{controllable ? 'Right-click to maneuver · Right-click any reachable system for the shortest route' : 'HULL INTEGRITY · SHIELD STRENGTH'}</small>
  </section>;
}
