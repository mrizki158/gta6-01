// The law. Crimes add heat; heat becomes stars; stars bring squad cars. Officers drive
// to intercept and ram, and climb out to fight on foot when their car is stopped close
// to a player on foot. Stay unseen and the heat bleeds away. Get pinned — on foot with
// an officer on top of you, or boxed in at walking pace — and you are busted.
import { CRIME, WANTED } from './config.js';
import { Car, driveCar, obstacleAhead } from './vehicles.js';
import { Ped, scarePeds } from './pedestrians.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeT = -99;
    this.lastSeenT = -99;
    this.bustMeter = 0;
  }
}

function starsFor(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.thresholds.length; i += 1) {
    if (heat >= WANTED.thresholds[i]) stars = i;
  }
  return stars;
}

/** Force the wanted level (missions that kick the hornet's nest). */
export function setWanted(world, stars) {
  world.wanted.heat = Math.max(world.wanted.heat, WANTED.thresholds[stars] + 1);
  world.wanted.stars = starsFor(world.wanted.heat);
  world.wanted.lastCrimeT = world.time;
}

/** A crime happened at (x, y): the fuller the audience, the fuller the heat. */
export function reportCrime(world, key, x, y) {
  const amount = CRIME[key] ?? 5;
  let witnessed = false;
  for (const car of world.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - x, car.y - y) < WANTED.sightRange + 120) witnessed = true;
  }
  if (!witnessed) {
    for (const ped of world.peds) {
      if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < 170) {
        witnessed = true;
        break;
      }
    }
  }
  world.wanted.heat += amount * (witnessed ? 1 : 0.35);
  world.wanted.lastCrimeT = world.time;
  world.wanted.stars = starsFor(world.wanted.heat);
}

export function updateWanted(world, dt) {
  const w = world.wanted;
  const player = world.player;
  // Seen if any police unit is close enough to have eyes on the player.
  let seen = false;
  for (const car of world.cars) {
    if (car.kind === 'police' && !car.dead && Math.hypot(car.x - player.x, car.y - player.y) < WANTED.sightRange) seen = true;
  }
  for (const ped of world.peds) {
    if (ped.role === 'officer' && !ped.dead && Math.hypot(ped.x - player.x, ped.y - player.y) < 330) seen = true;
  }
  if (seen) w.lastSeenT = world.time;
  if (world.time - w.lastCrimeT > WANTED.decayDelay && world.time - w.lastSeenT > 2.5 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - WANTED.decayPerSecond * dt);
  }
  w.stars = starsFor(w.heat);
}

/** Steer a police car at a target point with intent to intercept and shove. */
function pursue(world, car, dt) {
  const player = world.player;
  const lead = 0.35;
  const tx = player.x + (player.car ? player.car.vx * lead : 0);
  const ty = player.y + (player.car ? player.car.vy * lead : 0);
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let steer = Math.max(-1, Math.min(1, diff * 2.3));
  const obstacle = obstacleAhead(car, world);
  if (obstacle > 0.5 && world.player.car !== car) steer += steer >= 0 ? -0.7 : 0.7;
  const dist = Math.hypot(player.x - car.x, player.y - car.y);
  let throttle = 1;
  if (Math.abs(diff) > 2.4 && car.forwardSpeed() < 60) throttle = -1; // reverse out and swing round
  else if (Math.abs(diff) > 1.3) throttle = 0.45;
  if (dist < 90 && !player.car) throttle = 0.25; // pull up on a runner rather than flatten him
  return driveCar(car, dt, { throttle, steer: Math.max(-1, Math.min(1, steer)), handbrake: false }, world.city);
}

function spawnCop(world) {
  const { city, rng, player } = world;
  for (let tries = 0; tries < 14; tries += 1) {
    const i = Math.floor(rng() * city.vRoads.length);
    const j = Math.floor(rng() * city.hRoads.length);
    const x = city.vRoads[i];
    const y = city.hRoads[j];
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 560 || d > 980) continue;
    const car = new Car(x, y, rng() * Math.PI * 2, '#eef1f5', 'police');
    car.cruise = 330;
    world.cars.push(car);
    return true;
  }
  return false;
}

export function updatePolice(world, dt) {
  const w = world.wanted;
  const player = world.player;
  const cops = world.cars.filter((c) => c.kind === 'police' && !c.dead);
  const wanted = WANTED.copCounts[w.stars];

  if (cops.length < wanted) {
    world.copSpawnT = (world.copSpawnT ?? 0) - dt;
    if (world.copSpawnT <= 0) {
      if (spawnCop(world)) world.copSpawnT = 1.6;
      else world.copSpawnT = 0.5;
    }
  }
  // Surplus or far-flung units give up and despawn quietly.
  for (const car of cops) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if ((cops.length > wanted && d > 500) || d > 1600) {
      car.dead = true;
      world.cars.splice(world.cars.indexOf(car), 1);
    }
  }

  let nearestCop = Infinity;
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    // With no stars the hunt is off: near units idle, far units drift away and vanish.
    if (w.stars === 0) {
      const d0 = Math.hypot(car.x - player.x, car.y - player.y);
      if (d0 > 240) {
        car.dead = true;
        world.cars.splice(world.cars.indexOf(car), 1);
      }
      continue;
    }
    const result = pursue(world, car, dt);
    if (result.impact > 4 && result.speed > 200) {
      world.audio.crash(0.5);
    }
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    nearestCop = Math.min(nearestCop, d);
    // An officer climbs out when his car is stopped near a player on foot.
    car.stopT = car.speed() < 24 && d < 300 && !player.car ? (car.stopT ?? 0) + dt : 0;
    if (car.stopT > 1.1 && !car.officerOut && w.stars >= 2) {
      car.officerOut = true;
      const officer = new Ped(car.x + 26, car.y + 14, world.rng);
      officer.role = 'officer';
      officer.shirt = '#1f3a93';
      officer.pants = '#14181f';
      world.peds.push(officer);
    }
  }
  for (const ped of world.peds) {
    if (ped.role === 'officer' && !ped.dead) {
      nearestCop = Math.min(nearestCop, Math.hypot(ped.x - player.x, ped.y - player.y));
    }
  }

  // The bust: pinned and close to the law for too long.
  const playerSpeed = player.car ? Math.abs(player.car.forwardSpeed()) : (player.moving ? 200 : 0);
  const pinned = nearestCop < (player.car ? 78 : 58) && playerSpeed < 40;
  if (pinned && w.stars > 0) {
    w.bustMeter += dt / (player.car ? 2.4 : 1.6);
    if (w.bustMeter >= 1) {
      w.bustMeter = 0;
      world.pendingEnd = 'busted';
      scarePeds(world, player.x, player.y, 160);
    }
  } else {
    w.bustMeter = Math.max(0, w.bustMeter - dt * 0.7);
  }

  // Siren loudness follows the nearest unit.
  const siren = nearestCop === Infinity ? 0 : Math.max(0, 1 - nearestCop / 620);
  world.audio.setSiren(siren, dt);
}
