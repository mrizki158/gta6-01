// Solmaris Heat — boot and the one loop. The world is assembled here (city, player,
// traffic, crowds, the wanted system, Mara's mission director) and advanced in fixed
// 1/60 s steps; the renderer and HUD paint whatever state results. Screens: title,
// play, pause, and the busted/wasted end card.
//
// ?seed=N fixes the city and crowds. ?shot=chase|downtown|driving|mission (with
// &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for the screenshot harness.
import { STEP, WORLD } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { buildStaticLayer, drawWorld, spawnParticles, updateParticles, VIEW } from './render.js';
import { drawHud, drawTitle, drawPause, drawEnd, TITLE_BUTTONS, PAUSE_BUTTONS, buttonRect } from './hud.js';
import { Player, updatePlayer, nearestCar, respawnPlayer } from './player.js';
import { spawnParked, spawnTraffic, updateTrafficCar, maintainTraffic, collideCars } from './vehicles.js';
import { spawnPeds, updatePed, scarePeds } from './pedestrians.js';
import { Wanted, reportCrime, updateWanted, updatePolice } from './police.js';
import { updateCombat } from './combat.js';
import { MissionDirector } from './missions.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const input = new Input(canvas);
const audio = new AudioEngine();

/** Assemble a whole world: one seed, one city, everything wired to everything. */
function createWorld(worldSeed) {
  const rng = makeRng(worldSeed);
  const city = new City(rng);
  const world = {
    rng,
    city,
    staticLayer: buildStaticLayer(city),
    time: 0,
    screen: 'title',
    camera: { x: city.places.start.x, y: city.places.start.y },
    player: new Player(city.places.start.x, city.places.start.y),
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    wanted: new Wanted(),
    cash: 120,
    completedMissions: [],
    phone: null,
    shake: 0,
    muzzleT: 0,
    script: null,
    promptText: '',
    showControls: false,
    hasSave: Boolean(loadSave()),
    endKind: null,
    pendingEnd: null,
    input,
    audio,
    carColors: null, // filled below from config through rng picks
  };
  world.carColors = [
    '#d64541', '#2e6fb7', '#f2f2f2', '#22262b', '#f2c94c', '#39b56a',
    '#e67e22', '#8e5bb5', '#17a2b8', '#e84393', '#95a5a6', '#fdfffc',
  ];
  world.director = new MissionDirector(world);
  world.reportCrime = (key, x, y) => reportCrime(world, key, x, y);
  world.showPhone = (from, text, seconds) => {
    world.phone = { from, text, until: world.time + seconds };
  };
  world.spawnParticles = (kind, x, y, n) => spawnParticles(world, kind, x, y, n);
  world.muzzleAt = (ped) => {
    spawnParticles(world, 'flash', ped.x + Math.cos(ped.angle) * 19, ped.y + Math.sin(ped.angle) * 19, 1);
  };
  world.missionEvent = (evt) => world.director.event(evt);
  world.screenToWorld = (sx, sy) => ({
    x: sx + world.camera.x - VIEW.width / 2,
    y: sy + world.camera.y - VIEW.height / 2,
  });
  world.persist = () => {
    writeSave({
      cash: world.cash,
      missionIndex: world.director.index,
      completed: world.completedMissions,
      x: world.player.x,
      y: world.player.y,
    });
    world.hasSave = true;
  };
  world.clampCamera = () => {
    world.camera.x = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, world.camera.x));
    world.camera.y = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, world.camera.y));
  };

  spawnParked(world);
  spawnTraffic(world, 9);
  spawnPeds(world, 34);
  return world;
}

/** Car bumps the caller should hear about: crimes, crashes, camera shake. */
function onCarBump(world, a, b, severity) {
  const playerCar = world.player.car;
  const near = Math.hypot(a.x - world.player.x, a.y - world.player.y) < 520;
  if (a === playerCar || b === playerCar) {
    const other = a === playerCar ? b : a;
    if (other.kind === 'police') world.reportCrime('hitCop', other.x, other.y);
    else if (other.kind === 'traffic') world.reportCrime('hitCar', other.x, other.y);
    world.audio.crash(Math.min(1, severity / 260));
    world.shake = Math.min(8, severity / 34);
  } else if (near && severity > 120) {
    world.audio.crash(0.3);
  }
}

