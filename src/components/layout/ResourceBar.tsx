import { useState } from 'react';
import { BROOD_BIOMASS_PER_PLANET, PLAYABLE_FACTION_DEFINITIONS, RESOURCE_COLLECTION_MULTIPLIER, RESOURCE_TRADE_DEFAULT_SPEND, RESOURCE_TRADE_MAX_SPEND, RESOURCE_TRADE_RATE, STANDARD_RESOURCES, empireCivilization, researchIncomeMultiplier, type BuildingKind, type GameCommand, type GameState, type Resource } from '../../game';
import type { EmpireView } from '../../app/types';

export function ResourceBar({ state, view, onViewChange, act }: { state: GameState; view: EmpireView; onViewChange: (view: EmpireView) => void; act: (command: GameCommand) => boolean }) {
  const [trading, setTrading] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(String(RESOURCE_TRADE_DEFAULT_SPEND));
  const amount = Number(tradeAmount);
  const validAmount = Number.isSafeInteger(amount) && amount >= RESOURCE_TRADE_RATE && amount <= RESOURCE_TRADE_MAX_SPEND;
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
            <header><b>RESOURCE EXCHANGE</b><span>{RESOURCE_TRADE_RATE}:1 RATE</span></header>
            <label className="trade-amount"><span>AMOUNT TO SPEND</span><input aria-label="Amount to spend" type="number" min={RESOURCE_TRADE_RATE} max={RESOURCE_TRADE_MAX_SPEND} step="1" value={tradeAmount} onChange={event => setTradeAmount(event.target.value)} /><em>RECEIVE {validAmount ? formatTradeAmount(amount / RESOURCE_TRADE_RATE) : '—'}</em></label>
            <div className="trade-options">
              {STANDARD_RESOURCES.flatMap(from => STANDARD_RESOURCES.filter(to => to !== from).map(to => <TradeOption key={`${from}-${to}`} from={from} to={to} amount={amount} validAmount={validAmount} balance={state.resources[from]} act={act} />))}
            </div>
          </div>}
        </div>
      </>}
    </div>
    <div className="cycle">CYCLE {Math.floor(state.elapsed / 60) + 1}<small>{Math.floor(state.elapsed % 60).toString().padStart(2, '0')}:{Math.floor((state.elapsed * 10) % 10)}0</small></div>
  </div>;
}

function TradeOption({ from, to, amount, validAmount, balance, act }: { from: Resource; to: Resource; amount: number; validAmount: boolean; balance: number; act: (command: GameCommand) => boolean }) {
  const label = validAmount ? `${formatTradeAmount(amount)} ${from.toUpperCase()} → ${formatTradeAmount(amount / RESOURCE_TRADE_RATE)} ${to.toUpperCase()}` : `${from.toUpperCase()} → ${to.toUpperCase()}`;
  return <button disabled={!validAmount || balance < amount} onClick={() => act({ type: 'trade', from, to, amount })}>{label}</button>;
}

const formatTradeAmount = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 2 });

function Resource({ icon, name, value, rate, className }: { icon: string; name: string; value: number; rate: number; className: string }) {
  return <div className={`resource ${className}`}><i>{icon}</i><span><small>{name}</small>{Math.floor(value).toLocaleString()}</span><em>+{rate.toFixed(1)}/s</em></div>;
}
