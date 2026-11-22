// The Solmaris PD: a wanted level from 0 to 5 stars, patrol cars that hunt the player,
// and officers on foot who give chase, shoot at higher heat and fill the BUSTED meter
// when they corner the player on foot. Heat cools one star at a time while nobody in
// uniform can see the player.

import { WANTED, WORLD } from './config.js';
import { makeCar, collideCar } from './vehicles.js';
import { makeRng, randRange, angleLerp, angleDiff, clamp } from './random.js';
import { collideCircle } from './city.js';

export class Police {
  constructor(city) {
    this.city = city;
    this.stars = 0;
    this.unseen = 0;
    this.bust = 0;
    this.cars = [];
    this.foot = [];
    this.rng = makeRng(1234567);
    this.spawnTimer = 0;
    this.seenNow = false;
  }

  /** Report a crime: severity 1 = theft/assault, 2 = gunfire, 3 = a killing, 4 = cop down. */
  report(severity) {
    const before = this.stars;
    if (severity >= 4) this.stars = Math.max(this.stars, 4);
    else if (severity >= 3) this.stars = clamp(this.stars + 1, 2, 5);
    else if (severity >= 2) this.stars = clamp(this.stars + 1, 1, 5);
    else this.stars = clamp(this.stars + 1, 1, 5);
    this.unseen = 0;
    return this.stars > before;
  }

  clear() {
    this.stars = 0;
    this.unseen = 0;
    this.bust = 0;
    this.cars = [];
    this.foot = [];
  }

  desiredCars() {
    return [0, 1, 2, 3, 4, 6][this.stars];
  }

  desiredFoot() {
    return [0, 0, 1, 2, 3, 4][this.stars];
  }

  /** Can any officer currently see the target point? (range + no star requirement) */
  canSee(x, y) {
    for (const c of this.cars) if (Math.hypot(c.x - x, c.y - y) < 430) return true;
    for (const f of this.foot) if (!f.dead && Math.hypot(f.x - x, f.y - y) < 330) return true;
    return false;
  }

  spawnCarNear(px, py) {
    const angle = this.rng() * Math.PI * 2;
    const dist = randRange(this.rng, 640, 820);
    let x = clamp(px + Math.cos(angle) * dist, 60, WORLD.width - 60);
    let y = clamp(py + Math.sin(angle) * dist, 60, WORLD.height - 60);
    // snap to the nearest road centre so the cruiser starts on a street
    const snap = (v, lines) => lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), lines[0]);
    if (Math.abs(snap(x, this.city.roadsV) - x) < Math.abs(snap(y, this.city.roadsH) - y)) x = snap(x, this.city.roadsV);
    else y = snap(y, this.city.roadsH);
    const car = makeCar(x, y, Math.atan2(py - y, px - x), '#eef1f4', 'cop');
    car.copLight = true;
    this.cars.push(car);
  }

  spawnFootNear(px, py) {
    const angle = this.rng() * Math.PI * 2;
    const dist = randRange(this.rng, 380, 520);
    this.foot.push({
      x: clamp(px + Math.cos(angle) * dist, 30, WORLD.width - 30),
      y: clamp(py + Math.sin(angle) * dist, 30, WORLD.height - 30),
      angle: 0,
      health: 100,
      dead: false,
      downTime: 0,
      shotTimer: randRange(this.rng, 0.6, 1.6),
      phase: this.rng() * 6,
      shirt: '#274b73',
      pants: '#1d2733',
      cop: true,
    });
  }

  /**
   * Advance the whole force. ctx: {px, py, inCar, carSpeed, dt, onPlayerDamage, effects}
   * Returns 'busted' when the bust meter fills, else null.
   */
  update(dt, ctx) {
    const { px, py } = ctx;
    this.seenNow = this.stars > 0 && this.canSee(px, py);
    if (this.stars > 0) {
      if (this.seenNow) this.unseen = 0;
      else {
        this.unseen += dt;
        if (this.unseen >= WANTED.coolPerStar) {
          this.stars -= 1;
          this.unseen = 0;
          if (this.stars === 0) this.clear();
        }
      }
    }

    // spawns / despawns
    this.spawnTimer -= dt;
    if (this.stars > 0 && this.spawnTimer <= 0) {
      this.spawnTimer = 0.8;
      if (this.cars.length < this.desiredCars()) this.spawnCarNear(px, py);
      if (this.foot.length < this.desiredFoot()) this.spawnFootNear(px, py);
    }
    this.cars = this.cars.filter((c) => {
      const d = Math.hypot(c.x - px, c.y - py);
      return !(this.stars === 0 || d > 1500 || c.health <= -200);
    });
    this.foot = this.foot.filter((f) => {
      const d = Math.hypot(f.x - px, f.y - py);
      if (f.dead) {
        f.downTime += dt;
        return f.downTime < 6;
      }
      return !(this.stars === 0 || d > 1300);
    });

    // cruisers hunt
    for (const car of this.cars) {
      const dx = px - car.x;
      const dy = py - car.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = Math.atan2(dy, dx);
      const turn = clamp(angleDiff(car.angle, want), -2.4 * dt, 2.4 * dt);
      car.angle += turn;
      const align = Math.cos(angleDiff(car.angle, want));
      let target = WANTED.copCarSpeed * (d > 300 ? 1 : 0.72);
      if (align < 0.2) target = 90; // swing around when pointing the wrong way
      car.speed += clamp(target - car.speed, -500 * dt, 260 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (collideCar(car, this.city.colliders)) car.speed *= 0.4;
      car.sirenPhase += dt * 9;
    }

    // officers on foot
    let bustPressure = 0;
    for (const f of this.foot) {
      if (f.dead) continue;
      const dx = px - f.x;
      const dy = py - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.angle = Math.atan2(dy, dx);
      if (d > 60) {
        f.x += (dx / d) * WANTED.copFootSpeed * dt;
        f.y += (dy / d) * WANTED.copFootSpeed * dt;
        const fixed = collideCircle(f, 11, this.city.colliders);
        f.x = fixed.x;
        f.y = fixed.y;
        f.phase += dt * 11;
      }
      if (!ctx.inCar && d < WANTED.bustRange) bustPressure = Math.max(bustPressure, 1);
      if (ctx.inCar && Math.abs(ctx.carSpeed) < 26) {
        for (const c of this.cars) {
          if (Math.hypot(c.x - px, c.y - py) < 74) bustPressure = Math.max(bustPressure, 0.6);
        }
      }
      // officers shoot at 2+ stars when the player is exposed
      if (this.stars >= 2 && d < 330 && d > 40) {
        f.shotTimer -= dt;
        if (f.shotTimer <= 0) {
          f.shotTimer = randRange(this.rng, 1.1, 1.9);
          const hitChance = clamp(0.62 - d / 700, 0.15, 0.6);
          ctx.effects.push({ kind: 'tracer', x1: f.x, y1: f.y, x2: px, y2: py, life: 0.09, max: 0.09, hostile: true });
          if (this.rng() < hitChance) ctx.onPlayerDamage(randRange(this.rng, 5, 10));
        }
      }
    }

    if (bustPressure > 0) {
      this.bust += (dt / WANTED.bustSeconds) * bustPressure;
      if (this.bust >= 1) {
        this.bust = 0;
        return 'busted';
      }
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.7);
    }
    return null;
  }
}
