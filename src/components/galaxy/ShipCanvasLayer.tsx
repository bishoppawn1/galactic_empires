import { useEffect, useMemo, useRef } from 'react';
import type { GameState, UnitFaction } from '../../game';
import { isSpaceUnit, shipDisplaySize, shipImageSource } from '../shared/ShipImage';
import { fleetHeading, fleetMapPosition, orbitShipHeading, pointInViewport, shipMapPosition, type GalaxyViewportBounds } from './geometry';

const FACTION_COLORS: Record<UnitFaction, string> = {
  player: '#55d6be',
  enemy: '#e86a92',
  rival2: '#ffc857',
  rival3: '#a98bff',
  neutral: '#d5ba82',
};

interface CanvasShip {
  id: string;
  kind: Parameters<typeof shipImageSource>[0];
  faction: UnitFaction;
  x: number;
  y: number;
  heading: number;
  charging: boolean;
}

export function inspectableShipAtPoint(state: GameState, x: number, y: number) {
  let nearest: { planetId: string; unitId: string; distance: number } | undefined;
  for (const planet of state.planets) {
    planet.orbitUnits.forEach((ship, index) => {
      if (ship.faction === 'player' || ship.faction === 'neutral' || ship.pendingLanding || ship.pendingEmbark || !isSpaceUnit(ship.kind)) return;
      const position = shipMapPosition(planet, ship, index);
      const distance = Math.hypot(position.x - x, position.y - y);
      const hitRadius = Math.max(20, shipDisplaySize(ship.kind) * .45);
      if (distance <= hitRadius && (!nearest || distance < nearest.distance)) nearest = { planetId: planet.id, unitId: ship.id, distance };
    });
  }
  state.fleets.forEach(fleet => {
    if (fleet.faction === 'player' || !isSpaceUnit(fleet.unit.kind)) return;
    const position = fleetMapPosition(fleet, state.planets);
    const distance = Math.hypot(position.x - x, position.y - y);
    const hitRadius = Math.max(20, shipDisplaySize(fleet.unit.kind) * .45);
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

export function ShipCanvasLayer({ state, bounds, zoom, selectedShipIds }: { state: GameState; bounds?: GalaxyViewportBounds; zoom: number; selectedShipIds: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ships = useMemo(() => {
    const orbiting = state.planets.flatMap(planet => planet.orbitUnits.flatMap((ship, index) => {
      if (ship.faction === 'player' || ship.pendingLanding || ship.pendingEmbark || !isSpaceUnit(ship.kind)) return [];
      const position = shipMapPosition(planet, ship, index);
      return pointInViewport(bounds, position.x, position.y, shipDisplaySize(ship.kind))
        ? [{ id: ship.id, kind: ship.kind, faction: ship.faction, ...position, heading: orbitShipHeading(ship), charging: false } satisfies CanvasShip]
        : [];
    }));
    const traveling = state.fleets.flatMap(fleet => {
      if (fleet.faction === 'player' || !isSpaceUnit(fleet.unit.kind)) return [];
      const position = fleetMapPosition(fleet, state.planets);
      return pointInViewport(bounds, position.x, position.y, shipDisplaySize(fleet.unit.kind))
        ? [{ id: fleet.unit.id, kind: fleet.unit.kind, faction: fleet.faction, x: position.x, y: position.y, heading: fleetHeading(fleet, state.planets), charging: position.phase === 'charging' } satisfies CanvasShip]
        : [];
    });
    return [...orbiting, ...traveling];
  }, [bounds, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const pixelScale = Math.min(1.5, Math.max(.5, zoom * (window.devicePixelRatio || 1)));
    const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    canvas.width = Math.max(1, Math.ceil(width * pixelScale));
    canvas.height = Math.max(1, Math.ceil(height * pixelScale));
    context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    context.clearRect(0, 0, width, height);
    let active = true;

    const draw = () => {
      if (!active) return;
      context.clearRect(0, 0, width, height);
      for (const ship of ships) {
        const image = cachedShipImage(ship.kind);
        if (!image.complete) { image.onload = draw; continue; }
        const size = shipDisplaySize(ship.kind);
        context.save();
        context.translate(ship.x - bounds.left, ship.y - bounds.top);
        context.rotate(ship.heading * Math.PI / 180);
        context.globalAlpha = ship.charging ? .72 : .9;
        context.drawImage(image, -size / 2, -size / 2, size, size);
        const selected = selectedShipIds.includes(ship.id);
        context.strokeStyle = selected ? '#ffffff' : ship.charging ? '#ffc857' : FACTION_COLORS[ship.faction];
        context.lineWidth = selected ? 4 : ship.charging ? 3 : 2;
        context.strokeRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6);
        context.restore();
      }
    };
    draw();
    return () => { active = false; };
  }, [bounds, selectedShipIds, ships, zoom]);

  const style = bounds ? { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top } : undefined;
  return <canvas ref={canvasRef} className="ship-canvas-layer" style={style} data-ship-count={ships.length} data-selected-ship-count={ships.filter(ship => selectedShipIds.includes(ship.id)).length} data-transit-count={state.fleets.length} aria-hidden="true" />;
}
