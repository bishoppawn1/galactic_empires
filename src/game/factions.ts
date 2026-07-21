import { UNITS } from './definitions';
import type { EmpireFaction, GameState, PlayableFaction, ResourcePool, Unit } from './types';

export interface PlayableFactionDefinition {
  label: string;
  shortLabel: string;
  doctrine: string;
  description: string;
  strengths: string;
  weakness: string;
  signatureUnits: string[];
  color: string;
}

export const PLAYABLE_FACTIONS: PlayableFaction[] = ['human', 'brood', 'aegis', 'covenant'];

export const PLAYABLE_FACTION_DEFINITIONS: Record<PlayableFaction, PlayableFactionDefinition> = {
  human: {
    label: 'Human Coalition', shortLabel: 'Coalition', doctrine: 'Combined arms',
    description: 'A flexible roster with dependable industry and no severe strategic weakness.',
    strengths: 'Adaptable fleets · broad technology', weakness: 'No extreme specialization',
    signatureUnits: ['Escort Frigate', 'Light Tank', 'Battlecruiser'], color: '#55d6be',
  },
  brood: {
    label: 'The Brood', shortLabel: 'Brood', doctrine: 'Overwhelming growth',
    description: 'Living armies grown rapidly from planetary biomass and the remains of every battlefield.',
    strengths: 'Single-resource economy · casualty recycling', weakness: 'Weak individual organisms',
    signatureUnits: ['Spore Ark', 'Spore Lobber', 'World Eater'], color: '#9bd85b',
  },
  aegis: {
    label: 'Aegis Directorate', shortLabel: 'Aegis', doctrine: 'Armored advance',
    description: 'Slow, disciplined formations built around regenerating shields, fortress hulls, and long-range siege fire.',
    strengths: 'Massive shields · battle regeneration', weakness: 'Slow and expensive deployment',
    signatureUnits: ['Shield Monitor', 'Bastion Tank', 'Citadel Carrier'], color: '#ffc857',
  },
  covenant: {
    label: 'Iron Covenant', shortLabel: 'Covenant', doctrine: 'Mechanical attrition',
    description: 'Self-repairing machines that preserve veteran formations and reclaim ruined technology.',
    strengths: 'Repair systems · salvage · modular forces', weakness: 'Vulnerable to concentrated destruction',
    signatureUnits: ['Repair Drone', 'Salvage Frigate', 'Assembly Ark'], color: '#8fb4d8',
  },
};

export const BROOD_STARTING_BIOMASS = 550;
export const BROOD_BIOMASS_PER_PLANET = 4;
export const BROOD_BIOMASS_COST_RATIO = .45;
export const BROOD_BIOMASS_RECOVERY_RATIO = .35;

export const empireCivilization = (state: Pick<GameState, 'empireCivilizations'>, faction: EmpireFaction = 'player') =>
  state.empireCivilizations[faction] ?? 'human';

export const usesBiomass = (state: Pick<GameState, 'empireCivilizations'>, faction: EmpireFaction = 'player') =>
  empireCivilization(state, faction) === 'brood';

export const biomassCost = (cost: ResourcePool) => Math.max(0, Math.ceil((cost.metal + cost.crystal + cost.gold) * BROOD_BIOMASS_COST_RATIO));

export const formatFactionCost = (cost: ResourcePool, faction: PlayableFaction) => faction === 'brood'
  ? `${biomassCost(cost)} BIOMASS`
  : [cost.metal && `${cost.metal}M`, cost.crystal && `${cost.crystal}C`, cost.gold && `${cost.gold}G`].filter(Boolean).join(' · ');

export const startingResources = (faction: PlayableFaction): ResourcePool => faction === 'brood'
  ? { metal: 0, crystal: 0, gold: 0, biomass: BROOD_STARTING_BIOMASS }
  : { metal: 520, crystal: 420, gold: 280 };

export function recoverableBiomass(units: Unit[]): number {
  const biomass = (unit: Unit): number => biomassCost(UNITS[unit.kind].cost) + (unit.cargo?.reduce((sum, cargo) => sum + biomass(cargo), 0) ?? 0);
  return Math.floor(units.reduce((sum, unit) => sum + biomass(unit), 0) * BROOD_BIOMASS_RECOVERY_RATIO);
}