/** Cars meet people: at speed, somebody gets hurt. */
function runOvers(world) {
  for (const car of world.cars) {
    if (car.dead || car.speed() < 70) continue;
    for (const ped of world.peds) {
      if (ped.dead || ped.knockT > 0.4) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) > 34) continue;
      const damage = car.speed() * 0.24;
      ped.health -= damage;
      ped.knockT = 0.9;
      world.spawnParticles('hit', ped.x, ped.y, 6);
      if (car === world.player.car) {
        world.audio.crash(0.35);
        world.shake = Math.max(world.shake, 3);
        world.reportCrime(ped.health <= 0 ? 'killPed' : 'hitPed', ped.x, ped.y);
      }
      if (ped.health <= 0) ped.dead = true;
      else {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.fleeFrom = { x: car.x, y: car.y };
      }
    }
    // A car can also collect the player, if he insists on standing in the road.
    const player = world.player;
    if (!player.car && car !== player.car && Math.hypot(player.x - car.x, player.y - car.y) < 34 && car.speed() > 90) {
      player.health -= car.speed() * 0.07;
      player.lastHurtT = world.time;
      world.shake = Math.max(world.shake, 4);
      world.audio.crash(0.4);
    }
  }
}

function updateCamera(world, dt) {
  const player = world.player;
  let tx = player.x;
  let ty = player.y;
  if (player.car) {
    tx += Math.cos(player.car.angle) * Math.abs(player.car.forwardSpeed()) * 0.34;
    ty += Math.sin(player.car.angle) * Math.abs(player.car.forwardSpeed()) * 0.34;
  } else if (player.weapon === 'pistol') {
    const mouse = world.screenToWorld(input.mouse.x, input.mouse.y);
    tx += (mouse.x - player.x) * 0.13;
    ty += (mouse.y - player.y) * 0.13;
  }
  const k = 1 - Math.exp(-4.6 * dt);
  world.camera.x += (tx - world.camera.x) * k;
  world.camera.y += (ty - world.camera.y) * k;
  world.clampCamera();
}

/** One fixed simulation step of a live game. Shared by the loop and the staging. */
export function stepWorld(world, dt) {
  world.time += dt;
  world.muzzleT = Math.max(0, world.muzzleT - dt);
  world.shake = Math.max(0, world.shake - dt * 16);

  updatePlayer(world, dt);
  for (const car of world.cars) {
    if (car.kind === 'traffic' && !car.dead) {
      const result = updateTrafficCar(car, dt, world);
      if (result.impact > 4 && Math.hypot(car.x - world.player.x, car.y - world.player.y) < 480) {
        world.audio.crash(0.3);
      }
    }
  }
  updateWanted(world, dt);
  updatePolice(world, dt);
  for (const ped of world.peds) updatePed(ped, dt, world);
  updateCombat(world, dt);
  world.director.update(dt);
  collideCars(world, (a, b, s) => onCarBump(world, a, b, s));
  runOvers(world);
  updateParticles(world, dt);
  maintainTraffic(world, 9);

  // A wrecked ride leaves the player standing in the road.
  if (world.player.car && world.player.car.dead) {
    const car = world.player.car;
    world.player.car = null;
    car.kind = 'parked';
    world.player.x = car.x + 44;
    world.player.y = car.y;
    world.spawnParticles('smoke', car.x, car.y, 12);
  }
  if (world.player.health <= 0 && !world.pendingEnd) world.pendingEnd = 'wasted';

  // The little prompt over the player's head.
  if (!world.player.car) {
    const car = nearestCar(world);
    world.promptText = car ? (car.kind === 'traffic' ? '[E] Steal car' : '[E] Get in car') : '';
  } else {
    world.promptText = '';
  }

  updateCamera(world, dt);
}

/** The title screen's ambient city: traffic and crowds, no story, drifting camera. */
function stepAmbient(world, dt) {
  world.time += dt;
  for (const car of world.cars) {
    if (car.kind === 'traffic' && !car.dead) updateTrafficCar(car, dt, world);
  }
  for (const ped of world.peds) updatePed(ped, dt, world);
  collideCars(world, () => {});
  updateParticles(world, dt);
  maintainTraffic(world, 9);
  world.camera.x = 1750 + Math.sin(world.time * 0.02) * 780;
  world.camera.y = 1020 + Math.cos(world.time * 0.016) * 430;
  world.clampCamera();
}

