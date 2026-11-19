// Solmaris itself: a sun-soaked coastal grid. Roads run on a lattice; the squares between
// them are blocks holding buildings, parking lots or parks. East of the grid is a beach,
// then open water, with two wooden piers reaching out from the dock blocks. Everything
// solid (buildings, containers, warehouse walls) lives in `solids` for collision.
import { GRID, PITCH, WORLD, BUILDING_COLORS } from './config.js';
import { pick, randInt, randRange } from './random.js';

/** Centreline x of vertical road i, y of horizontal road j. */
export function roadCenterX(i) {
  return GRID.originX + GRID.road / 2 + i * PITCH;
}
export function roadCenterY(j) {
  return GRID.originY + GRID.road / 2 + j * PITCH;
}

/** Top-left corner of block (col, row). */
export function blockOrigin(col, row) {
  return {
    x: GRID.originX + GRID.road + col * PITCH,
    y: GRID.originY + GRID.road + row * PITCH,
  };
}

const SPECIAL = new Map([
  ['0,0', 'hospital'],
  ['3,1', 'station'],
  ['1,3', 'garage'],
  ['5,0', 'hotel'],
  ['2,1', 'showroom'],
  ['5,2', 'docks'],
  ['5,3', 'docks'],
  ['1,0', 'lot'],
  ['4,1', 'lot'],
  ['0,2', 'lot'],
  ['3,3', 'lot'],
  ['4,2', 'park'],
  ['2,3', 'hideout'],
]);

export class City {
  constructor(rng) {
    this.rng = rng;
    this.vRoads = [];
    this.hRoads = [];
    for (let i = 0; i < GRID.cols; i += 1) this.vRoads.push(roadCenterX(i));
    for (let j = 0; j < GRID.rows; j += 1) this.hRoads.push(roadCenterY(j));

    this.blocks = [];
    this.buildings = [];
    this.solids = [];
    this.palms = [];
    this.parkedSpots = [];
    this.containers = [];

    for (let row = 0; row < GRID.rows - 1; row += 1) {
      for (let col = 0; col < GRID.cols - 1; col += 1) {
        this.buildBlock(col, row);
      }
    }

    // Palms scattered over the beach and a few in parks.
    for (let i = 0; i < 26; i += 1) {
      this.palms.push({
        x: randRange(rng, WORLD.beachX + 30, WORLD.waterX - 40),
        y: randRange(rng, 80, WORLD.height - 80),
        s: randRange(rng, 0.8, 1.3),
      });
    }

    // Two piers reach into the water from the east–west roads by the docks.
    this.piers = [
      { x: 2622, y: roadCenterY(3) - 48, w: 618, h: 96 },
      { x: 2622, y: roadCenterY(4) - 48, w: 618, h: 96 },
    ];

    // Named places the story and the respawns use. Points sit on open ground.
    this.places = {
      hospital: { x: 285, y: 350, label: 'Solmaris General' },
      station: { x: 1400, y: 700, label: 'Police Station' },
      garage: { x: 800, y: 1690, label: "Mara's Garage" },
      hotel: { x: 2330, y: 330, label: 'Hotel Solmaris' },
      hotelLot: { x: 2330, y: 470, label: 'Hotel parking' },
      showroom: { x: 1150, y: 905, label: 'Solmaris Motors' },
      docks: { x: 2450, y: 1400, label: 'The Docks' },
      pierPickup: { x: 2850, y: roadCenterY(3), label: 'Pier A' },
      pierEnd: { x: 3120, y: roadCenterY(3), label: 'Pier A end' },
      hideout: { x: 1188, y: 1600, label: 'Hideout' },
      start: { x: 620, y: 1042, label: 'Palm Heights' },
    };
  }

