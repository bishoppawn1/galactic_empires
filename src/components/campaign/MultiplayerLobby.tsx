import { useState } from 'react';
import type { LobbySnapshot } from '../../app/multiplayer';
import { PLAYABLE_FACTION_DEFINITIONS, mapPlanetCount } from '../../game';

export function MultiplayerLobby({ lobby, isHost, onStart, onLeave, onAddAi, onRemoveAi }: {
  lobby: LobbySnapshot;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
  onAddAi: () => void;
  onRemoveAi: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    await navigator.clipboard?.writeText(lobby.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <main className="campaign-setup multiplayer-lobby" aria-label="Multiplayer lobby">
    <div className="setup-stars" aria-hidden="true" />
    <section className="setup-card lobby-card">
      <header><span className="setup-emblem">GE</span><small>MULTIPLAYER // FOUR-EMPIRE LINK</small><h1>{isHost ? 'Your lobby is open' : 'Command link established'}</h1><p>{isHost ? 'Invite up to three commanders or add AI empires, then launch the free-for-all.' : 'You command an independent empire. The host will launch when the roster is ready.'}</p></header>
      <div className="lobby-code"><small>LOBBY CODE</small><strong>{lobby.code}</strong><button onClick={copyCode}>{copied ? 'COPIED' : 'COPY CODE'}</button></div>
      <div className="lobby-roster"><div className="lobby-heading"><b>EMPIRE ROSTER</b><span>{lobby.players.length} / 4 SLOTS</span></div>{[...lobby.players].sort((a, b) => ['player', 'enemy', 'rival2', 'rival3'].indexOf(a.faction) - ['player', 'enemy', 'rival2', 'rival3'].indexOf(b.faction)).map(player => {
        const profile = PLAYABLE_FACTION_DEFINITIONS[player.civilization];
        return <div className={`lobby-player faction-${player.civilization} ${player.ai ? 'ai' : ''}`} key={player.id}><i style={{ background: profile.color, boxShadow: `0 0 10px ${profile.color}` }} /><span><b>{player.label}</b><small>EMPIRE {['player', 'enemy', 'rival2', 'rival3'].indexOf(player.faction) + 1} · {player.ai ? 'AI' : player.host ? 'HOST' : 'HUMAN'} · {profile.shortLabel.toUpperCase()}</small></span><em>READY</em></div>;
      })}</div>
      {isHost && <div className="ai-slot-controls"><button disabled={lobby.players.length >= 4} onClick={onAddAi}>ADD AI EMPIRE</button><button disabled={!lobby.players.some(player => player.ai)} onClick={onRemoveAi}>REMOVE AI</button></div>}
      <div className="setup-summary"><span><small>HOST FACTION</small><b>{PLAYABLE_FACTION_DEFINITIONS[lobby.config.playerFaction ?? 'human'].shortLabel.toUpperCase()}</b></span><span><small>STAR SYSTEMS</small><b>{lobby.players.length > 2 ? 21 : mapPlanetCount(lobby.config.mapSize)}</b></span><span><small>FORMAT</small><b>FREE-FOR-ALL</b></span></div>
      <div className="lobby-actions">{isHost ? <button className="launch-campaign" disabled={lobby.players.length < 2} onClick={onStart}>{lobby.players.length < 2 ? 'ADD A RIVAL OR AI' : 'START GAME'} <span>→</span></button> : <div className="waiting-pulse"><i /> WAITING FOR HOST</div>}<button className="leave-lobby" onClick={onLeave}>LEAVE LOBBY</button></div>
    </section>
  </main>;
}
