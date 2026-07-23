import type { UnitFaction } from '../../game';

const idPhase = (id: string) => [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) * .071;
export const FIGHTER_ORBIT_RADIUS = 92;
export const FIGHTER_ORBIT_SPREAD = 16;
export const FIGHTER_DISPLAY_SIZE = 10;

export function CarrierFighterWing({ id, faction, count, source, target, underFire = false }: {
  id: string;
  faction: UnitFaction;
  count: number;
  source: { x: number; y: number };
  target: { x: number; y: number };
  underFire?: boolean;
}) {
  if (count <= 0) return null;
  const fighters = Array.from({ length: count }, (_, index) => {
    const phase = idPhase(id) + index * Math.PI * 2 / count;
    const radius = FIGHTER_ORBIT_RADIUS + index % 2 * FIGHTER_ORBIT_SPREAD;
    const duration = 3.4 + index % 3 * .18;
    return {
      x: target.x + radius,
      y: target.y,
      begin: -(phase / (Math.PI * 2)) * duration,
      duration,
    };
  });

  return <g className={`carrier-fighter-wing ${faction} ${underFire ? 'under-fire' : ''}`} data-fighter-count={count} data-attackable="true" data-orbit-radius={FIGHTER_ORBIT_RADIUS}>
    <line className="fighter-launch-trail" x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
    <circle className="fighter-orbit-ring" cx={target.x} cy={target.y} r={FIGHTER_ORBIT_RADIUS + FIGHTER_ORBIT_SPREAD / 2} />
    {fighters.map((fighter, index) => <g className="fighter-sortie" key={`${id}-fighter-${index}`}>
      <animateTransform attributeName="transform" type="rotate" from={`0 ${target.x} ${target.y}`} to={`360 ${target.x} ${target.y}`} dur={`${fighter.duration}s`} begin={`${fighter.begin}s`} repeatCount="indefinite" />
      <line className="fighter-attack" x1={fighter.x} y1={fighter.y} x2={target.x} y2={target.y} style={{ animationDelay: `${index * -.13}s` }} />
      <path className="carrier-fighter" data-fighter-size={FIGHTER_DISPLAY_SIZE} transform={`translate(${fighter.x} ${fighter.y}) rotate(90)`} d="M 5 0 L 1.2 -1.4 L -1.4 -4 L -3 -3 L -2.2 -.8 L -5 0 L -2.2 .8 L -3 3 L -1.4 4 L 1.2 1.4 Z" />
      <circle className="fighter-engine" cx={fighter.x} cy={fighter.y + 3} r="1.2" />
    </g>)}
  </g>;
}
