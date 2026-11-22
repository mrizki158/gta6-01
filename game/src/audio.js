// Tiny synthesized sound: no audio assets, everything is oscillators and filtered noise
// through one WebAudio graph. Sounds are short, quiet and fire-and-forget; the engine hum
// and the siren are loops whose gain follows the game state.

class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

  /** Must be called from a user gesture at least once (the start screen click / key). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startEngine();
    this._startSiren();
  }

  _startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  _startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 780;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /** speedNorm 0..1 while driving, null when not in a car. */
  engine(speedNorm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (speedNorm === null) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, t, 0.05);
  }

  /** level 0..1 — how present the sirens are (nearest cop distance mapped). */
  siren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  shot() { this.noise(0.12, 0.3, 900); this.blip(160, 0.08, 'square', 0.1, -90); }
  punch() { this.noise(0.07, 0.22, 500); }
  door() { this.blip(220, 0.07, 'sine', 0.14, -60); this.noise(0.05, 0.08, 700); }
  cash() { this.blip(880, 0.09, 'square', 0.1); setTimeout(() => this.blip(1320, 0.14, 'square', 0.1), 70); }
  mission() { this.blip(523, 0.12, 'triangle', 0.14); setTimeout(() => this.blip(784, 0.2, 'triangle', 0.14), 110); }
  busted() { this.blip(300, 0.5, 'sawtooth', 0.14, -180); }
  star() { this.blip(1180, 0.1, 'square', 0.09); }
}

export const sound = new SoundBank();
