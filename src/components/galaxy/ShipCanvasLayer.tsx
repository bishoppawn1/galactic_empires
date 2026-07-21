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

const imageCache = new Map<CanvasShip['kind'], HTMLImageElement>();

const cachedShipImage = (kind: CanvasShip['kind']) => {
  const cached = imageCache.get(kind);
  if (cached) return cached;
  const image = new Image();
  image.src = shipImageSource(kind);
  imageCache.set(kind, image);
  return image;
};

export function ShipCanvasLayer({ state, bounds, zoom }: { state: GameState; bounds?: GalaxyViewportBounds; zoom: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ships = useMemo(() => {
    const orbiting = state.planets.flatMap(planet => planet.orbitUnits.flatMap((ship, index) => {
      if (ship.faction === 'player' || ship.pendingLanding || ship.pendingEmbark || !isSpaceUnit(ship.kind)) return [];
      const position = shipMapPosition(planet, ship, index);
      return pointInViewport(bounds, position.x, position.y, shipDisplaySize(ship.kind))
        ? [{ id: ship.id, kind: ship.kind, faction: ship.faction, ...position, heading: orbitShipHeading(ship), charging: false } satisfies CanvasShip]
        : [];
    }));
    const traveling = state.fleets.flatMap((fleet, index) => {
      if (!isSpaceUnit(fleet.unit.kind)) return [];
      const position = fleetMapPosition(fleet, state.planets);
      if (fleet.faction === 'player' && (position.phase === 'exiting' || position.phase === 'charging')) return [];
      const x = position.x + (index % 4) * 18, y = position.y + Math.floor(index / 4) * 18;
      return pointInViewport(bounds, x, y, shipDisplaySize(fleet.unit.kind))
        ? [{ id: fleet.id, kind: fleet.unit.kind, faction: fleet.faction, x, y, heading: fleetHeading(fleet, state.planets), charging: position.phase === 'charging' } satisfies CanvasShip]
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
        context.strokeStyle = ship.charging ? '#ffc857' : FACTION_COLORS[ship.faction];
        context.lineWidth = ship.charging ? 3 : 2;
        context.strokeRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6);
        context.restore();
      }
    };
    draw();
    return () => { active = false; };
  }, [bounds, ships, zoom]);

  const style = bounds ? { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top } : undefined;
  return <canvas ref={canvasRef} className="ship-canvas-layer" style={style} data-ship-count={ships.length} data-transit-count={state.fleets.length} aria-hidden="true" />;
}