function draw(world) {
  drawWorld(ctx, world);
  if (world.screen === 'play' || world.screen === 'pause') drawHud(ctx, world);
  if (world.screen === 'title') drawTitle(ctx, world);
  if (world.screen === 'pause') drawPause(ctx, world);
  if (world.screen === 'end') drawEnd(ctx, world);
}

// ------------------------------------------------------------------ flow
let world = createWorld(seed);

function announce(message) {
  if (status) status.textContent = message;
}

function startNewGame() {
  audio.unlock();
  world = createWorld(Math.floor(Math.random() * 4294967296));
  world.screen = 'play';
  world.director.begin(0);
  announce('New game. Mara Voss is calling.');
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  audio.unlock();
  world = createWorld(Math.floor(Math.random() * 4294967296));
  world.cash = save.cash;
  world.completedMissions = save.completed;
  if (save.x !== null) {
    world.player.x = save.x;
    world.player.y = save.y;
    world.camera.x = save.x;
    world.camera.y = save.y;
  }
  world.screen = 'play';
  world.director.begin(Math.min(save.missionIndex, 5));
  announce('Welcome back to Solmaris.');
}

function toTitle() {
  world = createWorld(Math.floor(Math.random() * 4294967296));
  world.screen = 'title';
  audio.setEngine(0, false);
  audio.setSiren(0, 0);
  announce('Solmaris Heat. Title screen.');
}

function enterEnd(kind) {
  world.screen = 'end';
  world.endKind = kind;
  world.pendingEnd = null;
  world.endT = 0;
  if (kind === 'busted') audio.busted();
  else audio.wasted();
  audio.setEngine(0, false);
  audio.setSiren(0, 0);
  announce(kind === 'busted' ? 'Busted.' : 'Wasted.');
}

function clickedButton(buttons) {
  if (!input.mouse.clicked) return null;
  for (const btn of buttons) {
    if (btn.id === 'continue' && !world.hasSave) continue;
    const r = buttonRect(btn);
    if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
      return btn.id;
    }
  }
  return null;
}

function handleScreens(dt) {
  if (world.screen === 'title') {
    if (world.showControls) {
      if (input.mouse.clicked || input.hit('Enter', 'Escape')) {
        world.showControls = false;
        audio.click();
      }
      return;
    }
    const id = clickedButton(TITLE_BUTTONS);
    if (id === 'new') startNewGame();
    else if (id === 'continue') continueGame();
    else if (id === 'controls') {
      world.showControls = true;
      audio.click();
    } else if (input.hit('Enter')) startNewGame();
    else if (input.hit('KeyC') && world.hasSave) continueGame();
    return;
  }
  if (world.screen === 'pause') {
    const id = clickedButton(PAUSE_BUTTONS);
    if (id === 'resume' || input.hit('Escape', 'KeyP')) {
      world.screen = 'play';
      audio.click();
    } else if (id === 'restart') startNewGame();
    else if (id === 'mute') audio.toggleMute();
    else if (id === 'title') toTitle();
    return;
  }
  if (world.screen === 'end') {
    world.endT = (world.endT ?? 0) + dt;
    if (world.endT > 1 && (input.hit('Enter') || input.mouse.clicked)) {
      respawnPlayer(world, world.endKind);
      world.screen = 'play';
      world.persist();
      announce('Back on the street.');
    }
    return;
  }
  // play
  if (input.hit('Escape', 'KeyP')) {
    world.screen = 'pause';
    audio.setEngine(0, false);
    audio.setSiren(0, 0);
    announce('Paused.');
  }
}

function runLoop() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.hit('KeyM')) audio.toggleMute();
    handleScreens(STEP);
    if (world.screen === 'play') {
      while (accumulator >= STEP) {
        stepWorld(world, STEP);
        accumulator -= STEP;
        if (world.pendingEnd) {
          enterEnd(world.pendingEnd);
          accumulator = 0;
          break;
        }
      }
    } else if (world.screen === 'title') {
      while (accumulator >= STEP) {
        stepAmbient(world, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    draw(world);
    input.endFrame();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.screen === 'play') world.screen = 'pause';
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  announce('Solmaris Heat. Title screen.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  world.screen = 'play';
  stageShot(world, name, stepWorld);
  let painted = 0;
  function paint() {
    draw(world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runLoop();
