import assaultCarrier from '../../assets/ships/assault-carrier.png';
import battlecruiser from '../../assets/ships/battlecruiser.png';
import destroyer from '../../assets/ships/destroyer.png';
import dreadnought from '../../assets/ships/dreadnought.png';
import escortFrigate from '../../assets/ships/escort-frigate.png';
import lightCruiser from '../../assets/ships/light-cruiser.png';
import missileFrigate from '../../assets/ships/missile-frigate.png';
import transport from '../../assets/ships/transport.png';
import { SPACE_KINDS, type SpaceUnitKind, type UnitKind } from '../../game';

const SHIP_IMAGES: Record<SpaceUnitKind, string> = {
  transport,
  escortFrigate,
  missileFrigate,
  lightCruiser,
  destroyer,
  assaultCarrier,
  battlecruiser,
  dreadnought,
};

export const SHIP_DISPLAY_SIZES: Record<SpaceUnitKind, number> = {
  transport: 68,
  escortFrigate: 78,
  missileFrigate: 82,
  lightCruiser: 94,
  destroyer: 104,
  assaultCarrier: 116,
  battlecruiser: 126,
  dreadnought: 140,
};

export const isSpaceUnit = (kind: UnitKind): kind is SpaceUnitKind => SPACE_KINDS.includes(kind as SpaceUnitKind);

export const shipDisplaySize = (kind: UnitKind) => isSpaceUnit(kind) ? SHIP_DISPLAY_SIZES[kind] : SHIP_DISPLAY_SIZES.transport;

export function ShipImage({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  if (!isSpaceUnit(kind)) return null;
  return <img className={`ship-image ${className}`} src={SHIP_IMAGES[kind]} alt="" aria-hidden="true" draggable={false} />;
}
