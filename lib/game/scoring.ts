import { COMBO_MESSAGES, COMBO_TIMEOUT, TITLES } from "./config";

export function comboMessage(n: number): string | null {
  for (const [k, m] of COMBO_MESSAGES) if (n >= k) return m;
  return null;
}

export function titleFor(score: number) {
  for (const [k, t] of TITLES) if (score >= k) return t;
  return "Intern";
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/** Score bookkeeping. Kept as plain numbers on purpose: the HUD samples it a few times a second. */
export class Score {
  score = 0;
  kills = 0;
  combo = 0;
  bestCombo = 0;
  comboTimer = 0;
  lastMsg: string | null = null;
  mult = 1;

  reset() {
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.lastMsg = null;
    this.mult = 1;
  }

  /** returns a new milestone message when crossing a threshold */
  hit(): string | null {
    this.combo++;
    this.comboTimer = COMBO_TIMEOUT;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.add(10 * (1 + this.combo * 0.05));
    const m = comboMessage(this.combo);
    if (m && m !== this.lastMsg) {
      this.lastMsg = m;
      return m;
    }
    return null;
  }

  kill(bonus = 0) {
    this.kills++;
    const v = (100 + bonus) * (1 + this.combo / 20);
    this.add(v);
    return Math.round(v * this.mult);
  }

  add(v: number) {
    this.score += v * this.mult;
  }

  tick(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.lastMsg = null;
      }
    }
  }
}
