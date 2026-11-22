// Solmaris itself: a seeded coastal grid city. Blocks are classified by district — a
// downtown core of towers, a warehouse docklands in the south-east, parks, a plaza and
// ordinary streets of houses and shops — and each block is filled with buildings whose
// AABBs double as the collision world. The east edge is beach and open water.

import { WORLD, PITCH, COLORS } from './config.js';
import { makeRng, pick, randInt, randRange } from './random.js';

const ROOFS = ['#c96f4a', '#b8574d', '#d9a05b', '#8f9aa6', '#7d8ca3', '#c2b49a', '#a3b18a', '#e0e1dd', '#bc6c25', '#606c38', '#90a955', '#dda15e'];
const WALLS = ['#e8dcc8', '#d6ccc0', '#cbb9a0', '#b8c4ce', '#e5e0d5', '#d9c6a5', '#a8b8c8', '#efe6da'];
const WAREHOUSE_ROOFS = ['#7a7f85', '#6e7f8a', '#8a7360', '#5f707c'];
const CONTAINERS = ['#c1443c', '#2e6da4', '#3f9142', '#d9a441', '#704214', '#5b5ea6'];

export function blockOrigin(bx, by) {
  return { x: WORLD.road + bx * PITCH, y: WORLD.road + by * PITCH };
}

export function districtOf(bx, by) {
  if ((bx === 1 && by === 2) || (bx === 6 && by === 1)) return 'park';
  if (bx === 3 && by === 5) return 'plaza';
  if (by >= 4 && bx >= 5) return 'docks';
  if (bx >= 2 && bx <= 4 && by >= 1 && by <= 3) return 'downtown';
  return 'street';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const colliders = [];
  const trees = [];
  const lamps = [];
  const containers = [];
  const lots = [];

  const addBuilding = (x, y, w, h, height, roof, wall, kind) => {
    const b = { x, y, w, h, height, roof, wall, kind };
    buildings.push(b);
    colliders.push({ x, y, w, h });
    return b;
  };

  for (let bx = 0; bx < 8; bx += 1) {
    for (let by = 0; by < 6; by += 1) {
      const { x: ox, y: oy } = blockOrigin(bx, by);
      const district = districtOf(bx, by);
      const inner = 18; // pavement margin inside the block
      const ix = ox + inner;
      const iy = oy + inner;
      const iw = WORLD.block - inner * 2;

      if (district === 'park') {
        for (let i = 0; i < 16; i += 1) {
          trees.push({ x: ix + rng() * iw, y: iy + rng() * iw, r: randRange(rng, 9, 15) });
        }
        continue;
      }
      if (district === 'plaza') {
        lots.push({ x: ix, y: iy, w: iw, h: iw, kind: 'plaza' });
        for (let i = 0; i < 6; i += 1) {
          trees.push({ x: ix + 12 + (i % 3) * (iw / 2 - 12), y: iy + 12 + Math.floor(i / 3) * (iw - 24), r: 10 });
        }
        continue;
      }
      if (district === 'docks') {
        // one or two long warehouses plus container stacks in the yard
        const n = rng() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i += 1) {
          const w = randRange(rng, 150, 210);
          const h = randRange(rng, 84, 120);
          const x = ix + (i % 2) * (iw - w) * (n === 1 ? rng() : 1);
          const y = iy + Math.floor(i / 2) * 130 + rng() * 20;
          addBuilding(x, y, w, h, randRange(rng, 10, 16), pick(rng, WAREHOUSE_ROOFS), '#9aa0a3', 'warehouse');
        }
        for (let i = 0; i < 7; i += 1) {
          const c = { x: ix + rng() * (iw - 44), y: iy + rng() * (iw - 20), w: 44, h: 20, color: pick(rng, CONTAINERS) };
          containers.push(c);
          colliders.push({ x: c.x, y: c.y, w: c.w, h: c.h });
        }
        continue;
      }
      if (district === 'downtown') {
        const cols = 2;
        const rows = 2;
        const cw = iw / cols;
        const ch = iw / rows;
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if (rng() < 0.12) continue; // the odd parking lot between towers
            const pad = randRange(rng, 10, 22);
            addBuilding(
              ix + cx * cw + pad, iy + cy * ch + pad,
              cw - pad * 2, ch - pad * 2,
              randRange(rng, 42, 96),
              pick(rng, ROOFS), pick(rng, WALLS), 'tower',
            );
          }
        }
        continue;
      }
      // ordinary street block: a row of smaller houses and shops
      const n = randInt(rng, 4, 6);
      const cw = iw / Math.ceil(n / 2);
      for (let i = 0; i < n; i += 1) {
        const cx = i % Math.ceil(n / 2);
        const cy = Math.floor(i / Math.ceil(n / 2));
        const pad = randRange(rng, 8, 16);
        addBuilding(
          ix + cx * cw + pad, iy + cy * (iw / 2) + pad,
          cw - pad * 2, iw / 2 - pad * 2,
          randRange(rng, 8, 20),
          pick(rng, ROOFS), pick(rng, WALLS), 'house',
        );
      }
      for (let i = 0; i < 3; i += 1) {
        trees.push({ x: ix + rng() * iw, y: iy + rng() * iw, r: randRange(rng, 7, 11) });
      }
    }
  }

  // street lamps along every road, alternating sides
  for (let i = 0; i <= 8; i += 1) {
    const cx = i * PITCH + WORLD.road / 2;
    for (let y = 60; y < WORLD.height; y += 210) lamps.push({ x: cx + (i % 2 ? 52 : -52), y });
  }
  for (let j = 0; j <= 6; j += 1) {
    const cy = j * PITCH + WORLD.road / 2;
    for (let x = 60; x < 3400; x += 230) lamps.push({ x, y: cy + (j % 2 ? 52 : -52) });
  }
  for (const t of trees) colliders.push({ x: t.x - 4, y: t.y - 4, w: 8, h: 8 });

  const roadsV = [];
  for (let i = 0; i <= 8; i += 1) roadsV.push(i * PITCH + WORLD.road / 2);
  const roadsH = [];
  for (let j = 0; j <= 6; j += 1) roadsH.push(j * PITCH + WORLD.road / 2);

  return {
    buildings,
    colliders,
    trees,
    lamps,
    containers,
    lots,
    roadsV,
    roadsH,
    beachX: 3424,
    waterX: 3560,
    spots: {
      playerSpawn: { x: 1504, y: 2560 },
      fixer: { x: 1504, y: 2310 },
      chopShop: { x: 256, y: 2560 },
      docks: { x: 3168, y: 2336 },
      marina: { x: 3360, y: 1216 },
      hideout: { x: 256, y: 256 },
      store: { x: 1960, y: 880 },
    },
  };
}

