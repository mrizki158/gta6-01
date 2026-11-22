// Cars: arcade driving for the player, lane-following traffic, and the shared physics
// helpers. Traffic cars live on the street grid — each follows a lane (road centre plus a
// right-hand offset), turns at junctions with a coin flip, and brakes for the car ahead.

import { CAR, WORLD, PITCH } from './config.js';
import { makeRng, pick, randRange, angleLerp, angleDiff, clamp } from './random.js';
import { collideCircle } from './city.js';

const PALETTE = ['#d64541', '#3f7fbf', '#e8b93e', '#59a96a', '#e6e6e6', '#8e6cc8', '#d97b29', '#4fb3bf', '#c0c6cc', '#7a4a2b', '#2f4858', '#f2f0d5'];
const LANE = 24; // right-hand offset from a road centre line

let nextId = 1;

export function makeCar(x, y, angle, color, kind) {
  return {
    id: nextId++,
    x, y, angle,
    speed: 0,
    color,
    kind, // 'traffic' | 'parked' | 'cop' | 'target'
    health: 100,
    axis: 'v',
    line: 0,
    dir: 1,
    cruise: CAR.trafficSpeed,
    nextJunction: Infinity,
    stuck: 0,
    sirenPhase: Math.random() * Math.PI * 2,
  };
}

function laneCoord(car) {
  // cross-axis coordinate for the car's current lane
  if (car.axis === 'v') return car.line + (car.dir > 0 ? -LANE : LANE);
  return car.line + (car.dir > 0 ? LANE : -LANE);
}

function alongCoord(car) {
  return car.axis === 'v' ? car.y : car.x;
}

function setAlong(car, v) {
  if (car.axis === 'v') car.y = v; else car.x = v;
}

function crossCoord(car) {
  return car.axis === 'v' ? car.x : car.y;
}

function setCross(car, v) {
  if (car.axis === 'v') car.x = v; else car.y = v;
}

/** Put a traffic car on a random lane, facing its direction of travel. */
export function placeOnRoad(car, city, rng) {
  const vertical = rng() < 0.5;
  car.axis = vertical ? 'v' : 'h';
  car.dir = rng() < 0.5 ? 1 : -1;
  car.line = vertical ? pick(rng, city.roadsV) : pick(rng, city.roadsH);
  car.cruise = CAR.trafficSpeed * randRange(rng, 0.8, 1.1);
  const along = vertical
    ? randRange(rng, 80, WORLD.height - 80)
    : randRange(rng, 80, 3300);
  setAlong(car, along);
  setCross(car, laneCoord(car));
  car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  planJunction(car, city);
}

function planJunction(car, city) {
  const lines = car.axis === 'v' ? city.roadsH : city.roadsV;
  const along = alongCoord(car);
  let best = car.dir > 0 ? Infinity : -Infinity;
  for (const l of lines) {
    if (car.dir > 0 && l > along + 4 && l < best) best = l;
    if (car.dir < 0 && l < along - 4 && l > best) best = l;
  }
  car.nextJunction = best;
}

/** Distance to the nearest car ahead in the same lane (Infinity when clear). */
function gapAhead(car, cars) {
  let gap = Infinity;
  for (const other of cars) {
    if (other === car || other.kind === 'parked') continue;
    if (other.axis !== car.axis && other.kind === 'traffic') continue;
    const dAlong = (alongCoord(other) - alongCoord(car)) * car.dir;
    const dCross = Math.abs(crossCoord(other) - crossCoord(car));
    if (dAlong > 0 && dAlong < gap && dCross < 30) gap = dAlong;
  }
  return gap;
}

