// Canvas renderer: a flat-shaded top-down city with pseudo-3D buildings (offset walls
// and soft shadows sell the height), lane markings, a beach and animated water, then
// cars, people and effects. Everything is drawn from the game state; no image assets.

import { VIEW, WORLD, PITCH, COLORS } from './config.js';

export function makeCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(cam, focusX, focusY, lookX, lookY) {
  const tx = focusX + lookX - VIEW.width / 2;
  const ty = focusY + lookY - VIEW.height / 2;
  cam.x += (tx - cam.x) * 0.12;
  cam.y += (ty - cam.y) * 0.12;
  cam.x = Math.max(0, Math.min(WORLD.width - VIEW.width, cam.x));
  cam.y = Math.max(0, Math.min(WORLD.height - VIEW.height, cam.y));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(ctx, game, time) {
  const cam = game.camera;
  const { city } = game;
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  const vx = cam.x - 40;
  const vy = cam.y - 40;
  const vw = VIEW.width + 80;
  const vh = VIEW.height + 80;

  drawGround(ctx, city, vx, vy, vw, vh, time);
  drawSkids(ctx, game.skids);
  for (const c of city.containers) drawContainer(ctx, c);
  // buildings sorted by y so taller southern neighbours overlap correctly
  const visible = city.buildings.filter((b) => b.x + b.w > vx && b.x < vx + vw && b.y + b.h > vy && b.y < vy + vh);
  visible.sort((a, b) => a.y - b.y);
  for (const b of visible) drawBuilding(ctx, b);
  for (const t of city.trees) {
    if (t.x < vx || t.x > vx + vw || t.y < vy || t.y > vy + vh) continue;
    drawTree(ctx, t);
  }
  for (const l of city.lamps) {
    if (l.x < vx || l.x > vx + vw || l.y < vy || l.y > vy + vh) continue;
    ctx.fillStyle = '#565d66';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#ffe9a3';
    ctx.fillRect(l.x - 1, l.y - 1, 2, 2);
  }

  for (const car of game.cars) drawCar(ctx, car, time);
  for (const car of game.police.cars) drawCar(ctx, car, time);
  for (const ped of game.peds) drawPerson(ctx, ped, ped.phase);
  for (const cop of game.police.foot) drawPerson(ctx, cop, cop.phase, true);
  for (const thug of game.missions.thugs) drawPerson(ctx, thug, thug.phase);
  drawPerson(ctx, game.fixer, 0);
  if (!game.inCar) drawPlayer(ctx, game.player);
  drawEffects(ctx, game.effects, game.particles);
  ctx.restore();
}

function drawGround(ctx, city, vx, vy, vw, vh, time) {
  // land base
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(vx, vy, vw, vh);
  // city pavement under the grid
  ctx.fillStyle = COLORS.sidewalk;
  ctx.fillRect(Math.max(vx, 0), Math.max(vy, 0), Math.min(vw, city.beachX - vx), vh);
  // blocks: pavement slabs with a slightly varied tone per block
  ctx.fillStyle = '#c4c7cb';
  for (let bx = 0; bx < 8; bx += 1) {
    for (let by = 0; by < 6; by += 1) {
      const x = WORLD.road + bx * PITCH;
      const y = WORLD.road + by * PITCH;
      if (x + WORLD.block < vx || x > vx + vw || y + WORLD.block < vy || y > vy + vh) continue;
      ctx.fillRect(x, y, WORLD.block, WORLD.block);
    }
  }
  // parks and plaza floors
  ctx.fillStyle = COLORS.park;
  for (const lot of city.lots) ctx.fillRect(lot.x - 18, lot.y - 18, lot.w + 36, lot.h + 36);
  // park blocks grass
  ctx.fillRect(WORLD.road + 1 * PITCH, WORLD.road + 2 * PITCH, WORLD.block, WORLD.block);
  ctx.fillRect(WORLD.road + 6 * PITCH, WORLD.road + 1 * PITCH, WORLD.block, WORLD.block);
  // plaza fountain
  const s = city.spots;
  ctx.fillStyle = '#8fc7d9';
  ctx.beginPath();
  ctx.arc(s.fixer.x, s.fixer.y + 52, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5ea8c4';
  ctx.beginPath();
  ctx.arc(s.fixer.x, s.fixer.y + 52, 18, 0, Math.PI * 2);
  ctx.fill();

  // roads
  ctx.fillStyle = COLORS.road;
  for (const cx of city.roadsV) ctx.fillRect(cx - WORLD.road / 2, Math.max(vy, 0), WORLD.road, vh);
  for (const cy of city.roadsH) ctx.fillRect(Math.max(vx, 0), cy - WORLD.road / 2, Math.min(vw, city.beachX - vx + WORLD.road), WORLD.road);
  // lane dashes
  ctx.fillStyle = COLORS.lane;
  for (const cx of city.roadsV) {
    for (let y = Math.floor(vy / 36) * 36; y < vy + vh; y += 36) {
      if ((y % PITCH) < WORLD.road) continue; // gap at junctions
      ctx.fillRect(cx - 2, y, 4, 18);
    }
  }
  for (const cy of city.roadsH) {
    for (let x = Math.floor(vx / 36) * 36; x < vx + vw && x < city.beachX; x += 36) {
      if ((x % PITCH) < WORLD.road) continue;
      ctx.fillRect(x, cy - 2, 18, 4);
    }
  }

  // beach and water
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(city.beachX, Math.max(vy, 0), city.waterX - city.beachX, vh);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(city.waterX, Math.max(vy, 0), vx + vw - city.waterX, vh);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = Math.floor(vy / 46) * 46; y < vy + vh; y += 46) {
    const off = Math.sin(time * 1.4 + y * 0.05) * 7;
    ctx.moveTo(city.waterX + 18 + off, y);
    ctx.lineTo(city.waterX + 66 + off, y);
    ctx.moveTo(city.waterX + 130 - off, y + 22);
    ctx.lineTo(city.waterX + 190 - off, y + 22);
  }
  ctx.stroke();
  // boardwalk line
  ctx.fillStyle = '#a98f5f';
  ctx.fillRect(city.beachX - 6, Math.max(vy, 0), 8, vh);
}

function drawBuilding(ctx, b) {
  const lift = b.height * 0.32;
  // ground shadow
  ctx.fillStyle = COLORS.roofShadow;
  ctx.fillRect(b.x + lift * 0.7, b.y + lift * 0.7, b.w, b.h);
  // wall (the visible south/east faces)
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x - lift * 0.4, b.y - lift * 0.4, b.w, b.h);
  // roof
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x - lift * 0.55, b.y - lift * 0.55, b.w, b.h);
  // roof detail: inner slab + furniture
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  const rx = b.x - lift * 0.55 + 7;
  const ry = b.y - lift * 0.55 + 7;
  ctx.fillRect(rx, ry, Math.max(0, b.w - 14), Math.max(0, b.h - 14));
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  if (b.w > 60 && b.h > 44) ctx.fillRect(rx + 8, ry + 6, 18, 12);
  if (b.kind === 'tower' && b.w > 90) ctx.fillRect(rx + b.w - 44, ry + b.h - 30, 22, 14);
  if (b.kind === 'warehouse') {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let x = rx + 10; x < rx + b.w - 20; x += 26) ctx.fillRect(x, ry + b.h / 2 - 2, 16, 4);
  }
}

