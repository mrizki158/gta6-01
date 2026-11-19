// Pedestrians: Solmaris citizens strolling the sidewalk ring of their block (or the beach
// promenade), who break into a run when danger shows up near them — a gunshot, a crash, a
// car mounting the pavement. Some peds are not citizens: mission thugs and police
// officers carry `role` and a gun, and combat.js drives those.
import { WORLD } from './config.js';
import { pick, randRange } from './random.js';

const SHIRTS = ['#e74c3c', '#f1c40f', '#ecf0f1', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#74b9ff'];
const PANTS = ['#2d3436', '#636e72', '#0984e3', '#6c5ce7', '#dfe6e9', '#b2bec3'];

export class Ped {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.angle = rng() * Math.PI * 2;
    this.speed = randRange(rng, 52, 86);
    this.health = 100;
    this.dead = false;
    this.role = 'civilian'; // 'civilian' | 'thug' | 'officer'
    this.state = 'walk'; // 'walk' | 'flee'
    this.fleeT = 0;
    this.fleeFrom = { x: 0, y: 0 };
    this.loop = null; // array of waypoints
    this.wp = 0;
    this.shirt = pick(rng, SHIRTS);
    this.pants = pick(rng, PANTS);
    this.skin = pick(rng, ['#f1c27d', '#e0ac69', '#8d5524', '#ffdbac', '#c68642']);
    this.fireCooldown = randRange(rng, 0.4, 1.2);
    this.knockT = 0; // > 0 while knocked flat (getting up or dying)
  }
}

/** The sidewalk ring of a block: four corners, walked clockwise. */
export function blockLoop(city, block) {
  const m = 9;
  return [
    { x: block.x + m, y: block.y + m },
    { x: block.x + block.w - m, y: block.y + m },
    { x: block.x + block.w - m, y: block.y + block.h - m },
    { x: block.x + m, y: block.y + block.h - m },
  ];
}

/** Scatter citizens over the city's blocks and along the beach. */
export function spawnPeds(world, count) {
  const { city, rng } = world;
  for (let n = 0; n < count; n += 1) {
    let ped;
    if (n % 5 === 4) {
      // Promenade walker: up and down the sand's edge.
      const x = WORLD.beachX + 46;
      ped = new Ped(x, randRange(rng, 120, WORLD.height - 120), rng);
      ped.loop = [
        { x, y: 90 },
        { x, y: WORLD.height - 90 },
      ];
    } else {
      const block = pick(rng, city.blocks);
      ped = new Ped(block.x + 9, block.y + randRange(rng, 9, block.h - 9), rng);
      ped.loop = blockLoop(city, block);
    }
    ped.wp = Math.floor(rng() * ped.loop.length);
    world.peds.push(ped);
  }
}

/** Send every civilian within `radius` of a point running away from it. */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.dead || ped.role !== 'civilian') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeT = randRange(world.rng, 1.6, 3.4);
      ped.fleeFrom = { x, y };
    }
  }
}

function moveToward(ped, tx, ty, speed, dt, city) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  ped.angle = Math.atan2(dy, dx);
  const step = Math.min(dist, speed * dt);
  const moved = city.tryMove(ped.x, ped.y, ped.x + Math.cos(ped.angle) * step, ped.y + Math.sin(ped.angle) * step, 10);
  const res = city.resolveCircle(moved.x, moved.y, 10);
  ped.x = res.x;
  ped.y = res.y;
  return dist < 14;
}

export function updatePed(ped, dt, world) {
  if (ped.dead) return;
  const { city } = world;
  if (ped.knockT > 0) {
    ped.knockT -= dt;
    if (ped.knockT <= 0 && ped.health > 0) ped.state = 'flee';
    return;
  }
  if (ped.role !== 'civilian') return; // combat.js drives armed peds

  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
    const tx = ped.x + Math.cos(away) * 120;
    const ty = ped.y + Math.sin(away) * 120;
    moveToward(ped, tx, ty, 245, dt, city);
    if (ped.fleeT <= 0) ped.state = 'walk';
    return;
  }
  const target = ped.loop[ped.wp % ped.loop.length];
  if (moveToward(ped, target.x, target.y, ped.speed, dt, city)) {
    ped.wp = (ped.wp + 1) % ped.loop.length;
  }
}

/** A car checks its path: anyone it is about to run down. Returns the ped or null. */
export function pedInPath(car, peds) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  for (const ped of peds) {
    if (ped.dead) continue;
    const relX = ped.x - car.x;
    const relY = ped.y - car.y;
    const ahead = relX * cos + relY * sin;
    const side = -relX * sin + relY * cos;
    if (ahead > -10 && ahead < 52 && Math.abs(side) < 26) return ped;
  }
  return null;
}
