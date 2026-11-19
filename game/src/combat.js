// Combat: the player's pistol and fists, bullets that die on walls and bite into people
// and cars, and the armed peds (dock thugs, police officers) who shoot back. Hits throw
// sparks and puffs through the particle system; kills are reported to the wanted system.
import { PISTOL, PLAYER } from './config.js';
import { damagePlayer } from './player.js';
import { scarePeds } from './pedestrians.js';

export function spawnBullet(world, x, y, angle, from, damage = PISTOL.damage, speed = PISTOL.speed) {
  world.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: PISTOL.range / speed,
    from,
    damage,
  });
}

function pointInSolids(city, x, y) {
  for (const s of city.solids) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  }
  return false;
}

function hurtPed(world, ped, damage, byPlayer, angle) {
  if (ped.dead) return;
  ped.health -= damage;
  ped.knockT = Math.max(ped.knockT, 0.25);
  world.spawnParticles('hit', ped.x, ped.y, 4);
  if (ped.health <= 0) {
    ped.dead = true;
    if (byPlayer) {
      world.reportCrime(ped.role === 'officer' ? 'killCop' : 'killPed', ped.x, ped.y);
      if (ped.missionTag) world.missionEvent({ type: 'thugDown', tag: ped.missionTag });
    }
  } else if (ped.role === 'civilian') {
    ped.state = 'flee';
    ped.fleeT = 2.6;
    ped.fleeFrom = { x: ped.x - Math.cos(angle) * 50, y: ped.y - Math.sin(angle) * 50 };
  }
}

/** Armed peds close to their fighting range, hold it, and shoot on a ragged rhythm. */
function updateShooter(world, ped, dt) {
  const player = world.player;
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  ped.angle = Math.atan2(dy, dx);
  const range = ped.role === 'officer' ? 215 : 240;
  let mx = 0;
  let my = 0;
  if (dist > range + 30) {
    mx = dx / dist;
    my = dy / dist;
  } else if (dist < 110) {
    mx = -dx / dist;
    my = -dy / dist;
  } else {
    // Sidestep slowly to feel alive while holding the line.
    mx = -dy / dist * 0.35 * ped.strafeDir;
    my = dx / dist * 0.35 * ped.strafeDir;
    if (world.rng() < dt * 0.25) ped.strafeDir = -(ped.strafeDir ?? 1);
  }
  if (mx !== 0 || my !== 0) {
    const sp = ped.role === 'officer' ? 148 : 128;
    const moved = world.city.tryMove(ped.x, ped.y, ped.x + mx * sp * dt, ped.y + my * sp * dt, 10);
    const res = world.city.resolveCircle(moved.x, moved.y, 10);
    ped.x = res.x;
    ped.y = res.y;
  }
  ped.fireCooldown -= dt;
  if (ped.fireCooldown <= 0 && dist < 380) {
    ped.fireCooldown = 0.75 + world.rng() * 0.7;
    const spread = (world.rng() - 0.5) * 0.17;
    spawnBullet(world, ped.x + Math.cos(ped.angle) * 16, ped.y + Math.sin(ped.angle) * 16, ped.angle + spread, 'enemy', 7, 820);
    world.audio.enemyShoot();
    world.muzzleAt(ped);
  }
}

export function updateCombat(world, dt) {
  const player = world.player;
  const input = world.input;

  // --- the player's own violence ---
  if (!player.car && player.health > 0) {
    if (player.weapon === 'pistol' && input.mouse.down && player.fireT <= 0) {
      player.fireT = PISTOL.cooldown;
      const spread = (world.rng() - 0.5) * 2 * PISTOL.spread;
      spawnBullet(
        world,
        player.x + Math.cos(player.angle) * 20,
        player.y + Math.sin(player.angle) * 20,
        player.angle + spread,
        'player',
      );
      world.muzzleT = 0.055;
      world.audio.shoot();
      world.shake = Math.max(world.shake, 1.6);
      scarePeds(world, player.x, player.y, 210);
      if (world.time - (world.shotCrimeT ?? -9) > 1.1) {
        world.shotCrimeT = world.time;
        world.reportCrime('shotFired', player.x, player.y);
      }
    }
    const meleePressed = input.mouse.clicked || input.hit('KeyF');
    if (meleePressed && player.meleeT <= 0) {
      player.meleeT = PLAYER.meleeCooldown;
      world.audio.punch();
      for (const ped of world.peds) {
        if (ped.dead) continue;
        const d = Math.hypot(ped.x - player.x, ped.y - player.y);
        if (d < PLAYER.meleeRange + 10) {
          hurtPed(world, ped, PLAYER.meleeDamage, true, Math.atan2(ped.y - player.y, ped.x - player.x));
          world.reportCrime('hitPed', ped.x, ped.y);
        }
      }
      for (const car of world.cars) {
        if (car === player.car || car.dead) continue;
        if (Math.hypot(car.x - player.x, car.y - player.y) < 62) {
          car.health -= 6;
          world.spawnParticles('spark', player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22, 3);
        }
      }
    }
  }

  // --- armed peds ---
  for (const ped of world.peds) {
    if (ped.dead || ped.role === 'civilian') continue;
    if (ped.knockT > 0) {
      ped.knockT -= dt;
      continue;
    }
    updateShooter(world, ped, dt);
  }

  // --- bullets ---
  const kept = [];
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (pointInSolids(world.city, b.x, b.y)) {
      world.spawnParticles('spark', b.x, b.y, 2);
      continue;
    }
    let consumed = false;
    if (b.from === 'player') {
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
          hurtPed(world, ped, b.damage, true, Math.atan2(b.vy, b.vx));
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const car of world.cars) {
          if (car.dead || car === player.car) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 36) {
            car.health -= b.damage * 0.45;
            if (car.health <= 0) {
              car.dead = true;
              world.spawnParticles('smoke', car.x, car.y, 10);
              if (car.kind === 'police') world.reportCrime('killCop', car.x, car.y);
            }
            world.spawnParticles('spark', b.x, b.y, 3);
            consumed = true;
            break;
          }
        }
      }
    } else if (!player.car && Math.hypot(player.x - b.x, player.y - b.y) < 15) {
      damagePlayer(world, b.damage);
      world.spawnParticles('hit', player.x, player.y, 3);
      consumed = true;
    } else if (player.car && Math.hypot(player.car.x - b.x, player.car.y - b.y) < 36) {
      player.car.health -= b.damage * 0.3;
      if (player.car.health <= 0) player.car.dead = true;
      world.spawnParticles('spark', b.x, b.y, 2);
      consumed = true;
    }
    if (!consumed) kept.push(b);
  }
  world.bullets = kept;
}
