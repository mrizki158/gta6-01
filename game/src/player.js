// The player on foot: movement with building collision, fists and a pistol. Combat is
// hitscan — a shot picks the closest living target within a narrow cone of the aim —
// and reports what it hit so the caller can spawn effects and raise the heat.

import { PLAYER } from './config.js';
import { collideCircle } from './city.js';
import { clamp } from './random.js';

export function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    weapon: 'fists',
    hasPistol: false,
    punchTimer: 0,
    shotTimer: 0,
    swing: 0, // 0..1 punch animation phase, render-only
    moving: false,
    phase: 0,
  };
}

export function updatePlayerOnFoot(player, dt, input, city, aimAngle) {
  const axis = input.axis();
  const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = axis.x !== 0 || axis.y !== 0;
  if (player.moving) {
    const len = Math.hypot(axis.x, axis.y) || 1;
    player.x += (axis.x / len) * speed * dt;
    player.y += (axis.y / len) * speed * dt;
    player.angle = Math.atan2(axis.y, axis.x);
    player.phase += dt * (run ? 12 : 9);
    const fixed = collideCircle(player, PLAYER.radius, city.colliders);
    player.x = fixed.x;
    player.y = fixed.y;
  }
  if (aimAngle !== null && aimAngle !== undefined) player.angle = aimAngle;
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.shotTimer = Math.max(0, player.shotTimer - dt);
  player.swing = Math.max(0, player.swing - dt * 5);
  player.health = clamp(player.health, 0, PLAYER.health);
}

/** Nearest living target to `player` within `range` and roughly in front of `angle`. */
function targetInCone(player, targets, range, angle, spread) {
  let best = null;
  let bestDist = range;
  for (const t of targets) {
    if (t.dead) continue;
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > range || d < 1) continue;
    let diff = Math.atan2(dy, dx) - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > spread) continue;
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/** Swing a punch. Returns the target hit, or null. */
export function tryPunch(player, targets) {
  if (player.punchTimer > 0) return null;
  player.punchTimer = PLAYER.punchCooldown;
  player.swing = 1;
  const hit = targetInCone(player, targets, PLAYER.punchRange + 12, player.angle, 0.9);
  if (hit) hit.health -= PLAYER.punchDamage;
  return hit;
}

/**
 * Fire the pistol toward `angle`. Returns {target, x, y} — the impact point — or null
 * when the gun is not ready. Cars count as targets with a wider body radius.
 */
export function tryShoot(player, angle, people, cars) {
  if (player.shotTimer > 0 || !player.hasPistol) return null;
  player.shotTimer = PLAYER.pistolCooldown;
  const hitPerson = targetInCone(player, people, PLAYER.pistolRange, angle, 0.055);
  let hitCar = null;
  let hitCarDist = PLAYER.pistolRange;
  for (const car of cars) {
    if (car.kind === 'copCarPlayer') continue;
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > PLAYER.pistolRange) continue;
    let diff = Math.atan2(dy, dx) - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < Math.atan2(26, Math.max(30, d)) && d < hitCarDist) {
      hitCar = car;
      hitCarDist = d;
    }
  }
  const personDist = hitPerson ? Math.hypot(hitPerson.x - player.x, hitPerson.y - player.y) : Infinity;
  if (hitPerson && personDist <= hitCarDist) {
    hitPerson.health -= PLAYER.pistolDamage;
    return { target: hitPerson, kind: 'person', x: hitPerson.x, y: hitPerson.y };
  }
  if (hitCar) {
    hitCar.health -= PLAYER.pistolDamage;
    return { target: hitCar, kind: 'car', x: hitCar.x, y: hitCar.y };
  }
  return {
    target: null,
    kind: 'miss',
    x: player.x + Math.cos(angle) * PLAYER.pistolRange * 0.6,
    y: player.y + Math.sin(angle) * PLAYER.pistolRange * 0.6,
  };
}
