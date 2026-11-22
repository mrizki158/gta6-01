// Solmaris Heat — tuning and shared constants.
// The world is a coastal grid city measured in pixels. Everything gameplay-related that a
// designer might want to nudge lives here so the rest of the code stays declarative.

export const VIEW = { width: 1280, height: 720 };

export const WORLD = {
  width: 3840,
  height: 2880,
  block: 320,        // one city block, building face to building face
  road: 96,          // road width between blocks
  sidewalk: 14,
};

// The pitch of the street grid: one block plus one road.
export const PITCH = WORLD.block + WORLD.road;

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  runSpeed: 268,
  health: 100,
  punchRange: 30,
  punchDamage: 34,
  punchCooldown: 0.34,
  pistolCooldown: 0.24,
  pistolRange: 460,
  pistolDamage: 55,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 340,
  brake: 620,
  reverse: 150,
  drag: 0.86,
  grip: 7.5,
  trafficSpeed: 150,
  parkedFraction: 0.5,
};

export const WANTED = {
  // seconds of staying unseen per star before the heat cools by one star
  coolPerStar: 9,
  bustSeconds: 2.4,     // standing next to a cop on foot fills the bust meter
  bustRange: 46,
  copCarSpeed: 305,
  copFootSpeed: 196,
};

export const COLORS = {
  water: '#1d6f8e',
  waterDeep: '#155a75',
  sand: '#e6cf9a',
  grass: '#69a854',
  park: '#5da24c',
  road: '#3c4046',
  roadEdge: '#2f3237',
  lane: '#e8d44d',
  sidewalk: '#b9bcc0',
  plaza: '#c9c2b4',
  roofShadow: 'rgba(20, 24, 30, 0.35)',
};

export const SAVE_KEY = 'solmaris-heat-save-v1';
