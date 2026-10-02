/**
 * Fully procedural audio. No sample files: every sound is synthesized with WebAudio so there are
 * no licensing questions and nothing to download.
 */

type Wave = OscillatorType;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// C G Am F, the most upbeat four chords in existence
const PROG: number[][] = [
  [48, 52, 55, 60],
  [43, 50, 55, 59],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
];
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
const BASS_STEPS = [0, 3, 6, 8, 10, 11, 14];
const LEAD = [72, -1, 74, 76, -1, 79, 76, -1, 74, -1, 72, 74, -1, 67, -1, -1, 69, -1, 72, 74, -1, 76, 74, -1, 72, -1, 71, 72, -1, -1, 67, -1];

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private shaper!: WaveShaperNode;
  private last = new Map<string, number>();
  private voices = 0;
  private muted = false;

  // music
  private mode: "off" | "ambient" | "title" | "battle" | "victory" = "off";
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  intensity = 0;
  private targetIntensity = 0;
  private bpm = 126;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 18000;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);

    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    this.shaper.curve = curve;
    this.shaper.connect(this.sfx);

    this.timer = setInterval(() => this.schedule(), 25);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** low-pass the music during slow motion / freezes so time feels thick */
  muffle(amount: number) {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(1 - amount, 3) + 300;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  setMusic(mode: AudioEngine["mode"]) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.ctx && this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    if (mode === "victory") this.step = 0;
  }

  /** Position of the music in 16th-note steps, matched to what's audible right now. */
  musicPos(): number | null {
    if (!this.ctx || this.mode === "off") return null;
    const stepDur = 60 / this.bpm / 4;
    return this.step - (this.nextTime - this.ctx.currentTime) / stepDur;
  }

  setIntensity(v: number) {
    this.targetIntensity = Math.max(0, Math.min(1, v));
  }

  // ---------------------------------------------------------------- primitives

  private gate(key: string, minGap: number) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const prev = this.last.get(key) ?? -1;
    if (now - prev < minGap) return false;
    if (this.voices > 48) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    opts: { type?: Wave; gain?: number; to?: number; attack?: number; at?: number; dest?: AudioNode; curve?: "exp" | "lin"; vibrato?: number; detune?: number } = {},
  ) {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.to) {
      if (opts.curve === "lin") o.frequency.linearRampToValueAtTime(opts.to, t + dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur);
    }
    if (opts.vibrato) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = 7;
      lg.gain.value = opts.vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const a = opts.attack ?? 0.005;
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.voices++;
    o.onended = () => this.voices--;
  }

  private noiseBurst(
    dur: number,
    opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; at?: number; dest?: AudioNode; attack?: number } = {},
  ) {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "lowpass";
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.voices++;
    src.onended = () => this.voices--;
  }

  // ---------------------------------------------------------------- sound effects

  play(name: SoundName, p = 1) {
    if (!this.ctx || this.muted) return;
    const r = 1 + (Math.random() - 0.5) * 0.12;
    switch (name) {
      case "click":
        if (!this.gate(name, 0.03)) return;
        this.tone(900, 0.06, { type: "square", gain: 0.08, to: 500 });
        this.tone(1800, 0.03, { gain: 0.05 });
        break;
      case "hover":
        if (!this.gate(name, 0.04)) return;
        this.tone(1300 * r, 0.05, { gain: 0.05, to: 1700 });
        break;
      case "pew":
        if (!this.gate(name, 0.045)) return;
        this.tone(1500 * r, 0.09, { gain: 0.09, to: 420 });
        this.tone(3000 * r, 0.03, { gain: 0.03, type: "triangle" });
        break;
      case "spark":
        if (!this.gate(name, 0.06)) return;
        this.tone(2100 * r, 0.14, { type: "triangle", gain: 0.07, to: 900 });
        this.tone(3200 * r, 0.18, { gain: 0.03, to: 4200 });
        break;
      case "laser":
        if (!this.gate(name, 0.05)) return;
        this.tone(1900 * r, 0.1, { type: "sawtooth", gain: 0.05, to: 180 });
        this.tone(950 * r, 0.08, { type: "square", gain: 0.03, to: 120, detune: 25 });
        break;
      case "enemyShot":
        if (!this.gate(name, 0.08)) return;
        this.tone(700 * r, 0.1, { type: "triangle", gain: 0.04, to: 300 });
        break;
      case "hit":
        if (!this.gate(name, 0.035)) return;
        this.noiseBurst(0.07, { type: "bandpass", freq: 2200 * r, q: 1.2, gain: 0.22 });
        this.tone(260 * r, 0.07, { type: "square", gain: 0.06, to: 110 });
        break;
      case "hurt":
        if (!this.gate(name, 0.12)) return;
        this.tone(320, 0.18, { type: "sawtooth", gain: 0.08, to: 140 });
        this.noiseBurst(0.12, { freq: 900, gain: 0.18 });
        break;
      case "boom": {
        if (!this.gate(name + Math.round(p), 0.06)) return;
        const s = Math.max(0.6, p);
        this.noiseBurst(0.5 * s, { freq: 1400, to: 60, gain: 0.5, q: 0.7 });
        this.tone(130, 0.55 * s, { gain: 0.5, to: 32, dest: this.shaper });
        break;
      }
      case "vineboom":
        if (!this.gate(name, 0.3)) return;
        this.tone(95, 1.2, { gain: 0.8, to: 38, dest: this.shaper, attack: 0.003 });
        this.tone(190, 0.35, { gain: 0.25, to: 80, type: "triangle" });
        this.noiseBurst(0.25, { freq: 500, to: 80, gain: 0.3 });
        break;
      case "dash":
        if (!this.gate(name, 0.1)) return;
        this.noiseBurst(0.28, { type: "bandpass", freq: 500, to: 5000, q: 2, gain: 0.3, attack: 0.03 });
        this.tone(300, 0.2, { gain: 0.05, to: 1200, type: "triangle" });
        break;
      case "portal":
        if (!this.gate(name, 0.1)) return;
        this.tone(240, 0.4, { gain: 0.12, to: 1400, vibrato: 30 });
        this.tone(480, 0.35, { gain: 0.05, to: 2400, type: "triangle" });
        break;
      case "boing":
        if (!this.gate(name, 0.08)) return;
        this.tone(170 * r, 0.35, { gain: 0.16, to: 520, vibrato: 60, type: "triangle" });
        break;
      case "whistle":
        if (!this.gate(name, 0.25)) return;
        this.tone(450 * r, 0.6, { gain: 0.08, to: 2100, vibrato: 12 });
        break;
      case "whistleDown":
        if (!this.gate(name, 0.3)) return;
        this.tone(2000, 0.9, { gain: 0.07, to: 300, vibrato: 10 });
        break;
      case "squeak": {
        if (!this.gate(name, 0.05)) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = 6;
        f.frequency.value = 1500;
        const g = ctx.createGain();
        const base = 900 * r;
        o.frequency.setValueAtTime(base, t);
        o.frequency.linearRampToValueAtTime(base * 1.7, t + 0.06);
        o.frequency.linearRampToValueAtTime(base * 1.2, t + 0.16);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(f).connect(g).connect(this.sfx);
        o.start(t);
        o.stop(t + 0.2);
        this.noiseBurst(0.08, { type: "highpass", freq: 3000, gain: 0.12 });
        this.tone(500 * r, 0.12, { gain: 0.12, to: 1400 });
        break;
      }
      case "pop":
        if (!this.gate(name, 0.03)) return;
        this.tone(500 * r, 0.06, { gain: 0.12, to: 1300 });
        break;
      case "bonk":
        if (!this.gate(name, 0.06)) return;
        this.tone(720 * r, 0.09, { type: "triangle", gain: 0.2, to: 380 });
        this.noiseBurst(0.04, { type: "bandpass", freq: 1800, q: 4, gain: 0.15 });
        break;
      case "beep":
        if (!this.gate(name, 0.15)) return;
        this.tone(880 * r, 0.07, { type: "square", gain: 0.05 });
        this.tone(1175 * r, 0.08, { type: "square", gain: 0.05, at: this.ctx.currentTime + 0.09 });
        break;
      case "sparkle": {
        if (!this.gate(name, 0.15)) return;
        const t = this.ctx.currentTime;
        [1318, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.18, { gain: 0.05, at: t + i * 0.05 }));
        break;
      }
      case "lol": {
        if (!this.gate(name, 0.15)) return;
        const t = this.ctx.currentTime;
        this.tone(260 * r, 0.06, { type: "square", gain: 0.06, at: t });
        this.tone(390 * r, 0.06, { type: "square", gain: 0.06, at: t + 0.08 });
        this.tone(200 * r, 0.12, { type: "square", gain: 0.06, at: t + 0.16, to: 140 });
        break;
      }
      case "pickup": {
        if (!this.gate(name, 0.05)) return;
        const t = this.ctx.currentTime;
        [660, 880, 1320].forEach((f, i) => this.tone(f * r, 0.12, { gain: 0.08, type: "triangle", at: t + i * 0.04 }));
        break;
      }
      case "orb":
        if (!this.gate(name, 0.03)) return;
        this.tone(1200 + p * 60, 0.06, { gain: 0.04, type: "triangle" });
        break;
      case "combo": {
        if (!this.gate(name, 0.05)) return;
        const n = Math.min(24, p);
        this.tone(NOTE(72 + ((n * 2) % 24)), 0.1, { gain: 0.05, type: "square" });
        break;
      }
      case "kill":
        if (!this.gate(name, 0.04)) return;
        this.tone(400 * r, 0.12, { gain: 0.1, to: 1600, type: "triangle" });
        this.noiseBurst(0.15, { type: "highpass", freq: 2500, gain: 0.12 });
        break;
      case "ult":
        if (!this.gate(name, 0.5)) return;
        this.tone(90, 1.4, { type: "sawtooth", gain: 0.14, to: 900, attack: 0.2 });
        this.tone(180, 1.4, { type: "sawtooth", gain: 0.08, to: 1800, attack: 0.2, detune: 12 });
        this.noiseBurst(1.4, { type: "bandpass", freq: 300, to: 6000, q: 1.5, gain: 0.2, attack: 0.4 });
        break;
      case "airhorn": {
        if (!this.gate(name, 0.6)) return;
        const t = this.ctx.currentTime;
        for (let k = 0; k < 3; k++) {
          const at = t + k * 0.18 + (k === 2 ? 0.08 : 0);
          const dur = k === 2 ? 0.5 : 0.14;
          [466, 554, 698].forEach((f) => this.tone(f, dur, { type: "sawtooth", gain: 0.06, at, attack: 0.01 }));
        }
        break;
      }
      case "stomp":
        if (!this.gate(name, 0.15)) return;
        this.tone(70, 0.5, { gain: 0.6, to: 28, dest: this.shaper });
        this.noiseBurst(0.3, { freq: 600, to: 60, gain: 0.35 });
        break;
      case "footstep":
        if (!this.gate(name, 0.09)) return;
        this.noiseBurst(0.035, { freq: 700 * r, gain: 0.04 });
        break;
      case "spawn":
        if (!this.gate(name, 0.12)) return;
        this.tone(1600, 0.3, { gain: 0.04, to: 300, type: "triangle" });
        break;
      case "land":
        if (!this.gate(name, 0.08)) return;
        this.tone(160 * r, 0.12, { gain: 0.14, to: 60 });
        this.noiseBurst(0.08, { freq: 500, gain: 0.08 });
        break;
      case "missile":
        if (!this.gate(name, 0.2)) return;
        this.noiseBurst(0.5, { type: "bandpass", freq: 800, to: 2400, q: 1, gain: 0.2 });
        this.tone(300, 0.4, { type: "sawtooth", gain: 0.05, to: 700 });
        break;
      case "updating": {
        if (!this.gate(name, 0.5)) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 10; i++) this.tone(400 + Math.random() * 1800, 0.07, { type: "square", gain: 0.035, at: t + i * 0.09 });
        break;
      }
      case "resume":
        if (!this.gate(name, 0.5)) return;
        this.tone(300, 0.35, { type: "square", gain: 0.06, to: 1600 });
        break;
      case "slowmo":
        if (!this.gate(name, 0.4)) return;
        this.tone(400, 0.8, { gain: 0.12, to: 60, type: "triangle" });
        break;
      case "victory": {
        const t = this.ctx.currentTime;
        const seq = [60, 64, 67, 72, 67, 72, 76, 79];
        seq.forEach((n, i) => this.tone(NOTE(n), 0.3, { type: "square", gain: 0.06, at: t + i * 0.12 }));
        [72, 76, 79, 84].forEach((n) => this.tone(NOTE(n), 1.6, { type: "triangle", gain: 0.06, at: t + 1.0 }));
        break;
      }
      case "defeat": {
        const t = this.ctx.currentTime;
        [55, 54, 53].forEach((n, i) => this.tone(NOTE(n), 0.42, { type: "sawtooth", gain: 0.09, at: t + i * 0.45, vibrato: 3 }));
        this.tone(NOTE(52), 1.4, { type: "sawtooth", gain: 0.09, at: t + 1.35, vibrato: 9 });
        break;
      }
      case "title":
        this.tone(55, 1.5, { gain: 0.7, to: 30, dest: this.shaper });
        this.noiseBurst(1.0, { freq: 3000, to: 100, gain: 0.35 });
        this.tone(NOTE(72), 0.6, { type: "square", gain: 0.05 });
        this.tone(NOTE(79), 0.6, { type: "square", gain: 0.05 });
        break;
      case "select":
        this.tone(NOTE(72), 0.12, { type: "square", gain: 0.07 });
        this.tone(NOTE(79), 0.25, { type: "square", gain: 0.07, at: this.ctx.currentTime + 0.1 });
        this.tone(NOTE(84), 0.35, { type: "triangle", gain: 0.08, at: this.ctx.currentTime + 0.2 });
        break;
      case "shutter":
        if (!this.gate(name, 0.3)) return;
        this.noiseBurst(0.05, { type: "highpass", freq: 4000, gain: 0.2 });
        this.noiseBurst(0.06, { type: "highpass", freq: 3000, gain: 0.12, at: this.ctx.currentTime + 0.07 });
        break;
    }
  }

  // ---------------------------------------------------------------- music

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mode === "off") return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.04;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private playStep(step: number, t: number, sd: number) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = PROG[bar];
    const mode = this.mode;
    const I = mode === "battle" ? this.intensity : mode === "title" ? 0.62 : mode === "victory" ? 0.75 : 0.1;
    const bus = this.musicBus;

    // pad, every bar
    if (s === 0) {
      const padGain = mode === "ambient" ? 0.03 : 0.018;
      chord.forEach((n, i) => {
        this.tone(NOTE(n + 12), sd * 16, { type: "triangle", gain: padGain, at: t, attack: 0.4, dest: bus, detune: i * 4 - 6 });
      });
    }
    if (mode === "ambient") {
      if (s % 4 === 2 && Math.random() < 0.5) this.tone(NOTE(chord[(s / 2) % 4] + 24), sd * 6, { gain: 0.012, at: t, attack: 0.05, dest: bus });
      return;
    }
    // kick
    if (I > 0.2 && s % 4 === 0) {
      this.tone(150, 0.28, { gain: 0.5, to: 40, at: t, dest: bus, attack: 0.002 });
    }
    // clap
    if (I > 0.45 && (s === 4 || s === 12)) {
      this.noiseBurst(0.12, { type: "bandpass", freq: 1500, q: 0.8, gain: 0.22, at: t, dest: bus });
    }
    // hats
    if (I > 0.3 && (s % 4 === 2 || (I > 0.8 && s % 2 === 1))) {
      this.noiseBurst(0.03, { type: "highpass", freq: 7000, gain: s % 4 === 2 ? 0.1 : 0.05, at: t, dest: bus });
    }
    // bass
    if (BASS_STEPS.includes(s)) {
      const root = chord[0] - 12 + (s === 10 ? 12 : 0);
      this.tone(NOTE(root), sd * 1.6, { type: "sawtooth", gain: 0.07 + I * 0.04, at: t, dest: bus, attack: 0.004 });
      this.tone(NOTE(root - 12), sd * 1.6, { type: "sine", gain: 0.12, at: t, dest: bus });
    }
    // arp
    if (I > 0.55) {
      const n = chord[ARP_ORDER[s]] + 24;
      this.tone(NOTE(n), sd * 0.9, { type: "square", gain: 0.022 + (I - 0.55) * 0.03, at: t, dest: bus });
    }
    // lead hook at high intensity and in victory
    if (I > 0.82 || mode === "victory") {
      const ln = LEAD[step % 32];
      if (ln > 0) this.tone(NOTE(ln), sd * 1.8, { type: "triangle", gain: 0.05, at: t, dest: bus, vibrato: 4 });
    }
  }
}

export type SoundName =
  | "click" | "hover" | "pew" | "spark" | "laser" | "enemyShot" | "hit" | "hurt" | "boom" | "vineboom" | "dash" | "portal"
  | "boing" | "whistle" | "whistleDown" | "squeak" | "pop" | "bonk" | "beep" | "sparkle" | "lol" | "pickup" | "orb" | "combo"
  | "kill" | "ult" | "airhorn" | "stomp" | "footstep" | "spawn" | "land" | "missile" | "updating" | "resume" | "slowmo"
  | "victory" | "defeat" | "title" | "select" | "shutter";

export const audio = new AudioEngine();
