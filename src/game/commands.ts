import {
  beginResearch,
  constructBuilding,
  dispatchSpaceUnits,
  dockSpaceUnits,
  maneuverSpaceUnits,
  maneuverGroundUnits,
  queueUnit,
  setBattleFocus,
  setOrbitFocusTarget,
  tradeResources,
  type GameResult,
} from './engine';
import { BUILDINGS, RESEARCH, STANDARD_RESOURCES, UNITS } from './definitions';
import type { BuildingKind, GameState, ResearchId, Resource, UnitKind } from './types';

export type GameCommand =
  | { type: 'construct'; planetId: string; kind: BuildingKind }
  | { type: 'queueUnit'; planetId: string; kind: UnitKind; yardIds?: string[] }
  | { type: 'beginResearch'; id: ResearchId }
  | { type: 'trade'; from: Resource; to: Resource }
  | { type: 'dock'; planetId: string; unitIds: string[] }
  | { type: 'maneuver'; planetId: string; unitIds: string[]; orbitX: number; orbitY: number }
  | { type: 'battleManeuver'; planetId: string; unitIds: string[]; battleX: number; battleY: number }
  | { type: 'dispatch'; originId: string; unitIds: string[]; destinationId: string }
  | { type: 'battleFocus'; planetId: string; targetId?: string }
  | { type: 'orbitFocus'; planetId: string; targetId?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 100;
const isOptionalString = (value: unknown) => value === undefined || isString(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 64 && value.every(isString);
const isResource = (value: unknown): value is Resource => typeof value === 'string' && STANDARD_RESOURCES.some(resource => resource === value);

export function isGameCommand(value: unknown): value is GameCommand {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'construct': return isString(value.planetId) && isString(value.kind) && value.kind in BUILDINGS;
    case 'queueUnit': return isString(value.planetId) && isString(value.kind) && value.kind in UNITS && (value.yardIds === undefined || isStringArray(value.yardIds));
    case 'beginResearch': return isString(value.id) && value.id in RESEARCH;
    case 'trade': return isResource(value.from) && isResource(value.to) && value.from !== value.to;
    case 'dock': return isString(value.planetId) && isStringArray(value.unitIds);
    case 'maneuver': return isString(value.planetId) && isStringArray(value.unitIds) && Number.isFinite(value.orbitX) && Number.isFinite(value.orbitY);
    case 'battleManeuver': return isString(value.planetId) && isStringArray(value.unitIds) && Number.isFinite(value.battleX) && Number.isFinite(value.battleY);
    case 'dispatch': return isString(value.originId) && isStringArray(value.unitIds) && isString(value.destinationId);
    case 'battleFocus':
    case 'orbitFocus': return isString(value.planetId) && isOptionalString(value.targetId);
    default: return false;
  }
}

export function applyGameCommand(state: GameState, command: GameCommand): GameResult {
  switch (command.type) {
    case 'construct': return constructBuilding(state, command.planetId, command.kind);
    case 'queueUnit': return queueUnit(state, command.planetId, command.kind, command.yardIds);
    case 'beginResearch': return beginResearch(state, command.id);
    case 'trade': return tradeResources(state, command.from, command.to);
    case 'dock': return dockSpaceUnits(state, command.planetId, command.unitIds);
    case 'maneuver': return maneuverSpaceUnits(state, command.planetId, command.unitIds, command.orbitX, command.orbitY);
    case 'battleManeuver': return maneuverGroundUnits(state, command.planetId, command.unitIds, command.battleX, command.battleY);
    case 'dispatch': return dispatchSpaceUnits(state, command.originId, command.unitIds, command.destinationId);
    case 'battleFocus': return { ok: true, state: setBattleFocus(state, command.planetId, command.targetId) };
    case 'orbitFocus': return { ok: true, state: setOrbitFocusTarget(state, command.planetId, command.targetId) };
  }
}