/** Is the point on a road surface (not a block, beach or water)? */
export function onRoad(x, y) {
  if (x >= 3424 || x < 0 || y < 0 || y >= WORLD.height) return false;
  const mx = x % PITCH;
  const my = y % PITCH;
  return mx < WORLD.road || my < WORLD.road;
}

/** Resolve a circle against every AABB collider; returns the corrected position. */
export function collideCircle(pos, radius, colliders) {
  let { x, y } = pos;
  for (const c of colliders) {
    const nx = Math.max(c.x, Math.min(x, c.x + c.w));
    const ny = Math.max(c.y, Math.min(y, c.y + c.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      y = ny + (dy / d) * radius;
    } else {
      // centre inside the box: push out along the smallest penetration axis
      const left = x - c.x;
      const right = c.x + c.w - x;
      const top = y - c.y;
      const bottom = c.y + c.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = c.x - radius;
      else if (m === right) x = c.x + c.w + radius;
      else if (m === top) y = c.y - radius;
      else y = c.y + c.h + radius;
    }
  }
  x = Math.max(radius, Math.min(WORLD.width - radius, x));
  y = Math.max(radius, Math.min(WORLD.height - radius, y));
  return { x, y };
}

/** Do two AABBs (given as centre + half extents) overlap? Cheap broadphase helper. */
export function aabbOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

export { COLORS };
