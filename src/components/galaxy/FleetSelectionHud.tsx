import {
  TITAN_UPGRADES, UNITS, biomassCost, canAfford, carrierFighterCount, empireCivilization,
  formatFactionCost, isTitanKind, titanUpgradeLevel, type GameState, type TitanUpgradeId, type Unit,
} from '../../game';
import { ShipImage, isSpaceUnit } from '../shared/ShipImage';

const statusPercent = (value: number, maximum: number) => maximum > 0
  ? Math.min(100, Math.max(0, value / maximum * 100))
  : 0;

export function FleetSelectionHud({ state, ships, onUpgradeTitan }: {
  state: GameState;
  ships: Unit[];
  onUpgradeTitan: (unitId: string, upgradeId: TitanUpgradeId) => void;
}) {
  if (!ships.length) return null;
  const controllable = ships.every(ship => ship.faction === 'player');
  const titan = controllable ? ships.find(ship => isTitanKind(ship.kind)) : undefined;
  const civilization = empireCivilization(state);

  return <section className={`fleet-selection-hud ${controllable ? '' : 'hostile-inspection'}`} aria-label={controllable ? 'Selected ship status' : 'Inspected hostile ship status'}>
    <header>{controllable ? `${ships.length} SHIP${ships.length === 1 ? '' : 'S'} SELECTED` : `HOSTILE SHIP${ships.length === 1 ? '' : 'S'} INSPECTED`}</header>
    <div className="fleet-selection-list">
      {ships.map(ship => {
        const definition = UNITS[ship.kind];
        const label = definition.label;
        const title = definition.ability ? `${label} — ${definition.ability.label}: ${definition.ability.description}` : label;
        return <article className={`selected-ship-card ${ship.faction}`} role="group" aria-label={`${label} status`} title={title} key={ship.id}>
          <span className="selected-ship-icon" aria-hidden="true">{isSpaceUnit(ship.kind) && <ShipImage kind={ship.kind} />}</span>
          {definition.fighterWing && <span className="selected-fighter-count" aria-label={`${definition.fighterWing.label} ${carrierFighterCount(ship)} of ${definition.fighterWing.capacity}`}>FTR {carrierFighterCount(ship)}/{definition.fighterWing.capacity}</span>}
          <div className="selected-ship-bars">
            <div className="selected-ship-status-row">
              <span className="selected-ship-health" role="meter" aria-label={`${label} hull`} aria-valuemin={0} aria-valuemax={ship.maxHp} aria-valuenow={Math.max(0, ship.hp)} title={`Hull ${Math.ceil(ship.hp)} / ${ship.maxHp}`}>
                <i style={{ width: `${statusPercent(ship.hp, ship.maxHp)}%` }} />
              </span>
              <span className="selected-ship-status-value" aria-label={`${label} hull value`}>{Math.ceil(Math.max(0, ship.hp))}/{ship.maxHp}</span>
            </div>
            <div className="selected-ship-status-row">
              <span className="selected-ship-shields" role="meter" aria-label={`${label} shields`} aria-valuemin={0} aria-valuemax={ship.maxShields} aria-valuenow={Math.max(0, ship.shields)} title={`Shields ${Math.ceil(ship.shields)} / ${ship.maxShields}`}>
                <i style={{ width: `${statusPercent(ship.shields, ship.maxShields)}%` }} />
              </span>
              <span className="selected-ship-status-value" aria-label={`${label} shield value`}>{Math.ceil(Math.max(0, ship.shields))}/{ship.maxShields}</span>
            </div>
          </div>
        </article>;
      })}
    </div>
    {titan && <div className="titan-refit">
      <div className="titan-refit-heading">
        <span><b>{UNITS[titan.kind].label}</b><em>{UNITS[titan.kind].ability?.label ?? 'APEX TITAN'}</em></span>
        <strong>TITAN UPGRADES</strong>
      </div>
      <div className="titan-upgrades">{(Object.keys(TITAN_UPGRADES) as TitanUpgradeId[]).map(id => {
        const level = titanUpgradeLevel(titan, id);
        const upgrade = TITAN_UPGRADES[id];
        const costLabel = formatFactionCost(upgrade.cost, civilization);
        const affordable = civilization === 'brood'
          ? (state.resources.biomass ?? 0) >= biomassCost(upgrade.cost)
          : canAfford(state.resources, upgrade.cost);
        return <button
          key={id}
          disabled={!affordable}
          onClick={() => onUpgradeTitan(titan.id, id)}
          aria-label={`Purchase ${upgrade.label} level ${level + 1} for ${costLabel}`}
        ><b>{upgrade.label}</b><span>{upgrade.description} · LEVEL {level}</span><em>{costLabel}</em></button>;
      })}</div>
    </div>}
    <small>{controllable ? 'Right-click to maneuver · Right-click any reachable system for the shortest route' : 'HULL INTEGRITY · SHIELD STRENGTH'}</small>
  </section>;
}
