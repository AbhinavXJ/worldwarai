import { audio } from "./audio";

/** Everything in the world bounces to the soundtrack. */
export const beat = {
  /** position in beats */
  pos: 0,
  /** 0..1 within the current beat */
  phase: 0,
  /** 1 on the beat, decaying to 0 */
  pulse: 0,
  /** 1 on the downbeat of each bar */
  bar: 0,
  count: 0,
  onBeat: false,
  /** 0..1 how unhinged the visuals should be right now (combo, ults, chaos) */
  hype: 0,
};

export const beatU = { value: 0 };
export const beatPosU = { value: 0 };
export const hypeU = { value: 0 };

let hypeTarget = 0;
export function setHype(v: number) {
  hypeTarget = Math.max(0, Math.min(1, v));
}

export function updateBeat(t: number, dt: number) {
  const steps = audio.musicPos() ?? (t * 126) / 15;
  const b = Math.max(0, steps / 4);
  const n = Math.floor(b);
  beat.onBeat = n !== beat.count;
  beat.count = n;
  beat.pos = b;
  beat.phase = b - n;
  beat.pulse = Math.pow(1 - beat.phase, 3);
  beat.bar = n % 4 === 0 ? beat.pulse : 0;
  beat.hype += (hypeTarget - beat.hype) * Math.min(1, dt * 3);
  beatU.value = beat.pulse;
  beatPosU.value = b;
  hypeU.value = beat.hype;
}
