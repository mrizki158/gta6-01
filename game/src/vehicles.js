// Cars: arcade physics (velocity split into forward/lateral parts, lateral grip, drift on
// the handbrake), traffic that drives the road lattice lane by lane and brakes for
// obstacles, and car-to-car bumps. Police and the player drive through the same
// `driveCar` physics as everyone else — only their inputs differ.
import { CAR, LANE, WORLD } from './config.js';
import { pick, randRange } from './random.js';

let nextCarId = 1;

export class Car {
  constructor(x, y, angle, color, kind = 'traffic') {
    this.id = nextCarId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.color = color;
    this.kind = kind; // 'parked' | 'traffic' | 'police' | 'mission'
    this.health = CAR.health;
    this.dead = false;
    this.smoke = 0; // seconds of tire smoke to emit
    this.route = null; // traffic: { type:'v'|'h', index, dir, target }
    this.cruise = 190; // reassigned from the seeded rng when a route starts
    this.brakeLight = false;
  }

  /** Speed along the facing direction (negative in reverse). */
  forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }
}

/**
 * Advance one car under arcade physics. `input` is { throttle: -1..1, steer: -1..1,
 * handbrake: bool }. Returns the impact depth if the car struck a building this step.
 */
export function driveCar(car, dt, input, city) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const surface = city.surfaceAt(car.x, car.y);
  const onSand = surface === 'sand';

  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;

  // Steering bites harder the faster the car rolls, and flips in reverse.
  if (input.steer !== 0 && Math.abs(forward) > 4) {
    const bite = Math.max(-1, Math.min(1, forward / 130));
    car.angle += input.steer * CAR.steer * bite * dt * (input.handbrake ? 1.35 : 1);
  }

  const accel = onSand ? CAR.accel * 0.5 : CAR.accel;
  if (input.throttle > 0) forward += accel * input.throttle * dt;
  else if (input.throttle < 0) {
    forward += (forward > 12 ? -CAR.brake : -CAR.reverse * 0.9) * -input.throttle * dt;
  }

  // Lateral grip kills sideways slide; the handbrake lets it hang out (drift + smoke).
  const grip = input.handbrake ? CAR.driftGrip : CAR.grip;
  lateral *= Math.max(0, 1 - grip * dt);
  if (input.handbrake && Math.abs(forward) > 130 && Math.abs(input.steer) > 0) car.smoke = 0.12;

  // Drag and a soft top speed.
  forward *= Math.max(0, 1 - CAR.drag * dt * (onSand ? 2.2 : 1));
  forward = Math.max(-165, Math.min(455, forward));

  const ncos = Math.cos(car.angle);
  const nsin = Math.sin(car.angle);
  car.vx = ncos * forward - nsin * lateral;
  car.vy = nsin * forward + ncos * lateral;

  const moved = city.tryMove(car.x, car.y, car.x + car.vx * dt, car.y + car.vy * dt, 26);
  car.x = moved.x;
  car.y = moved.y;

  // Buildings: probe with two circles, bow and stern.
  let impact = 0;
  for (const off of [30, -30]) {
    const px = car.x + ncos * off;
    const py = car.y + nsin * off;
    const res = city.resolveCircle(px, py, 23);
    if (res.hit > 0) {
      car.x += res.x - px;
      car.y += res.y - py;
      impact = Math.max(impact, res.hit);
    }
  }
  if (impact > 1.5) {
    const severity = Math.abs(forward);
    car.vx *= 0.32;
    car.vy *= 0.32;
    if (severity > 170) car.health -= (severity - 170) * 0.06;
    if (car.health <= 0) car.dead = true;
    return { impact, speed: severity };
  }
  const clamped = city.clampToWorld(car.x, car.y, 30);
  car.x = clamped.x;
  car.y = clamped.y;
  return { impact: 0, speed: Math.abs(forward) };
}

/** The lane centre coordinate for a car travelling `dir` along road `index`. */
function laneCoord(city, type, index, dir) {
  if (type === 'v') return city.vRoads[index] + (dir < 0 ? LANE : -LANE);
  return city.hRoads[index] + (dir > 0 ? LANE : -LANE);
}

/** Give a traffic car a fresh route along a random road through an intersection. */
export function startRoute(car, city, rng) {
  car.cruise = randRange(rng, 150, 235);
  const i = Math.floor(rng() * city.vRoads.length);
  const j = Math.floor(rng() * city.hRoads.length);
  const type = rng() > 0.5 ? 'v' : 'h';
  const dir = rng() > 0.5 ? 1 : -1;
  car.route = { type, index: type === 'v' ? i : j, dir, cross: type === 'v' ? j : i };
  if (type === 'v') {
    car.x = laneCoord(city, 'v', i, dir);
    car.y = city.hRoads[j];
    car.angle = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
  } else {
    car.x = city.vRoads[i];
    car.y = laneCoord(city, 'h', j, dir);
    car.angle = dir > 0 ? 0 : Math.PI;
  }
  car.vx = 0;
  car.vy = 0;
}

