import type { GalaxyCanvasDimensions } from '../../game';
import { DEFAULT_GALAXY_CANVAS_DIMENSIONS } from './geometry';

export interface GalaxyCamera {
  pitch: number;
  yaw: number;
}

export interface GalaxyPoint {
  x: number;
  y: number;
}

export const DEFAULT_GALAXY_CAMERA: GalaxyCamera = { pitch: 38, yaw: 0 };
export const MIN_CAMERA_PITCH = 20;
export const MAX_CAMERA_PITCH = 70;

export const clampCameraPitch = (pitch: number) => Math.min(MAX_CAMERA_PITCH, Math.max(MIN_CAMERA_PITCH, pitch));
export const cameraDepth = (pitch: number) => Math.cos(clampCameraPitch(pitch) * Math.PI / 180);

export function projectGalaxyPoint(point: GalaxyPoint, camera: GalaxyCamera, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS): GalaxyPoint {
  const centerX = dimensions.width / 2, centerY = dimensions.height / 2;
  const radians = camera.yaw * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = point.x - centerX, y = (point.y - centerY) * cameraDepth(camera.pitch);
  return { x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos };
}

export function unprojectGalaxyPoint(point: GalaxyPoint, camera: GalaxyCamera, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS): GalaxyPoint {
  const centerX = dimensions.width / 2, centerY = dimensions.height / 2;
  const radians = -camera.yaw * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = point.x - centerX, y = point.y - centerY;
  return {
    x: centerX + x * cos - y * sin,
    y: centerY + (x * sin + y * cos) / cameraDepth(camera.pitch),
  };
}

export function galaxyCameraBounds(camera: GalaxyCamera, dimensions: GalaxyCanvasDimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) {
  const corners = [
    { x: 0, y: 0 },
    { x: dimensions.width, y: 0 },
    { x: 0, y: dimensions.height },
    { x: dimensions.width, y: dimensions.height },
  ].map(point => projectGalaxyPoint(point, camera, dimensions));
  const minX = Math.min(...corners.map(point => point.x)), maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y)), maxY = Math.max(...corners.map(point => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
