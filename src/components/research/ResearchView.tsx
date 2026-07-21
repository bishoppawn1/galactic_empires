import { RESEARCH, RESEARCH_UNLOCKS, beginResearch, formatCost, type GameResult, type GameState, type ResearchId } from '../../game';

function ResearchNode({ id, state, hasLab, act }: { id: ResearchId; state: GameState; hasLab: boolean; act: (result: GameResult) => void }) {
  const def = RESEARCH[id];
  const done = state.completedResearch.includes(id);
  const active = state.researchQueue.find(project => project.id === id);
  const prerequisiteMet = !def.requires || state.completedResearch.includes(def.requires);
  const status = done ? 'complete' : active ? 'active-research' : !prerequisiteMet || !hasLab ? 'locked-tech' : 'available-tech';
  const buttonLabel = done ? 'COMPLETE' : active ? `${Math.ceil(active.remaining)}s` : !hasLab ? 'LAB REQUIRED' : !prerequisiteMet ? 'PREREQUISITE' : 'RESEARCH';
  return <article className={`tech-node ${status}`} data-tech-id={id} data-requires={def.requires ?? ''}>
    <header><span>{done ? '✓' : active ? '◌' : '⌬'}</span><div><small>{def.requires ? `REQUIRES ${RESEARCH[def.requires].label.toUpperCase()}` : 'FOUNDATIONAL TECHNOLOGY'}</small><b>{def.label}</b></div></header>
    <p>{def.description}</p>
    {!!RESEARCH_UNLOCKS[id]?.length && <div className="tech-unlocks"><small>UNLOCKS</small><span>{RESEARCH_UNLOCKS[id]!.join(' · ')}</span></div>}
    {active ? <div className="research-progress" aria-label={`${def.label} progress`}><i style={{ width: `${100 * (1 - active.remaining / active.total)}%` }} /></div> : <em>{formatCost(def.cost)} · {def.time}s</em>}
    <button disabled={done || !!active || !hasLab || !prerequisiteMet} onClick={() => act(beginResearch(state, id))}>{buttonLabel}</button>
  </article>;
}

export function ResearchView({ state, act }: { state: GameState; act: (result: GameResult) => void }) {
  const hasLab = state.planets.some(p => p.owner === 'player' && p.buildings.some(b => b.kind === 'researchLab'));
  const researchIds = Object.keys(RESEARCH) as ResearchId[];
  const depth = (id: ResearchId): number => RESEARCH[id].requires ? 1 + depth(RESEARCH[id].requires!) : 0;
  const tiers = Array.from({ length: Math.max(...researchIds.map(depth)) + 1 }, (_, tier) => researchIds.filter(id => depth(id) === tier));
  return <main className="research-view" aria-label="Research tech tree">
    <header className="research-hero"><div><small>SCIENCE DIRECTORATE // EMPIRE-WIDE</small><h1>Technology tree</h1><p>Develop foundational industry, then choose the doctrines that shape your expansion.</p></div>
      <div className="research-stats"><span><b>{state.completedResearch.length}</b> COMPLETE</span><span><b>{state.researchQueue.length}</b> ACTIVE</span><span><b>{state.planets.reduce((sum, p) => sum + p.buildings.filter(building => building.kind === 'researchLab').length, 0)}</b> LABS</span></div>
    </header>
    {!hasLab && <div className="research-warning"><span>⌾</span><div><b>RESEARCH NETWORK OFFLINE</b><p>Construct a Research Lab on any colony to activate the technology tree.</p></div></div>}
    <section className="tech-tree expanded-tech-tree" aria-label="Technology prerequisites">
      {tiers.map((ids, tier) => <div className="tech-tier" data-tier={tier + 1} key={tier}>
        <header><span>TIER {tier + 1}</span><b>{tier === 0 ? 'INDUSTRIAL FOUNDATION' : tier === tiers.length - 1 ? 'APEX TECHNOLOGY' : 'SPECIALIZATION'}</b></header>
        <div>{ids.map(id => <ResearchNode key={id} id={id} state={state} hasLab={hasLab} act={act} />)}</div>
      </div>)}
    </section>
  </main>;
}
