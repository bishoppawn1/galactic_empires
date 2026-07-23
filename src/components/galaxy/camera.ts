import { GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH } from './geometry';

export interface GalaxyCamera {
  pitch: number;
  yaw: number;
}

export interface GalaxyPoint {
  x: number;
  y: number;
}

export const DEFAULT_GALAXY_CAMERA: GalaxyCamera = { pitch: 50, yaw: 0 };
export const MIN_CAMERA_PITCH = 20;
export const MAX_CAMERA_PITCH = 70;

export const clampCameraPitch = (pitch: number) => Math.min(MAX_CAMERA_PITCH, Math.max(MIN_CAMERA_PITCH, pitch));
export const cameraDepth = (pitch: number) => Math.cos(clampCameraPitch(pitch) * Math.PI / 180);

export function projectGalaxyPoint(point: GalaxyPoint, camera: GalaxyCamera): GalaxyPoint {
  const centerX = GALAXY_CANVAS_WIDTH / 2, centerY = GALAXY_CANVAS_HEIGHT / 2;
  const radians = camera.yaw * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = point.x - centerX, y = (point.y - centerY) * cameraDepth(camera.pitch);
  return { x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos };
}

export function unprojectGalaxyPoint(point: GalaxyPoint, camera: GalaxyCamera): GalaxyPoint {
  const centerX = GALAXY_CANVAS_WIDTH / 2, centerY = GALAXY_CANVAS_HEIGHT / 2;
  const radians = -camera.yaw * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = point.x - centerX, y = point.y - centerY;
  return {
    x: centerX + x * cos - y * sin,
    y: centerY + (x * sin + y * cos) / cameraDepth(camera.pitch),
  };
}

export function galaxyCameraBounds(camera: GalaxyCamera) {
  const corners = [
    { x: 0, y: 0 },
    { x: GALAXY_CANVAS_WIDTH, y: 0 },
    { x: 0, y: GALAXY_CANVAS_HEIGHT },
    { x: GALAXY_CANVAS_WIDTH, y: GALAXY_CANVAS_HEIGHT },
  ].map(point => projectGalaxyPoint(point, camera));
  const minX = Math.min(...corners.map(point => point.x)), maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y)), maxY = Math.max(...corners.map(point => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
