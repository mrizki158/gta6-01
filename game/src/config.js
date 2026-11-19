// Solmaris Heat — every tuning number and colour in one place.
// The world is a fixed-size coastal city measured in pixels; the renderer scales the
// canvas to the window, so no rule below depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** World extents. The city grid sits west of x = BEACH_X; sand, then water, to the east. */
export const WORLD = { width: 3400, height: 2000, beachX: 2660, waterX: 2960 };

/** City grid: roads ROAD wide on a PITCH lattice; blocks are the squares between roads. */
export const GRID = { originX: 150, originY: 150, road: 96, block: 300, cols: 7, rows: 5 };
export const PITCH = GRID.road + GRID.block;

/** Lane offset from a road centreline (right-hand traffic). */
export const LANE = 24;

export const PLAYER = {
  radius: 13,
  walkSpeed: 215,
  sprintSpeed: 330,
  health: 100,
  meleeRange: 40,
  meleeDamage: 55,
  meleeCooldown: 0.38,
};

export const PISTOL = { cooldown: 0.21, speed: 950, damage: 34, spread: 0.035, range: 620 };

export const CAR = {
  width: 46,
  length: 96,
  accel: 340,
  brake: 620,
  reverse: 160,
  drag: 0.55,
  grip: 8.5,
  driftGrip: 2.1,
  steer: 2.5,
  health: 100,
};

export const WANTED = {
  /** Heat needed for 0..5 stars. */
  thresholds: [0, 14, 34, 58, 88, 124],
  decayPerSecond: 3.2,
  decayDelay: 5,
  sightRange: 470,
  copCounts: [0, 2, 3, 4, 5, 7],
};

export const CRIME = {
  stealParked: 8,
  carjack: 22,
  hitCar: 6,
  hitPed: 26,
  killPed: 42,
  shotFired: 9,
  hitCop: 16,
  killCop: 55,
};

export const PALETTE = {
  water: '#1d6f8e',
  waterDeep: '#175d79',
  sand: '#ecd28f',
  sandDark: '#dfc078',
  grass: '#79b657',
  grassDark: '#6aa84c',
  lot: '#9aa0a3',
  road: '#3c4043',
  roadEdge: '#2f3235',
  sidewalk: '#c9c2b4',
  marking: '#e8e4d8',
  markingYellow: '#f2c94c',
  pier: '#8a6b46',
  pierDark: '#75582f',
  buildingShadow: 'rgba(60,40,10,0.28)',
  sunWash: 'rgba(255,166,66,0.07)',
};

export const BUILDING_COLORS = [
  '#f4e3c1', '#eec9a3', '#e8b4b8', '#a8d5e5', '#f7f0dc', '#d9e6c3',
  '#f2d16b', '#e5989b', '#b5c7d3', '#ffe5b4', '#c3e0d9', '#f4a259',
];

export const CAR_COLORS = [
  '#d64541', '#2e6fb7', '#f2f2f2', '#22262b', '#f2c94c', '#39b56a',
  '#e67e22', '#8e5bb5', '#17a2b8', '#e84393', '#95a5a6', '#fdfffc',
];

/** Where the player wakes up after a bust or a wreck. */
export const RESPAWNS = {
  hospital: { x: 285, y: 350, label: 'Solmaris General Hospital' },
  station: { x: 1400, y: 700, label: 'Solmaris Police Department' },
};

export const SAVE_KEY = 'solmaris-heat.save.v1';
export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
