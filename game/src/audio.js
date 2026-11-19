// All sound is synthesized with WebAudio — no audio files. A tiny synth engine: an engine
// hum whose pitch follows the driven car's speed, a two-tone siren for nearby police,
// noise-burst gunshots, UI blips, and a slow synthwave loop (bass + pad) as ambient music.
// Everything is created lazily on the first user gesture, and M toggles mute.

const MUSIC_BASS = [55, 55, 65.41, 49]; // A1 A1 C2 G1
const MUSIC_PAD = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
  [164.81, 196, 246.94],
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = 0;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  /** Create the context and the looping voices. Call from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: a detuned saw pair through a lowpass, gain driven by speed.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineFilter = filter;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 27.5;
    this.engineSub = sub;
    this.engineOsc.connect(filter);
    sub.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    sub.start();

    // Siren: a square wave whose frequency the game flips between two tones.
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** `speed` 0..1 (car speed), `active` while the player is driving. */
  setEngine(speed, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gain = active ? 0.05 + speed * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(gain, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed * 165, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(26 + speed * 82, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + speed * 900, t, 0.1);
  }

  /** `level` 0..1 from the nearest police car; silent when no officer is close. */
  setSiren(level, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(level * 0.055, t, 0.1);
    if (level > 0.01) {
      this.sirenFlip += dt;
      if (this.sirenFlip > 0.42) {
        this.sirenFlip = 0;
        const current = this.sirenOsc.frequency.value;
        this.sirenOsc.frequency.setValueAtTime(current < 800 ? 960 : 690, t);
      }
    }
  }

  /** A short enveloped tone — the building block for blips and stingers. */
  tone(freq, dur, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** White-noise burst through a bandpass — gunshots, crashes, punches. */
  noise(dur, vol, freq, q = 1) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot() {
    this.noise(0.14, 0.5, 900, 0.6);
    this.tone(160, 0.09, 'square', 0.1, 60);
  }

  enemyShoot() {
    this.noise(0.11, 0.28, 1100, 0.7);
  }

  punch() {
    this.noise(0.08, 0.35, 300, 1.2);
  }

  crash(strength = 1) {
    this.noise(0.22, Math.min(0.6, 0.2 + strength * 0.3), 220, 0.5);
    this.tone(70, 0.2, 'sine', 0.25, 40);
  }

  click() {
    this.tone(660, 0.05, 'square', 0.07);
  }

  phone() {
    this.tone(880, 0.09, 'sine', 0.12);
    this.tone(1174, 0.12, 'sine', 0.12, null, 0.11);
  }

  cash() {
    this.tone(988, 0.08, 'square', 0.1);
    this.tone(1319, 0.14, 'square', 0.1, null, 0.07);
  }

  busted() {
    this.tone(392, 0.16, 'sawtooth', 0.12);
    this.tone(311, 0.16, 'sawtooth', 0.12, null, 0.16);
    this.tone(233, 0.3, 'sawtooth', 0.12, null, 0.32);
  }

  wasted() {
    this.tone(220, 0.5, 'sawtooth', 0.12, 55);
  }

  /** A slow four-bar loop: sub bass on the beat, a soft pad chord each bar. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const stepDur = 0.46;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const beat = this.musicStep % 8;
      if (beat % 2 === 0) this.tone(MUSIC_BASS[bar] * 2, 0.4, 'triangle', 0.06);
      if (beat === 0) {
        for (const note of MUSIC_PAD[bar]) this.tone(note, 2.6, 'sine', 0.022);
      }
      this.musicStep += 1;
    }, stepDur * 1000);
  }
}
