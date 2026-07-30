import { type CSSProperties } from 'react';
import antiVehicle from '../../assets/ground/anti-vehicle.png';
import artillery from '../../assets/ground/artillery.png';
import defenseTurret from '../../assets/ground/defense-turret.png';
import dragonflyScout from '../../assets/ground/dragonfly-scout.png';
import falconGunship from '../../assets/ground/falcon-gunship.png';
import flakRover from '../../assets/ground/flak-rover.png';
import infantry from '../../assets/ground/infantry.png';
import lightTank from '../../assets/ground/light-tank.png';
import plasmaTank from '../../assets/ground/plasma-tank.png';
import railgunTank from '../../assets/ground/railgun-tank.png';
import recon from '../../assets/ground/recon.png';
import shockTrooper from '../../assets/ground/shock-trooper.png';
import siegeWalker from '../../assets/ground/siege-walker.png';
import aegisBastionTank from '../../assets/aegis/ground/bastion-tank.png';
import aegisFortressWalker from '../../assets/aegis/ground/fortress-walker.png';
import aegisPaladinGuard from '../../assets/aegis/ground/paladin-guard.png';
import aegisRampartArtillery from '../../assets/aegis/ground/rampart-artillery.png';
import aegisWarden from '../../assets/aegis/ground/warden.png';
import aegisHaloGunship from '../../assets/aegis/ground/halo-gunship.png';
import aegisSeraphSkimmer from '../../assets/aegis/ground/seraph-skimmer.png';
import aegisSkyguard from '../../assets/aegis/ground/aegis-skyguard.png';
import covenantBastionStrider from '../../assets/covenant/ground/bastion-strider.png';
import covenantBulwark from '../../assets/covenant/ground/iron-bulwark.png';
import covenantCohort from '../../assets/covenant/ground/iron-cohort.png';
import covenantFurnaceArtillery from '../../assets/covenant/ground/furnace-artillery.png';
import covenantJuggernaut from '../../assets/covenant/ground/juggernaut-engine.png';
import covenantRepairDrone from '../../assets/covenant/ground/repair-drone.png';
import covenantFurnaceGunship from '../../assets/covenant/ground/furnace-gunship.png';
import covenantWaspDrone from '../../assets/covenant/ground/wasp-drone.png';
import covenantFlakEngine from '../../assets/covenant/ground/covenant-flak-engine.png';
import acidBehemoth from '../../assets/brood/ground/acid-behemoth.png';
import acidSpitter from '../../assets/brood/ground/acid-spitter.png';
import broodling from '../../assets/brood/ground/broodling.png';
import carapaceBeast from '../../assets/brood/ground/carapace-beast.png';
import crusherBeast from '../../assets/brood/ground/crusher-beast.png';
import razorwing from '../../assets/brood/ground/razorwing.png';
import siegeCrawler from '../../assets/brood/ground/siege-crawler.png';
import skitterer from '../../assets/brood/ground/skitterer.png';
import spineTower from '../../assets/brood/ground/spine-tower.png';
import spineFlak from '../../assets/brood/ground/spine-flak.png';
import sporewing from '../../assets/brood/ground/sporewing.png';
import sporeLobber from '../../assets/brood/ground/spore-lobber.png';
import synapseGuard from '../../assets/brood/ground/synapse-guard.png';
import { BROOD_GROUND_KINDS, type GroundUnitKind, type UnitKind } from '../../game';

const GROUND_UNIT_IMAGES: Record<GroundUnitKind, string> = {
  infantry,
  antiVehicle,
  recon,
  lightTank,
  artillery,
  flakRover,
  dragonflyScout,
  falconGunship,
  shockTrooper,
  railgunTank,
  plasmaTank,
  siegeWalker,
  defenseTurret,
  broodling,
  acidSpitter,
  skitterer,
  carapaceBeast,
  sporeLobber,
  spineFlak,
  razorwing,
  sporewing,
  synapseGuard,
  crusherBeast,
  acidBehemoth,
  siegeCrawler,
  spineTower,
  aegisWarden,
  aegisBastionTank,
  aegisRampartArtillery,
  aegisSkyguard,
  aegisSeraphSkimmer,
  aegisHaloGunship,
  aegisPaladinGuard,
  aegisFortressWalker,
  covenantCohort,
  covenantRepairDrone,
  covenantBastionStrider,
  covenantFurnaceArtillery,
  covenantFlakEngine,
  covenantWaspDrone,
  covenantFurnaceGunship,
  covenantJuggernaut,
  covenantBulwark,
};

const BROOD_GROUND_IMAGES = new Set<GroundUnitKind>([...BROOD_GROUND_KINDS, 'spineTower']);

export const GROUND_UNIT_DISPLAY_SCALES = {
  infantry: .72,
  antiVehicle: .78,
  recon: .86,
  lightTank: .98,
  artillery: 1.06,
  flakRover: .925,
  dragonflyScout: .705,
  falconGunship: 1.115,
  shockTrooper: .82,
  railgunTank: 1.1,
  plasmaTank: 1.16,
  siegeWalker: 1.28,
  defenseTurret: 1.18,
  broodling: .66,
  acidSpitter: .75,
  skitterer: .84,
  carapaceBeast: 1.02,
  sporeLobber: .94,
  spineFlak: .955,
  razorwing: .735,
  sporewing: 1.105,
  synapseGuard: .88,
  crusherBeast: 1.14,
  acidBehemoth: 1.22,
  siegeCrawler: 1.3,
  spineTower: 1.2,
  aegisWarden: .76,
  aegisBastionTank: 1,
  aegisRampartArtillery: 1.08,
  aegisSkyguard: 1.035,
  aegisSeraphSkimmer: .795,
  aegisHaloGunship: 1.145,
  aegisPaladinGuard: .9,
  aegisFortressWalker: 1.26,
  covenantCohort: .74,
  covenantRepairDrone: .68,
  covenantBastionStrider: .96,
  covenantFurnaceArtillery: 1.07,
  covenantFlakEngine: 1.045,
  covenantWaspDrone: .815,
  covenantFurnaceGunship: 1.155,
  covenantJuggernaut: 1.24,
  covenantBulwark: 1.19,
} satisfies Record<GroundUnitKind, number>;

export const isGroundUnit = (kind: UnitKind): kind is GroundUnitKind => kind in GROUND_UNIT_IMAGES;

export function GroundUnitImage({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  if (!isGroundUnit(kind)) return null;
  const displayScale = GROUND_UNIT_DISPLAY_SCALES[kind];
  return <img
    className={`ground-unit-image ground-unit-sprite ${BROOD_GROUND_IMAGES.has(kind) ? 'brood-organic' : ''} ${className}`}
    src={GROUND_UNIT_IMAGES[kind]}
    alt=""
    aria-hidden="true"
    draggable={false}
    data-unit-kind={kind}
    data-display-scale={displayScale}
    style={{ '--ground-unit-scale': displayScale } as CSSProperties}
  />;
}
