import { useState } from 'react';
import type { LobbySnapshot } from '../../app/multiplayer';
import { mapPlanetCount } from '../../game';

export function MultiplayerLobby({ lobby, isHost, onStart, onLeave }: {
  lobby: LobbySnapshot;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
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
      <header><span className="setup-emblem">GE</span><small>MULTIPLAYER // COMMAND LINK</small><h1>{isHost ? 'Your lobby is open' : 'Linked to host'}</h1><p>{isHost ? 'Share the command code, then launch when your allied commander arrives.' : 'Stand by. The host commander will launch the campaign when the lobby is ready.'}</p></header>
      <div className="lobby-code"><small>LOBBY CODE</small><strong>{lobby.code}</strong><button onClick={copyCode}>{copied ? 'COPIED' : 'COPY CODE'}</button></div>
      <div className="lobby-roster"><div className="lobby-heading"><b>COMMAND ROSTER</b><span>{lobby.players.length} / 4 ONLINE</span></div>{lobby.players.map(player => <div className="lobby-player" key={player.id}><i /><span><b>{player.label}</b><small>{player.host ? 'LOBBY HOST' : 'CO-OP COMMAND'}</small></span><em>READY</em></div>)}</div>
      <div className="setup-summary"><span><small>STAR SYSTEMS</small><b>{mapPlanetCount(lobby.config.mapSize)}</b></span><span><small>THREAT LEVEL</small><b>{lobby.config.difficulty.toUpperCase()}</b></span></div>
      <div className="lobby-actions">{isHost ? <button className="launch-campaign" disabled={lobby.players.length < 2} onClick={onStart}>{lobby.players.length < 2 ? 'WAITING FOR ALLY' : 'START GAME'} <span>→</span></button> : <div className="waiting-pulse"><i /> WAITING FOR HOST</div>}<button className="leave-lobby" onClick={onLeave}>LEAVE LOBBY</button></div>
    </section>
  </main>;
}
