// The story: five jobs for fixer Mara Voss, who waits on the plaza in south Solmaris.
// Each job is a small stage machine — reach a marker, steal the marked car, clear the
// docks, beat the clock, and finally outrun a four-star response with the dock loot.
// Progress persists through the save (missionsDone), and every job pays cash on delivery.

import { makeRng, randRange, clamp } from './random.js';
import { collideCircle } from './city.js';

export const MISSION_DEFS = [
  {
    title: 'First Wheels',
    brief: 'Mara: "Wheels, kid. Any wheels. Lift a car and drop it at the chop yard west of here — Vince pays, I collect."',
    pay: 300,
  },
  {
    title: 'Hot Property',
    brief: 'Mara: "A collector parks his pride at the marina and never locks it. Bring it to Vince. The badge magnets will notice — keep moving."',
    pay: 500,
  },
  {
    title: 'Dockside Disagreement',
    brief: 'Mara: "The dock crews stopped paying their cut. Three of them are waiting by the warehouses. Settle it. There is a pistol in the crate by my bench."',
    pay: 700,
  },
  {
    title: 'The Long Way Home',
    brief: 'Mara: "Package at the corner store on Palm Row. My cousin at the north hideout needs it inside two minutes. The city will try to slow you down."',
    pay: 900,
  },
  {
    title: 'Solmaris Heat',
    brief: 'Mara: "Last one. The dock warehouse holds a fortune in bonded cargo. Load up, then disappear to the hideout. Every badge in Solmaris will be awake."',
    pay: 1500,
  },
];

export class Missions {
  constructor(city, missionsDone) {
    this.city = city;
    this.index = missionsDone; // next mission to offer, 0..5
    this.state = missionsDone >= 5 ? 'done' : 'offer'; // offer | active | done
    this.stage = 0;
    this.timer = 0;
    this.thugs = [];
    this.rng = makeRng(987654);
    this.loadTimer = 0;
  }

  def() {
    return MISSION_DEFS[this.index] || null;
  }

  marker() {
    const s = this.city.spots;
    if (this.state === 'offer') return { x: s.fixer.x, y: s.fixer.y, label: 'M' };
    if (this.state !== 'active') return null;
    switch (this.index) {
      case 0: return this.stage === 0 ? { x: s.chopShop.x, y: s.chopShop.y, label: 'V' } : null;
      case 1:
        if (this.stage === 0) return { x: s.marina.x, y: s.marina.y, label: '!' };
        return { x: s.chopShop.x, y: s.chopShop.y, label: 'V' };
      case 2: return { x: s.docks.x, y: s.docks.y, label: '!' };
      case 3:
        if (this.stage === 0) return { x: s.store.x, y: s.store.y, label: '!' };
        return { x: s.hideout.x, y: s.hideout.y, label: 'H' };
      case 4:
        if (this.stage === 0) return { x: s.docks.x, y: s.docks.y, label: '!' };
        return { x: s.hideout.x, y: s.hideout.y, label: 'H' };
      default: return null;
    }
  }

  objective() {
    if (this.state === 'done') return 'Solmaris is yours. Free roam — the city keeps turning.';
    if (this.state === 'offer') return `Meet Mara Voss on the plaza — job ${this.index + 1} of 5: ${this.def().title}`;
    switch (this.index) {
      case 0: return 'Steal any car and deliver it to the chop yard (V)';
      case 1: return this.stage === 0 ? 'Steal the marked car at the marina' : 'Deliver the car to the chop yard (V)';
      case 2: {
        const left = this.thugs.filter((t) => !t.dead).length;
        return `Settle the dock crew — ${left} still standing`;
      }
      case 3: return this.stage === 0 ? 'Pick up the package at the corner store' : `Deliver to the hideout — ${Math.max(0, Math.ceil(this.timer))}s left`;
      case 4: return this.stage === 0 ? `Hold in the warehouse zone to load the loot (${Math.max(0, Math.ceil(4 - this.loadTimer))}s)` : 'Lose yourself at the north hideout (H)';
      default: return '';
    }
  }

  /** Start the offered mission when the player talks to Mara. */
  tryStart(game) {
    if (this.state !== 'offer') return false;
    const s = this.city.spots;
    if (Math.hypot(game.player.x - s.fixer.x, game.player.y - s.fixer.y) > 52 || game.inCar) return false;
    this.state = 'active';
    this.stage = 0;
    this.loadTimer = 0;
    game.notify(this.def().brief);
    game.sound.mission();
    if (this.index === 1) game.spawnTargetCar();
    if (this.index === 2) {
      this.spawnThugs();
      game.grantPistol();
    }
    if (this.index === 3) this.timer = 999; // timer starts at pickup
    return true;
  }

