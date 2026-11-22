// Pedestrians: citizens stroll the sidewalks and the beach, wander parks, and run when
// there is gunfire or a car bears down on them. Simple steering: a walker has a target
// point on a walkable line (a road edge, a park path) and picks a new one on arrival.

import { WORLD, PITCH } from './config.js';
import { makeRng, pick, randRange } from './random.js';
import { collideCircle } from './city.js';

const SHIRTS = ['#e74c3c', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00b894', '#0984e3', '#dfe6e9'];
const PANTS = ['#2d3436', '#636e72', '#574b90', '#30336b', '#6c5ce7'];

let nextId = 1;

export function spawnPeds(city, count, seed) {
  const rng = makeRng(seed);
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const ped = {
      id: nextId++,
      x: 0, y: 0,
      tx: 0, ty: 0,
      speed: randRange(rng, 52, 86),
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      angle: 0,
      panic: 0,
      dead: false,
      downTime: 0,
      phase: rng() * Math.PI * 2,
    };
    // start near a random junction, on a sidewalk corner
    const jx = pick(rng, city.roadsV);
    const jy = pick(rng, city.roadsH);
    ped.x = jx + randRange(rng, -70, 70);
    ped.y = jy + randRange(rng, -70, 70);
    ped.x = Math.max(20, Math.min(3400, ped.x));
    ped.y = Math.max(20, Math.min(WORLD.height - 20, ped.y));
    retarget(ped, rng);
    peds.push(ped);
  }
  return peds;
}

function retarget(ped, rng) {
  // walk along the grid: pick a point up to two blocks away on a road edge
  const alongX = rng() < 0.55;
  const reach = randRange(rng, 120, 800);
  const dir = rng() < 0.5 ? -1 : 1;
  if (alongX) {
    ped.tx = Math.max(24, Math.min(3400, ped.x + dir * reach));
    ped.ty = ped.y + randRange(rng, -26, 26);
  } else {
    ped.ty = Math.max(24, Math.min(WORLD.height - 24, ped.y + dir * reach));
    ped.tx = ped.x + randRange(rng, -26, 26);
  }
}

/** danger: {x, y} of a threat to flee from, or null. */
export function updatePed(ped, dt, city, rng, danger) {
  if (ped.dead) {
    ped.downTime += dt;
    return;
  }
  if (danger) {
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy);
    if (d < 190) ped.panic = 1.6;
  }
  let tx = ped.tx;
  let ty = ped.ty;
  let speed = ped.speed;
  if (ped.panic > 0) {
    ped.panic -= dt;
    if (danger) {
      tx = ped.x + (ped.x - danger.x);
      ty = ped.y + (ped.y - danger.y);
    }
    speed = 215;
  } else if (Math.hypot(tx - ped.x, ty - ped.y) < 12) {
    retarget(ped, rng);
    return;
  }
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * speed * dt;
  ped.y += (dy / d) * speed * dt;
  const fixed = collideCircle(ped, 9, city.colliders);
  ped.x = fixed.x;
  ped.y = fixed.y;
  ped.phase += dt * (ped.panic > 0 ? 13 : 8);
}

/** Knock a pedestrian down (car hit or a punch). Returns true if newly downed. */
export function downPed(ped) {
  if (ped.dead) return false;
  ped.dead = true;
  ped.downTime = 0;
  return true;
}
