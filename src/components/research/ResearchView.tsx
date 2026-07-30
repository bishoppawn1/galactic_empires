import {
  PLAYABLE_FACTION_DEFINITIONS, REPEATABLE_RESEARCH, empireCivilization, formatFactionCost, isRepeatableResearch,
  researchCost, researchDefinitionForCivilization, researchLevel, researchTime, researchUnlocksForCivilization,
  researchTreeForCivilization,
  type GameCommand, type GameState, type PlayableFaction, type ResearchId, type ResearchTreeNode,
} from '../../game';

const NODE_WIDTH = 292;
const ORIGINAL_NODE_HEIGHT = 220;
const NODE_HEIGHT = 260;
const NODE_Y_SCALE = NODE_HEIGHT / ORIGINAL_NODE_HEIGHT;
const NODE_VERTICAL_GAP = 20;

const FACTION_RESEARCH_INTRO: Record<PlayableFaction, string> = {
  human: 'A modular doctrine network built around combined arms, adaptable logistics, and coordinated fleet command.',
  brood: 'A living evolutionary web where biomass, instinct, and predatory adaptation become permanent genetic memory.',
  aegis: 'A harmonic lattice of ward systems, fortress doctrine, and increasingly perfect defensive coordination.',
  covenant: 'A recursive foundry protocol that converts matter, combat data, and machine logic into stronger patterns.',
};

const graphPath = (from: ResearchTreeNode, to: ResearchTreeNode) => {
  const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x, y2 = to.y + NODE_HEIGHT / 2;
  const middle = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
};

const layoutResearchNodes = (nodes: ResearchTreeNode[]) => {
  const columns = new Map<number, ResearchTreeNode[]>();
  nodes.forEach(node => columns.set(node.x, [...(columns.get(node.x) ?? []), node]));
  const topById = new Map<ResearchId, number>();
  columns.forEach(column => {
    let nextTop = 0;
    column.sort((left, right) => left.y - right.y).forEach(node => {
      const top = Math.max(node.y * NODE_Y_SCALE, nextTop);
      topById.set(node.id, top);
      nextTop = top + NODE_HEIGHT + NODE_VERTICAL_GAP;
    });
  });
  return nodes.map(node => ({ ...node, y: topById.get(node.id)! }));
};

function ResearchNode({ node, state, hasLab, civilization, act }: {
  node: ResearchTreeNode; state: GameState; hasLab: boolean; civilization: PlayableFaction; act: (command: GameCommand) => void;
}) {
  const { id } = node;
  const definition = researchDefinitionForCivilization(id, civilization);
  const repeatable = isRepeatableResearch(id);
  const level = researchLevel(state.completedResearch, id);
  const done = !repeatable && level > 0;
  const active = state.researchQueue.find(project => project.id === id);
  const prerequisiteMet = !definition.requires || state.completedResearch.includes(definition.requires);
  const status = done ? 'complete' : active ? 'active-research' : !prerequisiteMet || !hasLab ? 'locked-tech' : level ? 'repeatable-ready' : 'available-tech';
  const buttonLabel = done ? 'COMPLETE'
    : active ? `${Math.ceil(active.remaining)}s`
      : !hasLab ? 'LAB REQUIRED'
        : !prerequisiteMet ? 'PREREQUISITE NOT COMPLETED'
          : repeatable ? `ITERATE · LV ${level + 1}` : 'RESEARCH';
  const unlocks = researchUnlocksForCivilization(id, civilization);
  const cost = researchCost(id, state.completedResearch);
  const time = researchTime(id, state.completedResearch);
  const prerequisite = definition.requires ? researchDefinitionForCivilization(definition.requires, civilization).label : undefined;
  return <article
    className={`tech-node ${status} branch-${node.branch} ${repeatable ? 'repeatable-tech' : ''}`}
    data-tech-id={id}
    data-requires={definition.requires ?? ''}
    data-level={level}
    style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT, minHeight: NODE_HEIGHT }}
  >
    <header><span>{repeatable ? '∞' : done ? '✓' : active ? '◌' : '⌬'}</span><div>
      <small>{repeatable ? `REPEATABLE CAPSTONE · LEVEL ${level}` : prerequisite ? `REQUIRES ${prerequisite.toUpperCase()}` : 'FOUNDATIONAL TECHNOLOGY'}</small>
      <b>{definition.label}</b>
    </div></header>
    <p>{definition.description}</p>
    {!!unlocks?.length && <div className="tech-unlocks"><small>{repeatable ? 'EACH LEVEL' : 'UNLOCKS'}</small><span>{unlocks.join(' · ')}</span></div>}
    <div className="tech-node-footer">
      {active
        ? <div className="research-progress" aria-label={`${definition.label} progress`}><i style={{ width: `${100 * (1 - active.remaining / active.total)}%` }} /></div>
        : <em>{formatFactionCost(cost, civilization)} · {time}s</em>}
      <button disabled={done || !!active || !hasLab || !prerequisiteMet} onClick={() => act({ type: 'beginResearch', id })}>{buttonLabel}</button>
    </div>
  </article>;
}