export function updateTraffic(car, dt, city, cars, rng) {
  const gap = gapAhead(car, cars);
  const want = gap < 54 ? 0 : gap < 110 ? car.cruise * 0.45 : car.cruise;
  car.speed += clamp(want - car.speed, -420 * dt, 200 * dt);
  if (car.speed < 0) car.speed = 0;
  setAlong(car, alongCoord(car) + car.dir * car.speed * dt);
  setCross(car, laneCoord(car));
  const targetAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  car.angle = angleLerp(car.angle, targetAngle, Math.min(1, dt * 8));

  // world edge: turn around at the map border or the coast road
  const along = alongCoord(car);
  const atEdge = (car.axis === 'v' && (along < 60 || along > WORLD.height - 60))
    || (car.axis === 'h' && (along < 60 || along > 3340));
  if (atEdge) {
    car.dir *= -1;
    setCross(car, laneCoord(car));
    planJunction(car, city);
    return;
  }

  if ((car.dir > 0 && along >= car.nextJunction) || (car.dir < 0 && along <= car.nextJunction)) {
    const junctionCross = car.nextJunction;
    setAlong(car, junctionCross);
    if (rng() < 0.45) {
      // turn onto the crossing road
      const oldAxis = car.axis;
      car.axis = oldAxis === 'v' ? 'h' : 'v';
      car.line = junctionCross;
      car.dir = rng() < 0.5 ? 1 : -1;
      const cross = laneCoord(car);
      if (car.axis === 'v') { car.y = crossCoord(car); car.x = cross; }
      else { car.x = crossCoord(car); car.y = cross; }
      if (car.axis === 'h' && car.x > 3340) { car.axis = 'v'; car.line = city.roadsV[city.roadsV.length - 1]; car.x = car.line; }
    }
    planJunction(car, city);
  }
}

/** Player driving: throttle/steer are -1..1. Returns the speed for the engine sound. */
export function driveCar(car, dt, throttle, steer) {
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverse, car.speed + CAR.accel * throttle * dt);
  }
  car.speed -= car.speed * (1 - CAR.drag) * dt * 3.2;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -CAR.reverse, 430);
  const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * CAR.grip * 0.36 * steerAuthority * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return Math.abs(car.speed) / 430;
}

/** Push a car out of buildings with two sample circles (front and rear bumper). */
export function collideCar(car, colliders) {
  const fx = car.x + Math.cos(car.angle) * 16;
  const fy = car.y + Math.sin(car.angle) * 16;
  const rx = car.x - Math.cos(car.angle) * 16;
  const ry = car.y - Math.sin(car.angle) * 16;
  const f = collideCircle({ x: fx, y: fy }, 14, colliders);
  const r = collideCircle({ x: rx, y: ry }, 14, colliders);
  const dx = (f.x - fx + (r.x - rx)) / 2;
  const dy = (f.y - fy + (r.y - ry)) / 2;
  if (dx !== 0 || dy !== 0) {
    car.x += dx;
    car.y += dy;
    car.speed *= 0.55;
    return true;
  }
  car.x = clamp(car.x, 20, WORLD.width - 20);
  car.y = clamp(car.y, 20, WORLD.height - 20);
  return false;
}

/** Soft separation so cars never overlap; returns impact speed if a hard hit happened. */
export function separateCars(cars) {
  let impact = 0;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 40;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      const rel = Math.abs(a.speed - b.speed);
      if (a.kind !== 'parked') { a.x -= nx * push; a.y -= ny * push; }
      if (b.kind !== 'parked') { b.x += nx * push; b.y += ny * push; }
      if (rel > impact) impact = rel;
      a.speed *= 0.8;
      b.speed *= 0.8;
    }
  }
  return impact;
}

export function spawnTraffic(city, count, seed) {
  const rng = makeRng(seed);
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const car = makeCar(0, 0, 0, pick(rng, PALETTE), 'traffic');
    placeOnRoad(car, city, rng);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, count, seed) {
  const rng = makeRng(seed);
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 30) {
    guard += 1;
    const vertical = rng() < 0.5;
    const line = vertical ? pick(rng, city.roadsV) : pick(rng, city.roadsH);
    const side = rng() < 0.5 ? -1 : 1;
    const offset = side * (WORLD.road / 2 - 15);
    let x;
    let y;
    let angle;
    if (vertical) {
      x = line + offset;
      y = randRange(rng, 120, WORLD.height - 120);
      if (y % PITCH < WORLD.road + 26) continue; // not in a junction
      angle = Math.PI / 2;
    } else {
      y = line + offset;
      x = randRange(rng, 120, 3300);
      if (x % PITCH < WORLD.road + 26) continue;
      angle = 0;
    }
    const car = makeCar(x, y, angle, pick(rng, PALETTE), 'parked');
    cars.push(car);
  }
  return cars;
}

export { PALETTE };
