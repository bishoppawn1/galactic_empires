import {
  BUILDINGS, BUILDING_KINDS, LANDING_APPROACH_SPEED, UNITS,
  ANCIENT_RELIC_DAMAGE_MULTIPLIER, ANCIENT_RELIC_ECONOMY_MULTIPLIER, BROOD_BIOMASS_PER_PLANET, STELLAR_HAZARD_DAMAGE_PER_SECOND, carrierFighterCount, empireCivilization, factionTitanStatus, formatFactionCost, groundProductionMultiplier, hasUnlimitedBuildingCapacity, isBuildingOperational, isColonizableWorld, isDefenseBuildingKind, isTitanKind, shipArmor, shipWeaponBatteries, spaceProductionMultiplier, spaceTierForUnit, spaceYardCanProduce, spaceYards, spaceYardTier, systemKind, visibleOrbitUnits,
  groundUnitKindsForCivilization, spaceUnitKindsForCivilization,
  type BuildingKind, type GameCommand, type GameState, type Planet, type QueueItem, type SpaceShipTier, type SpaceUnitKind, type Unit, type UnitKind,
} from '../../game';
import type { PlanetTab, ProductionFocus } from '../../app/types';
import { buildingIcon, factionName, fleetPhaseLabel, planetDisplayColor } from '../shared/presentation';
import { GroundUnitImage } from '../shared/GroundUnitImage';
import { ShipImage, isSpaceUnit } from '../shared/ShipImage';

export function PlanetPanel({ state, planet, tab, setTab, productionFocus, selectedYardIds, act, onBattle }: {
  state: GameState; planet: Planet; tab: PlanetTab; setTab: (tab: PlanetTab) => void; productionFocus?: ProductionFocus; selectedYardIds: string[]; act: (command: GameCommand) => void; onBattle: () => void;
}) {
  const kind = systemKind(planet);
  const world = isColonizableWorld(planet);
  const classification = kind === 'planet' ? (planet.owner === 'player' ? 'Player-controlled world' : planet.owner ? 'Rival-controlled world' : 'Unclaimed frontier world')
    : kind === 'nebula' ? 'Empty sensor-dark nebula'
      : kind === 'star' ? 'Unstable lethal star'
        : kind === 'pirateBase' ? (planet.owner === 'player' ? 'Player-controlled former pirate world' : planet.owner ? 'Rival-controlled former pirate world' : 'Pirate-occupied frontier world')
          : planet.owner ? `${factionName(planet.owner)} controls the relic` : 'Uncontrolled ancient relic';
  return <aside className="panel">
    <header className="planet-header">
      <div className={`mini-planet mini-${kind}`} style={{ '--planet': planetDisplayColor(planet) } as React.CSSProperties} />
      <div><small>{world ? `${planet.intelStatus === 'unscouted' ? 'UNSCOUTED' : factionName(planet.owner)} // ${planet.id.toUpperCase()}` : `${kind.replace(/([A-Z])/g, ' $1').toUpperCase()} // DEEP SPACE`}</small><h1>{planet.name}</h1><p>{world ? planet.intelStatus === 'unscouted' ? `Unverified ${kind === 'pirateBase' ? 'pirate world' : 'frontier world'}` : planet.intelStatus === 'stale' ? 'Last known reconnaissance' : classification : classification}</p></div>
    </header>
    {state.battles.some(b => b.planetId === planet.id) && <button className="battle-alert" onClick={onBattle}><span>⚔</span><b>GROUND BATTLE ACTIVE</b><small>Enter battlefield →</small></button>}
    <nav className="tabs" aria-label="Planet sections">
      {(['command', ...(world ? ['construction'] : []), 'forces'] as PlanetTab[]).map(section => <button key={section} className={tab === section ? 'active' : ''} onClick={() => setTab(section)}>{section}</button>)}
    </nav>
    <div className="panel-scroll">
      {tab === 'command' && <Command state={state} planet={planet} />}
      {tab === 'construction' && <Construction state={state} planet={planet} act={act} />}
      {tab === 'forces' && <Forces state={state} planet={planet} focus={productionFocus} selectedYardIds={selectedYardIds} act={act} />}
    </div>
  </aside>;
}

