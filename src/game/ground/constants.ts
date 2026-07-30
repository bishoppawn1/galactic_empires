export const GROUND_BATTLEFIELD_WIDTH = 5200;
export const GROUND_BATTLEFIELD_HEIGHT = 3200;
export const GROUND_UNIT_HITBOX_RADIUS = 52;
export const GROUND_UNIT_MIN_SPACING = GROUND_UNIT_HITBOX_RADIUS * 2;
export const GROUND_UNIT_SIGHT_RANGE = 28;
export const GROUND_UNIT_MOVEMENT_SPEED_SCALE = .5;

export interface GroundPosition {
  id?: string;
  battleX: number;
  battleY: number;
}
