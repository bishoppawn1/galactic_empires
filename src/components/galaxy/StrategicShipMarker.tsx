import {
  UNITS, isFlakFrigateKind, isPhaseControlShipKind, isReconShipKind, isTitanKind, spaceTierForUnit,
  type SpaceShipTier, type SpaceUnitKind,
} from '../../game';

export const STRATEGIC_SHIP_MARKER_ZOOM = .45;
export const STRATEGIC_SHIP_MARKER_SCREEN_SIZE = 22;

export type StrategicShipRole = 'transport' | 'escort' | 'long-range' | 'flak' | 'recon' | 'phase' | 'carrier' | 'capital' | 'titan';

const ROLE_SYMBOLS: Record<StrategicShipRole, string> = {
  transport: '⇣',
  escort: '◇',
  'long-range': '↗',
  flak: '✣',
  recon: '⌖',
  phase: 'Φ',
  carrier: '✦',
  capital: '◆',
  titan: 'Ω',
};

export const strategicShipMarkerInfo = (kind: SpaceUnitKind) => {
  const definition = UNITS[kind];
  const tier = spaceTierForUnit(kind) ?? 1;
  const role: StrategicShipRole = definition.fighterWing ? 'carrier'
    : definition.capacity ? 'transport'
      : isReconShipKind(kind) ? 'recon'
        : isPhaseControlShipKind(kind) ? 'phase'
          : isFlakFrigateKind(kind) ? 'flak'
            : isTitanKind(kind) ? 'titan'
              : tier === 3 ? 'capital'
                : definition.range >= 400 ? 'long-range'
                  : 'escort';
  return { role, symbol: ROLE_SYMBOLS[role], tier };
};

export const strategicTierLabel = (tier: SpaceShipTier) => tier === 1 ? 'I' : tier === 2 ? 'II' : 'III';

export const usesStrategicShipMarkers = (zoom: number) => zoom <= STRATEGIC_SHIP_MARKER_ZOOM;

export function StrategicShipMarker({ kind }: { kind: SpaceUnitKind }) {
  const marker = strategicShipMarkerInfo(kind);
  return <span
    className={`strategic-ship-marker camera-billboard role-${marker.role} tier-${marker.tier}`}
    data-ship-role={marker.role}
    data-ship-tier={marker.tier}
    aria-hidden="true"
  >
    <b>{marker.symbol}</b>
    <i>{strategicTierLabel(marker.tier)}</i>
  </span>;
}
