// Screen-space HUD: cash and health, wanted stars with the BUSTED meter, a live minimap
// (roads, water, blips for police, the mission marker and the player), the current
// objective, timed notification banners, and the title / pause / busted / wasted screens.

import { VIEW, WORLD } from './config.js';

function wrap(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawHUD(ctx, game, time) {
  const { player, police } = game;
  // top-left: cash + health
  ctx.fillStyle = 'rgba(12,16,20,0.55)';
  ctx.fillRect(14, 14, 218, 64);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${game.cash}`, 26, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 54, 180, 10);
  ctx.fillStyle = player.health > 30 ? '#e5534b' : (Math.floor(time * 6) % 2 ? '#ff7b72' : '#e5534b');
  ctx.fillRect(26, 54, 180 * Math.max(0, player.health) / 100, 10);

  // top-right: wanted stars
  const stars = police.stars;
  ctx.font = '30px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#f7c948' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', VIEW.width - 22 - (4 - i) * 32, 46);
  }
  if (stars > 0 && !police.seenNow) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('LOSING THEM…', VIEW.width - 22, 66);
  }
  // BUSTED meter
  if (police.bust > 0.02) {
    ctx.fillStyle = 'rgba(12,16,20,0.55)';
    ctx.fillRect(VIEW.width / 2 - 130, 84, 260, 26);
    ctx.fillStyle = '#3f7fbf';
    ctx.fillRect(VIEW.width / 2 - 124, 90, 248 * Math.min(1, police.bust), 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', VIEW.width / 2, 101);
  }

  // weapon + speed, bottom-right
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  if (game.inCar && game.playerCar) {
    const kmh = Math.round(Math.abs(game.playerCar.speed) * 0.36);
    ctx.fillText(`${kmh} km/h`, VIEW.width - 22, VIEW.height - 20);
  } else {
    ctx.fillText(player.hasPistol ? (player.weapon === 'pistol' ? 'PISTOL' : 'FISTS') : 'FISTS', VIEW.width - 22, VIEW.height - 20);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('F near a car: drive · E: talk · Q: weapon · Shift: run · LMB: attack', VIEW.width - 22, VIEW.height - 40);
  }

  drawMinimap(ctx, game, time);
  drawObjective(ctx, game);
  drawNotices(ctx, game);
}

function drawMinimap(ctx, game, time) {
  const w = 224;
  const h = 168;
  const x = 14;
  const y = VIEW.height - h - 14;
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  ctx.fillStyle = 'rgba(10,14,18,0.72)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1d6f8e';
  ctx.fillRect(x + game.city.waterX * sx, y, (WORLD.width - game.city.waterX) * sx, h);
  ctx.fillStyle = '#e6cf9a';
  ctx.fillRect(x + game.city.beachX * sx, y, (game.city.waterX - game.city.beachX) * sx, h);
  ctx.strokeStyle = 'rgba(230,230,230,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const cx of game.city.roadsV) {
    ctx.moveTo(x + cx * sx, y);
    ctx.lineTo(x + cx * sx, y + h);
  }
  for (const cy of game.city.roadsH) {
    ctx.moveTo(x, y + cy * sy);
    ctx.lineTo(x + w, y + cy * sy);
  }
  ctx.stroke();
  // police blips
  for (const c of game.police.cars) {
    ctx.fillStyle = Math.floor(time * 5 + c.sirenPhase) % 2 ? '#ff5050' : '#5aa2ff';
    ctx.fillRect(x + c.x * sx - 2, y + c.y * sy - 2, 4, 4);
  }
  // mission marker
  const m = game.missions.marker();
  if (m) {
    const pulse = 3 + Math.sin(time * 5) * 1.2;
    ctx.fillStyle = '#f7c948';
    ctx.beginPath();
    ctx.arc(x + m.x * sx, y + m.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // player arrow
  const px = x + game.playerPos.x * sx;
  const py = y + game.playerPos.y * sy;
  const ang = game.inCar && game.playerCar ? game.playerCar.angle : game.player.angle;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawObjective(ctx, game) {
  const text = game.missions.objective();
  if (!text) return;
  ctx.font = '14px system-ui, sans-serif';
  const lines = wrap(ctx, text, 520);
  const w = Math.min(560, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28);
  const h = lines.length * 19 + 16;
  ctx.fillStyle = 'rgba(12,16,20,0.55)';
  ctx.fillRect(VIEW.width / 2 - w / 2, VIEW.height - h - 12, w, h);
  ctx.fillStyle = '#ffd964';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, VIEW.width / 2, VIEW.height - h + 6 + (i + 1) * 19 - 12));
}

function drawNotices(ctx, game) {
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  let y = 128;
  for (const n of game.notices) {
    const lines = wrap(ctx, n.text, 620);
    const h = lines.length * 20 + 14;
    ctx.fillStyle = 'rgba(12,16,20,0.68)';
    ctx.fillRect(VIEW.width / 2 - 330, y, 660, h);
    ctx.fillStyle = '#f2f0d5';
    lines.forEach((l, i) => ctx.fillText(l, VIEW.width / 2, y + 22 + i * 20));
    y += h + 8;
  }
}

export function drawMarker(ctx, game, time) {
  // world-space mission beacon: a pulsing column ring at the objective
  const m = game.missions.marker();
  if (!m) return;
  const cam = game.camera;
  const x = m.x - cam.x;
  const y = m.y - cam.y;
  if (x < -80 || y < -80 || x > VIEW.width + 80 || y > VIEW.height + 80) return;
  const pulse = 0.75 + Math.sin(time * 4) * 0.25;
  ctx.strokeStyle = `rgba(247,201,72,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 26 + Math.sin(time * 4) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f7c948';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.label, x, y - 38);
}

export function drawTitle(ctx, time, save) {
  ctx.fillStyle = 'rgba(8,12,20,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7c948';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SOLMARIS', VIEW.width / 2, 240);
  ctx.fillStyle = '#ff6b4a';
  ctx.fillText('HEAT', VIEW.width / 2, 326);
  ctx.fillStyle = '#f2f0d5';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('An open-world crime story on the Solmaris coast', VIEW.width / 2, 372);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = `rgba(255,255,255,${0.65 + Math.sin(time * 3) * 0.3})`;
  ctx.fillText('Press ENTER or click to play', VIEW.width / 2, 440);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('WASD move · Shift run · F enter/leave car · E talk · Q swap weapon · Mouse aim, LMB attack · P pause', VIEW.width / 2, 486);
  ctx.fillText('Steal cars, run jobs for Mara Voss, and mind the stars.', VIEW.width / 2, 512);
  if (save.missionsDone > 0 || save.cash > 0) {
    ctx.fillStyle = '#7ee787';
    ctx.fillText(`Saved: $${save.cash} earned · ${save.missionsDone}/5 jobs done · best heat ${save.bestStars}★`, VIEW.width / 2, 556);
  }
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(8,12,20,0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f0d5';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW.width / 2, 320);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('P or Esc to resume', VIEW.width / 2, 362);
}

export function drawEndCard(ctx, kind, detail) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,40,80,0.72)' : 'rgba(80,16,16,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', VIEW.width / 2, 320);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(detail, VIEW.width / 2, 366);
  ctx.fillText('Press ENTER to get back up', VIEW.width / 2, 402);
}
