// Rendering. The whole static city — ground, roads, sidewalks, buildings with their
// afternoon shadows, palms, piers, containers — is painted once into an offscreen canvas
// the size of the world; each frame blits the camera's slice of it and draws the moving
// things (cars, people, bullets, particles) on top, y-sorted so figures pass in front of
// and behind each other naturally. A warm sun wash and a vignette finish the frame.
import { GRID, PALETTE, WORLD } from './config.js';

export const VIEW = { width: 1280, height: 720 };

/** Spawn `n` particles of a kind at a point. Kinds: smoke, spark, hit, flash. */
export function spawnParticles(world, kind, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = world.rng() * Math.PI * 2;
    const sp = kind === 'spark' ? 60 + world.rng() * 160 : 12 + world.rng() * 30;
    const life = kind === 'flash' ? 0.06 : kind === 'smoke' ? 0.7 + world.rng() * 0.5 : 0.32;
    world.particles.push({
      kind, x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (kind === 'smoke' ? 26 : 0),
      life,
      maxLife: life,
      size: kind === 'smoke' ? 7 + world.rng() * 8 : 2 + world.rng() * 2.5,
    });
  }
  if (world.particles.length > 420) world.particles.splice(0, world.particles.length - 420);
}

export function updateParticles(world, dt) {
  const kept = [];
  for (const p of world.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 1.8 * dt;
    p.vy *= 1 - 1.8 * dt;
    if (p.kind === 'smoke') p.size += 16 * dt;
    kept.push(p);
  }
  world.particles = kept;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Paint the entire static city once. */
export function buildStaticLayer(city) {
  const layer = document.createElement('canvas');
  layer.width = WORLD.width;
  layer.height = WORLD.height;
  const ctx = layer.getContext('2d');

  // Land and sea.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.beachX, 0, WORLD.waterX - WORLD.beachX, WORLD.height);
  ctx.fillStyle = PALETTE.sandDark;
  for (let i = 0; i < 40; i += 1) {
    ctx.fillRect(WORLD.beachX + ((i * 173) % 260), (i * 389) % WORLD.height, 26, 7);
  }
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WORLD.waterX, 0, WORLD.width - WORLD.waterX, WORLD.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 90; i += 1) {
    const x = WORLD.waterX + 20 + ((i * 211) % (WORLD.width - WORLD.waterX - 60));
    const y = (i * 331) % WORLD.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y);
    ctx.stroke();
  }
  // Foam line where the sea meets the sand.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(WORLD.waterX - 3, 0, 5, WORLD.height);

  // Sidewalk aprons under every block, then the block's own ground.
  for (const b of city.blocks) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(b.x - 13, b.y - 13, b.w + 26, b.h + 26);
    ctx.fillStyle = b.kind === 'lot' || b.kind === 'station' || b.kind === 'garage' ? PALETTE.lot : PALETTE.grassDark;
    if (b.kind === 'docks') ctx.fillStyle = '#b8ab8e';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.kind === 'lot') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(b.x + 30 + i * 52, b.y + 55);
        ctx.lineTo(b.x + 30 + i * 52, b.y + 105);
        ctx.stroke();
      }
    }
  }

  // Roads: asphalt bands, then markings.
  ctx.fillStyle = PALETTE.road;
  for (const cx of city.vRoads) ctx.fillRect(cx - GRID.road / 2, 0, GRID.road, WORLD.height);
  for (const cy of city.hRoads) ctx.fillRect(0, cy - GRID.road / 2, WORLD.beachX + 70, GRID.road);
  ctx.strokeStyle = PALETTE.markingYellow;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const cx of city.vRoads) {
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, WORLD.height);
    ctx.stroke();
  }
  for (const cy of city.hRoads) {
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(WORLD.beachX + 70, cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(232,228,216,0.75)';
  for (const cx of city.vRoads) {
    for (const cy of city.hRoads) {
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(cx + s * 12 - 4, cy - GRID.road / 2 + 3, 8, 12);
        ctx.fillRect(cx + s * 12 - 4, cy + GRID.road / 2 - 15, 8, 12);
      }
    }
  }

  // Piers: plank decks over the water.
  for (const p of city.piers) {
    ctx.fillStyle = PALETTE.pier;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = PALETTE.pierDark;
    ctx.lineWidth = 2;
    for (let x = p.x + 18; x < p.x + p.w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, p.y + p.h);
      ctx.stroke();
    }
    ctx.lineWidth = 5;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }

  // Containers at the docks.
  for (const c of city.containers) {
    ctx.fillStyle = PALETTE.buildingShadow;
    ctx.fillRect(c.x + 5, c.y + 5, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let x = c.x + 12; x < c.x + c.w - 6; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, c.y + 3);
      ctx.lineTo(x, c.y + c.h - 3);
      ctx.stroke();
    }
  }

  // Buildings: long afternoon shadows, walls, roofs, names.
  for (const b of city.buildings) {
    ctx.fillStyle = PALETTE.buildingShadow;
    ctx.fillRect(b.x + b.height * 0.55, b.y + b.height * 0.4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const inset = 10;
    ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
    ctx.fillStyle = 'rgba(90,70,40,0.20)';
    ctx.fillRect(b.x + inset + 8, b.y + inset + 8, Math.max(0, b.w - inset * 2 - 40), 14);
    ctx.fillRect(b.x + inset + 8, b.y + b.h - inset - 24, Math.max(0, b.w - inset * 2 - 60), 12);
    if (b.label) {
      ctx.fillStyle = '#33302a';
      ctx.font = 'bold 21px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7);
      ctx.textAlign = 'left';
    }
  }

  // Palms: shadow, trunk, fronds.
  for (const palm of city.palms) {
    const s = palm.s;
    ctx.fillStyle = PALETTE.buildingShadow;
    ctx.beginPath();
    ctx.ellipse(palm.x + 8 * s, palm.y + 5 * s, 20 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6b46';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3 * s, palm.y - 12 * s);
    ctx.stroke();
    ctx.strokeStyle = '#3f8f4f';
    ctx.lineWidth = 3.4 * s;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x + 3 * s, palm.y - 12 * s);
      ctx.quadraticCurveTo(
        palm.x + 3 * s + Math.cos(a) * 15 * s,
        palm.y - 12 * s + Math.sin(a) * 8 * s - 4 * s,
        palm.x + 3 * s + Math.cos(a) * 23 * s,
        palm.y - 12 * s + Math.sin(a) * 12 * s + 3 * s,
      );
      ctx.stroke();
    }
  }

  // Beach umbrellas.
  for (let i = 0; i < 7; i += 1) {
    const x = WORLD.beachX + 70 + (i % 3) * 80;
    const y = 240 + i * 250;
    ctx.fillStyle = ['#e5534b', '#f2c94c', '#2e9fb7'][i % 3];
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  return layer;
}

