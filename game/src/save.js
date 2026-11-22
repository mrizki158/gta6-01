// localStorage save: cash earned, missions completed and the best wanted level survived.
// Deliberately tiny and forgiving — a corrupt or missing save just starts fresh.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      cash: Number(data.cash) || 0,
      missionsDone: Number(data.missionsDone) || 0,
      bestStars: Number(data.bestStars) || 0,
    };
  } catch {
    return fresh();
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // storage unavailable (private mode): the game simply does not persist
  }
}

function fresh() {
  return { cash: 0, missionsDone: 0, bestStars: 0 };
}
