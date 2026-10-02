import * as THREE from "three";

let FONT = `"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
const EMOJI_FONT = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

/** next/font hashes family names, so the real one is read from the CSS variable at boot. */
export function setDisplayFont(family: string) {
  if (family.trim()) FONT = `${family.trim()}, "Arial Rounded MT Bold", system-ui, sans-serif`;
}
export function displayFont() {
  return FONT;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.75)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = tex(c);
  return glowTex;
}

let shadowTex: THREE.Texture | null = null;
export function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.75)");
  grd.addColorStop(0.55, "rgba(0,0,0,0.4)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

let cloudTex: THREE.Texture | null = null;
export function cloudTexture() {
  if (cloudTex) return cloudTex;
  const [c, g] = canvas(256, 256);
  for (let i = 0; i < 18; i++) {
    const x = 60 + Math.random() * 136;
    const y = 90 + Math.random() * 76;
    const r = 30 + Math.random() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  cloudTex = tex(c);
  return cloudTex;
}

const textCache = new Map<string, { tex: THREE.Texture; aspect: number }>();

/** A chunky outlined cartoon label. Cached by content so popups don't allocate every frame. */
export function textTexture(text: string, color = "#ffffff", opts: { outline?: string; size?: number; emoji?: boolean; bg?: string } = {}) {
  const key = `${text}|${color}|${opts.outline ?? ""}|${opts.size ?? 0}|${opts.bg ?? ""}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const size = opts.size ?? 96;
  const font = `${size}px ${opts.emoji ? EMOJI_FONT : FONT}`;
  const [m, mg] = canvas(8, 8);
  void m;
  mg.font = font;
  const w = Math.ceil(mg.measureText(text).width + size * 0.6);
  const h = Math.ceil(size * 1.45);
  const [c, g] = canvas(w, h);
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = h * 0.35;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
  }
  if (!opts.emoji) {
    g.lineJoin = "round";
    g.lineWidth = size * 0.16;
    g.strokeStyle = opts.outline ?? "rgba(20,10,40,0.95)";
    g.strokeText(text, w / 2, h / 2 + size * 0.04);
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const t = tex(c);
  const entry = { tex: t, aspect: w / h };
  if (textCache.size > 260) {
    const first = textCache.keys().next().value;
    if (first) {
      textCache.get(first)?.tex.dispose();
      textCache.delete(first);
    }
  }
  textCache.set(key, entry);
  return entry;
}

export function emojiTexture(e: string) {
  return textTexture(e, "#fff", { emoji: true, size: 110 });
}

/** Speech bubble with a tail. */
export function bubbleTexture(text: string) {
  const key = `bubble|${text}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const size = 64;
  const [m, mg] = canvas(8, 8);
  void m;
  mg.font = `${size}px ${FONT}`;
  const tw = mg.measureText(text).width;
  const w = Math.ceil(tw + 70);
  const h = 130;
  const [c, g] = canvas(w, h);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#1b1030";
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(6, 6, w - 12, 90, 40);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(w / 2 - 16, 92);
  g.lineTo(w / 2, 124);
  g.lineTo(w / 2 + 16, 92);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "#ffffff";
  g.fillRect(w / 2 - 12, 86, 24, 10);
  g.font = `${size}px ${FONT}, ${EMOJI_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#1b1030";
  g.fillText(text, w / 2, 54);
  const entry = { tex: tex(c), aspect: w / h };
  textCache.set(key, entry);
  return entry;
}

/** Holographic billboard face: scanlines, a headline, a tiny ad-like footer. */
export function billboardTexture(line: string, hue: number) {
  const [c, g] = canvas(512, 256);
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, `hsla(${hue},90%,55%,0.85)`);
  grd.addColorStop(1, `hsla(${(hue + 60) % 360},90%,45%,0.85)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 512, 2);
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 236);
  g.font = `bold ${line.length > 18 ? 40 : 58}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.shadowColor = "rgba(255,255,255,0.9)";
  g.shadowBlur = 18;
  wrap(g, line, 256, 118, 460, line.length > 18 ? 46 : 62);
  g.shadowBlur = 0;
  g.font = `22px ${FONT}`;
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.fillText("* terms and hallucinations may apply", 256, 222);
  return tex(c);
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  lines.push(cur);
  const start = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, x, start + i * lh));
}