  buildBlock(col, row) {
    const { x, y } = blockOrigin(col, row);
    const size = GRID.block;
    const kind = SPECIAL.get(`${col},${row}`) ?? 'city';
    const block = { col, row, x, y, w: size, h: size, kind };
    this.blocks.push(block);
    const rng = this.rng;
    const inset = 26;

    const addBuilding = (bx, by, bw, bh, label = null, color = null) => {
      const building = {
        x: bx, y: by, w: bw, h: bh,
        color: color ?? pick(rng, BUILDING_COLORS),
        height: randRange(rng, 14, 42),
        label,
      };
      this.buildings.push(building);
      this.solids.push(building);
      return building;
    };

    if (kind === 'hospital') {
      addBuilding(x + 90, y + 50, 190, 200, 'HOSPITAL', '#f7f4ec');
      return;
    }
    if (kind === 'station') {
      addBuilding(x + 80, y + 40, 200, 150, 'POLICE', '#b5c7d3');
      this.parkedSpots.push(...this.lotSpots(x + 30, y + 215, 3, 0));
      return;
    }
    if (kind === 'garage') {
      addBuilding(x + 60, y + 30, 190, 110, "MARA'S GARAGE", '#f2d16b');
      this.parkedSpots.push(...this.lotSpots(x + 40, y + 190, 3, 0));
      return;
    }
    if (kind === 'hotel') {
      addBuilding(x + 120, y + 20, 160, 130, 'HOTEL SOLMARIS', '#ffe5b4');
      // The hotel lot in front (south-west of the block) holds story cars.
      for (let i = 0; i < 4; i += 1) {
        this.parkedSpots.push({ x: x + 45 + i * 56, y: y + 215, angle: Math.PI / 2, hotel: true });
      }
      return;
    }
    if (kind === 'showroom') {
      addBuilding(x + 50, y + 30, 200, 120, 'SOLMARIS MOTORS', '#a8d5e5');
      return;
    }
    if (kind === 'docks') {
      // Long warehouse plus container stacks; lanes stay open for the shootout.
      addBuilding(x + 10, y + 16, 280, 74, 'WAREHOUSE', '#c9a876');
      for (let i = 0; i < 5; i += 1) {
        const c = {
          x: x + 20 + (i % 3) * 92, y: y + 130 + Math.floor(i / 3) * 74,
          w: 78, h: 34, container: true,
          color: pick(rng, ['#b5523c', '#3c6fb5', '#3f9e63', '#c9862b']),
        };
        this.containers.push(c);
        this.solids.push(c);
      }
      return;
    }
    if (kind === 'lot') {
      const horizontal = rng() > 0.5;
      const count = randInt(rng, 4, 6);
      for (let i = 0; i < count; i += 1) {
        this.parkedSpots.push(
          horizontal
            ? { x: x + 45 + i * 46, y: y + 80, angle: 0 }
            : { x: x + 80, y: y + 45 + i * 46, angle: Math.PI / 2 },
        );
      }
      return;
    }
    if (kind === 'park') {
      for (let i = 0; i < 6; i += 1) {
        this.palms.push({ x: x + randRange(rng, 40, size - 40), y: y + randRange(rng, 40, size - 40), s: randRange(rng, 0.9, 1.4) });
      }
      return;
    }
    if (kind === 'hideout') {
      // Two buildings with a courtyard gap between them: the hideout yard.
      addBuilding(x + 20, y + 30, 110, 240);
      addBuilding(x + 170, y + 30, 110, 240);
      return;
    }
    // Ordinary city block: one, two or four buildings with gaps between.
    const layout = randInt(rng, 0, 2);
    if (layout === 0) {
      addBuilding(x + inset + 20, y + inset + 16, size - inset * 2 - 40, size - inset * 2 - 32);
    } else if (layout === 1) {
      const w = (size - inset * 2 - 24) / 2;
      addBuilding(x + inset, y + inset + 10, w, size - inset * 2 - 20);
      addBuilding(x + inset + w + 24, y + inset + 10, w, size - inset * 2 - 20);
    } else {
      const w = (size - inset * 2 - 22) / 2;
      const h = (size - inset * 2 - 22) / 2;
      addBuilding(x + inset, y + inset, w, h);
      addBuilding(x + inset + w + 22, y + inset, w, h);
      addBuilding(x + inset, y + inset + h + 22, w, h);
      addBuilding(x + inset + w + 22, y + inset + h + 22, w, h);
    }
  }

  lotSpots(x, y, count, angle) {
    const spots = [];
    for (let i = 0; i < count; i += 1) spots.push({ x: x + i * 56, y, angle });
    return spots;
  }

  /** The block record containing a point, or null on a road / off-grid. */
  blockAt(x, y) {
    for (const b of this.blocks) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  isRoad(x, y) {
    if (x > WORLD.beachX + 60) return false;
    for (const cx of this.vRoads) if (Math.abs(x - cx) <= GRID.road / 2) return true;
    for (const cy of this.hRoads) if (Math.abs(y - cy) <= GRID.road / 2) return true;
    return false;
  }

  /** 'water' | 'pier' | 'sand' | 'road' | 'ground' — drives movement rules. */
  surfaceAt(x, y) {
    for (const p of this.piers) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'pier';
    }
    if (x >= WORLD.waterX) return 'water';
    if (x >= WORLD.beachX) return 'sand';
    if (this.isRoad(x, y)) return 'road';
    return 'ground';
  }

  /**
   * Push a circle (centre x, y, radius r) out of every solid. Returns the corrected
   * position plus `hit`, the deepest penetration found (0 when nothing was touched).
   */
  resolveCircle(x, y, r) {
    let hit = 0;
    for (const s of this.solids) {
      const nearX = Math.max(s.x, Math.min(x, s.x + s.w));
      const nearY = Math.max(s.y, Math.min(y, s.y + s.h));
      let dx = x - nearX;
      let dy = y - nearY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = r - d;
        hit = Math.max(hit, push);
        x += (dx / d) * push;
        y += (dy / d) * push;
      } else {
        // Centre inside the rect: leave by the shortest side.
        const left = x - s.x;
        const right = s.x + s.w - x;
        const top = y - s.y;
        const bottom = s.y + s.h - y;
        const min = Math.min(left, right, top, bottom);
        hit = Math.max(hit, min + r);
        if (min === left) x = s.x - r;
        else if (min === right) x = s.x + s.w + r;
        else if (min === top) y = s.y - r;
        else y = s.y + s.h + r;
      }
    }
    return { x, y, hit };
  }

  /** Clamp a point into the world bounds. */
  clampToWorld(x, y, r) {
    return {
      x: Math.max(r, Math.min(WORLD.width - r, x)),
      y: Math.max(r, Math.min(WORLD.height - r, y)),
    };
  }

  /**
   * Move a circle from (x, y) toward (nx, ny) without entering open water: tries the
   * full move, then each axis alone, then stays put. Piers count as dry land.
   */
  tryMove(x, y, nx, ny, r) {
    const dry = (px, py) => this.surfaceAt(px, py) !== 'water';
    if (dry(nx, ny)) return { x: nx, y: ny };
    if (dry(nx, y)) return { x: nx, y };
    if (dry(x, ny)) return { x, y: ny };
    return { x, y };
  }
}
