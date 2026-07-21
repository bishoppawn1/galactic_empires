import { UNITS, type Unit } from '../../game';
import { ShipImage, isSpaceUnit } from '../shared/ShipImage';

const statusPercent = (value: number, maximum: number) => maximum > 0
  ? Math.min(100, Math.max(0, value / maximum * 100))
  : 0;

export function FleetSelectionHud({ ships }: { ships: Unit[] }) {
  if (!ships.length) return null;

  return <section className="fleet-selection-hud" aria-label="Selected ship status">
    <header>{ships.length} SHIP{ships.length === 1 ? '' : 'S'} SELECTED</header>
    <div className="fleet-selection-list">
      {ships.map(ship => {
        const label = UNITS[ship.kind].label;
        return <article className="selected-ship-card" role="group" aria-label={`${label} status`} title={label} key={ship.id}>
          <span className="selected-ship-icon" aria-hidden="true">{isSpaceUnit(ship.kind) && <ShipImage kind={ship.kind} />}</span>
          <div className="selected-ship-bars">
            <span className="selected-ship-health" role="meter" aria-label={`${label} hull`} aria-valuemin={0} aria-valuemax={ship.maxHp} aria-valuenow={Math.max(0, ship.hp)}>
              <i style={{ width: `${statusPercent(ship.hp, ship.maxHp)}%` }} />
            </span>
            <span className="selected-ship-shields" role="meter" aria-label={`${label} shields`} aria-valuemin={0} aria-valuemax={ship.maxShields} aria-valuenow={Math.max(0, ship.shields)}>
              <i style={{ width: `${statusPercent(ship.shields, ship.maxShields)}%` }} />
            </span>
          </div>
        </article>;
      })}
    </div>
    <small>Right-click to maneuver · Right-click any reachable system for the shortest route</small>
  </section>;
}
