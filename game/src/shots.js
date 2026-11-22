// Staged screenshot scenes behind ?shot=chase|downtown|walk|mission&seed=N. Each scene
// arranges the real game state — cars, cops, people, heat, HUD — and steps the actual
// simulation a few ticks so the frame is a genuine moment of play, identical per seed.

import { makeCar } from './vehicles.js';
import { makeRng } from './random.js';

function stubInput() {
  return {
    keys: new Set(),
    pressed: new Set(),
    mouse: { x: 900, y: 300, down: false, clicked: false },
    axis: () => ({ x: 0, y: 0 }),
    endFrame() {},
  };
}

function extraTraffic(game, rng, cx, cy, n) {
  const colors = ['#d64541', '#3f7fbf', '#e8b93e', '#59a96a', '#e6e6e6', '#8e6cc8'];
  for (let i = 0; i < n; i += 1) {
    const vertical = rng() < 0.5;
    const car = makeCar(
      cx + (rng() - 0.5) * 700,
      cy + (rng() - 0.5) * 460,
      vertical ? Math.PI / 2 : 0,
      colors[i % colors.length],
      'parked',
    );
    car.x = Math.max(60, Math.min(3380, car.x));
    car.y = Math.max(60, Math.min(2820, car.y));
    game.cars.push(car);
  }
}

function extraPeds(game, rng, cx, cy, n) {
  const shirts = ['#e74c3c', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];
  for (let i = 0; i < n; i += 1) {
    game.peds.push({
      id: 5000 + i,
      x: cx + (rng() - 0.5) * 520,
      y: cy + (rng() - 0.5) * 340,
      tx: cx, ty: cy,
      speed: 60, shirt: shirts[i % shirts.length], pants: '#2d3436',
      angle: rng() * 6.28, panic: 0, dead: false, downTime: 0,
      phase: rng() * 6, health: 60,
    });
  }
}

export function setupShot(game, name, seed) {
  const rng = makeRng(seed * 31 + 7);
  const { city } = game;
  game.cash = 1450;
  game.player.health = 82;

  if (name === 'chase') {
    // cover: a three-star pursuit tearing east through downtown
    const y = city.roadsH[2];
    const car = makeCar(1750, y + 24, 0, '#d64541', 'parked');
    car.speed = 265;
    car.ownedByPlayer = true;
    game.cars.push(car);
    game.inCar = true;
    game.playerCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    game.police.stars = 3;
    const copA = makeCar(1560, y + 22, 0.12, '#eef1f4', 'cop');
    copA.speed = 280;
    copA.copLight = true;
    const copB = makeCar(1985, y - 24, Math.PI - 0.35, '#eef1f4', 'cop');
    copB.speed = 190;
    copB.copLight = true;
    const copC = makeCar(1660, y - 26, 0.3, '#eef1f4', 'cop');
    copC.speed = 240;
    copC.copLight = true;
    game.police.cars.push(copA, copB, copC);
    extraTraffic(game, rng, 1850, y, 6);
    extraPeds(game, rng, 1850, y - 90, 7);
    // burnt rubber behind the player's car
    for (let i = 0; i < 12; i += 1) {
      game.skids.push({ x1: 1750 - i * 22 - 20, y1: y + 24 - 10, x2: 1750 - i * 22 - 38, y2: y + 24 - 10 });
      game.skids.push({ x1: 1750 - i * 22 - 20, y1: y + 24 + 12, x2: 1750 - i * 22 - 38, y2: y + 24 + 12 });
    }
    game.playerPos.x = car.x;
    game.playerPos.y = car.y;
  } else if (name === 'downtown') {
    const x = city.roadsV[4];
    const car = makeCar(x - 24, 1180, Math.PI / 2, '#3f7fbf', 'parked');
    car.speed = 150;
    car.ownedByPlayer = true;
    game.cars.push(car);
    game.inCar = true;
    game.playerCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    extraTraffic(game, rng, x, 1250, 8);
    extraPeds(game, rng, x - 80, 1250, 8);
    game.playerPos.x = car.x;
    game.playerPos.y = car.y;
  } else if (name === 'walk') {
    // on foot in the plaza quarter: Mara, the fountain, citizens, the gold marker
    game.player.x = city.spots.fixer.x - 120;
    game.player.y = city.spots.fixer.y + 96;
    game.player.angle = -0.6;
    extraPeds(game, rng, city.spots.fixer.x, city.spots.fixer.y + 40, 9);
    extraTraffic(game, rng, city.spots.fixer.x, city.spots.fixer.y + 330, 5);
    game.playerPos.x = game.player.x;
    game.playerPos.y = game.player.y;
  } else if (name === 'mission') {
    // the dockside disagreement: pistol out, one thug down, tracers in the air
    game.missions.index = 2;
    game.missions.state = 'active';
    game.missions.spawnThugs();
    game.player.hasPistol = true;
    game.player.weapon = 'pistol';
    const d = city.spots.docks;
    game.player.x = d.x - 190;
    game.player.y = d.y + 30;
    game.player.angle = 0.15;
    const thugs = game.missions.thugs;
    thugs[0].x = d.x + 30;
    thugs[0].y = d.y - 40;
    thugs[1].x = d.x + 120;
    thugs[1].y = d.y + 70;
    thugs[2].x = d.x + 60;
    thugs[2].y = d.y + 130;
    thugs[2].dead = true;
    thugs[2].health = 0;
    game.effects.push({ kind: 'tracer', x1: game.player.x, y1: game.player.y, x2: thugs[0].x, y2: thugs[0].y, life: 5, max: 5 });
    game.effects.push({ kind: 'tracer', x1: thugs[1].x, y1: thugs[1].y, x2: game.player.x + 30, y2: game.player.y - 12, life: 5, max: 5, hostile: true });
    game.effects.push({ kind: 'flash', x: game.player.x + 24, y: game.player.y + 4, life: 5, max: 5 });
    game.police.stars = 1;
    extraTraffic(game, rng, d.x - 200, d.y + 260, 4);
    game.playerPos.x = game.player.x;
    game.playerPos.y = game.player.y;
  }

  // settle: a few real ticks so wheels, walkers and the camera agree with the staging
  // (main.js wires game._step to stepGame before calling setupShot)
  const input = stubInput();
  for (let i = 0; i < 3; i += 1) game._step(input, 1 / 60);
}
