import type { UnitFaction } from '../../game';

const idPhase = (id: string) => [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) * .071;

export function CarrierFighterWing({ id, faction, count, elapsed, source, target }: {
  id: string;
  faction: UnitFaction;
  count: number;
  elapsed: number;
  source: { x: number; y: number };
  target: { x: number; y: number };
}) {
  if (count <= 0) return null;
  const fighters = Array.from({ length: Math.min(4, count) }, (_, index) => {
    const angle = elapsed * (1.65 + index * .08) + idPhase(id) + index * Math.PI * 2 / Math.min(4, count);
    const radius = 30 + index % 2 * 9;
    return {
      x: target.x + Math.cos(angle) * radius,
      y: target.y + Math.sin(angle) * radius,
      heading: angle * 180 / Math.PI + 90,
    };
  });

  return <g className={`carrier-fighter-wing ${faction}`} data-fighter-count={count}>
    <line className="fighter-launch-trail" x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
    {fighters.map((fighter, index) => <g key={`${id}-fighter-${index}`}>
      <line className="fighter-attack" x1={fighter.x} y1={fighter.y} x2={target.x} y2={target.y} style={{ animationDelay: `${index * -.13}s` }} />
      <path className="carrier-fighter" transform={`translate(${fighter.x} ${fighter.y}) rotate(${fighter.heading})`} d="M 8 0 L -5 -4 L -2 0 L -5 4 Z" />
    </g>)}
  </g>;
}
