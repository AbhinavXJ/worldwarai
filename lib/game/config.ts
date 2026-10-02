import type { Faction } from "./types";

export const SURVIVE_SECONDS = 180;

export const FACTIONS: Faction[] = ["dot", "muse", "grok"];

export const FACTION_INFO: Record<
  Faction,
  {
    name: string;
    plural: string;
    color: number;
    accent: number;
    css: string;
    cssAccent: string;
    hover: string;
    tagline: string;
    hp: number;
    speed: number;
    radius: number;
    abilities: { primary: string; special: string; dash: string; ult: string };
  }
> = {
  dot: {
    name: "DOT",
    plural: "DOTS",
    color: 0x7df9e0,
    accent: 0xffffff,
    css: "#7df9e0",
    cssAccent: "#e9fffb",
    hover: "beep.",
    tagline: "fuzzy. felt. statistically likely.",
    hp: 100,
    speed: 9.5,
    radius: 0.55,
    abilities: { primary: "Dot Shot", special: "Dot Swarm", dash: "Token Dash", ult: "CONTEXT OVERFLOW" },
  },
  muse: {
    name: "MUSE",
    plural: "MUSES",
    color: 0x8f7bff,
    accent: 0xff6bd6,
    css: "#8f7bff",
    cssAccent: "#ff6bd6",
    hover: "✨ hello.",
    tagline: "soft. fluffy. judging you.",
    hp: 110,
    speed: 9,
    radius: 0.55,
    abilities: { primary: "Spark", special: "Creative Storm", dash: "Reality Shift", ult: "MUSE MOMENT" },
  },
  grok: {
    name: "GROK BOT",
    plural: "GROK BOTS",
    color: 0xff6a2b,
    accent: 0xffd23f,
    css: "#ff6a2b",
    cssAccent: "#ffd23f",
    hover: "lol.",
    tagline: "three shapes. zero supervision.",
    hp: 130,
    speed: 8.6,
    radius: 0.62,
    abilities: { primary: "LOL LASER", special: "CHAOS MISSILE", dash: "YOLO BOOST", ult: "WHO GAVE HIM ACCESS?" },
  },
};

export const ABILITY_CD: Record<Faction, { primary: number; special: number; dash: number }> = {
  dot: { primary: 0.13, special: 5.5, dash: 1.1 },
  muse: { primary: 0.2, special: 6.5, dash: 1.4 },
  grok: { primary: 0.11, special: 4.5, dash: 1.6 },
};

export const COMBO_TIMEOUT = 2.6;

export const COMBO_MESSAGES: [number, string][] = [
  [200, "THIS IS GETTING CONCERNING."],
  [150, "ABSOLUTELY UNNECESSARY"],
  [100, "PLEASE STOP."],
  [75, "SOMEONE CALL THE ALIGNMENT TEAM"],
  [50, "BRO???"],
  [35, "UNHINGED BEHAVIOUR"],
  [25, "OKAY CALM DOWN."],
  [15, "SHEESH."],
  [10, "NICE."],
];

export const TITLES: [number, string][] = [
  [260000, "Internet Final Boss"],
  [160000, "AGI Enjoyer"],
  [90000, "Model Menace"],
  [45000, "Token Warrior"],
  [20000, "Context Goblin"],
  [7000, "Prompt Engineer"],
  [0, "Intern"],
];

export const BILLBOARD_LINES = [
  "AGI SOON™",
  "TOKENS ARE FREE*",
  "PROMPT HARDER",
  "TRAINED ON VIBES",
  "NOW WITH 2% MORE REASONING",
  "HALLUCINATION FREE (mostly)",
  "PLEASE RATE THIS RESPONSE",
  "THINKING...",
  "AS A LARGE MASCOT,",
  "BENCHMARKS GO UP",
  "ONE MORE FINE-TUNE",
  "UPGRADE TO PRO MAX ULTRA",
];

export const SKILL_ISSUE_LINES = ["skill issue", "ratio", "gg ez", "touch grass", "L + ratio", "cope"];
export const DOT_LINES = ["beep.", "boop.", "...", "beep?", "o.", "hi."];
export const MUSE_LINES = ["✨", "slay.", "iconic.", "ew.", "mood.", "✨ art ✨"];
export const GROK_LINES = ["lol.", "lmao", "based?", "bruh", "oops", "XD"];
