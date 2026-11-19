// localStorage persistence: cash, finished missions, the mission in progress and where
// the player stood. Continue on the start screen reads exactly this shape back.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 0,
      missionIndex: Number.isFinite(data.missionIndex) ? data.missionIndex : 0,
      completed: Array.isArray(data.completed) ? data.completed : [],
      x: Number.isFinite(data.x) ? data.x : null,
      y: Number.isFinite(data.y) ? data.y : null,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: state.cash,
        missionIndex: state.missionIndex,
        completed: state.completed,
        x: Math.round(state.x),
        y: Math.round(state.y),
      }),
    );
  } catch {
    // Private mode or a full store: the game simply runs unsaved.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