  spawnThugs() {
    const s = this.city.spots;
    this.thugs = [];
    for (let i = 0; i < 3; i += 1) {
      this.thugs.push({
        x: s.docks.x + randRange(this.rng, -120, 120),
        y: s.docks.y + randRange(this.rng, -110, 110),
        angle: 0,
        health: 100,
        dead: false,
        downTime: 0,
        shotTimer: randRange(this.rng, 0.8, 1.8),
        phase: this.rng() * 6,
        shirt: '#5d3a1a',
        pants: '#2d3436',
        thug: true,
      });
    }
  }

  complete(game) {
    const pay = this.def().pay;
    game.reward(pay);
    game.notify(`Job done — $${pay} wired. ${this.index >= 4 ? 'Mara: "That is the last of it. Solmaris remembers you."' : 'Mara has more work when you are ready.'}`);
    this.index += 1;
    this.thugs = [];
    this.state = this.index >= 5 ? 'done' : 'offer';
    this.stage = 0;
  }

  fail(game, why) {
    game.notify(`Job failed — ${why}. Mara is still on the plaza.`);
    this.state = 'offer';
    this.stage = 0;
    this.thugs = [];
    game.removeTargetCar();
  }

  /** Called by main when the player gets into the marked car (mission 2). */
  onTargetStolen(game) {
    if (this.state === 'active' && this.index === 1 && this.stage === 0) {
      this.stage = 1;
      game.police.report(2);
      game.notify('Mara: "That is the one. Chop yard, now — and lose the attention on the way."');
    }
  }

  /** Called by main when the player enters any car during mission 1's delivery. */
  update(dt, game) {
    if (this.state !== 'active') return;
    const s = this.city.spots;
    const px = game.playerPos.x;
    const py = game.playerPos.y;
    const near = (spot, r) => Math.hypot(px - spot.x, py - spot.y) < r;

    switch (this.index) {
      case 0:
        if (game.inCar && near(s.chopShop, 92)) this.complete(game);
        break;
      case 1:
        if (this.stage === 1 && game.inCar && game.playerCar && game.playerCar.kind === 'target' && near(s.chopShop, 92)) {
          game.removeTargetCar(true);
          this.complete(game);
        }
        break;
      case 2: {
        this.updateThugs(dt, game);
        if (this.thugs.length && this.thugs.every((t) => t.dead)) this.complete(game);
        break;
      }
      case 3:
        if (this.stage === 0 && near(s.store, 60)) {
          this.stage = 1;
          this.timer = 120;
          game.police.report(2);
          game.notify('Package in hand. Two minutes — go!');
        } else if (this.stage === 1) {
          this.timer -= dt;
          if (near(s.hideout, 92)) this.complete(game);
          else if (this.timer <= 0) this.fail(game, 'the delivery window closed');
        }
        break;
      case 4:
        if (this.stage === 0) {
          if (near(s.docks, 110)) {
            this.loadTimer += dt;
            if (this.loadTimer >= 4) {
              this.stage = 1;
              game.police.stars = Math.max(game.police.stars, 4);
              game.police.unseen = 0;
              game.notify('Loaded! Every siren in the city just woke up — get to the hideout!');
            }
          } else this.loadTimer = Math.max(0, this.loadTimer - dt);
        } else if (near(s.hideout, 100)) this.complete(game);
        break;
      default:
        break;
    }
  }

  updateThugs(dt, game) {
    const px = game.playerPos.x;
    const py = game.playerPos.y;
    for (const t of this.thugs) {
      if (t.dead) {
        t.downTime += dt;
        continue;
      }
      const dx = px - t.x;
      const dy = py - t.y;
      const d = Math.hypot(dx, dy) || 1;
      t.angle = Math.atan2(dy, dx);
      if (d > 210) {
        t.x += (dx / d) * 150 * dt;
        t.y += (dy / d) * 150 * dt;
        const fixed = collideCircle(t, 11, this.city.colliders);
        t.x = fixed.x;
        t.y = fixed.y;
        t.phase += dt * 10;
      }
      if (d < 360 && d > 30) {
        t.shotTimer -= dt;
        if (t.shotTimer <= 0) {
          t.shotTimer = randRange(this.rng, 1.2, 2.1);
          game.effects.push({ kind: 'tracer', x1: t.x, y1: t.y, x2: px, y2: py, life: 0.09, max: 0.09, hostile: true });
          if (this.rng() < clamp(0.5 - d / 900, 0.12, 0.45)) game.onPlayerDamage(randRange(this.rng, 4, 9));
          game.sound.shot();
        }
      }
    }
  }
}
