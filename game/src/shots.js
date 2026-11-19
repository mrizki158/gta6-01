// Screenshot staging behind ?shot=chase|downtown|driving|mission (with &seed=N).
// Each scene arranges a real moment of play — real cars, real police, a real mission
// objective — then runs the ordinary simulation forward under scripted input for a
// fixed number of steps, so the captured frame is the game itself, reproducible from
// the seed. main.js paints the result and sets window.__shotReady.
import { STEP } from './config.js';
import { Car } from './vehicles.js';
import { setWanted } from './police.js';

function run(world, stepWorld, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepWorld(world, STEP);
}

function putPlayerInCar(world, x, y, angle, color) {
  const car = new Car(x, y, angle, color, 'player');
  world.cars.push(car);
  world.player.car = car;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  return car;
}

function addCop(world, x, y, angle) {
  const cop = new Car(x, y, angle, '#eef1f5', 'police');
  cop.cruise = 330;
  world.cars.push(cop);
  return cop;
}

/** Remove ambient traffic near a staged scene so nothing wanders into the frame. */
function clearTrafficNear(world, x, y, radius) {
  world.cars = world.cars.filter((car) => {
    if (car.kind !== 'traffic') return true;
    return Math.hypot(car.x - x, car.y - y) > radius;
  });
}

/** The cover: a three-star chase down the central avenue, package job on the clock. */
function stageChase(world, stepWorld) {
  const y = world.city.hRoads[2]; // the middle east–west avenue
  clearTrafficNear(world, 1400, y, 750);
  world.director.begin(1); // Hot Package: objective marker out on Pier A
  const car = putPlayerInCar(world, 1420, y + 24, 0, '#d64541');
  car.vx = 260;
  addCop(world, 1180, y - 24, 0).vx = 240;
  addCop(world, 1090, y + 24, 0).vx = 230;
  addCop(world, 1300, y - 24, 0).vx = 250;
  setWanted(world, 3);
  world.script = { throttle: 1, steer: 0 };
  run(world, stepWorld, 2.1);
  world.script = null;
}

/** On foot downtown: crowds, traffic, the first job waiting across town. */
function stageDowntown(world, stepWorld) {
  world.director.begin(0);
  world.player.x = world.city.vRoads[3] - 62;
  world.player.y = world.city.hRoads[2] + 58;
  world.player.angle = Math.PI / 3;
  // Aim ahead of the walk so the sprite faces where it is going.
  world.input.mouse.x = 640 + 130;
  world.input.mouse.y = 360 + 190;
  world.script = { mx: 0.4, my: 1 };
  run(world, stepWorld, 1.4);
  world.script = null;
}

/** Fast driving down the beachfront avenue, traffic ahead, map open. */
function stageDriving(world, stepWorld) {
  world.director.begin(0);
  const x = world.city.vRoads[6]; // the beachfront avenue
  clearTrafficNear(world, x, 760, 620);
  const car = putPlayerInCar(world, x - 24, 420, Math.PI / 2, '#f2c94c');
  car.vy = 300;
  world.script = { throttle: 1, steer: 0 };
  run(world, stepWorld, 1.9);
  world.script = null;
}

/** The dockside shootout: Mara's fourth job, mid-firefight among the containers. */
function stageMission(world, stepWorld) {
  world.director.begin(3);
  const docks = world.city.places.docks;
  // Walk the goto stage through instantly so the crew is on the field.
  world.player.x = docks.x;
  world.player.y = docks.y;
  stepWorld(world, STEP);
  world.player.x = docks.x - 270;
  world.player.y = docks.y + 5;
  world.player.weapon = 'pistol';
  // Face and fire on the nearest thug in bursts: the player aims at the mouse, so the
  // mouse is parked over the thug (the camera rides on the player, hence the offsets).
  for (let burst = 0; burst < 5; burst += 1) {
    const thug = world.peds.find((p) => p.role === 'thug' && !p.dead);
    if (thug) {
      world.input.mouse.x = 640 + (thug.x - world.player.x);
      world.input.mouse.y = 360 + (thug.y - world.player.y);
    }
    world.input.mouse.down = burst % 2 === 0;
    run(world, stepWorld, 0.24);
  }
  world.input.mouse.down = true;
  run(world, stepWorld, 0.18);
  world.input.mouse.down = false;
}

const SCENES = {
  chase: stageChase,
  downtown: stageDowntown,
  driving: stageDriving,
  mission: stageMission,
};

/** Stage the named scene (any other name stages the chase). */
export function stageShot(world, name, stepWorld) {
  world.screen = 'play';
  const scene = SCENES[name] ?? stageChase;
  scene(world, stepWorld);
  // Settle the camera on the player so the frame is composed, not mid-lerp.
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  world.clampCamera();
}
