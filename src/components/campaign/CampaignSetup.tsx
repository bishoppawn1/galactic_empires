import { useState } from 'react';
import { mapPlanetCount, type EnemyDifficulty, type GameConfig, type MapSize } from '../../game';

const MAP_SIZE_DETAILS: Record<MapSize, { label: string; description: string }> = {
  small: { label: 'Compact', description: '7 worlds · quicker conflicts' },
  medium: { label: 'Standard', description: '11 worlds · balanced frontier' },
  large: { label: 'Expansive', description: '15 worlds · long campaign' },
};

const DIFFICULTY_DETAILS: Record<EnemyDifficulty, { label: string; description: string }> = {
  cadet: { label: 'Cadet', description: 'Slower expansion and lighter attacks' },
  commander: { label: 'Commander', description: 'Balanced hostile development' },
  admiral: { label: 'Admiral', description: 'Faster industry and heavier attacks' },
};

export function CampaignSetup({ onStart }: { onStart: (config: GameConfig) => void }) {
  const [mapSize, setMapSize] = useState<MapSize>('medium');
  const [difficulty, setDifficulty] = useState<EnemyDifficulty>('commander');
  return <main className="campaign-setup" aria-label="New campaign setup">
    <div className="setup-stars" aria-hidden="true" />
    <section className="setup-card">
      <header><span className="setup-emblem">GE</span><small>STRATEGIC COMMAND // NEW CAMPAIGN</small><h1>Choose your frontier</h1><p>Configure the scale of the galaxy and the strength of the hostile empire before deployment.</p></header>
      <fieldset><legend>Galaxy size</legend><div className="setup-options">
        {(Object.keys(MAP_SIZE_DETAILS) as MapSize[]).map(size => <button type="button" key={size} className={mapSize === size ? 'selected' : ''} aria-pressed={mapSize === size} onClick={() => setMapSize(size)}><b>{MAP_SIZE_DETAILS[size].label}</b><span>{MAP_SIZE_DETAILS[size].description}</span></button>)}
      </div></fieldset>
      <fieldset><legend>Enemy difficulty</legend><div className="setup-options difficulty-options">
        {(Object.keys(DIFFICULTY_DETAILS) as EnemyDifficulty[]).map(level => <button type="button" key={level} className={difficulty === level ? 'selected' : ''} aria-pressed={difficulty === level} onClick={() => setDifficulty(level)}><b>{DIFFICULTY_DETAILS[level].label}</b><span>{DIFFICULTY_DETAILS[level].description}</span></button>)}
      </div></fieldset>
      <div className="setup-summary"><span><small>STAR SYSTEMS</small><b>{mapPlanetCount(mapSize)}</b></span><span><small>THREAT LEVEL</small><b>{DIFFICULTY_DETAILS[difficulty].label.toUpperCase()}</b></span></div>
      <button className="launch-campaign" onClick={() => onStart({ mapSize, difficulty })}>LAUNCH CAMPAIGN <span>→</span></button>
    </section>
  </main>;
}
