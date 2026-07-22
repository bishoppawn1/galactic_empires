import {
  BUILDINGS, BUILDING_KINDS, LANDING_APPROACH_SPEED, UNITS,
  BROOD_BIOMASS_PER_PLANET, carrierFighterCount, empireCivilization, formatFactionCost, groundProductionMultiplier, hasUnlimitedBuildingCapacity, spaceProductionMultiplier, spaceYards,
  groundUnitKindsForCivilization, spaceUnitKindsForCivilization,
  type BuildingKind, type GameCommand, type GameState, type Planet, type QueueItem, type Unit, type UnitKind,
} from '../../game';
import type { PlanetTab, ProductionFocus } from '../../app/types';
import { buildingIcon, factionName, fleetPhaseLabel, planetDisplayColor } from '../shared/presentation';
import { GroundUnitImage } from '../shared/GroundUnitImage';
import { ShipImage, isSpaceUnit } from '../shared/ShipImage';

export function PlanetPanel({ state, planet, tab, setTab, productionFocus, selectedYardIds, act, onBattle }: {
  state: GameState; planet: Planet; tab: PlanetTab; setTab: (tab: PlanetTab) => void; productionFocus?: ProductionFocus; selectedYardIds: string[]; act: (command: GameCommand) => void; onBattle: () => void;
}) {
  return <aside className="panel">
    <header className="planet-header">
      <div className="mini-planet" style={{ '--planet': planetDisplayColor(planet) } as React.CSSProperties} />
      <div><small>{factionName(planet.owner)} // {planet.id.toUpperCase()}</small><h1>{planet.name}</h1><p>{planet.owner === 'player' ? 'Player-controlled world' : planet.owner ? 'Rival-controlled world' : 'Unclaimed frontier world'}</p></div>
    </header>
    {state.battles.some(b => b.planetId === planet.id) && <button className="battle-alert" onClick={onBattle}><span>⚔</span><b>GROUND BATTLE ACTIVE</b><small>Enter battlefield →</small></button>}
    <nav className="tabs" aria-label="Planet sections">
      {(['command', 'construction', 'forces'] as PlanetTab[]).map(section => <button key={section} className={tab === section ? 'active' : ''} onClick={() => setTab(section)}>{section}</button>)}
    </nav>
    <div className="panel-scroll">
      {tab === 'command' && <Command state={state} planet={planet} />}
      {tab === 'construction' && <Construction state={state} planet={planet} act={act} />}
      {tab === 'forces' && <Forces state={state} planet={planet} focus={productionFocus} selectedYardIds={selectedYardIds} act={act} />}
    </div>
  </aside>;
}

function Command({ state, planet }: { state: GameState; planet: Planet }) {
  const activeQueues = planet.groundQueue.length + spaceYards(planet).reduce((sum, yard) => sum + (yard.spaceQueue?.length ?? 0), 0);
  const brood = empireCivilization(state) === 'brood';
  return <section>
    <SectionTitle kicker="PLANETARY COMMAND" title="Colony overview" />
    <div className="stat-grid">
      <Stat label="Structures" value={planet.buildings.length} /><Stat label="Ground forces" value={planet.groundUnits.length} />
      <Stat label="Ships in orbit" value={planet.orbitUnits.length} /><Stat label="Active queues" value={activeQueues} />
    </div>
    <h3>{brood ? 'Living planetary yield' : 'Unlimited resource output'}</h3>
    {brood ? <div className="deposit biomass"><span>biomass</span><div><i style={{ width: '100%' }} /></div><b>{planet.owner === 'player' ? `+${BROOD_BIOMASS_PER_PLANET}/s` : 'DORMANT'} · ∞</b></div> : (['metal', 'crystal', 'gold'] as const).map(resource => {
      const kind = `${resource}Mine` as BuildingKind;
      const count = planet.buildings.filter(building => building.kind === kind).length;
      const maximum = planet.buildingLimits[kind];
      return <div className="deposit" key={resource}><span>{resource}</span><div><i style={{ width: `${count / maximum * 100}%` }} /></div><b>{count}/{maximum} · ∞</b></div>;
    })}
    {planet.owner !== 'player' && <div className="intel"><b>{planet.owner ? 'HOSTILE INTELLIGENCE' : 'NEUTRAL GARRISON'}</b><p>{planet.owner ? 'Select a transport in a friendly orbit, then click this planet. Squads embark and invade automatically.' : `${planet.groundUnits.length} independent defender${planet.groundUnits.length === 1 ? '' : 's'} detected. Land ground forces to secure this world.`}</p></div>}
  </section>;
}

