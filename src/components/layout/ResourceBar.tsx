import { BROOD_BIOMASS_PER_PLANET, PLAYABLE_FACTION_DEFINITIONS, RESOURCE_COLLECTION_MULTIPLIER, empireCivilization, researchIncomeMultiplier, type BuildingKind, type GameState } from '../../game';
import type { EmpireView } from '../../app/types';

export function ResourceBar({ state, view, onViewChange }: { state: GameState; view: EmpireView; onViewChange: (view: EmpireView) => void }) {
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
      </>}
    </div>
    <div className="cycle">CYCLE {Math.floor(state.elapsed / 60) + 1}<small>{Math.floor(state.elapsed % 60).toString().padStart(2, '0')}:{Math.floor((state.elapsed * 10) % 10)}0</small></div>
  </div>;
}

function Resource({ icon, name, value, rate, className }: { icon: string; name: string; value: number; rate: number; className: string }) {
  return <div className={`resource ${className}`}><i>{icon}</i><span><small>{name}</small>{Math.floor(value).toLocaleString()}</span><em>+{rate.toFixed(1)}/s</em></div>;
}
