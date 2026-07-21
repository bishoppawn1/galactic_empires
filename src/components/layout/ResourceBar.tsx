import { researchIncomeMultiplier, type BuildingKind, type GameState } from '../../game';
import type { EmpireView } from '../../app/types';

export function ResourceBar({ state, view, onViewChange }: { state: GameState; view: EmpireView; onViewChange: (view: EmpireView) => void }) {
  const owned = state.planets.filter(p => p.owner === 'player');
  const rate = (resource: 'metal' | 'crystal' | 'gold', kind: BuildingKind) => owned.reduce((sum, p) => sum + p.buildings.filter(b => b.kind === kind).length * p.resourceYield[resource] * 0.7, 0) * researchIncomeMultiplier(state.completedResearch);
  return <div className="resource-bar">
    <div className="brand"><span className="brand-mark">GE</span><span>GALACTIC <b>EMPIRES</b></span></div>
    <nav className="empire-tabs" aria-label="Empire views">
      {(['galaxy', 'research'] as EmpireView[]).map(item => <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => onViewChange(item)}>{item}</button>)}
    </nav>
    <div className="resources">
      <Resource icon="◆" name="Metal" value={state.resources.metal} rate={rate('metal', 'metalMine')} className="metal" />
      <Resource icon="⬢" name="Crystal" value={state.resources.crystal} rate={rate('crystal', 'crystalMine')} className="crystal" />
      <Resource icon="●" name="Gold" value={state.resources.gold} rate={rate('gold', 'goldMine')} className="gold" />
    </div>
    <div className="cycle">CYCLE {Math.floor(state.elapsed / 60) + 1}<small>{Math.floor(state.elapsed % 60).toString().padStart(2, '0')}:{Math.floor((state.elapsed * 10) % 10)}0</small></div>
  </div>;
}

function Resource({ icon, name, value, rate, className }: { icon: string; name: string; value: number; rate: number; className: string }) {
  return <div className={`resource ${className}`}><i>{icon}</i><span><small>{name}</small>{Math.floor(value).toLocaleString()}</span><em>+{rate.toFixed(1)}/s</em></div>;
}
