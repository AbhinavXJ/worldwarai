import { create } from "zustand";
import type { Faction, HudState, Phase, RunResult } from "./types";

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: "event" | "ult" | "secret" | "info" | "warn";
}

export interface ComboFlash {
  id: number;
  count: number;
  msg: string | null;
}

interface UIStore {
  phase: Phase;
  introStep: number;
  faction: Faction | null;
  hoverFaction: Faction | null;
  selected: Faction | null;
  hud: HudState;
  banner: Banner | null;
  combo: ComboFlash;
  result: RunResult | null;
  announce: { id: number; text: string; n: number } | null;
  overlay: "none" | "updating" | "ratelimit" | "context" | "muse" | "latent";
  overlayProgress: number;
  letterbox: boolean;
  paused: boolean;
  muted: boolean;
  touch: boolean;
  skipIntro: boolean;
  /** the Game exists and the mascot models are loaded */
  ready: boolean;
  setPhase: (p: Phase) => void;
  set: (partial: Partial<UIStore>) => void;
  showBanner: (title: string, sub?: string, tone?: Banner["tone"]) => void;
  clearBanner: (id: number) => void;
}

const emptyHud: HudState = {
  hp: 100,
  maxHp: 100,
  energy: 0,
  score: 0,
  kills: 0,
  combo: 0,
  bestCombo: 0,
  time: 0,
  survive: 0,
  cd: { primary: 0, special: 0, dash: 0, ult: 0 },
  cdMax: { primary: 1, special: 1, dash: 1, ult: 1 },
  interact: null,
  secret: false,
  fps: 60,
};

let bannerId = 1;

export const useUI = create<UIStore>((set) => ({
  phase: "boot",
  introStep: 0,
  faction: null,
  hoverFaction: null,
  selected: null,
  hud: emptyHud,
  banner: null,
  combo: { id: 0, count: 0, msg: null },
  result: null,
  announce: null,
  overlay: "none",
  overlayProgress: 0,
  letterbox: false,
  paused: false,
  muted: false,
  touch: false,
  skipIntro: false,
  ready: false,
  setPhase: (phase) => set({ phase }),
  set: (partial) => set(partial),
  showBanner: (title, sub, tone = "event") => set({ banner: { id: bannerId++, title, sub, tone } }),
  clearBanner: (id) => set((s) => (s.banner && s.banner.id === id ? { banner: null } : {})),
}));

export const ui = () => useUI.getState();