function Construction({ state, planet, act }: { state: GameState; planet: Planet; act: (command: GameCommand) => void }) {
  if (planet.owner !== 'player') return <Locked text="Construction is only available on your colonies." />;
  const civilization = empireCivilization(state);
  const availableBuildings = civilization === 'brood' ? BUILDING_KINDS.filter(kind => !['metalMine', 'crystalMine', 'goldMine'].includes(kind)) : BUILDING_KINDS;
  return <section><SectionTitle kicker="PLANETARY INDUSTRY" title="Build structures" />
    <div className="card-list">
      {availableBuildings.map(kind => {
        const def = BUILDINGS[kind]; const count = planet.buildings.filter(building => building.kind === kind).length; const maximum = planet.buildingLimits[kind];
        const unlimited = hasUnlimitedBuildingCapacity(kind);
        const locked = !!def.requires && !state.completedResearch.includes(def.requires);
        return <article className={`build-card ${locked ? 'locked-card' : ''}`} key={kind}>
          <div className="building-icon">{buildingIcon(kind)}</div><div className="card-copy"><b>{def.label}</b><small>{def.description}</small><em>{count} / {unlimited ? '∞' : maximum} BUILT · {formatFactionCost(def.cost, civilization)}</em></div>
          <button disabled={locked || (!unlimited && count >= maximum)} onClick={() => act({ type: 'construct', planetId: planet.id, kind })}>{locked ? 'LOCKED' : !unlimited && count >= maximum ? 'MAX' : 'BUILD +1'}</button>
        </article>;
      })}
    </div>
  </section>;
}

const formatProductionSeconds = (seconds: number) => `${Number(seconds.toFixed(1))}s`;

function Queue({ items, speed = 1, showEmpty = false }: { items: QueueItem[]; speed?: number; showEmpty?: boolean }) {
  if (!items.length && !showEmpty) return null;
  return <div className="queue"><b>PRODUCTION QUEUE · {speed}× SPEED</b>{items.length ? items.map((item, index) => <div key={item.id}><span>{index + 1}. {UNITS[item.kind].label}</span><div><i style={{ width: `${100 * (1 - item.remaining / item.total)}%` }} /></div><em>{formatProductionSeconds(item.remaining / speed)}</em></div>) : <small>QUEUE EMPTY</small>}</div>;
}

