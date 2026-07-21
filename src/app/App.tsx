import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyGameCommand, createCompetitiveState, createInitialState, spaceYards, viewStateForFaction, tick,
  type EmpireFaction, type GameCommand, type GameConfig, type GameState,
} from '../game';
import { GroundBattleView } from '../components/battle/GroundBattleView';
import { CampaignSetup } from '../components/campaign/CampaignSetup';
import { MultiplayerLobby } from '../components/campaign/MultiplayerLobby';
import { GalaxyMap } from '../components/galaxy/GalaxyMap';
import { ResourceBar } from '../components/layout/ResourceBar';
import { PlanetPanel } from '../components/planet/PlanetPanel';
import { ResearchView } from '../components/research/ResearchView';
import {
  hostMultiplayer, joinMultiplayer,
  type LobbySnapshot, type MultiplayerController,
} from './multiplayer';
import { LEGACY_SAVE_KEY, SAVE_KEY, loadGame } from './storage';
import type { EmpireView, PlanetTab, ProductionFocus } from './types';

export default function App() {
  const [state, setState] = useState<GameState | undefined>(loadGame);
  const [lobby, setLobby] = useState<LobbySnapshot>();
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();
  const [selectedId, setSelectedId] = useState('terra');
  const [view, setView] = useState<EmpireView>('galaxy');
  const [tab, setTab] = useState<PlanetTab>('command');
  const [battleId, setBattleId] = useState<string>();
  const [selectedShipIds, setSelectedShipIds] = useState<string[]>([]);
  const [selectedYardIds, setSelectedYardIds] = useState<string[]>([]);
  const [productionFocus, setProductionFocus] = useState<ProductionFocus>();
  const [toast, setToast] = useState<string>();
  const stateRef = useRef(state);
  const controllerRef = useRef<MultiplayerController | undefined>(undefined);
  const multiplayerPlayingRef = useRef(false);
  const remoteCommandRef = useRef<(command: GameCommand, faction: EmpireFaction) => void>(() => {});
  const battle = state?.battles.find(candidate => candidate.planetId === battleId);

  const installState = (next: GameState, broadcast = false) => {
    stateRef.current = next;
    setState(next);
    if (broadcast) controllerRef.current?.sendState(next);
  };
  remoteCommandRef.current = (command, faction) => {
    const current = stateRef.current;
    if (!current || !controllerRef.current?.isHost || !multiplayerPlayingRef.current) return;
    const rivalView = viewStateForFaction(current, faction);
    const result = applyGameCommand(rivalView, command);
    if (result.ok) installState(viewStateForFaction(result.state, faction), true);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      const controller = controllerRef.current;
      if (!current || (controller && (!controller.isHost || !multiplayerPlayingRef.current))) return;
      const next = tick(current, .1);
      stateRef.current = next;
      setState(next);
      if (controller?.isHost) controller.sendState(next);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (state && !controllerRef.current) localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(undefined), 2400); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (battleId && state && !state.battles.some(candidate => candidate.planetId === battleId)) setBattleId(undefined); }, [state, battleId]);
  useEffect(() => () => controllerRef.current?.close(), []);

  const resetInterface = (nextState?: GameState) => { setView('galaxy'); setSelectedId(nextState?.planets.find(planet => planet.owner === 'player')?.id ?? 'terra'); setTab('command'); setProductionFocus(undefined); setBattleId(undefined); setSelectedShipIds([]); setSelectedYardIds([]); };
  const closeMultiplayer = () => {
    controllerRef.current?.close();
    controllerRef.current = undefined;
    multiplayerPlayingRef.current = false;
    setLobby(undefined);
    setConnecting(false);
  };
  const leaveLobby = () => { closeMultiplayer(); setConnectionError(undefined); stateRef.current = undefined; setState(undefined); };
  const sessionClosed = (message: string) => {
    closeMultiplayer();
    stateRef.current = undefined;
    setState(undefined);
    setConnectionError(message);
    resetInterface();
  };
  const connectionFailed = (message: string) => {
    if (stateRef.current) setToast(message);
    else setConnectionError(message);
  };
  const playerLeft = (faction: EmpireFaction) => {
    const current = stateRef.current;
    if (!current || !controllerRef.current?.isHost) return;
    const next = { ...current, aiFactions: Array.from(new Set([...(current.aiFactions ?? []), faction])) };
    installState(next, true);
    setToast(`EMPIRE ${['player', 'enemy', 'rival2', 'rival3'].indexOf(faction) + 1} COMMAND LINK LOST — AI CONTROL ENGAGED.`);
  };
  const beginHost = async (config: GameConfig) => {
    setConnecting(true); setConnectionError(undefined);
    try {
      const controller = await hostMultiplayer(config, {
        onLobby: nextLobby => setLobby(nextLobby),
        onStart: () => {},
        onState: () => {},
        onCommand: (command, faction) => remoteCommandRef.current(command, faction),
        onPlayerLeft: playerLeft,
        onError: connectionFailed,
        onClosed: sessionClosed,
      });
      controllerRef.current = controller;
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not open the multiplayer lobby.');
    } finally { setConnecting(false); }
  };
  const beginJoin = async (code: string) => {
    setConnecting(true); setConnectionError(undefined);
    try {
      const controller = await joinMultiplayer(code, {
        onLobby: nextLobby => setLobby(nextLobby),
        onStart: next => {
          multiplayerPlayingRef.current = true;
          stateRef.current = next;
          setState(next);
          setLobby(undefined);
          resetInterface(next);
        },
        onState: next => { if (multiplayerPlayingRef.current) { stateRef.current = next; setState(next); } },
        onCommand: () => {},
        onPlayerLeft: () => {},
        onError: connectionFailed,
        onClosed: sessionClosed,
      });
      controllerRef.current = controller;
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not join that multiplayer lobby.');
    } finally { setConnecting(false); }
  };
  const startMultiplayer = () => {
    const controller = controllerRef.current;
    if (!controller?.isHost || !lobby || lobby.players.length < 2) return;
    const next = createCompetitiveState(lobby.config, lobby.players.map(player => ({ faction: player.faction, controller: player.ai ? 'ai' : 'human' })));
    multiplayerPlayingRef.current = true;
    controller.start(next);
    installState(next);
    setLobby(undefined);
    resetInterface(next);
  };
  const issue = (command: GameCommand) => {
    const current = stateRef.current;
    if (!current) return false;
    const preview = applyGameCommand(current, command);
    if (!preview.ok) { setToast(preview.error); return false; }
    const controller = controllerRef.current;
    if (controller && !controller.isHost) controller.sendCommand(command);
    else installState(preview.state, !!controller?.isHost);
    return true;
  };
  const reset = () => {
    const multiplayer = !!controllerRef.current;
    if (confirm(multiplayer ? 'Leave this multiplayer campaign?' : 'Reset the campaign and erase this local save?')) {
      if (!multiplayer) { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); }
      closeMultiplayer();
      stateRef.current = undefined;
      setState(undefined);
      resetInterface();
    }
  };
  const changeTab = (nextTab: PlanetTab) => { setTab(nextTab); setProductionFocus(undefined); };
  const alerts = useMemo(() => state ? state.battles.length + state.planets.filter(planet => planet.orbitUnits.some(unit => unit.faction === 'player') && planet.orbitUnits.some(unit => unit.faction !== 'player' && unit.faction !== 'neutral')).length : 0, [state]);

  if (lobby) return <MultiplayerLobby lobby={lobby} isHost={!!controllerRef.current?.isHost} onStart={startMultiplayer} onLeave={leaveLobby} onAddAi={() => controllerRef.current?.addAi()} onRemoveAi={() => controllerRef.current?.removeAi()} />;
  if (!state) return <CampaignSetup
    onStart={config => { const next = createInitialState(config); installState(next); resetInterface(); }}
    onHost={beginHost}
    onJoin={beginJoin}
    connecting={connecting}
    connectionError={connectionError}
  />;

  const planet = state.planets.find(candidate => candidate.id === selectedId) ?? state.planets[0];
  const selectPlanet = (id: string) => {
    setSelectedYardIds([]);
    setSelectedId(id); setTab('command'); setProductionFocus(undefined);
  };
  const orderShipsToPlanet = (id: string) => {
    setSelectedYardIds([]);
    if (!selectedShipIds.length) return;
    const origin = state.planets.find(candidate => selectedShipIds.every(shipId => candidate.orbitUnits.some(unit => unit.id === shipId && unit.faction === 'player')));
    if (!origin) return;
    if (origin.id === id) { issue({ type: 'dock', planetId: origin.id, unitIds: selectedShipIds }); return; }
    if (issue({ type: 'dispatch', originId: origin.id, unitIds: selectedShipIds, destinationId: id })) {
      setSelectedId(id); setTab('command'); setProductionFocus(undefined); setSelectedShipIds([]);
    }
  };

  const changeView = (nextView: EmpireView) => { setView(nextView); if (nextView !== 'galaxy') setBattleId(undefined); };
  if (battle) return <><ResourceBar state={state} view="galaxy" onViewChange={changeView} /><GroundBattleView state={state} battle={battle} onFocus={(planetId, targetId) => issue({ type: 'battleFocus', planetId, targetId })} onExit={() => setBattleId(undefined)} /></>;
  return <div className="app-shell">
    <ResourceBar state={state} view={view} onViewChange={changeView} />
    {view === 'galaxy' ? <div className="workspace"><GalaxyMap state={state} selectedId={planet.id} selectedShipIds={selectedShipIds} selectedYardIds={selectedYardIds} onSelect={selectPlanet} onOrderToPlanet={orderShipsToPlanet} onSelectShip={(planetId, unitId, additive) => { setSelectedId(planetId); setSelectedYardIds([]); setSelectedShipIds(current => additive ? (current.includes(unitId) ? current.filter(id => id !== unitId) : [...current, unitId]) : (current.length === 1 && current[0] === unitId ? [] : [unitId])); }} onSelectSpaceYard={(planetId, yardId, additive) => { setSelectedId(planetId); setSelectedShipIds([]); setSelectedYardIds(current => { const samePlanet = current.every(id => spaceYards(state.planets.find(candidate => candidate.id === planetId)!).some(yard => yard.id === id)); return additive && samePlanet ? (current.includes(yardId) ? current.filter(id => id !== yardId) : [...current, yardId]) : (current.length === 1 && current[0] === yardId ? [] : [yardId]); }); setProductionFocus('space'); setTab('forces'); }} onGroupSelect={ids => { setSelectedYardIds([]); setSelectedShipIds(ids); }} onManeuver={(planetId, x, y) => issue({ type: 'maneuver', planetId, unitIds: selectedShipIds, orbitX: x, orbitY: y })} onTargetDefense={(planetId, defenseId) => issue({ type: 'orbitFocus', planetId, targetId: defenseId })} /><PlanetPanel state={state} planet={planet} tab={tab} setTab={changeTab} productionFocus={productionFocus} selectedYardIds={selectedYardIds} act={issue} onBattle={() => setBattleId(planet.id)} /></div> : <ResearchView state={state} act={issue} />}
    <footer className="command-log"><b>COMMAND LOG</b><div>{state.messages[0]}</div>{controllerRef.current && <span className="multiplayer-status">FREE-FOR-ALL · EMPIRE {['player', 'enemy', 'rival2', 'rival3'].indexOf(controllerRef.current.faction) + 1} · {controllerRef.current.code}</span>}{alerts > 0 && <span className="alert-count">{alerts} ACTIVE CONFLICT{alerts > 1 ? 'S' : ''}</span>}<button onClick={reset}>{controllerRef.current ? 'LEAVE GAME' : 'RESET CAMPAIGN'}</button></footer>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