function drawCar(ctx, world, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(50,35,10,0.30)';
  ctx.beginPath();
  ctx.ellipse(5, 7, 46, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const L = 92;
  const Wd = 44;
  if (car.kind === 'police') {
    ctx.fillStyle = '#171a1f';
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 9);
    ctx.fill();
    ctx.fillStyle = '#eef1f5';
    roundRect(ctx, -L * 0.18, -Wd / 2 + 2, L * 0.42, Wd - 4, 6);
    ctx.fill();
  } else {
    ctx.fillStyle = car.color;
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    roundRect(ctx, -L / 2 + 4, -Wd / 2 + 3, L - 8, 9, 5);
    ctx.fill();
  }
  // Cabin and glass.
  ctx.fillStyle = '#1d2733';
  roundRect(ctx, -L * 0.16, -Wd / 2 + 6, L * 0.34, Wd - 12, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,240,0.55)';
  roundRect(ctx, L * 0.13, -Wd / 2 + 8, 7, Wd - 16, 3);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#101216';
  for (const [wx, wy] of [[-L * 0.32, -Wd / 2 - 2], [L * 0.32, -Wd / 2 - 2], [-L * 0.32, Wd / 2 - 4], [L * 0.32, Wd / 2 - 4]]) {
    ctx.fillRect(wx - 8, wy, 16, 6);
  }
  // Headlights and brake lights.
  ctx.fillStyle = '#fff6bf';
  ctx.fillRect(L / 2 - 3, -Wd / 2 + 5, 4, 8);
  ctx.fillRect(L / 2 - 3, Wd / 2 - 13, 4, 8);
  ctx.fillStyle = car.brakeLight ? '#ff5040' : '#a02c22';
  ctx.fillRect(-L / 2 - 1, -Wd / 2 + 5, 4, 8);
  ctx.fillRect(-L / 2 - 1, Wd / 2 - 13, 4, 8);
  if (car.kind === 'police') {
    // Flashing lightbar.
    const phase = Math.floor(world.time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#5aa2ff';
    roundRect(ctx, -12, -Wd / 2 + 9, 24, 9, 3);
    ctx.fill();
    ctx.fillStyle = phase ? '#5aa2ff' : '#ff3b30';
    roundRect(ctx, -12, 4, 24, 9, 3);
    ctx.fill();
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(30,30,30,0.45)';
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 9);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, world, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(50,35,10,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.dead) {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -6, -13, 12, 26, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(0, -17, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const swing = Math.sin(world.time * 9 + ped.x * 0.05 + ped.y * 0.03) * 4;
  ctx.rotate(ped.angle + Math.PI / 2);
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-3.4, 10 + swing);
  ctx.moveTo(0, 2);
  ctx.lineTo(3.4, 10 - swing);
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  roundRect(ctx, -6.4, -6, 12.8, 13, 5);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -10.5, 5.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.role !== 'civilian') {
    ctx.strokeStyle = '#14181f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -2);
    ctx.lineTo(4, -16);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, world) {
  const player = world.player;
  if (player.car) return; // the car is the body while driving
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(50,35,10,0.30)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle + Math.PI / 2);
  const swing = player.moving ? Math.sin(player.walkCycle * 2.4) * 4.6 : 0;
  ctx.strokeStyle = '#22303c';
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-3.6, 11 + swing);
  ctx.moveTo(0, 2);
  ctx.lineTo(3.6, 11 - swing);
  ctx.stroke();
  // Teal jacket — the player's signature colour.
  ctx.fillStyle = '#0f7d8a';
  roundRect(ctx, -6.8, -6.4, 13.6, 14, 5);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -11, 5.8, 0, Math.PI * 2);
  ctx.fill();
  // Cap.
  ctx.fillStyle = '#d64541';
  ctx.beginPath();
  ctx.arc(0, -11.6, 5.8, Math.PI, Math.PI * 2);
  ctx.fill();
  if (player.weapon === 'pistol') {
    ctx.strokeStyle = '#14181f';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(4.4, -2);
    ctx.lineTo(4.4, -17);
    ctx.stroke();
    if (world.muzzleT > 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(4.4, -21, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawParticles(ctx, world) {
  for (const p of world.particles) {
    const fade = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(210,208,204,${0.35 * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.fillStyle = `rgba(255,170,60,${fade})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === 'hit') {
      ctx.fillStyle = `rgba(198,44,44,${0.55 * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'flash') {
      ctx.fillStyle = `rgba(255,211,77,${fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw the whole world for this frame. */
export function drawWorld(ctx, world) {
  const cam = world.camera;
  const shakeX = world.shake > 0 ? (world.rng() - 0.5) * world.shake : 0;
  const shakeY = world.shake > 0 ? (world.rng() - 0.5) * world.shake : 0;
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  ctx.translate(VIEW.width / 2 - cam.x + shakeX, VIEW.height / 2 - cam.y + shakeY);
  ctx.drawImage(world.staticLayer, 0, 0);

  // Objective marker: a pulsing gold ring on the ground.
  const obj = world.director ? world.director.objective() : null;
  if (obj && obj.x !== null && world.screen === 'play') {
    const pulse = 30 + Math.sin(world.time * 5) * 7;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,201,76,0.16)';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // The story car gets a bobbing diamond so it stands out of a crowded lot.
  const target = world.director ? world.director.targetCar : null;
  if (target && !target.dead && world.player.car !== target && world.screen === 'play') {
    const bob = Math.sin(world.time * 4) * 5;
    ctx.fillStyle = '#f2c94c';
    ctx.save();
    ctx.translate(target.x, target.y - 62 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }

  // Y-sorted entities.
  const drawables = [];
  for (const ped of world.peds) drawables.push({ y: ped.y, draw: () => drawPed(ctx, world, ped) });
  for (const car of world.cars) drawables.push({ y: car.y + 10, draw: () => drawCar(ctx, world, car) });
  if (!world.player.car) drawables.push({ y: world.player.y, draw: () => drawPlayer(ctx, world) });
  drawables.sort((a, b) => a.y - b.y);
  for (const item of drawables) item.draw();

  // Bullets as bright tracers.
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const b of world.bullets) {
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  drawParticles(ctx, world);
  ctx.restore();

  // Warm afternoon wash and a soft vignette.
  ctx.fillStyle = PALETTE.sunWash;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const grad = ctx.createRadialGradient(
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42,
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.86,
  );
  grad.addColorStop(0, 'rgba(46,24,0,0)');
  grad.addColorStop(1, 'rgba(46,24,0,0.20)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}
