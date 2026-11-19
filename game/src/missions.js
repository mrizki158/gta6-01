// The story: Mara Voss, a fixer working out of a Palm Heights garage, takes the player
// from boosting one convertible to running the whole Solmaris Run. Five missions, each a
// small state machine of stages (go here, steal that, lose them, clear the docks), with
// phone briefings, cash rewards and an objective marker the HUD and minimap draw.
import { Car } from './vehicles.js';
import { Ped } from './pedestrians.js';
import { setWanted } from './police.js';

export const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 300,
    intro: "Mara Voss: Kid, I need wheels with a clean shine. There's a teal convertible in the Hotel Solmaris lot. Take it, bring it to my garage. Quiet as you can.",
    stages: [
      { type: 'stealCar', text: 'Steal the teal convertible at the Hotel Solmaris lot' },
      { type: 'deliverCar', point: 'garage', text: "Deliver the convertible to Mara's Garage" },
    ],
  },
  {
    id: 'hot-package',
    title: 'Hot Package',
    reward: 450,
    intro: "Mara Voss: A crate came in on Pier A and it cannot sit in the sun. Pick it up and get it to Solmaris Motors — fast, the buyer is watching the clock.",
    stages: [
      { type: 'goto', point: 'pierPickup', text: 'Pick up the package on Pier A' },
      { type: 'goto', point: 'showroom', text: 'Deliver the package to Solmaris Motors', timeLimit: 100 },
    ],
  },
  {
    id: 'loud-exit',
    title: 'Loud Exit',
    reward: 600,
    intro: "Mara Voss: My accountant needs to leave the Hotel Solmaris in a hurry and the police would love to chat. Pick him up, lose the law, then park him at the hideout.",
    stages: [
      { type: 'goto', point: 'hotel', text: 'Pick up the accountant at Hotel Solmaris', onArrive: 'heatUp' },
      { type: 'escape', text: 'Lose the police' },
      { type: 'goto', point: 'hideout', text: 'Reach the hideout courtyard' },
    ],
  },
  {
    id: 'dockside-diplomacy',
    title: 'Dockside Diplomacy',
    reward: 800,
    intro: "Mara Voss: The Cuda crew is squatting on my docks and diplomacy has failed. Clear them out — all five — and the piers are ours again.",
    stages: [
      { type: 'goto', point: 'docks', text: 'Go to the docks', onArrive: 'spawnThugs' },
      { type: 'shootout', text: 'Clear the Cuda crew from the docks' },
    ],
  },
  {
    id: 'the-solmaris-run',
    title: 'The Solmaris Run',
    reward: 1500,
    intro: "Mara Voss: Last one, and it's the big one. Solmaris Motors has an armoured coupe with our name on it. Take it, run it to the end of Pier A. Every cop in town will want a word.",
    stages: [
      { type: 'stealCar', text: 'Steal the armoured coupe at Solmaris Motors', onSteal: 'heatUp4' },
      { type: 'deliverCar', point: 'pierEnd', text: 'Deliver the coupe to the end of Pier A', timeLimit: 150 },
    ],
  },
];

function spawnMissionCar(world, x, y, angle, color, health = 100) {
  const car = new Car(x, y, angle, color, 'mission');
  car.health = health;
  world.cars.push(car);
  return car;
}

export class MissionDirector {
  constructor(world) {
    this.world = world;
    this.index = 0; // next mission to run
    this.stage = 0;
    this.active = false;
    this.done = false;
    this.targetCar = null;
    this.thugs = [];
    this.stageT = 0;
    this.betweenT = 0;
    this.timer = null;
  }

  /** Begin the run at a mission index (New Game: 0; Continue: the saved index). */
  begin(index) {
    this.index = index;
    if (index >= MISSION_DEFS.length) {
      this.done = true;
      return;
    }
    this.startMission(index);
  }

  startMission(index) {
    const world = this.world;
    const def = MISSION_DEFS[index];
    this.index = index;
    this.stage = 0;
    this.active = true;
    this.thugs = [];
    this.targetCar = null;
    this.enterStage();
    world.showPhone('Mara Voss', def.intro, 8);
    world.audio.phone();
  }

  /** Set up whatever the current stage needs (story cars, timers). */
  enterStage() {
    const world = this.world;
    const def = MISSION_DEFS[this.index];
    const stage = def.stages[this.stage];
    this.stageT = 0;
    this.timer = stage.timeLimit ?? null;

    if (stage.type === 'stealCar' && def.id === 'first-wheels') {
      // Prefer a car already parked at the hotel; otherwise drop the convertible in.
      let car = world.cars.find((c) => c.hotelSpot && !c.dead);
      if (!car) {
        const lot = world.city.places.hotelLot;
        car = spawnMissionCar(world, lot.x, lot.y, Math.PI / 2, '#17a2b8');
      } else {
        car.kind = 'mission';
        car.color = '#17a2b8';
      }
      this.targetCar = car;
    }
    if (stage.type === 'stealCar' && def.id === 'the-solmaris-run') {
      const spot = world.city.places.showroom;
      this.targetCar = spawnMissionCar(world, spot.x, spot.y + 26, Math.PI, '#22262b', 240);
    }
    if (stage.type === 'shootout') {
      // Thugs appear as the player closes in (spawned by the goto stage's onArrive).
      if (this.thugs.length === 0) this.spawnThugs();
    }
  }

