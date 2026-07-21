import { useState } from 'react';
import { PLAYABLE_FACTIONS, PLAYABLE_FACTION_DEFINITIONS, mapPlanetCount, type EnemyDifficulty, type GameConfig, type MapSize, type PlayableFaction } from '../../game';

const MAP_SIZE_DETAILS: Record<MapSize, { label: string; description: string }> = {
  small: { label: 'Compact', description: '7 worlds · quicker conflicts' },
  medium: { label: 'Standard', description: '11 worlds · balanced frontier' },
  large: { label: 'Expansive', description: '15 worlds · long campaign' },
  huge: { label: 'Colossal', description: '21 worlds · four-empire frontier' },
};

const DIFFICULTY_DETAILS: Record<EnemyDifficulty, { label: string; description: string }> = {
  cadet: { label: 'Cadet', description: 'Slower expansion and lighter attacks' },
  commander: { label: 'Commander', description: 'Balanced hostile development' },
  admiral: { label: 'Admiral', description: 'Faster industry and heavier attacks' },
};

export function CampaignSetup({ onStart, onHost, onJoin, connecting, connectionError }: {
  onStart: (config: GameConfig) => void;
  onHost: (config: GameConfig) => void;
  onJoin: (code: string, faction: PlayableFaction) => void;
  connecting?: boolean;
  connectionError?: string;
}) {
  const [mapSize, setMapSize] = useState<MapSize>('medium');
  const [difficulty, setDifficulty] = useState<EnemyDifficulty>('commander');
  const [playerFaction, setPlayerFaction] = useState<PlayableFaction>('human');
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  return <main className="campaign-setup" aria-label="New campaign setup">
    <div className="setup-stars" aria-hidden="true" />
    <section className="setup-card">
      <header><span className="setup-emblem">GE</span><small>STRATEGIC COMMAND // NEW CAMPAIGN</small><h1>Choose your frontier</h1><p>Deploy solo against the hostile AI, or open a multiplayer lobby for up to four independent empires.</p></header>
      <fieldset><legend>Command faction</legend><div className="setup-options faction-options">
        {PLAYABLE_FACTIONS.map(faction => {
          const profile = PLAYABLE_FACTION_DEFINITIONS[faction];
          return <button type="button" key={faction} className={`faction-${faction} ${playerFaction === faction ? 'selected' : ''}`} aria-pressed={playerFaction === faction} onClick={() => setPlayerFaction(faction)}><b>{profile.label}</b><span>{profile.doctrine} · {profile.strengths}</span><small>{profile.weakness}</small></button>;
        })}
      </div></fieldset>
      <fieldset><legend>Galaxy size</legend><div className="setup-options">
        {(Object.keys(MAP_SIZE_DETAILS) as MapSize[]).map(size => <button type="button" key={size} className={mapSize === size ? 'selected' : ''} aria-pressed={mapSize === size} onClick={() => setMapSize(size)}><b>{MAP_SIZE_DETAILS[size].label}</b><span>{MAP_SIZE_DETAILS[size].description}</span></button>)}
      </div></fieldset>
      <fieldset><legend>Enemy difficulty</legend><div className="setup-options difficulty-options">
        {(Object.keys(DIFFICULTY_DETAILS) as EnemyDifficulty[]).map(level => <button type="button" key={level} className={difficulty === level ? 'selected' : ''} aria-pressed={difficulty === level} onClick={() => setDifficulty(level)}><b>{DIFFICULTY_DETAILS[level].label}</b><span>{DIFFICULTY_DETAILS[level].description}</span></button>)}
      </div></fieldset>
      <div className="setup-footer"><div className="setup-summary"><span><small>FACTION</small><b>{PLAYABLE_FACTION_DEFINITIONS[playerFaction].shortLabel.toUpperCase()}</b></span><span><small>STAR SYSTEMS</small><b>{mapPlanetCount(mapSize)}</b></span><span><small>THREAT LEVEL</small><b>{DIFFICULTY_DETAILS[difficulty].label.toUpperCase()}</b></span></div>
        <div className="campaign-actions">
          <button className="launch-campaign" disabled={connecting} onClick={() => onStart({ mapSize, difficulty, playerFaction })}>START SINGLE PLAYER <span>→</span></button>
          <button className="multiplayer-start" disabled={connecting} onClick={() => onHost({ mapSize, difficulty, playerFaction })}>{connecting ? 'OPENING COMMAND LINK…' : 'START MULTIPLAYER'} <span>◎</span></button>
          <button className="join-game" disabled={connecting} onClick={() => setJoining(current => !current)}>JOIN GAME <span>＋</span></button>
          {joining && <form className="join-form" onSubmit={event => { event.preventDefault(); onJoin(code, playerFaction); }}><label htmlFor="lobby-code">LOBBY CODE · JOIN AS {PLAYABLE_FACTION_DEFINITIONS[playerFaction].shortLabel.toUpperCase()}</label><div><input id="lobby-code" autoFocus maxLength={6} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="ABC234" aria-label="Lobby code" /><button disabled={connecting || code.length !== 6}>CONNECT</button></div></form>}
          {connectionError && <p className="connection-error" role="alert">{connectionError}</p>}
        </div>
      </div>
    </section>
  </main>;
}