function Command({ state, planet }: { state: GameState; planet: Planet }) {
  const kind = systemKind(planet);
  if (kind !== 'planet' && kind !== 'pirateBase') {
    const data = kind === 'nebula'
      ? { kicker: 'NEBULA', title: 'Blind-space phenomenon', icon: '◌', text: 'There is no planet here and nothing can be built or landed. Long-range scans cannot reveal hostile ships inside; entering the cloud restores close-range contact.' }
      : kind === 'star'
        ? { kicker: 'STELLAR HAZARD', title: 'Unstable stellar furnace', icon: '☀', text: `There is no planet here. Radiation inflicts ${STELLAR_HAZARD_DAMAGE_PER_SECOND} damage per second on every ship in the system until it leaves or is destroyed.` }
        : { kicker: 'ANCIENT TEMPLE', title: 'Relic control site', icon: '◇', text: `There is no planet here. Hold this system uncontested to claim its relic: +${Math.round((ANCIENT_RELIC_ECONOMY_MULTIPLIER - 1) * 100)}% empire income and +${Math.round((ANCIENT_RELIC_DAMAGE_MULTIPLIER - 1) * 100)}% fleet damage while controlled.` };
    return <section className={`special-system-brief ${kind}`}><SectionTitle kicker={data.kicker} title={data.title} /><div className="special-system-icon">{data.icon}</div><p>{data.text}</p>{kind === 'ancientTemple' && <div className={`relic-control ${planet.owner ?? 'neutral'}`}><b>{planet.owner ? `${factionName(planet.owner)} CONTROLS THE RELIC` : 'RELIC UNCONTROLLED'}</b><small>{visibleOrbitUnits(planet).length} visible ship{visibleOrbitUnits(planet).length === 1 ? '' : 's'} in system</small></div>}</section>;
  }
  const pirateBrief = kind === 'pirateBase' ? <section className="special-system-brief pirateBase">
    <SectionTitle kicker="PIRATE WORLD" title={planet.owner ? 'Captured stronghold' : 'Static pirate garrison'} />
    <div className="special-system-icon">☠</div>
    <p>{planet.owner
      ? 'This conquered pirate world can be developed, defended, and used for production like any other colony.'
      : 'This is a habitable planet held by a 48-ship pirate armada and ground army. The garrison never builds units or receives reinforcements: clear its orbit, land troops, and conquer the surface to claim the world.'}</p>
  </section> : null;
  if (planet.intelStatus === 'unscouted') return <>{pirateBrief}<section><SectionTitle kicker="PLANETARY COMMAND" title="No reconnaissance data" /><Locked text="Bring one of your ships into this system to identify its controller, structures, and ground forces." /></section></>;
  const activeQueues = planet.groundQueue.length + spaceYards(planet).reduce((sum, yard) => sum + (yard.spaceQueue?.length ?? 0), 0);
  const brood = empireCivilization(state) === 'brood';
  return <>{pirateBrief}<section>
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
    {planet.intelStatus === 'stale' && <div className="intel"><b>LAST KNOWN INTELLIGENCE</b><p>Ownership, structures, and ground forces may have changed since your ships left this system.</p></div>}
    {planet.owner !== 'player' && planet.intelStatus !== 'stale' && <div className="intel"><b>{planet.owner ? 'HOSTILE INTELLIGENCE' : 'NEUTRAL GARRISON'}</b><p>{planet.owner ? 'Select a transport in a friendly orbit, then click this planet. Squads embark and invade automatically.' : `${planet.groundUnits.length} independent defender${planet.groundUnits.length === 1 ? '' : 's'} detected. Land ground forces to secure this world.`}</p></div>}
  </section></>;
}