/** At an intersection, pick the next leg: mostly straight, sometimes a turn. */
function chooseLeg(car, city, rng) {
  const r = car.route;
  const maxCross = r.type === 'v' ? city.hRoads.length - 1 : city.vRoads.length - 1;
  const roll = rng();
  if (roll < 0.45) {
    // Straight on, unless the road ends — then turn around the block.
    const next = r.cross + r.dir;
    if (next < 0 || next > maxCross) {
      r.dir = -r.dir;
      r.cross = r.cross + r.dir;
    } else {
      r.cross = next;
    }
    return;
  }
  // Turn onto the crossing road.
  const newType = r.type === 'v' ? 'h' : 'v';
  const newDir = rng() > 0.5 ? 1 : -1;
  const crossIndex = r.index;
  car.route = { type: newType, index: r.cross, dir: newDir, cross: crossIndex };
}

/** The point this traffic car is steering for right now. */
function routeTarget(car, city) {
  const r = car.route;
  if (r.type === 'v') {
    return { x: laneCoord(city, 'v', r.index, r.dir), y: city.hRoads[r.cross] };
  }
  return { x: city.vRoads[r.cross], y: laneCoord(city, 'h', r.index, r.dir) };
}

/** Is something solid just ahead of this car? Returns 0 (clear) .. 1 (touching). */
export function obstacleAhead(car, world) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let worst = 0;
  const test = (ox, oy, radius) => {
    const relX = ox - car.x;
    const relY = oy - car.y;
    const ahead = relX * cos + relY * sin;
    const side = -relX * sin + relY * cos;
    if (ahead > 4 && ahead < 96 && Math.abs(side) < 27 + radius) {
      worst = Math.max(worst, 1 - ahead / 96);
    }
  };
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    test(other.x, other.y, 22);
  }
  if (world.player && !world.player.car) test(world.player.x, world.player.y, 6);
  for (const ped of world.peds) {
    if (!ped.dead) test(ped.x, ped.y, 4);
  }
  return worst;
}

/** One traffic step: steer the lane, mind obstacles, hand inputs to the physics. */
export function updateTrafficCar(car, dt, world) {
  if (!car.route) startRoute(car, world.city, world.rng);
  const target = routeTarget(car, world.city);
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 42) chooseLeg(car, world.city, world.rng);

  const wanted = Math.atan2(dy, dx);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));

  const obstacle = obstacleAhead(car, world);
  let throttle = 0.55;
  if (obstacle > 0.55) throttle = -0.7;
  else if (obstacle > 0.15) throttle = 0.05;
  if (Math.abs(diff) > 1.15) throttle = Math.min(throttle, 0.12); // slow for sharp turns
  const fwd = car.forwardSpeed();
  if (fwd > car.cruise) throttle = Math.min(throttle, 0);
  car.brakeLight = throttle < 0 || obstacle > 0.3;

  return driveCar(car, dt, { throttle, steer, handbrake: false }, world.city);
}

/** Spawn `count` traffic cars at intersections away from (avoidX, avoidY). */
export function spawnTraffic(world, count) {
  for (let n = 0; n < count; n += 1) {
    const car = new Car(0, 0, 0, pick(world.rng, world.carColors), 'traffic');
    for (let tries = 0; tries < 12; tries += 1) {
      startRoute(car, world.city, world.rng);
      const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
      if (d > 420) break;
    }
    world.cars.push(car);
  }
}

/** Park cars on the city's marked spots (and the story cars missions point at). */
export function spawnParked(world) {
  for (const spot of world.city.parkedSpots) {
    if (world.rng() < 0.22) continue; // some spots stay empty
    const car = new Car(spot.x, spot.y, spot.angle, pick(world.rng, world.carColors), 'parked');
    car.hotelSpot = Boolean(spot.hotel);
    world.cars.push(car);
  }
}

/**
 * Car-to-car bumps: separate overlapping pairs, trade a little velocity, report pairs
 * that hit hard so the caller can score crimes and play the crash.
 */
export function collideCars(world, onBump) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 56;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.55;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        const severity = -rel;
        if (severity > 60) {
          a.health -= severity * 0.05;
          b.health -= severity * 0.05;
          if (a.health <= 0) a.dead = true;
          if (b.health <= 0) b.dead = true;
          onBump(a, b, severity);
        }
      }
    }
  }
}

/** Keep the world populated: top traffic back up away from the player. */
export function maintainTraffic(world, target) {
  const live = world.cars.filter((c) => c.kind === 'traffic' && !c.dead);
  // Cull traffic that drifted far away so spawns stay near the action.
  for (const car of live) {
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d > 1500) {
      car.dead = true;
      world.cars.splice(world.cars.indexOf(car), 1);
    }
  }
  const count = world.cars.filter((c) => c.kind === 'traffic' && !c.dead).length;
  if (count < target) spawnTraffic(world, Math.min(2, target - count));
}
