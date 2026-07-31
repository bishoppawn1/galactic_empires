import nebulaR0C0 from '../../assets/galaxy/nebula-tiles/nebula-r0-c0.webp';
import nebulaR0C1 from '../../assets/galaxy/nebula-tiles/nebula-r0-c1.webp';
import nebulaR0C2 from '../../assets/galaxy/nebula-tiles/nebula-r0-c2.webp';
import nebulaR0C3 from '../../assets/galaxy/nebula-tiles/nebula-r0-c3.webp';
import nebulaR1C0 from '../../assets/galaxy/nebula-tiles/nebula-r1-c0.webp';
import nebulaR1C1 from '../../assets/galaxy/nebula-tiles/nebula-r1-c1.webp';
import nebulaR1C2 from '../../assets/galaxy/nebula-tiles/nebula-r1-c2.webp';
import nebulaR1C3 from '../../assets/galaxy/nebula-tiles/nebula-r1-c3.webp';
import nebulaR2C0 from '../../assets/galaxy/nebula-tiles/nebula-r2-c0.webp';
import nebulaR2C1 from '../../assets/galaxy/nebula-tiles/nebula-r2-c1.webp';
import nebulaR2C2 from '../../assets/galaxy/nebula-tiles/nebula-r2-c2.webp';
import nebulaR2C3 from '../../assets/galaxy/nebula-tiles/nebula-r2-c3.webp';
import nebulaR3C0 from '../../assets/galaxy/nebula-tiles/nebula-r3-c0.webp';
import nebulaR3C1 from '../../assets/galaxy/nebula-tiles/nebula-r3-c1.webp';
import nebulaR3C2 from '../../assets/galaxy/nebula-tiles/nebula-r3-c2.webp';
import nebulaR3C3 from '../../assets/galaxy/nebula-tiles/nebula-r3-c3.webp';

const NEBULA_TILE_COLUMNS = 4;
const nebulaTiles = [
  nebulaR0C0, nebulaR0C1, nebulaR0C2, nebulaR0C3,
  nebulaR1C0, nebulaR1C1, nebulaR1C2, nebulaR1C3,
  nebulaR2C0, nebulaR2C1, nebulaR2C2, nebulaR2C3,
  nebulaR3C0, nebulaR3C1, nebulaR3C2, nebulaR3C3,
];

export function NebulaTileLayer() {
  return <div className="galaxy-nebula-tiles" aria-hidden="true">
    {nebulaTiles.map((source, index) => <img
      key={source}
      className="galaxy-nebula-tile"
      src={source}
      alt=""
      draggable={false}
      data-nebula-row={Math.floor(index / NEBULA_TILE_COLUMNS)}
      data-nebula-column={index % NEBULA_TILE_COLUMNS}
    />)}
  </div>;
}