function Construction({ state, planet, act }: { state: GameState; planet: Planet; act: (command: GameCommand) => void }) {
  if (planet.intelStatus === 'unscouted') return <Locked text="Construction data is unavailable until this system is scouted." />;
  if (!isColonizableWorld(planet)) return <Locked text="This system contains no planet to build on." />;
  if (planet.owner !== 'player') return <Locked text="Construction is only available on your colonies." />;
  const civilization = empireCivilization(state);
  const availableBuildings = civilization === 'brood' ? BUILDING_KINDS.filter(kind => !['metalMine', 'crystalMine', 'goldMine'].includes(kind)) : BUILDING_KINDS;
  return <section><SectionTitle kicker="PLANETARY INDUSTRY" title="Build structures" />
    <div className="card-list">
      {availableBuildings.map(kind => {
        const def = BUILDINGS[kind]; const count = planet.buildings.filter(building => building.kind === kind).length; const maximum = planet.buildingLimits[kind];
        const constructing = planet.buildings.filter(building => building.kind === kind && !isBuildingOperational(building));
        const operationalCount = count - constructing.length;
        const nextCompletion = constructing.length ? Math.min(...constructing.map(building => building.constructionRemaining!)) : 0;
        const rebuildCooldown = isDefenseBuildingKind(kind) ? planet.defenseRebuildCooldowns?.[kind] ?? 0 : 0;
        const unlimited = hasUnlimitedBuildingCapacity(kind);
        const locked = !!def.requires && !state.completedResearch.includes(def.requires);
        const atMaximum = !unlimited && count >= maximum;
        const disabled = locked || atMaximum || rebuildCooldown > 0;
        const status = constructing.length
          ? `${operationalCount} BUILT · ${constructing.length} BUILDING · ${formatProductionSeconds(nextCompletion)}`
          : `${count} / ${unlimited ? '∞' : maximum} BUILT`;
        return <article className={`build-card ${locked ? 'locked-card' : ''}`} key={kind}>
          <div className="building-icon">{buildingIcon(kind)}</div><div className="card-copy"><b>{def.label}</b><small>{def.description}</small><em>{status} · {formatFactionCost(def.cost, civilization)}{def.time ? ` · ${formatProductionSeconds(def.time)}` : ''}{rebuildCooldown > 0 ? ` · REBUILD LOCK ${formatProductionSeconds(rebuildCooldown)}` : ''}</em></div>
          <button disabled={disabled} onClick={() => act({ type: 'construct', planetId: planet.id, kind })}>{locked ? 'LOCKED' : rebuildCooldown > 0 ? `${formatProductionSeconds(rebuildCooldown)} LOCK` : atMaximum ? 'MAX' : 'BUILD +1'}</button>
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
  if (planet.intelStatus === 'unscouted') return <section><SectionTitle kicker="FORCE COMMAND" title="No force intelligence" /><Locked text="Bring one of your ships into this system to reveal deployed ground and orbital forces." /></section>;
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
  const visibleUnits = visibleOrbitUnits(planet);
  const lockReason = (kind: UnitKind) => {
    const def = UNITS[kind];
    if (def.requires && !state.completedResearch.includes(def.requires)) return 'RESEARCH REQUIRED';
    const titanStatus = isTitanKind(kind) ? factionTitanStatus(state, 'player') : undefined;
    if (titanStatus === 'under-construction') return 'TITAN ALREADY IN PRODUCTION';
    if (titanStatus === 'deployed') return 'TITAN ALREADY DEPLOYED';
    if (isTitanKind(kind) && groupedYards.length > 1) return 'SELECT ONE YARD FOR TITAN';
    if (def.factory === 'ground' && def.advancedFactory && !hasAdvancedGroundFactory) return 'ADVANCED FACTORY REQUIRED';
    if (def.factory === 'space') {
      const tier = spaceTierForUnit(kind)!;
      const candidates = groupedYards.length ? groupedYards : yards.filter(yard => spaceYardCanProduce(yard, kind));
      if (!candidates.length || candidates.some(yard => !spaceYardCanProduce(yard, kind))) {
        return tier === 1 ? 'TIER 1 SPACE YARD REQUIRED' : tier === 2 ? 'TIER 2 ADVANCED YARD REQUIRED' : 'TIER 3 EXPERIMENTAL YARD REQUIRED';
      }
    }
    return undefined;
  };
  const groundProduction = <div className={`production-group ${focus === 'ground' ? 'focused' : ''}`}>
    <h3>Ground factories · {groundFactoryCount} online · {groundSpeed}× speed</h3>
    <div className="unit-grid">{groundKinds.map(kind => <UnitButton key={kind} kind={kind} faction={civilization} speed={groundSpeed} onClick={() => act({ type: 'queueUnit', planetId: planet.id, kind })} lockReason={lockReason(kind)} />)}</div><Queue items={planet.groundQueue} speed={groundSpeed} />
  </div>;
  const spaceProduction = <div className={`production-group ${focus === 'space' ? 'focused' : ''}`}>
    <h3>Space yards · {yards.length} online · {spaceSpeed}× speed · {groupedYards.length ? `${groupedYards.length} grouped override` : 'auto-distribution'}</h3>
    {focus === 'space' && <p className="production-link">ORBITAL NETWORK ACTIVE — {groupedYards.length ? `grouped orders require every selected yard to match the hull tier` : 'orders rotate across yards of the matching tier; constructing another yard rebalances compatible waiting hulls'}.</p>}
    {([1, 2, 3] as SpaceShipTier[]).map(tier => <div className={`ship-tier tier-${tier}`} key={tier}>
      <h4>TIER {tier} · {tier === 1 ? 'FRIGATES & TRANSPORTS' : tier === 2 ? 'ADVANCED SHIPS' : 'SUPER CAPITALS'}</h4>
      <div className="unit-grid">{spaceKinds.filter(kind => spaceTierForUnit(kind) === tier).map(kind => <UnitButton key={kind} kind={kind} faction={civilization} speed={spaceSpeed} onClick={() => act({ type: 'queueUnit', planetId: planet.id, kind, yardIds: groupedYards.length ? groupedYards.map(yard => yard.id) : undefined })} lockReason={lockReason(kind)} />)}</div>
    </div>)}
    <div className="yard-queue-list">{yards.map((yard, index) => {
      const tier = spaceYardTier(yard)!;
      const label = tier === 1 ? 'STANDARD' : tier === 2 ? 'ADVANCED' : 'EXPERIMENTAL';
      return <article className={`yard-queue-card tier-${tier} ${selectedYardIds.includes(yard.id) ? 'selected' : ''}`} key={yard.id}><header><b>SPACE YARD {index + 1}</b><span>TIER {tier} · {label} · {(yard.spaceQueue?.length ?? 0) ? `${yard.spaceQueue!.length} QUEUED` : 'IDLE'}</span></header><Queue items={yard.spaceQueue ?? []} speed={spaceSpeed} showEmpty /></article>;
    })}</div>
  </div>;
  return <section><SectionTitle kicker="FORCE COMMAND" title="Production & deployment" />
    {planet.owner === 'player' && isColonizableWorld(planet) && <>{focus === 'space' ? <>{spaceProduction}{groundProduction}</> : <>{groundProduction}{spaceProduction}</>}</>}
    <h3>Deployed forces</h3>
    <div className="force-summary"><span>GROUND <b>{planet.groundUnits.length}</b></span><span>VISIBLE ORBIT <b>{visibleUnits.length}</b></span></div>
    {planet.groundUnits.map(unit => <UnitRow key={unit.id} unit={unit} />)}{visibleUnits.map(unit => <UnitRow key={unit.id} unit={unit} />)}
    {systemKind(planet) === 'nebula' && visibleUnits.length !== planet.orbitUnits.length && <div className="intel"><b>SENSOR CONTACT LOST</b><p>Hostile ships inside this nebula are hidden until one of your ships enters the system.</p></div>}
    {planet.orbitUnits.some(unit => unit.faction === 'player') && <div className="transport-order"><b>GRAVITY WELL CONTROL</b><small>{isColonizableWorld(planet) ? 'Select a ship marker, then right-click inside this gravity well to maneuver over time. Right-click the planet center to dock and automatically embark squads, or right-click any reachable system to plot the shortest phase-lane route.' : 'Select a ship marker, then right-click inside this system to maneuver. This location has no planetary surface, but any reachable system can still be right-clicked to plot the shortest phase-lane route.'}</small></div>}
    {state.fleets.filter(fleet => (fleet.finalDestinationId ?? fleet.destinationId) === planet.id).map(fleet => <div className={`incoming ${fleet.phase ?? 'tunnel'}`} key={fleet.id}>{fleetPhaseLabel(fleet)} · {UNITS[fleet.unit.kind].label.toUpperCase()} <b>{Math.ceil(fleet.travelTime - fleet.progress)}s</b></div>)}
    {planet.orbitUnits.filter(unit => unit.pendingLanding).map(unit => <div className={`incoming landing-warning ${unit.faction}`} key={`landing-${unit.id}`}>{unit.faction === 'player' ? 'FRIENDLY' : 'HOSTILE'} {UNITS[unit.kind].label.toUpperCase()} LANDING APPROACH <b>{Math.ceil(Math.hypot(unit.orbitX ?? 0, unit.orbitY ?? 0) / LANDING_APPROACH_SPEED)}s TO PLANET</b></div>)}
    {planet.orbitUnits.filter(unit => unit.pendingEmbark).map(unit => <div className={`incoming landing-warning ${unit.faction}`} key={`embark-${unit.id}`}>{unit.faction === 'player' ? 'FRIENDLY' : 'HOSTILE'} {UNITS[unit.kind].label.toUpperCase()} EMBARKING <b>{Math.ceil(Math.hypot(unit.orbitX ?? 0, unit.orbitY ?? 0) / LANDING_APPROACH_SPEED)}s TO PLANET</b></div>)}
  </section>;
}

function UnitButton({ kind, faction, onClick, lockReason, speed = 1 }: { kind: UnitKind; faction: ReturnType<typeof empireCivilization>; onClick: () => void; lockReason?: string; speed?: number }) {
  const definition = UNITS[kind];
  const spaceUnit = isSpaceUnit(kind);
  const shipSystems = spaceUnit ? shipWeaponBatteries(kind as SpaceUnitKind)
    .map(weapon => `${weapon.mounts}× ${weapon.label} · ${weapon.damage} DMG · ${weapon.cooldown}s · RNG ${weapon.range}`)
    .join(' + ') : '';
  const details = spaceUnit
    ? `TIER ${definition.spaceTier}${isTitanKind(kind) ? ' · UNIQUE TITAN' : ''} · ${formatFactionCost(definition.cost, faction)} · ${formatProductionSeconds(definition.time! / speed)} · ARMOR ${Math.round(shipArmor(kind as SpaceUnitKind) * 100)}% · ${shipSystems}${definition.fighterWing ? ` · ${definition.fighterWing.capacity} FIGHTERS · ${definition.fighterWing.rebuildTime}s REBUILD` : ''}${definition.ability ? ` · ${definition.ability.label.toUpperCase()}` : ''}`
    : `${formatFactionCost(definition.cost, faction)} · ${formatProductionSeconds(definition.time! / speed)} · HP ${definition.hp} · RNG ${definition.range}${definition.ability ? ` · ${definition.ability.label.toUpperCase()}` : ''}`;
  return <button className="unit-button" onClick={onClick} disabled={!!lockReason}><span>{spaceUnit ? <ShipImage kind={kind} /> : <GroundUnitImage kind={kind} />}</span><b>{definition.label}</b><small>{lockReason ?? details}</small>{definition.ability && <em>{definition.ability.description}</em>}</button>;
}
function UnitRow({ unit }: { unit: Unit }) {
  const definition = UNITS[unit.kind];
  const spaceUnit = isSpaceUnit(unit.kind);
  const shipSystems = spaceUnit ? shipWeaponBatteries(unit.kind as SpaceUnitKind)
    .map(weapon => `${weapon.mounts}× ${weapon.label} ${weapon.damage} DMG/${weapon.cooldown}s`)
    .join(' + ') : '';
  const details = spaceUnit
    ? `${unit.faction.toUpperCase()} · ARMOR ${Math.round(shipArmor(unit.kind as SpaceUnitKind) * 100)}% · ${shipSystems}${definition.fighterWing ? ` · FTR ${carrierFighterCount(unit)}/${definition.fighterWing.capacity}` : ''}${definition.ability ? ` · ${definition.ability.label}` : ''}`
    : `${unit.faction.toUpperCase()} · HP ${Math.ceil(unit.hp)}/${unit.maxHp} · SH ${Math.ceil(unit.shields)}/${unit.maxShields} · RNG ${definition.range}${definition.ability ? ` · ${definition.ability.label}` : ''}${unit.corrodedFor ? ' · CORRODED' : ''}`;
  return <div className="unit-row"><span>{spaceUnit ? <ShipImage kind={unit.kind} /> : <GroundUnitImage kind={unit.kind} />}</span><div><b>{definition.label}</b><small>{details}</small></div></div>;
}
function SectionTitle({ kicker, title }: { kicker: string; title: string }) { return <header className="section-title"><small>{kicker}</small><h2>{title}</h2></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="stat"><b>{value.toString().padStart(2, '0')}</b><small>{label}</small></div>; }
function Locked({ text }: { text: string }) { return <div className="locked"><span>⌾</span><p>{text}</p></div>; }