  spawnThugs() {
    const world = this.world;
    const base = world.city.places.docks;
    const spots = [
      [0, -60], [90, 30], [60, 150], [150, -30], [-140, -40],
    ];
    this.thugs = spots.map(([ox, oy], i) => {
      const thug = new Ped(base.x + ox, base.y + oy, world.rng);
      thug.role = 'thug';
      thug.shirt = '#5d2a84';
      thug.pants = '#1c1c22';
      thug.missionTag = 'dock';
      thug.strafeDir = i % 2 === 0 ? 1 : -1;
      world.peds.push(thug);
      return thug;
    });
  }

  /** combat.js reports kills here; the update loop recounts the living each step. */
  event(evt) {
    if (evt.type === 'thugDown') this.thugsDown = (this.thugsDown ?? 0) + 1;
  }

  /** The live objective for HUD and minimap: { text, x, y } or null in free roam. */
  objective() {
    if (!this.active || this.done) return null;
    const def = MISSION_DEFS[this.index];
    const stage = def.stages[this.stage];
    const world = this.world;
    let point = null;
    if (stage.point) point = world.city.places[stage.point];
    else if (stage.type === 'stealCar' && this.targetCar) point = this.targetCar;
    else if (stage.type === 'deliverCar') point = world.city.places[stage.point];
    else if (stage.type === 'shootout') point = world.city.places.docks;
    else if (stage.type === 'escape') point = null;
    let text = stage.text;
    if (stage.type === 'shootout') text = `${stage.text} (${this.thugs.filter((t) => !t.dead).length} left)`;
    if (this.timer !== null) text += ` — ${Math.max(0, Math.ceil(this.timer))}s`;
    return { text, x: point ? point.x : null, y: point ? point.y : null, missionTitle: def.title };
  }

  completeStage() {
    const world = this.world;
    const def = MISSION_DEFS[this.index];
    this.stage += 1;
    if (this.stage >= def.stages.length) {
      this.completeMission();
    } else {
      this.enterStage();
      world.audio.click();
    }
  }

  completeMission() {
    const world = this.world;
    const def = MISSION_DEFS[this.index];
    world.cash += def.reward;
    world.completedMissions.push(def.id);
    world.audio.cash();
    world.showPhone('Mara Voss', `Done and dusted. $${def.reward} is yours — ${def.title} is history.`, 6);
    this.active = false;
    this.index += 1;
    this.targetCar = null;
    this.betweenT = 7;
    if (this.index >= MISSION_DEFS.length) {
      this.done = true;
      world.showPhone('Mara Voss', 'That was the Solmaris Run, kid. The town is yours now — free as the sea breeze. (Free roam)', 9);
    }
    world.persist();
  }

  update(dt) {
    const world = this.world;
    if (!this.active) {
      if (!this.done && this.index < MISSION_DEFS.length) {
        this.betweenT -= dt;
        if (this.betweenT <= 0) this.startMission(this.index);
      }
      return;
    }
    const def = MISSION_DEFS[this.index];
    const stage = def.stages[this.stage];
    const player = world.player;
    this.stageT += dt;

    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = stage.timeLimit;
        world.showPhone('Mara Voss', 'Too slow — the clock restarts. Move!', 4);
        world.audio.phone();
      }
    }

    const atPoint = (point, radius = 52) => {
      const p = world.city.places[point];
      return Math.hypot(player.x - p.x, player.y - p.y) < radius;
    };

    switch (stage.type) {
      case 'goto':
        if (atPoint(stage.point)) {
          if (stage.onArrive === 'heatUp') setWanted(world, 3);
          if (stage.onArrive === 'spawnThugs') this.spawnThugs();
          this.completeStage();
        }
        break;
      case 'stealCar':
        if (this.targetCar && player.car === this.targetCar) {
          if (stage.onSteal === 'heatUp4') setWanted(world, 4);
          this.completeStage();
        }
        break;
      case 'deliverCar':
        if (this.targetCar && player.car === this.targetCar && atPoint(stage.point, 64)) {
          this.completeStage();
        }
        break;
      case 'escape':
        if (world.wanted.stars === 0) this.completeStage();
        break;
      case 'shootout':
        if (this.thugs.length > 0 && this.thugs.every((t) => t.dead)) this.completeStage();
        break;
      default:
        break;
    }
  }
}
