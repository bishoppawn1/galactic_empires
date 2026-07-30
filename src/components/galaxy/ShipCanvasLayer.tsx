import { useEffect, useMemo, useRef } from 'react';
import { galaxyCanvasDimensions, visibleOrbitUnits, type GameState, type UnitFaction } from '../../game';
import { isSpaceUnit, shipDisplaySize, shipImageSource } from '../shared/ShipImage';
import { fleetHeading, fleetMapPosition, orbitShipHeading, pointInViewport, shipMapPosition, type GalaxyViewportBounds } from './geometry';
import { canvasPixelScale } from './renderBudget';
import {
  STRATEGIC_SHIP_MARKER_SCREEN_SIZE, strategicShipMarkerInfo, strategicTierLabel, usesStrategicShipMarkers,
} from './StrategicShipMarker';

interface CanvasShip {
  id: string;
  kind: Parameters<typeof shipImageSource>[0];
  faction: UnitFaction;
  x: number;
  y: number;
  heading: number;
  charging: boolean;
}

export function inspectableShipAtPoint(state: GameState, x: number, y: number, zoom = 1) {
  const dimensions = galaxyCanvasDimensions(state.config.mapSize);
  const strategicHitRadius = usesStrategicShipMarkers(zoom) ? STRATEGIC_SHIP_MARKER_SCREEN_SIZE / zoom * .65 : 0;
  let nearest: { planetId: string; unitId: string; distance: number } | undefined;
  for (const planet of state.planets) {
    visibleOrbitUnits(planet).forEach((ship, index) => {
      if (ship.faction === 'player' || ship.faction === 'neutral' || ship.pendingLanding || ship.pendingEmbark || !isSpaceUnit(ship.kind)) return;
      const position = shipMapPosition(planet, ship, index, dimensions);
      const distance = Math.hypot(position.x - x, position.y - y);
      const hitRadius = Math.max(20, shipDisplaySize(ship.kind) * .45, strategicHitRadius);
      if (distance <= hitRadius && (!nearest || distance < nearest.distance)) nearest = { planetId: planet.id, unitId: ship.id, distance };
    });
  }
  state.fleets.forEach(fleet => {
    if (fleet.faction === 'player' || !isSpaceUnit(fleet.unit.kind)) return;
    const position = fleetMapPosition(fleet, state.planets, dimensions);
    const distance = Math.hypot(position.x - x, position.y - y);
    const hitRadius = Math.max(20, shipDisplaySize(fleet.unit.kind) * .45, strategicHitRadius);
    if (distance <= hitRadius && (!nearest || distance < nearest.distance)) nearest = { planetId: fleet.destinationId, unitId: fleet.unit.id, distance };
  });
  return nearest;
}

const imageCache = new Map<CanvasShip['kind'], HTMLImageElement>();

const cachedShipImage = (kind: CanvasShip['kind']) => {
  const cached = imageCache.get(kind);
  if (cached) return cached;
  const image = new Image();
  image.src = shipImageSource(kind);
  imageCache.set(kind, image);
  return image;
};

const factionMarkerColor: Record<UnitFaction, string> = {
  player: '#55d6be',
  enemy: '#e86a92',
  rival2: '#ffc857',
  rival3: '#a98bff',
  neutral: '#d5ba82',
};

