// Heads-up display and screens, all painted on the same canvas: cash and health,
// wanted stars with a bust meter, the phone when Mara calls, the objective line, the
// weapon and speed readouts, and a live minimap (roads and blocks simplified, blips for
// the player, the police and the objective). The title, pause and end screens live here
// too; main.js feeds them clicks through the button geometry exported below.
import { FONT, WORLD } from './config.js';
import { VIEW } from './render.js';

const INK = 'rgba(16,18,22,0.82)';
const PAPER = '#f7f3e8';
const GOLD = '#f2c94c';

function panel(ctx, x, y, w, h, fill = INK, r = 10) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = GOLD;
    ctx.fill();
  }
  ctx.strokeStyle = filled ? '#a87e14' : 'rgba(240,240,240,0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ------------------------------------------------------------------ minimap
const MAP = { x: 18, y: VIEW.height - 148, w: 212, h: 130 };

function mapScale() {
  return MAP.w / WORLD.width;
}

function toMap(x, y) {
  return { x: MAP.x + x * mapScale(), y: MAP.y + y * mapScale() };
}

function drawMinimap(ctx, world) {
  const { city, player } = world;
  panel(ctx, MAP.x - 4, MAP.y - 4, MAP.w + 8, MAP.h + 8, 'rgba(10,12,16,0.78)', 8);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(MAP.x, MAP.y, MAP.w, MAP.h, 5);
  ctx.clip();
  // Land, sea, roads.
  ctx.fillStyle = '#5d9153';
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  const shore = toMap(WORLD.beachX, 0);
  ctx.fillStyle = '#d9bd7a';
  ctx.fillRect(shore.x, MAP.y, toMap(WORLD.waterX, 0).x - shore.x, MAP.h);
  ctx.fillStyle = '#2a7ba0';
  ctx.fillRect(toMap(WORLD.waterX, 0).x, MAP.y, MAP.w - (toMap(WORLD.waterX, 0).x - MAP.x), MAP.h);
  ctx.strokeStyle = 'rgba(30,32,36,0.85)';
  ctx.lineWidth = 2;
  for (const cx of city.vRoads) {
    const p = toMap(cx, 0);
    ctx.beginPath();
    ctx.moveTo(p.x, MAP.y);
    ctx.lineTo(p.x, MAP.y + MAP.h);
    ctx.stroke();
  }
  for (const cy of city.hRoads) {
    const p = toMap(0, cy);
    ctx.beginPath();
    ctx.moveTo(MAP.x, p.y);
    ctx.lineTo(MAP.x + MAP.w, p.y);
    ctx.stroke();
  }
  // Police blips.
  const flash = Math.floor(world.time * 3) % 2 === 0;
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    const p = toMap(car.x, car.y);
    ctx.fillStyle = flash ? '#5aa2ff' : '#ff5040';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const ped of world.peds) {
    if (ped.role !== 'officer' || ped.dead) continue;
    const p = toMap(ped.x, ped.y);
    ctx.fillStyle = '#5aa2ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Objective blip.
  const obj = world.director ? world.director.objective() : null;
  if (obj && obj.x !== null) {
    const p = toMap(obj.x, obj.y);
    ctx.fillStyle = GOLD;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
    ctx.restore();
  }
  // Player arrow.
  const p = toMap(player.x, player.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -4);
  ctx.lineTo(-4.4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `11px ${FONT}`;
  ctx.fillText('SOLMARIS', MAP.x + 4, MAP.y + MAP.h + 15);
}

// ------------------------------------------------------------------ HUD
export function drawHud(ctx, world) {
  const { player, wanted } = world;
  ctx.textAlign = 'left';

  // Cash and health, top-left.
  panel(ctx, 16, 14, 208, 64);
  ctx.fillStyle = '#7ee787';
  ctx.font = `bold 25px ${FONT}`;
  ctx.fillText(`$${world.cash.toLocaleString('en-US')}`, 30, 46);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(30, 56, 180, 10);
  const hp = Math.max(0, player.health) / 100;
  ctx.fillStyle = hp > 0.35 ? '#51cf66' : '#ff5040';
  ctx.fillRect(30, 56, 180 * hp, 10);

  // Wanted stars, top-right.
  if (wanted.stars > 0 || wanted.bustMeter > 0) {
    panel(ctx, VIEW.width - 216, 14, 200, 52);
    for (let i = 0; i < 5; i += 1) {
      star(ctx, VIEW.width - 192 + i * 38, 40, 15, i < wanted.stars);
    }
    if (wanted.bustMeter > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(VIEW.width - 200, 74, 168, 9);
      ctx.fillStyle = '#ff5040';
      ctx.fillRect(VIEW.width - 200, 74, 168 * Math.min(1, wanted.bustMeter), 9);
      ctx.fillStyle = '#ffb3ab';
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText('BUSTED…', VIEW.width - 200, 96);
    } else if (world.time - wanted.lastSeenT > 2.5 && world.time - wanted.lastCrimeT > 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText('LOSING THEM…', VIEW.width - 200, 82);
    }
  }

  // Phone: Mara's calls, top-centre.
  if (world.phone && world.time < world.phone.until) {
    const boxW = 560;
    ctx.font = `15px ${FONT}`;
    const lines = wrapText(ctx, world.phone.text, boxW - 36);
    const boxH = 44 + lines.length * 20;
    panel(ctx, (VIEW.width - boxW) / 2, 14, boxW, boxH, 'rgba(20,22,28,0.92)');
    ctx.fillStyle = GOLD;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`PHONE — ${world.phone.from.toUpperCase()}`, (VIEW.width - boxW) / 2 + 18, 38);
    ctx.fillStyle = PAPER;
    ctx.font = `15px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, (VIEW.width - boxW) / 2 + 18, 62 + i * 20);
    });
  }

  // Objective, bottom-centre.
  const obj = world.director ? world.director.objective() : null;
  if (obj) {
    ctx.font = `bold 17px ${FONT}`;
    const w = Math.min(760, ctx.measureText(obj.text).width + 56);
    panel(ctx, (VIEW.width - w) / 2, VIEW.height - 52, w, 38, 'rgba(16,18,22,0.78)');
    ctx.fillStyle = GOLD;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText(obj.missionTitle.toUpperCase(), (VIEW.width - w) / 2 + 16, VIEW.height - 38);
    ctx.fillStyle = PAPER;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(obj.text, (VIEW.width - w) / 2 + 16, VIEW.height - 20);
  } else if (world.director && world.director.done) {
    ctx.font = `bold 15px ${FONT}`;
    const text = 'Free roam — Solmaris is yours. Cause trouble, outrun the law.';
    const w = ctx.measureText(text).width + 40;
    panel(ctx, (VIEW.width - w) / 2, VIEW.height - 52, w, 34, 'rgba(16,18,22,0.6)');
    ctx.fillStyle = PAPER;
    ctx.fillText(text, (VIEW.width - w) / 2 + 20, VIEW.height - 29);
  }

  // Weapon and speed, bottom-right.
  panel(ctx, VIEW.width - 168, VIEW.height - 84, 150, 66);
  ctx.fillStyle = PAPER;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(player.car ? 'DRIVING' : player.weapon === 'pistol' ? 'PISTOL' : 'FISTS', VIEW.width - 152, VIEW.height - 58);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `12px ${FONT}`;
  if (player.car) {
    const mph = Math.round(Math.abs(player.car.forwardSpeed()) * 0.24);
    ctx.fillText(`${mph} MPH`, VIEW.width - 152, VIEW.height - 38);
    const carHp = Math.max(0, Math.round(player.car.health));
    ctx.fillText(`CAR ${carHp}%`, VIEW.width - 100, VIEW.height - 38);
  } else {
    ctx.fillText('[1] FISTS  [2] PISTOL', VIEW.width - 152, VIEW.height - 38);
  }

  // Interaction prompt, centre-bottom above the objective.
  if (world.promptText) {
    ctx.font = `bold 16px ${FONT}`;
    const w = ctx.measureText(world.promptText).width + 34;
    panel(ctx, (VIEW.width - w) / 2, VIEW.height - 104, w, 32, 'rgba(16,18,22,0.85)');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(world.promptText, (VIEW.width - w) / 2 + 17, VIEW.height - 83);
  }

  drawMinimap(ctx, world);

  // Hurt vignette.
  if (player.health < 35 || world.time - player.lastHurtT < 0.25) {
    const pulse = player.health < 35 ? 0.16 + Math.sin(world.time * 6) * 0.05 : 0.13;
    const grad = ctx.createRadialGradient(640, 360, 260, 640, 360, 640);
    grad.addColorStop(0, 'rgba(180,20,20,0)');
    grad.addColorStop(1, `rgba(180,20,20,${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

// ------------------------------------------------------------------ screens
export const TITLE_BUTTONS = [
  { id: 'new', label: 'NEW GAME', y: 402 },
  { id: 'continue', label: 'CONTINUE', y: 458 },
  { id: 'controls', label: 'HOW TO PLAY', y: 514 },
];
export const BUTTON_W = 300;
export const BUTTON_H = 44;

export function buttonRect(btn) {
  return { x: (VIEW.width - BUTTON_W) / 2, y: btn.y, w: BUTTON_W, h: BUTTON_H };
}

function drawButtons(ctx, world, buttons) {
  for (const btn of buttons) {
    const r = buttonRect(btn);
    const enabled = btn.id !== 'continue' || world.hasSave;
    const hover = enabled && world.input.mouse.x >= r.x && world.input.mouse.x <= r.x + r.w
      && world.input.mouse.y >= r.y && world.input.mouse.y <= r.y + r.h;
    panel(ctx, r.x, r.y, r.w, r.h, hover ? 'rgba(242,201,76,0.92)' : 'rgba(16,18,22,0.85)');
    ctx.fillStyle = !enabled ? 'rgba(255,255,255,0.35)' : hover ? '#171a1f' : PAPER;
    ctx.font = `bold 19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, VIEW.width / 2, r.y + 29);
    ctx.textAlign = 'left';
  }
}

const CONTROLS = [
  'WASD / Arrows — move and drive',
  'E — enter / exit a car (walk up to any car)',
  'Mouse — aim · Click — shoot or punch',
  '1 / 2 or Q — fists / pistol',
  'Shift — sprint · Space — handbrake',
  'P or Esc — pause · M — mute',
  'Do the jobs Mara Voss phones in. Stars bring police.',
  'Lose the law to cool off. Get pinned and you are busted.',
];

export function drawTitle(ctx, world) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, 'rgba(24,16,40,0.55)');
  grad.addColorStop(0.55, 'rgba(24,16,40,0.25)');
  grad.addColorStop(1, 'rgba(24,16,40,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText('W E L C O M E   T O', VIEW.width / 2, 168);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 96px ${FONT}`;
  ctx.fillText('SOLMARIS', VIEW.width / 2, 258);
  ctx.fillStyle = '#ff7a59';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('H E A T', VIEW.width / 2, 316);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `17px ${FONT}`;
  ctx.fillText('An original open-world crime story — steal, run, and rise on the Solmaris coast.', VIEW.width / 2, 352);
  ctx.textAlign = 'left';

  if (world.showControls) {
    panel(ctx, VIEW.width / 2 - 300, 386, 600, CONTROLS.length * 27 + 58, 'rgba(12,14,18,0.94)');
    ctx.fillStyle = GOLD;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('HOW TO PLAY', VIEW.width / 2 - 272, 418);
    ctx.fillStyle = PAPER;
    ctx.font = `15.5px ${FONT}`;
    CONTROLS.forEach((line, i) => ctx.fillText(line, VIEW.width / 2 - 272, 448 + i * 27));
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('Click anywhere to go back', VIEW.width / 2 - 272, 418 + CONTROLS.length * 27 + 16);
  } else {
    drawButtons(ctx, world, TITLE_BUTTONS);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Headphones on. Nothing here is from anywhere else — Solmaris is its own town.', VIEW.width / 2, 690);
  ctx.textAlign = 'left';
}

export const PAUSE_BUTTONS = [
  { id: 'resume', label: 'RESUME', y: 330 },
  { id: 'restart', label: 'NEW GAME', y: 386 },
  { id: 'mute', label: 'SOUND ON/OFF', y: 442 },
  { id: 'title', label: 'TITLE SCREEN', y: 498 },
];

export function drawPause(ctx, world) {
  ctx.fillStyle = 'rgba(10,12,18,0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText('PAUSED', VIEW.width / 2, 268);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`Cash $${world.cash.toLocaleString('en-US')} · Jobs done ${world.completedMissions.length}/5`, VIEW.width / 2, 298);
  ctx.textAlign = 'left';
  drawButtons(ctx, world, PAUSE_BUTTONS);
}

export function drawEnd(ctx, world) {
  const busted = world.endKind === 'busted';
  ctx.fillStyle = busted ? 'rgba(14,22,52,0.66)' : 'rgba(52,10,10,0.66)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = busted ? '#7fb2ff' : '#ff6b5e';
  ctx.font = `bold 92px ${FONT}`;
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', VIEW.width / 2, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `19px ${FONT}`;
  ctx.fillText(
    busted
      ? 'The Solmaris PD walks you out after a $150 fine.'
      : 'Solmaris General patches you up for $100.',
    VIEW.width / 2, 366,
  );
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('Press ENTER to keep rolling', VIEW.width / 2, 404);
  ctx.textAlign = 'left';
}
