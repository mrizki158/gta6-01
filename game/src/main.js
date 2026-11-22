// Solmaris Heat — entry point and game orchestration. Owns the world state, the fixed
// step loop, and every interaction between systems: carjacking, combat consequences,
// police responses, mission hooks, busted/wasted flow and the save.

import { VIEW, WORLD } from './config.js';
import { Input } from './input.js';
import { sound } from './audio.js';
import { buildCity } from './city.js';
import { spawnTraffic, spawnParked, makeCar, updateTraffic, driveCar, collideCar, separateCars } from './vehicles.js';
import { spawnPeds, updatePed, downPed } from './pedestrians.js';
import { makePlayer, updatePlayerOnFoot, tryPunch, tryShoot } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { loadSave, storeSave } from './save.js';
import { makeRng } from './random.js';
import { makeCamera, updateCamera, drawScene } from './render.js';
import { drawHUD, drawMarker, drawTitle, drawPause, drawEndCard } from './hud.js';
import { setupShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261122);

export function createGame() {
  const city = buildCity(seed);
  const save = loadSave();
  const game = {
    city,
    save,
    cash: save.cash,
    player: makePlayer(city.spots.playerSpawn.x, city.spots.playerSpawn.y),
    cars: [],
    peds: [],
    police: new Police(city),
    missions: null,
    camera: makeCamera(),
    effects: [],
    particles: [],
    skids: [],
    notices: [],
    inCar: false,
    playerCar: null,
    screen: 'title',
    time: 0,
    danger: null,
    dangerTimer: 0,
    crimeCooldown: 0,
    endDetail: '',
    sound,
    fixer: {
      x: city.spots.fixer.x, y: city.spots.fixer.y, angle: Math.PI / 2,
      shirt: '#0e7c7b', pants: '#e6cf9a', phase: 0, dead: false,
    },
  };
  game.missions = new Missions(city, save.missionsDone);
  game.cars.push(...spawnTraffic(city, 22, seed + 7));
  game.cars.push(...spawnParked(city, 26, seed + 13));
  game.peds = spawnPeds(city, 42, seed + 21);
  for (const p of game.peds) p.health = 60;
  game.playerPos = { x: game.player.x, y: game.player.y };

  // ---- facade used by missions / police ----
  game.notify = (text) => {
    game.notices.push({ text, ttl: 7 });
    if (game.notices.length > 3) game.notices.shift();
  };
  game.reward = (n) => {
    game.cash += n;
    game.save.cash = game.cash;
    // reward() is called from Missions.complete before the index advances
    game.save.missionsDone = Math.max(game.save.missionsDone, game.missions.index + 1);
    storeSave(game.save);
    sound.cash();
  };
  game.grantPistol = () => {
    if (!game.player.hasPistol) {
      game.player.hasPistol = true;
      game.player.weapon = 'pistol';
      game.notify('Picked up a pistol — Q swaps weapons, mouse aims, click fires.');
    }
  };
  game.spawnTargetCar = () => {
    if (game.cars.some((c) => c.kind === 'target')) return;
    const s = city.spots.marina;
    const car = makeCar(s.x, s.y - 60, -Math.PI / 2, '#f7c948', 'target');
    game.cars.push(car);
  };
  game.removeTargetCar = (delivered = false) => {
    const target = game.cars.find((c) => c.kind === 'target');
    if (!target) return;
    if (game.playerCar === target) exitCar(game);
    game.cars = game.cars.filter((c) => c !== target);
    if (delivered) game.particles.push(...burst(target.x, target.y, '#f7c948'));
  };
  game.onPlayerDamage = (dmg) => {
    game.player.health -= game.inCar ? dmg * 0.45 : dmg;
  };
  return game;
}

function burst(x, y, color) {
  const out = [];
  for (let i = 0; i < 14; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 90;
    out.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5, max: 0.5, color, size: 3 + Math.random() * 3,
    });
  }
  return out;
}

function exitCar(game) {
  const car = game.playerCar;
  if (!car) return;
  game.player.x = car.x + Math.cos(car.angle - Math.PI / 2) * 30;
  game.player.y = car.y + Math.sin(car.angle - Math.PI / 2) * 30;
  game.player.angle = car.angle;
  game.inCar = false;
  game.playerCar = null;
  car.kind = car.kind === 'cop' ? 'cop' : car.kind;
  sound.door();
  sound.engine(null);
}

