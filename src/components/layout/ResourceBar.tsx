import { useState } from 'react';
import { BROOD_BIOMASS_PER_PLANET, PLAYABLE_FACTION_DEFINITIONS, RESOURCE_COLLECTION_MULTIPLIER, RESOURCE_TRADE_RECEIVE, RESOURCE_TRADE_SPEND, STANDARD_RESOURCES, empireCivilization, researchIncomeMultiplier, type BuildingKind, type GameCommand, type GameState, type Resource } from '../../game';
import type { EmpireView } from '../../app/types';

export function ResourceBar({ state, view, onViewChange, act }: { state: GameState; view: EmpireView; onViewChange: (view: EmpireView) => void; act: (command: GameCommand) => boolean }) {
  const [trading, setTrading] = useState(false);
  const owned = state.planets.filter(p => p.owner === 'player');
  const civilization = empireCivilization(state);
  const profile = PLAYABLE_FACTION_DEFINITIONS[civilization];
  const rate = (resource: 'metal' | 'crystal' | 'gold', kind: BuildingKind) => owned.reduce((sum, p) => sum + p.buildings.filter(b => b.kind === kind).length * p.resourceYield[resource] * 0.7, 0) * RESOURCE_COLLECTION_MULTIPLIER * researchIncomeMultiplier(state.completedResearch);
  const biomassRate = owned.length * BROOD_BIOMASS_PER_PLANET * researchIncomeMultiplier(state.completedResearch);
  return <div className={`resource-bar faction-${civilization}`}>
    <div className="brand"><span className="brand-mark">GE</span><span>GALACTIC <b>EMPIRES</b><small>{profile.label}</small></span></div>
    <nav className="empire-tabs" aria-label="Empire views">
      {(['galaxy', 'research'] as EmpireView[]).map(item => <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => onViewChange(item)}>{item}</button>)}
    </nav>
    <div className="resources">
      {civilization === 'brood' ? <Resource icon="✺" name="Biomass" value={state.resources.biomass ?? 0} rate={biomassRate} className="biomass" /> : <>
        <Resource icon="◆" name="Metal" value={state.resources.metal} rate={rate('metal', 'metalMine')} className="metal" />
        <Resource icon="⬢" name="Crystal" value={state.resources.crystal} rate={rate('crystal', 'crystalMine')} className="crystal" />
        <Resource icon="●" name="Gold" value={state.resources.gold} rate={rate('gold', 'goldMine')} className="gold" />
        <div className="trade-control">
          <button className="trade-toggle" aria-label="TRADE 3:1" aria-expanded={trading} aria-controls="resource-trades" onClick={() => setTrading(open => !open)}>TRADE<small>3:1</small></button>
          {trading && <div className="trade-menu" id="resource-trades" role="region" aria-label="Resource trading">
            <header><b>RESOURCE EXCHANGE</b><span>Spend {RESOURCE_TRADE_SPEND} · Receive {RESOURCE_TRADE_RECEIVE}</span></header>
            <div className="trade-options">
              {STANDARD_RESOURCES.flatMap(from => STANDARD_RESOURCES.filter(to => to !== from).map(to => <TradeOption key={`${from}-${to}`} from={from} to={to} balance={state.resources[from]} act={act} />))}
            </div>
          </div>}
        </div>
      </>}
    </div>
    <div className="cycle">CYCLE {Math.floor(state.elapsed / 60) + 1}<small>{Math.floor(state.elapsed % 60).toString().padStart(2, '0')}:{Math.floor((state.elapsed * 10) % 10)}0</small></div>
  </div>;
}

function TradeOption({ from, to, balance, act }: { from: Resource; to: Resource; balance: number; act: (command: GameCommand) => boolean }) {
  const label = `${RESOURCE_TRADE_SPEND} ${from.toUpperCase()} → ${RESOURCE_TRADE_RECEIVE} ${to.toUpperCase()}`;
  return <button disabled={balance < RESOURCE_TRADE_SPEND} onClick={() => act({ type: 'trade', from, to })}>{label}</button>;
}

function Resource({ icon, name, value, rate, className }: { icon: string; name: string; value: number; rate: number; className: string }) {
  return <div className={`resource ${className}`}><i>{icon}</i><span><small>{name}</small>{Math.floor(value).toLocaleString()}</span><em>+{rate.toFixed(1)}/s</em></div>;
}