export function ResearchView({ state, act }: { state: GameState; act: (command: GameCommand) => void }) {
  const labs = state.planets.reduce((sum, planet) => sum + (planet.owner === 'player' ? planet.buildings.filter(building => building.kind === 'researchLab').length : 0), 0);
  const hasLab = labs > 0;
  const civilization = empireCivilization(state);
  const faction = PLAYABLE_FACTION_DEFINITIONS[civilization];
  const tree = researchTreeForCivilization(civilization);
  const nodes = layoutResearchNodes(tree.nodes);
  const canvasHeight = Math.max(tree.height * NODE_Y_SCALE + NODE_HEIGHT, ...nodes.map(node => node.y + NODE_HEIGHT + NODE_VERTICAL_GAP));
  const discoveries = new Set(state.completedResearch.filter(id => !isRepeatableResearch(id))).size;
  const iterations = REPEATABLE_RESEARCH.reduce((total, id) => total + researchLevel(state.completedResearch, id), 0);
  return <main className={`research-view research-${civilization}`} aria-label="Research tech tree">
    <header className="research-hero"><div><small>{faction.label.toUpperCase()} // STRATEGIC RESEARCH MATRIX</small><h1>{faction.label} technology lattice</h1><p>{FACTION_RESEARCH_INTRO[civilization]}</p></div>
      <div className="research-stats"><span><b>{discoveries}</b> DISCOVERIES</span><span><b>{iterations}</b> ITERATIONS</span><span><b>{state.researchQueue.length}</b> ACTIVE</span><span><b>{labs}</b> LABS</span></div>
    </header>
    {!hasLab && <div className="research-warning"><span>⌾</span><div><b>RESEARCH NETWORK OFFLINE</b><p>Construct a Research Lab on any colony to activate the technology lattice.</p></div></div>}
    <section className="tech-tree expanded-tech-tree research-graph" aria-label={`${faction.label} technology prerequisites`}>
      <div className="research-graph-canvas" style={{ width: tree.width, height: canvasHeight }}>
        <div className="research-root-label"><small>FACTION FOUNDATION</small><b>{tree.rootLabel}</b></div>
        {tree.branches.map(branch => <div className={`research-branch-label tech-tier branch-${branch.id}`} style={{ top: branch.y * NODE_Y_SCALE }} key={branch.id}><b>{branch.label}</b><small>{branch.subtitle}</small></div>)}
        <svg className="research-connections" viewBox={`0 0 ${tree.width} ${canvasHeight}`} aria-hidden="true">
          <defs><filter id="research-link-glow"><feGaussianBlur stdDeviation="2.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {nodes.flatMap(node => {
            const requires = tree.requires[node.id];
            if (!requires) return [];
            const prerequisite = nodes.find(candidate => candidate.id === requires);
            if (!prerequisite) return [];
            const online = state.completedResearch.includes(requires);
            return [<path key={`${requires}-${node.id}`} d={graphPath(prerequisite, node)} className={online ? 'online' : ''} data-from={requires} data-to={node.id} />];
          })}
        </svg>
        {nodes.map(node => <ResearchNode key={node.id} node={node} state={state} hasLab={hasLab} civilization={civilization} act={act} />)}
      </div>
    </section>
  </main>;
}