function enterCar(game, car) {
  if (car.kind === 'traffic') {
    // the driver bails out and runs
    const driver = {
      id: 9000 + Math.floor(Math.random() * 1000),
      x: car.x + 20, y: car.y, tx: car.x + 90, ty: car.y + 40,
      speed: 90, shirt: '#95a5a6', pants: '#2d3436', angle: 0,
      panic: 2.4, dead: false, downTime: 0, phase: 0, health: 60,
    };
    game.peds.push(driver);
    car.kind = 'parked';
  }
  const wasOwned = car.ownedByPlayer;
  game.inCar = true;
  game.playerCar = car;
  car.ownedByPlayer = true;
  sound.door();
  if (car.kind === 'target') {
    game.missions.onTargetStolen(game);
  } else if (!wasOwned && car.kind !== 'cop') {
    if (game.police.report(1)) sound.star();
  }
}

function nearestCar(game, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function resolveHit(game, hit, wasShot) {
  if (!hit || !hit.target) return;
  const t = hit.target;
  if (hit.kind === 'person') {
    game.effects.push({ kind: 'flash', x: hit.x, y: hit.y, life: 0.08, max: 0.08 });
    if (t.health <= 0 && !t.dead) {
      t.dead = true;
      t.downTime = 0;
      game.particles.push(...burst(t.x, t.y, '#c0392b'));
      if (t.cop) {
        if (game.police.report(4)) sound.star();
      } else if (game.police.report(3)) sound.star();
    }
  } else if (hit.kind === 'car') {
    game.particles.push(...burst(hit.x, hit.y, '#f39c12'));
    if (t.kind === 'cop' && wasShot && game.police.report(2)) sound.star();
  }
}

export function stepGame(game, input, dt) {
  game.time += dt;
  const rng = game._rng || (game._rng = makeRng(4242));
  game.crimeCooldown = Math.max(0, game.crimeCooldown - dt);
  game.dangerTimer = Math.max(0, game.dangerTimer - dt);
  if (game.dangerTimer <= 0) game.danger = null;

  const player = game.player;
  const mouseAim = Math.atan2(
    input.mouse.y - (player.y - game.camera.y),
    input.mouse.x - (player.x - game.camera.x),
  );

  if (!game.inCar) {
    const aiming = player.hasPistol && player.weapon === 'pistol';
    updatePlayerOnFoot(player, dt, input, game.city, aiming ? mouseAim : null);
    if (input.pressed.has('KeyQ') && player.hasPistol) {
      player.weapon = player.weapon === 'pistol' ? 'fists' : 'pistol';
    }
    if (input.pressed.has('KeyE')) game.missions.tryStart(game);
    if (input.pressed.has('KeyF')) {
      const car = nearestCar(game, player.x, player.y, 52);
      if (car && Math.abs(car.speed) < 90) enterCar(game, car);
    }
    if (input.mouse.clicked || input.pressed.has('Space')) {
      if (player.weapon === 'pistol' && player.hasPistol) {
        const hit = tryShoot(player, mouseAim, [...game.peds, ...game.police.foot, ...game.missions.thugs], game.cars);
        if (hit) {
          sound.shot();
          game.effects.push({ kind: 'tracer', x1: player.x, y1: player.y, x2: hit.x, y2: hit.y, life: 0.07, max: 0.07 });
          game.effects.push({ kind: 'flash', x: player.x + Math.cos(mouseAim) * 22, y: player.y + Math.sin(mouseAim) * 22, life: 0.05, max: 0.05 });
          game.danger = { x: player.x, y: player.y };
          game.dangerTimer = 2.5;
          if (game.police.report(2)) sound.star();
          resolveHit(game, hit, true);
        }
      } else {
        const hit = tryPunch(player, [...game.peds, ...game.police.foot, ...game.missions.thugs]);
        sound.punch();
        if (hit) {
          game.effects.push({ kind: 'flash', x: hit.x, y: hit.y, life: 0.06, max: 0.06 });
          if (hit.health <= 0 && !hit.dead) {
            hit.dead = true;
            hit.downTime = 0;
            if (game.police.report(hit.cop ? 4 : 3)) sound.star();
          } else if (game.police.report(1)) sound.star();
        }
      }
    }
  } else {
    const car = game.playerCar;
    const throttle = (input.keys.has('KeyW') || input.keys.has('ArrowUp') ? 1 : 0) - (input.keys.has('KeyS') || input.keys.has('ArrowDown') ? 1 : 0);
    const steer = (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? 1 : 0) - (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? 1 : 0);
    const norm = driveCar(car, dt, throttle, steer);
    sound.engine(norm);
    if (input.keys.has('Space')) car.speed -= car.speed * 2.4 * dt;
    const hitWall = collideCar(car, game.city.colliders);
    if (hitWall && Math.abs(car.speed) > 120) car.health -= 4;
    // skid marks while cornering hard
    if (Math.abs(car.speed) > 190 && steer !== 0) {
      game.skids.push({
        x1: car.x - Math.cos(car.angle) * 16 - Math.cos(car.angle + Math.PI / 2) * 10,
        y1: car.y - Math.sin(car.angle) * 16 - Math.sin(car.angle + Math.PI / 2) * 10,
        x2: car.x - Math.cos(car.angle) * 10 - Math.cos(car.angle + Math.PI / 2) * 10,
        y2: car.y - Math.sin(car.angle) * 10 - Math.sin(car.angle + Math.PI / 2) * 10,
      });
      if (game.skids.length > 420) game.skids.splice(0, game.skids.length - 420);
    }
    // running people down
    const everyone = [...game.peds, ...game.police.foot, ...game.missions.thugs];
    for (const p of everyone) {
      if (p.dead) continue;
      if (Math.abs(car.speed) > 55 && Math.hypot(p.x - car.x, p.y - car.y) < 26) {
        downPed(p);
        p.health = 0;
        p.dead = true;
        game.particles.push(...burst(p.x, p.y, '#c0392b'));
        car.speed *= 0.82;
        game.danger = { x: car.x, y: car.y };
        game.dangerTimer = 2;
        if (game.police.report(p.cop ? 4 : 3)) sound.star();
      }
    }
    if (input.pressed.has('KeyF')) exitCar(game);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  }

  // traffic + collisions between cars
  for (const car of game.cars) {
    if (car === game.playerCar) continue;
    if (car.kind === 'traffic') updateTraffic(car, dt, game.city, game.cars, rng);
  }
  const allCars = [...game.cars, ...game.police.cars];
  const impact = separateCars(allCars);
  if (impact > 190 && game.crimeCooldown <= 0) {
    game.crimeCooldown = 4;
    if (game.police.report(1)) sound.star();
  }

  // pedestrians flee gunfire / fast cars
  const threat = game.danger || (game.inCar && Math.abs(game.playerCar.speed) > 240 ? { x: game.playerCar.x, y: game.playerCar.y } : null);
  for (const ped of game.peds) updatePed(ped, dt, game.city, rng, threat);
  game.peds = game.peds.filter((p) => !p.dead || p.downTime < 9);

  // police
  game.playerPos.x = game.inCar ? game.playerCar.x : player.x;
  game.playerPos.y = game.inCar ? game.playerCar.y : player.y;
  const bustResult = game.police.update(dt, {
    px: game.playerPos.x,
    py: game.playerPos.y,
    inCar: game.inCar,
    carSpeed: game.inCar ? game.playerCar.speed : 0,
    effects: game.effects,
    onPlayerDamage: game.onPlayerDamage,
  });
  let sirenLevel = 0;
  if (game.police.cars.length) {
    const d = Math.min(...game.police.cars.map((c) => Math.hypot(c.x - game.playerPos.x, c.y - game.playerPos.y)));
    sirenLevel = Math.max(0, 1 - d / 700);
  }
  sound.siren(game.screen === 'play' ? sirenLevel : 0);
  game.save.bestStars = Math.max(game.save.bestStars, game.police.stars);

  if (bustResult === 'busted' && game.screen === 'play') {
    endRun(game, 'busted');
    return;
  }
  if (player.health <= 0 && game.screen === 'play') {
    endRun(game, 'wasted');
    return;
  }

  // missions
  game.missions.update(dt, game);

  // fixer idles, turning toward the player
  const f = game.fixer;
  f.angle = Math.atan2(game.playerPos.y - f.y, game.playerPos.x - f.x);

  // effects & notices
  for (const e of game.effects) e.life -= dt;
  game.effects = game.effects.filter((e) => e.life > 0);
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  for (const n of game.notices) n.ttl -= dt;
  game.notices = game.notices.filter((n) => n.ttl > 0);

  // camera
  const look = game.inCar
    ? { x: Math.cos(game.playerCar.angle) * Math.abs(game.playerCar.speed) * 0.28, y: Math.sin(game.playerCar.angle) * Math.abs(game.playerCar.speed) * 0.28 }
    : { x: 0, y: 0 };
  updateCamera(game.camera, game.playerPos.x, game.playerPos.y, look.x, look.y);
}

function endRun(game, kind) {
  game.screen = kind;
  sound.engine(null);
  sound.siren(0);
  if (kind === 'busted') sound.busted();
  const fine = Math.min(game.cash, 120 + game.police.stars * 60);
  game.endDetail = fine > 0 ? `The city fines you $${fine}. Your jobs reset — Mara waits on the plaza.` : 'You walk away with nothing but the story.';
  game._fine = fine;
  if (game.missions.state === 'active') game.missions.fail(game, kind === 'busted' ? 'you got caught' : 'you ended up in hospital');
}

function respawn(game) {
  game.cash = Math.max(0, game.cash - (game._fine || 0));
  game.save.cash = game.cash;
  storeSave(game.save);
  game.police.clear();
  if (game.inCar) {
    game.inCar = false;
    game.playerCar = null;
    sound.engine(null);
  }
  game.player.health = 100;
  game.player.x = game.city.spots.playerSpawn.x;
  game.player.y = game.city.spots.playerSpawn.y;
  game.camera.x = game.player.x - VIEW.width / 2;
  game.camera.y = game.player.y - VIEW.height / 2;
  game.screen = 'play';
}

export function render(game, time) {
  ctx.fillStyle = '#10151b';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  drawScene(ctx, game, time);
  drawMarker(ctx, game, time);
  if (game.screen !== 'title') drawHUD(ctx, game, time);
  if (game.screen === 'title') drawTitle(ctx, time, game.save);
  else if (game.screen === 'pause') drawPause(ctx);
  else if (game.screen === 'busted' || game.screen === 'wasted') drawEndCard(ctx, game.screen, game.endDetail);
}

function boot() {
  const game = createGame();
  const input = new Input(canvas);
  const shotName = params.get('shot');
  if (shotName) {
    game._step = (inp, dt) => stepGame(game, inp, dt);
    setupShot(game, shotName, seed);
    game.screen = 'play';
    // settle the camera on the staged scene, then draw one exact frame
    game.camera.x = game.playerPos.x - VIEW.width / 2;
    game.camera.y = game.playerPos.y - VIEW.height / 2;
    render(game, 1.25);
    document.title = 'shot-ready';
    return;
  }
  game.camera.x = game.player.x - VIEW.width / 2;
  game.camera.y = game.player.y - VIEW.height / 2;

  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    const dtReal = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    if (game.screen === 'title') {
      if (input.pressed.has('Enter') || input.mouse.clicked) {
        sound.unlock();
        game.screen = 'play';
        game.notify('Welcome to Solmaris. Mara Voss is waiting on the plaza — follow the gold marker.');
      }
      // slow ambient pan behind the title
      game.camera.x = (Math.sin(time * 0.05) * 0.5 + 0.5) * (WORLD.width - VIEW.width);
      game.camera.y = (Math.cos(time * 0.04) * 0.5 + 0.5) * (WORLD.height - VIEW.height);
      for (const car of game.cars) if (car.kind === 'traffic') updateTraffic(car, dtReal, game.city, game.cars, game._rng || (game._rng = makeRng(4242)));
    } else if (game.screen === 'play') {
      acc += dtReal;
      const step = 1 / 60;
      let n = 0;
      while (acc >= step && n < 4) {
        stepGame(game, input, step);
        acc -= step;
        n += 1;
      }
      if (input.pressed.has('KeyP') || input.pressed.has('Escape')) game.screen = 'pause';
    } else if (game.screen === 'pause') {
      if (input.pressed.has('KeyP') || input.pressed.has('Escape')) game.screen = 'play';
    } else if (game.screen === 'busted' || game.screen === 'wasted') {
      if (input.pressed.has('Enter')) respawn(game);
    }
    render(game, time);
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
