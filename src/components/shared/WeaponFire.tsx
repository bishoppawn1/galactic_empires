import type { UnitFaction, WeaponEffect } from '../../game';
import artilleryImage from '../../assets/weapons/artillery.png';
import droneImage from '../../assets/weapons/drone.png';
import kineticImage from '../../assets/weapons/kinetic.png';
import laserImage from '../../assets/weapons/laser.png';
import missileImage from '../../assets/weapons/missile.png';
import plasmaImage from '../../assets/weapons/plasma.png';
import pulseImage from '../../assets/weapons/pulse.png';
import railgunImage from '../../assets/weapons/railgun.png';
import siegeImage from '../../assets/weapons/siege.png';

const weaponImages: Record<WeaponEffect, string> = {
  artillery: artilleryImage,
  drone: droneImage,
  kinetic: kineticImage,
  laser: laserImage,
  missile: missileImage,
  plasma: plasmaImage,
  pulse: pulseImage,
  railgun: railgunImage,
  siege: siegeImage,
};

const flightDurations: Record<WeaponEffect, number> = {
  artillery: .65,
  drone: .55,
  kinetic: .28,
  laser: .16,
  missile: .7,
  plasma: .48,
  pulse: .3,
  railgun: .18,
  siege: .24,
};

export function WeaponFire({ id, x1, y1, x2, y2, effect, projectiles, faction, size, className = '' }: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  effect: WeaponEffect;
  projectiles: number;
  faction: UnitFaction;
  size: number;
  className?: string;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  if (!distance) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const beam = effect === 'laser' || effect === 'siege';
  const count = effect === 'drone' ? 1 : Math.max(1, Math.min(4, projectiles));
  const imageWidth = beam ? distance : Math.min(distance, size * 2.4);
  const imageHeight = beam ? size * .8 : size;
  const travel = Math.max(0, distance - imageWidth);
  const duration = flightDurations[effect];
  const offsets = Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * size * .22);

  return <g className={`weapon-fire weapon-${effect} ${faction} ${className}`} data-weapon-effect={effect} data-projectiles={projectiles}>
    <title>{effect} weapon fire</title>
    <g transform={`translate(${x1} ${y1}) rotate(${angle})`}>
      {offsets.map((offset, index) => <image key={`${id}-projectile-${index}`} className="weapon-projectile" href={weaponImages[effect]} x="0" y={-imageHeight / 2 + offset} width={imageWidth} height={imageHeight} preserveAspectRatio="none">
        {beam
          ? <animate attributeName="opacity" values=".35;1;.55" dur={`${duration}s`} begin={`${index * .035}s`} repeatCount="indefinite" />
          : <><animate attributeName="x" from="0" to={travel} dur={`${duration}s`} begin={`${index * .045}s`} repeatCount="1" fill="freeze" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.84;1" dur={`${duration}s`} begin={`${index * .045}s`} repeatCount="1" fill="freeze" /></>}
      </image>)}
    </g>
  </g>;
}