function drawContainer(ctx, c) {
  ctx.fillStyle = 'rgba(20,24,30,0.25)';
  ctx.fillRect(c.x + 3, c.y + 3, c.w, c.h);
  ctx.fillStyle = c.color;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = c.x + 5; x < c.x + c.w - 4; x += 8) ctx.fillRect(x, c.y + 3, 3, c.h - 6);
}

function drawTree(ctx, t) {
  ctx.fillStyle = 'rgba(20,24,30,0.22)';
  ctx.beginPath();
  ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3e7d3a';
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#57a047';
  ctx.beginPath();
  ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = 52;
  const W = 26;
  // shadow
  ctx.fillStyle = 'rgba(15,18,22,0.3)';
  roundRect(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 7);
  ctx.fill();
  // body
  ctx.fillStyle = car.kind === 'cop' ? '#eef1f4' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  if (car.kind === 'cop') {
    ctx.fillStyle = '#22303e';
    ctx.fillRect(-6, -W / 2, 14, W);
  }
  if (car.kind === 'target') {
    ctx.fillStyle = '#f7c948';
    roundRect(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
  }
  // cabin + glass
  ctx.fillStyle = '#1d2733';
  roundRect(ctx, -10, -W / 2 + 4, 22, W - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,235,0.85)';
  ctx.fillRect(6, -W / 2 + 5, 5, W - 10);
  ctx.fillRect(-13, -W / 2 + 5, 4, W - 10);
  // roof
  ctx.fillStyle = car.kind === 'cop' ? '#dfe5ea' : shade(car.color, -18);
  ctx.fillRect(-8, -W / 2 + 6, 15, W - 12);
  // headlights / tail lights
  ctx.fillStyle = '#fff6bf';
  ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 5);
  ctx.fillStyle = '#d64541';
  ctx.fillRect(-L / 2, -W / 2 + 3, 3, 5);
  ctx.fillRect(-L / 2, W / 2 - 8, 3, 5);
  // wheels
  ctx.fillStyle = '#14171a';
  ctx.fillRect(-L / 2 + 6, -W / 2 - 2, 11, 4);
  ctx.fillRect(-L / 2 + 6, W / 2 - 2, 11, 4);
  ctx.fillRect(L / 2 - 17, -W / 2 - 2, 11, 4);
  ctx.fillRect(L / 2 - 17, W / 2 - 2, 11, 4);
  // damage smoke
  if (car.health < 45) {
    ctx.fillStyle = `rgba(60,60,60,${0.25 + 0.15 * Math.sin(time * 9 + car.id)})`;
    ctx.beginPath();
    ctx.arc(L / 2 - 4, 0, 6 + Math.sin(time * 7 + car.id) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // cop light bar (unrotated colours flash in world space above the car)
  if (car.kind === 'cop') {
    const phase = Math.floor(time * 6 + car.sirenPhase) % 2;
    ctx.fillStyle = phase ? '#ff4040' : '#3f7fbf';
    ctx.beginPath();
    ctx.arc(car.x - 4, car.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = phase ? '#3f7fbf' : '#ff4040';
    ctx.beginPath();
    ctx.arc(car.x + 5, car.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export function drawPerson(ctx, p, phase, isCop = false) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.dead) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(20,20,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -11, -6, 22, 12, 5);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // shadow
  ctx.fillStyle = 'rgba(20,20,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 5, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const swing = Math.sin(phase || 0) * 4;
  ctx.rotate(p.angle + Math.PI / 2);
  // legs
  ctx.strokeStyle = p.pants;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3, 2);
  ctx.lineTo(-3, 9 + swing);
  ctx.moveTo(3, 2);
  ctx.lineTo(3, 9 - swing);
  ctx.stroke();
  // torso
  ctx.fillStyle = p.shirt;
  roundRect(ctx, -7, -6, 14, 13, 5);
  ctx.fill();
  // head
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(0, -10, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (isCop || p.cop) {
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(-6, -15, 12, 5);
  }
  if (p.thug) {
    ctx.fillStyle = '#22252a';
    ctx.fillRect(-6, -15, 12, 4);
  }
  ctx.restore();
}

export function drawPlayer(ctx, player) {
  drawPerson(ctx, {
    x: player.x, y: player.y, angle: player.angle, dead: false,
    shirt: '#f4f1de', pants: '#3d405b', phase: player.phase,
  }, player.phase);
  // the player's marker ring + held pistol
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 16, 0, Math.PI * 2);
  ctx.stroke();
  if (player.weapon === 'pistol' && player.hasPistol) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#22252a';
    ctx.fillRect(10, -2, 12, 4);
    ctx.restore();
  }
  if (player.swing > 0) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.strokeStyle = '#e8b98d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(6, 4);
    ctx.lineTo(6 + player.swing * 14, 8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSkids(ctx, skids) {
  ctx.strokeStyle = 'rgba(20,20,22,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const s of skids) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
}

function drawEffects(ctx, effects, particles) {
  for (const e of effects) {
    if (e.kind === 'tracer') {
      ctx.strokeStyle = e.hostile ? 'rgba(255,90,60,0.85)' : 'rgba(255,230,130,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.kind === 'flash') {
      ctx.fillStyle = 'rgba(255,210,80,0.9)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'ring') {
      ctx.strokeStyle = `rgba(255,220,90,${Math.max(0, e.life / e.max)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1.6 - e.life / e.max), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}
