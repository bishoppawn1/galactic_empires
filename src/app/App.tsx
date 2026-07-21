import { useEffect, useMemo, useState } from 'react';
import {
  createInitialState, dispatchSpaceUnits, dockSpaceUnits, maneuverSpaceUnits,
  setOrbitFocusTarget, spaceYards, tick, type GameResult, type GameState,
} from '../game';
import { GroundBattleView } from '../components/battle/GroundBattleView';
import { CampaignSetup } from '../components/campaign/CampaignSetup';
import { GalaxyMap } from '../components/galaxy/GalaxyMap';
import { ResourceBar } from '../components/layout/ResourceBar';
import { PlanetPanel } from '../components/planet/PlanetPanel';
import { ResearchView } from '../components/research/ResearchView';
import { LEGACY_SAVE_KEY, SAVE_KEY, loadGame } from './storage';
import type { EmpireView, PlanetTab, ProductionFocus } from './types';

export default function App() {
  const [state, setState] = useState<GameState | undefined>(loadGame);
  const [selectedId, setSelectedId] = useState('terra');
  const [view, setView] = useState<EmpireView>('galaxy');
  const [tab, setTab] = useState<PlanetTab>('command');
  const [battleId, setBattleId] = useState<string>();
  const [selectedShipIds, setSelectedShipIds] = useState<string[]>([]);
  const [selectedYardIds, setSelectedYardIds] = useState<string[]>([]);
  const [productionFocus, setProductionFocus] = useState<ProductionFocus>();
  const [toast, setToast] = useState<string>();
  const battle = state?.battles.find(candidate => candidate.planetId === battleId);

  useEffect(() => { const timer = window.setInterval(() => setState(current => current ? tick(current, .1) : current), 100); return () => clearInterval(timer); }, []);
  useEffect(() => { if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(undefined), 2400); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (battleId && state && !state.battles.some(candidate => candidate.planetId === battleId)) setBattleId(undefined); }, [state, battleId]);

  const act = (result: GameResult) => { if (result.ok) setState(result.state); else setToast(result.error); };
  const resetInterface = () => { setView('galaxy'); setSelectedId('terra'); setTab('command'); setProductionFocus(undefined); setBattleId(undefined); setSelectedShipIds([]); setSelectedYardIds([]); };
  const reset = () => { if (confirm('Reset the campaign and erase this local save?')) { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); setState(undefined); resetInterface(); } };
  const changeTab = (nextTab: PlanetTab) => { setTab(nextTab); setProductionFocus(undefined); };
  const alerts = useMemo(() => state ? state.battles.length + state.planets.filter(planet => planet.orbitUnits.some(unit => unit.faction === 'enemy') && planet.orbitUnits.some(unit => unit.faction === 'player')).length : 0, [state]);

  if (!state) return <CampaignSetup onStart={config => { setState(createInitialState(config)); resetInterface(); }} />;

  const planet = state.planets.find(candidate => candidate.id === selectedId) ?? state.planets[0];
  const selectPlanet = (id: string) => {
    setSelectedYardIds([]);
    if (selectedShipIds.length) {
      const origin = state.planets.find(candidate => selectedShipIds.every(shipId => candidate.orbitUnits.some(unit => unit.id === shipId && unit.faction === 'player')));
      if (origin && origin.id !== id) {
        const result = dispatchSpaceUnits(state, origin.id, selectedShipIds, id);
        if (result.ok) { setState(result.state); setSelectedId(id); setTab('command'); setProductionFocus(undefined); setSelectedShipIds([]); }
        else setToast(result.error);
        return;
      }
      if (origin?.id === id) {
        const result = dockSpaceUnits(state, origin.id, selectedShipIds);
        if (result.ok) setState(result.state); else setToast(result.error);
        return;
      }
    }
    setSelectedId(id); setTab('command'); setProductionFocus(undefined);
  };

  const changeView = (nextView: EmpireView) => { setView(nextView); if (nextView !== 'galaxy') setBattleId(undefined); };
  if (battle) return <><ResourceBar state={state} view="galaxy" onViewChange={changeView} /><GroundBattleView state={state} battle={battle} setState={setState} onExit={() => setBattleId(undefined)} /></>;
  return <div className="app-shell">
    <ResourceBar state={state} view={view} onViewChange={changeView} />
    {view === 'galaxy' ? <div className="workspace"><GalaxyMap state={state} selectedId={planet.id} selectedShipIds={selectedShipIds} selectedYardIds={selectedYardIds} onSelect={selectPlanet} onSelectShip={(planetId, unitId, additive) => { setSelectedId(planetId); setSelectedYardIds([]); setSelectedShipIds(current => additive ? (current.includes(unitId) ? current.filter(id => id !== unitId) : [...current, unitId]) : (current.length === 1 && current[0] === unitId ? [] : [unitId])); }} onSelectSpaceYard={(planetId, yardId, additive) => { setSelectedId(planetId); setSelectedShipIds([]); setSelectedYardIds(current => { const samePlanet = current.every(id => spaceYards(state.planets.find(candidate => candidate.id === planetId)!).some(yard => yard.id === id)); return additive && samePlanet ? (current.includes(yardId) ? current.filter(id => id !== yardId) : [...current, yardId]) : (current.length === 1 && current[0] === yardId ? [] : [yardId]); }); setProductionFocus('space'); setTab('forces'); }} onGroupSelect={ids => { setSelectedYardIds([]); setSelectedShipIds(ids); }} onManeuver={(planetId, x, y) => act(maneuverSpaceUnits(state, planetId, selectedShipIds, x, y))} onTargetDefense={(planetId, defenseId) => setState(current => current ? setOrbitFocusTarget(current, planetId, defenseId) : current)} /><PlanetPanel state={state} planet={planet} tab={tab} setTab={changeTab} productionFocus={productionFocus} selectedYardIds={selectedYardIds} act={act} onBattle={() => setBattleId(planet.id)} /></div> : <ResearchView state={state} act={act} />}
    <footer className="command-log"><b>COMMAND LOG</b><div>{state.messages[0]}</div>{alerts > 0 && <span className="alert-count">{alerts} ACTIVE CONFLICT{alerts > 1 ? 'S' : ''}</span>}<button onClick={reset}>RESET CAMPAIGN</button></footer>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
