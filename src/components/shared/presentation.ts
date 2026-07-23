import type { BuildingKind, Fleet, Planet, UnitKind } from '../../game';

export const factionName = (owner: Planet['owner']) => owner === 'player' ? 'YOUR EMPIRE' : owner ? `RIVAL EMPIRE ${owner === 'enemy' ? 'A' : owner === 'rival2' ? 'B' : 'C'}` : 'NEUTRAL';

const factionPlanetColors: Record<Exclude<Planet['owner'], null>, string> = {
  player: '#55d6be', enemy: '#e86a92', rival2: '#ffc857', rival3: '#a98bff',
};

export const planetDisplayColor = (planet: Pick<Planet, 'color' | 'owner'>) => planet.owner ? factionPlanetColors[planet.owner] : planet.color;

export const fleetPhaseLabel = (fleet: Fleet) => fleet.phase === 'exiting' ? 'CLEARING WELL' : fleet.phase === 'charging' ? 'GATE CHARGE' : 'IN TUNNEL';

export const buildingIcon = (kind: BuildingKind) => kind.includes('Mine') ? '⌁' : kind.includes('Factory') ? '▰' : kind.includes('Defense') ? '⌂' : '⌬';

export const unitGlyph = (kind: UnitKind) => kind === 'infantry' || kind === 'aegisWarden' || kind === 'covenantCohort' ? '♟' : kind === 'antiVehicle' ? '⌁' : kind === 'recon' || kind === 'covenantRepairDrone' ? '◇' : kind === 'lightTank' || kind === 'aegisBastionTank' || kind === 'covenantBastionStrider' ? '▰' : kind === 'artillery' || kind === 'aegisRampartArtillery' || kind === 'covenantFurnaceArtillery' ? '⌖' : kind === 'shockTrooper' || kind === 'aegisPaladinGuard' ? '♞' : kind === 'railgunTank' ? '▱' : kind === 'plasmaTank' ? '⬣' : kind === 'siegeWalker' || kind === 'aegisFortressWalker' || kind === 'covenantJuggernaut' ? '♜' : kind === 'defenseTurret' || kind === 'covenantBulwark' ? '⌂' : kind === 'broodling' ? '✣' : kind === 'acidSpitter' ? '◔' : kind === 'skitterer' ? '⌁' : kind === 'carapaceBeast' ? '⬢' : kind === 'sporeLobber' ? '✺' : kind === 'synapseGuard' ? '♛' : kind === 'crusherBeast' ? '⬟' : kind === 'acidBehemoth' ? '◉' : kind === 'siegeCrawler' ? '✹' : kind === 'spineTower' ? '♜' : kind === 'transport' || kind === 'sporeArk' || kind === 'aegisBastionLander' || kind === 'covenantAssemblyArk' ? '△' : kind === 'destroyer' || kind === 'voidStalker' ? '◉' : kind === 'assaultCarrier' || kind === 'broodCarrier' || kind === 'aegisCitadelCarrier' || kind === 'covenantFabricatorCarrier' ? '⬡' : kind === 'commandFlagship' || kind === 'broodRazorQueen' || kind === 'aegisArbiterFlagship' || kind === 'covenantNullFlagship' ? '✪' : kind.includes('Frigate') || kind === 'aegisShieldMonitor' ? '◈' : kind === 'battlecruiser' || kind === 'leviathan' || kind === 'aegisWardCruiser' || kind === 'covenantFoundryCruiser' || kind === 'covenantIronclad' ? '✦' : kind === 'dreadnought' || kind === 'worldEater' || kind === 'aegisSovereignDreadnought' || kind === 'covenantDreadforge' ? '✹' : '◆';