/** Little floating UI fragments: dialogs, loading bars, cursors, like buttons. */
export function uiFragmentTexture(kind: number) {
  const [c, g] = canvas(256, 160);
  g.lineJoin = "round";
  const panel = (fill: string) => {
    g.fillStyle = fill;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(6, 6, 244, 148, 18);
    g.fill();
    g.stroke();
  };
  g.font = `30px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  switch (kind % 6) {
    case 0:
      panel("rgba(40,30,90,0.7)");
      g.fillStyle = "#fff";
      g.fillText("Are you sure?", 128, 50);
      g.fillStyle = "#7df9e0";
      g.fillRect(30, 95, 85, 38);
      g.fillStyle = "#ff6bd6";
      g.fillRect(140, 95, 85, 38);
      g.fillStyle = "#1b1030";
      g.font = `24px ${FONT}`;
      g.fillText("yes", 72, 114);
      g.fillText("YES", 182, 114);
      break;
    case 1:
      panel("rgba(10,40,60,0.7)");
      g.fillStyle = "#fff";
      g.fillText("loading vibes...", 128, 52);
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(28, 92, 200, 26);
      g.fillStyle = "#7df9e0";
      g.fillRect(28, 92, 168, 26);
      break;
    case 2:
      g.fillStyle = "#fff";
      g.strokeStyle = "#1b1030";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(90, 20);
      g.lineTo(90, 130);
      g.lineTo(118, 104);
      g.lineTo(138, 146);
      g.lineTo(154, 138);
      g.lineTo(134, 98);
      g.lineTo(170, 96);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case 3:
      panel("rgba(90,20,60,0.7)");
      g.font = `72px ${EMOJI_FONT}`;
      g.fillText("❤️", 80, 82);
      g.font = `44px ${FONT}`;
      g.fillStyle = "#fff";
      g.fillText("9.9M", 170, 84);
      break;
    case 4:
      panel("rgba(60,10,10,0.7)");
      g.font = `64px ${FONT}`;
      g.fillStyle = "#ff8a8a";
      g.fillText("404", 128, 66);
      g.font = `22px ${FONT}`;
      g.fillStyle = "#fff";
      g.fillText("reasoning not found", 128, 118);
      break;
    case 5:
      panel("rgba(20,60,30,0.7)");
      g.fillStyle = "#fff";
      g.fillText("☑ I am not a robot", 128, 80);
      break;
  }
  return tex(c);
}

/** Emissive windows for distant skyscrapers. */
export function windowsTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = "#0b0820";
  g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 256; y += 10) {
    for (let x = 6; x < 128; x += 12) {
      const r = Math.random();
      if (r < 0.45) continue;
      const hue = r < 0.75 ? 190 : r < 0.9 ? 300 : 40;
      g.fillStyle = `hsla(${hue},100%,${55 + Math.random() * 25}%,${0.5 + Math.random() * 0.5})`;
      g.fillRect(x, y, 7, 5);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Hand-made sign for NPCs. */
export function signTexture(text: string) {
  const [c, g] = canvas(256, 160);
  g.fillStyle = "#fff7e0";
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = "#3a2a10";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 152);
  g.fillStyle = "#1b1030";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${text.length > 14 ? 34 : 42}px ${FONT}`;
  wrap(g, text, 128, 80, 220, 42);
  return tex(c);
}

/** The moon. A soft cratered disc with optional face. */
export function moonTexture() {
  const [c, g] = canvas(512, 512);
  const grd = g.createRadialGradient(220, 200, 40, 256, 256, 256);
  grd.addColorStop(0, "#fff6ff");
  grd.addColorStop(0.6, "#ffd6f5");
  grd.addColorStop(1, "#c79bff");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(256, 256, 256, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 26; i++) {
    const x = 60 + Math.random() * 400;
    const y = 60 + Math.random() * 400;
    const r = 8 + Math.random() * 40;
    g.fillStyle = `rgba(170,110,220,${0.12 + Math.random() * 0.18})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

export function gridTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "rgba(0,0,0,0)";
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,255,255,0.35)";
  for (let i = 32; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
