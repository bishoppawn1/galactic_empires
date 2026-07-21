import type { BuildingKind, Fleet, Planet, UnitKind } from '../../game';

export const factionName = (owner: Planet['owner']) => owner === 'player' ? 'YOUR EMPIRE' : owner ? `RIVAL EMPIRE ${owner === 'enemy' ? 'A' : owner === 'rival2' ? 'B' : 'C'}` : 'NEUTRAL';

export const fleetPhaseLabel = (fleet: Fleet) => fleet.phase === 'exiting' ? 'CLEARING WELL' : fleet.phase === 'charging' ? 'GATE CHARGE' : 'IN TUNNEL';

export const buildingIcon = (kind: BuildingKind) => kind.includes('Mine') ? '⌁' : kind.includes('Factory') ? '▰' : kind.includes('Defense') ? '⌂' : '⌬';

export const unitGlyph = (kind: UnitKind) => kind === 'infantry' ? '♟' : kind === 'antiVehicle' ? '⌁' : kind === 'recon' ? '◇' : kind === 'lightTank' ? '▰' : kind === 'artillery' ? '⌖' : kind === 'shockTrooper' ? '♞' : kind === 'railgunTank' ? '▱' : kind === 'plasmaTank' ? '⬣' : kind === 'siegeWalker' ? '♜' : kind === 'defenseTurret' ? '⌂' : kind === 'transport' ? '△' : kind === 'destroyer' ? '◉' : kind === 'assaultCarrier' ? '⬡' : kind.includes('Frigate') ? '◈' : kind === 'battlecruiser' ? '✦' : kind === 'dreadnought' ? '✹' : '◆';
