// The player: a kid from Palm Heights with a borrowed jacket and big plans. On foot he
// walks and sprints with building collision; E gets into the nearest car — politely when
// it is parked, by force when it is not (the driver climbs out and runs, and the law
// notices). Driving feeds the same arcade physics the traffic uses.
import { PLAYER, RESPAWNS } from './config.js';
import { driveCar } from './vehicles.js';
import { Ped, scarePeds } from './pedestrians.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.health = PLAYER.health;
    this.car = null;
    this.weapon = 'pistol'; // 'fist' | 'pistol'
    this.meleeT = 0;
    this.fireT = 0;
    this.lastHurtT = -99;
    this.walkCycle = 0;
    this.moving = false;
  }
}

/** The nearest enterable car within reach of the player, or null. */
export function nearestCar(world, maxDist = 70) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.dead || car === world.player.car) continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Get in (or jack) a car. Returns a crime key when the law should hear about it. */
export function enterCar(world, car) {
  const player = world.player;
  let crime = null;
  if (car.kind === 'traffic') {
    crime = 'carjack';
    // The driver bails out and runs for it.
    const driver = new Ped(car.x + 30, car.y + 10, world.rng);
    driver.state = 'flee';
    driver.fleeT = 3;
    driver.fleeFrom = { x: player.x, y: player.y };
    world.peds.push(driver);
    scarePeds(world, car.x, car.y, 130);
  } else if (car.kind === 'parked' || car.kind === 'mission') {
    crime = 'stealParked';
  } else if (car.kind === 'police') {
    crime = 'carjack';
  }
  car.kind = car.kind === 'mission' ? 'mission' : 'player';
  car.route = null;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  world.audio.click();
  return crime;
}

/** Step out of the car, left standing at its side. */
export function exitCar(world) {
  const player = world.player;
  const car = player.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  const spot = world.city.tryMove(
    car.x, car.y,
    car.x + Math.cos(side) * -40, car.y + Math.sin(side) * -40, 13,
  );
  const res = world.city.resolveCircle(spot.x, spot.y, 13);
  player.x = res.x;
  player.y = res.y;
  player.angle = car.angle;
  if (car.kind === 'player') car.kind = 'parked';
  player.car = null;
  car.vx *= 0.2;
  car.vy *= 0.2;
  world.audio.click();
}

export function damagePlayer(world, amount) {
  const player = world.player;
  player.health -= amount;
  player.lastHurtT = world.time;
  if (player.health < 0) player.health = 0;
}

/** Wake up at the hospital (wasted) or walk out of the station (busted), lighter of pocket. */
export function respawnPlayer(world, kind) {
  const player = world.player;
  const spot = kind === 'busted' ? RESPAWNS.station : RESPAWNS.hospital;
  if (player.car) {
    player.car.kind = 'parked';
    player.car = null;
  }
  player.x = spot.x;
  player.y = spot.y;
  player.health = PLAYER.health;
  player.weapon = 'pistol';
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.cash = Math.max(0, world.cash - (kind === 'busted' ? 150 : 100));
  world.camera.x = player.x;
  world.camera.y = player.y;
}

export function updatePlayer(world, dt) {
  const player = world.player;
  const input = world.input;
  const city = world.city;
  player.meleeT = Math.max(0, player.meleeT - dt);
  player.fireT = Math.max(0, player.fireT - dt);

  // Slow recovery once the shooting stops.
  if (world.time - player.lastHurtT > 6 && player.health > 0) {
    player.health = Math.min(PLAYER.health, player.health + 5 * dt);
  }

  if (input.hit('KeyE')) {
    if (player.car) exitCar(world);
    else {
      const car = nearestCar(world);
      if (car) {
        const crime = enterCar(world, car);
        if (crime) world.reportCrime(crime, car.x, car.y);
      }
    }
  }
  if (input.hit('Digit1')) player.weapon = 'fist';
  if (input.hit('Digit2')) player.weapon = 'pistol';
  if (input.hit('KeyQ')) player.weapon = player.weapon === 'fist' ? 'pistol' : 'fist';

  if (player.car) {
    const car = player.car;
    const script = world.script;
    const throttle = script && script.throttle !== undefined
      ? script.throttle
      : (input.down('KeyW', 'ArrowUp') ? 1 : 0) + (input.down('KeyS', 'ArrowDown') ? -1 : 0);
    const steer = script && script.steer !== undefined
      ? script.steer
      : (input.down('KeyD', 'ArrowRight') ? 1 : 0) + (input.down('KeyA', 'ArrowLeft') ? -1 : 0);
    const handbrake = script ? Boolean(script.handbrake) : input.down('Space');
    const result = driveCar(car, dt, { throttle, steer, handbrake }, city);
    if (car.smoke > 0) {
      car.smoke -= dt;
      world.spawnParticles('smoke', car.x - Math.cos(car.angle) * 34, car.y - Math.sin(car.angle) * 34, 2);
    }
    if (result.impact > 3) {
      world.audio.crash(Math.min(1, result.speed / 300));
      world.shake = Math.min(9, result.speed / 45);
      if (result.speed > 240) damagePlayer(world, (result.speed - 240) * 0.03);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.moving = Math.abs(car.forwardSpeed()) > 12;
    world.audio.setEngine(Math.abs(car.forwardSpeed()) / 455, true);
    return;
  }

  world.audio.setEngine(0, false);
  // On foot: WASD/arrows move in world axes (the camera never rotates).
  let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
  // A staged screenshot may drive the player through the scripted input instead.
  if (world.script) {
    mx = world.script.mx ?? mx;
    my = world.script.my ?? my;
  }
  const sprint = input.down('ShiftLeft', 'ShiftRight') || (world.script && world.script.sprint);
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.moving = mx !== 0 || my !== 0;
  if (player.moving) {
    const len = Math.hypot(mx, my);
    const nx = player.x + (mx / len) * speed * dt;
    const ny = player.y + (my / len) * speed * dt;
    const moved = city.tryMove(player.x, player.y, nx, ny, PLAYER.radius);
    const res = city.resolveCircle(moved.x, moved.y, PLAYER.radius);
    player.x = res.x;
    player.y = res.y;
    player.walkCycle += dt * (sprint ? 11 : 8);
  } else {
    // Never rest inside a solid (car exits and respawns can overlap a wall corner).
    const res = city.resolveCircle(player.x, player.y, PLAYER.radius);
    player.x = res.x;
    player.y = res.y;
  }
  // Face the mouse when armed, the walk direction otherwise.
  const mouseWorld = world.screenToWorld(input.mouse.x, input.mouse.y);
  if (player.weapon === 'pistol') {
    player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
  } else if (player.moving) {
    player.angle = Math.atan2(my, mx);
  }
}