const drawStrategicMarker = (context: CanvasRenderingContext2D, ship: CanvasShip, zoom: number, selected: boolean) => {
  const marker = strategicShipMarkerInfo(ship.kind);
  const size = STRATEGIC_SHIP_MARKER_SCREEN_SIZE / zoom;
  const radius = size / 2;
  const line = 1.5 / zoom;
  const color = factionMarkerColor[ship.faction];
  context.globalAlpha = ship.charging ? .76 : .96;
  context.fillStyle = '#071016';
  context.strokeStyle = color;
  context.lineWidth = line;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (marker.tier >= 2) {
    context.beginPath();
    context.arc(0, 0, radius * .7, 0, Math.PI * 2);
    context.stroke();
  }
  if (marker.tier === 3) {
    context.beginPath();
    context.moveTo(-radius * .78, 0);
    context.lineTo(0, -radius * .78);
    context.lineTo(radius * .78, 0);
    context.lineTo(0, radius * .78);
    context.closePath();
    context.stroke();
  }
  context.globalAlpha = 1;
  context.fillStyle = color;
  context.font = `700 ${size * .45}px Inter, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(marker.symbol, 0, -size * .03);
  context.fillStyle = '#071016';
  context.strokeStyle = color;
  context.lineWidth = line;
  context.beginPath();
  context.arc(radius * .66, radius * .66, radius * .35, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = `700 ${size * .2}px Inter, sans-serif`;
  context.fillText(strategicTierLabel(marker.tier), radius * .66, radius * .67);
  if (selected) {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2.5 / zoom;
    context.beginPath();
    context.arc(0, 0, radius + 4 / zoom, 0, Math.PI * 2);
    context.stroke();
  }
};

export function ShipCanvasLayer({ state, bounds, zoom, selectedShipIds }: { state: GameState; bounds?: GalaxyViewportBounds; zoom: number; selectedShipIds: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ships = useMemo(() => {
    const dimensions = galaxyCanvasDimensions(state.config.mapSize);
    const orbiting = state.planets.flatMap(planet => visibleOrbitUnits(planet).flatMap((ship, index) => {
      if (ship.faction === 'player' || ship.pendingLanding || ship.pendingEmbark || !isSpaceUnit(ship.kind)) return [];
      const position = shipMapPosition(planet, ship, index, dimensions);
      return pointInViewport(bounds, position.x, position.y, shipDisplaySize(ship.kind))
        ? [{ id: ship.id, kind: ship.kind, faction: ship.faction, ...position, heading: orbitShipHeading(ship), charging: false } satisfies CanvasShip]
        : [];
    }));
    const traveling = state.fleets.flatMap(fleet => {
      if (fleet.faction === 'player' || !isSpaceUnit(fleet.unit.kind)) return [];
      const position = fleetMapPosition(fleet, state.planets, dimensions);
      return pointInViewport(bounds, position.x, position.y, shipDisplaySize(fleet.unit.kind))
        ? [{ id: fleet.unit.id, kind: fleet.unit.kind, faction: fleet.faction, x: position.x, y: position.y, heading: fleetHeading(fleet, state.planets, dimensions), charging: position.phase === 'charging' } satisfies CanvasShip]
        : [];
    });
    return [...orbiting, ...traveling];
  }, [bounds, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const pixelScale = canvasPixelScale(zoom, window.devicePixelRatio || 1);
    const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    const backingWidth = Math.max(1, Math.ceil(width * pixelScale));
    const backingHeight = Math.max(1, Math.ceil(height * pixelScale));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    context.clearRect(0, 0, width, height);
    let active = true;
    const selectedIds = new Set(selectedShipIds);

    const draw = () => {
      if (!active) return;
      context.clearRect(0, 0, width, height);
      for (const ship of ships) {
        const selected = selectedIds.has(ship.id);
        if (usesStrategicShipMarkers(zoom)) {
          context.save();
          context.translate(ship.x - bounds.left, ship.y - bounds.top);
          drawStrategicMarker(context, ship, zoom, selected);
          context.restore();
          continue;
        }
        const image = cachedShipImage(ship.kind);
        if (!image.complete) { image.onload = draw; continue; }
        const size = shipDisplaySize(ship.kind);
        context.save();
        context.translate(ship.x - bounds.left, ship.y - bounds.top);
        context.rotate(ship.heading * Math.PI / 180);
        context.globalAlpha = ship.charging ? .72 : .9;
        context.drawImage(image, -size / 2, -size / 2, size, size);
        if (selected) {
          context.globalAlpha = 1;
          context.strokeStyle = '#ffffff';
          context.lineWidth = 3;
          context.beginPath();
          context.arc(0, 0, size / 2 + 5, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
      }
    };
    draw();
    return () => { active = false; };
  }, [bounds, selectedShipIds, ships, zoom]);

  const style = bounds ? { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top } : undefined;
  const selectedIds = new Set(selectedShipIds);
  const strategicMarkers = usesStrategicShipMarkers(zoom);
  return <canvas ref={canvasRef} className="ship-canvas-layer" style={style} data-ship-count={ships.length} data-selected-ship-count={ships.filter(ship => selectedIds.has(ship.id)).length} data-transit-count={state.fleets.length} data-marker-mode={strategicMarkers ? 'strategic' : 'artwork'} data-tier-one-marker-count={strategicMarkers ? ships.filter(ship => strategicShipMarkerInfo(ship.kind).tier === 1).length : 0} data-tier-two-marker-count={strategicMarkers ? ships.filter(ship => strategicShipMarkerInfo(ship.kind).tier === 2).length : 0} data-tier-three-marker-count={strategicMarkers ? ships.filter(ship => strategicShipMarkerInfo(ship.kind).tier === 3).length : 0} aria-hidden="true" />;
}