function Forces({ state, planet, focus, selectedYardIds, act }: { state: GameState; planet: Planet; focus?: ProductionFocus; selectedYardIds: string[]; act: (command: GameCommand) => void }) {
  const civilization = empireCivilization(state);
  const groundKinds = groundUnitKindsForCivilization(civilization);
  const spaceKinds = spaceUnitKindsForCivilization(civilization);
  const groundSpeed = groundProductionMultiplier(planet, state.completedResearch);
  const spaceSpeed = spaceProductionMultiplier(state.completedResearch);
  const groundFactoryCount = planet.buildings.filter(building => building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory').length;
  const yards = spaceYards(planet);
  const selectedYards = yards.filter(yard => selectedYardIds.includes(yard.id));
  const groupedYards = selectedYards.length > 1 ? selectedYards : [];
  const hasAdvancedGroundFactory = planet.buildings.some(building => building.kind === 'advancedGroundFactory');
  const lockReason = (kind: UnitKind) => {
    const def = UNITS[kind];
    if (def.requires && !state.completedResearch.includes(def.requires)) return 'RESEARCH REQUIRED';
    if (def.factory === 'ground' && def.advancedFactory && !hasAdvancedGroundFactory) return 'ADVANCED FACTORY REQUIRED';
    if (def.factory === 'space' && def.advancedFactory) {
      const candidates = groupedYards.length ? groupedYards : yards.filter(yard => yard.kind === 'advancedSpaceFactory');
      if (!candidates.length || candidates.some(yard => yard.kind !== 'advancedSpaceFactory')) return 'ADVANCED YARD REQUIRED';
    }
    return undefined;
  };
  const groundProduction = <div className={`production-group ${focus === 'ground' ? 'focused' : ''}`}>
    <h3>Ground factories · {groundFactoryCount} online · {groundSpeed}× speed</h3>
    <div className="unit-grid">{groundKinds.map(kind => <UnitButton key={kind} kind={kind} faction={civilization} speed={groundSpeed} onClick={() => act({ type: 'queueUnit', planetId: planet.id, kind })} lockReason={lockReason(kind)} />)}</div><Queue items={planet.groundQueue} speed={groundSpeed} />
  </div>;
  const spaceProduction = <div className={`production-group ${focus === 'space' ? 'focused' : ''}`}>
    <h3>Space yards · {yards.length} online · {spaceSpeed}× speed · {groupedYards.length ? `${groupedYards.length} grouped override` : 'auto-distribution'}</h3>
    {focus === 'space' && <p className="production-link">ORBITAL NETWORK ACTIVE — {groupedYards.length ? `each order builds once at all ${groupedYards.length} grouped yards` : 'orders rotate across all compatible yards automatically'}.</p>}
    <div className="unit-grid">{spaceKinds.map(kind => <UnitButton key={kind} kind={kind} faction={civilization} speed={spaceSpeed} onClick={() => act({ type: 'queueUnit', planetId: planet.id, kind, yardIds: groupedYards.length ? groupedYards.map(yard => yard.id) : undefined })} lockReason={!yards.length ? 'SPACE YARD REQUIRED' : lockReason(kind)} />)}</div>
    <div className="yard-queue-list">{yards.map((yard, index) => <article className={`yard-queue-card ${selectedYardIds.includes(yard.id) ? 'selected' : ''}`} key={yard.id}><header><b>SPACE YARD {index + 1}</b><span>{yard.kind === 'advancedSpaceFactory' ? 'ADVANCED' : 'STANDARD'} · {(yard.spaceQueue?.length ?? 0) ? `${yard.spaceQueue!.length} QUEUED` : 'IDLE'}</span></header><Queue items={yard.spaceQueue ?? []} speed={spaceSpeed} showEmpty /></article>)}</div>
  </div>;
  return <section><SectionTitle kicker="FORCE COMMAND" title="Production & deployment" />
    {planet.owner === 'player' && <>{focus === 'space' ? <>{spaceProduction}{groundProduction}</> : <>{groundProduction}{spaceProduction}</>}</>}
    <h3>Deployed forces</h3>
    <div className="force-summary"><span>GROUND <b>{planet.groundUnits.length}</b></span><span>ORBIT <b>{planet.orbitUnits.length}</b></span></div>
    {planet.groundUnits.map(unit => <UnitRow key={unit.id} unit={unit} />)}{planet.orbitUnits.map(unit => <UnitRow key={unit.id} unit={unit} />)}
    {planet.orbitUnits.some(unit => unit.faction === 'player') && <div className="transport-order"><b>GRAVITY WELL CONTROL</b><small>Select a ship marker, then right-click inside this gravity well to maneuver over time. Right-click the planet center to dock and automatically embark squads, or right-click any reachable system to plot the shortest phase-lane route.</small></div>}
    {state.fleets.filter(fleet => (fleet.finalDestinationId ?? fleet.destinationId) === planet.id).map(fleet => <div className={`incoming ${fleet.phase ?? 'tunnel'}`} key={fleet.id}>{fleetPhaseLabel(fleet)} · {UNITS[fleet.unit.kind].label.toUpperCase()} <b>{Math.ceil(fleet.travelTime - fleet.progress)}s</b></div>)}
    {planet.orbitUnits.filter(unit => unit.pendingLanding).map(unit => <div className={`incoming landing-warning ${unit.faction}`} key={`landing-${unit.id}`}>{unit.faction === 'player' ? 'FRIENDLY' : 'HOSTILE'} {UNITS[unit.kind].label.toUpperCase()} LANDING APPROACH <b>{Math.ceil(Math.hypot(unit.orbitX ?? 0, unit.orbitY ?? 0) / LANDING_APPROACH_SPEED)}s TO PLANET</b></div>)}
    {planet.orbitUnits.filter(unit => unit.pendingEmbark).map(unit => <div className={`incoming landing-warning ${unit.faction}`} key={`embark-${unit.id}`}>{unit.faction === 'player' ? 'FRIENDLY' : 'HOSTILE'} {UNITS[unit.kind].label.toUpperCase()} EMBARKING <b>{Math.ceil(Math.hypot(unit.orbitX ?? 0, unit.orbitY ?? 0) / LANDING_APPROACH_SPEED)}s TO PLANET</b></div>)}
  </section>;
}

function UnitButton({ kind, faction, onClick, lockReason, speed = 1 }: { kind: UnitKind; faction: ReturnType<typeof empireCivilization>; onClick: () => void; lockReason?: string; speed?: number }) {
  const definition = UNITS[kind];
  const spaceUnit = isSpaceUnit(kind);
  const details = spaceUnit
    ? `${formatFactionCost(definition.cost, faction)} · ${formatProductionSeconds(definition.time! / speed)} · RNG ${definition.range} · ${definition.weapon.label} · ${definition.weapon.cooldown}s${definition.fighterWing ? ` · ${definition.fighterWing.capacity} FIGHTERS · ${definition.fighterWing.rebuildTime}s REBUILD` : ''}${definition.ability ? ` · ${definition.ability.label.toUpperCase()}` : ''}`
    : `${formatFactionCost(definition.cost, faction)} · ${formatProductionSeconds(definition.time! / speed)} · HP ${definition.hp} · RNG ${definition.range}${definition.ability ? ` · ${definition.ability.label.toUpperCase()}` : ''}`;
  return <button className="unit-button" onClick={onClick} disabled={!!lockReason}><span>{spaceUnit ? <ShipImage kind={kind} /> : <GroundUnitImage kind={kind} />}</span><b>{definition.label}</b><small>{lockReason ?? details}</small>{definition.ability && <em>{definition.ability.description}</em>}</button>;
}
function UnitRow({ unit }: { unit: Unit }) {
  const definition = UNITS[unit.kind];
  const spaceUnit = isSpaceUnit(unit.kind);
  const details = spaceUnit
    ? `${unit.faction.toUpperCase()} · ${definition.weapon.label} · ${definition.weapon.projectiles}× / ${definition.weapon.cooldown}s · RNG ${definition.range}${definition.fighterWing ? ` · FTR ${carrierFighterCount(unit)}/${definition.fighterWing.capacity}` : ''}${definition.ability ? ` · ${definition.ability.label}` : ''}`
    : `${unit.faction.toUpperCase()} · HP ${Math.ceil(unit.hp)}/${unit.maxHp} · SH ${Math.ceil(unit.shields)}/${unit.maxShields} · RNG ${definition.range}${definition.ability ? ` · ${definition.ability.label}` : ''}${unit.corrodedFor ? ' · CORRODED' : ''}`;
  return <div className="unit-row"><span>{spaceUnit ? <ShipImage kind={unit.kind} /> : <GroundUnitImage kind={unit.kind} />}</span><div><b>{definition.label}</b><small>{details}</small></div></div>;
}
function SectionTitle({ kicker, title }: { kicker: string; title: string }) { return <header className="section-title"><small>{kicker}</small><h2>{title}</h2></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="stat"><b>{value.toString().padStart(2, '0')}</b><small>{label}</small></div>; }
function Locked({ text }: { text: string }) { return <div className="locked"><span>⌾</span><p>{text}</p></div>; }
