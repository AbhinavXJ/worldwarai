import type { RunResult } from "./types";
import { FACTION_INFO } from "./config";
import { fmtTime } from "./scoring";
import { displayFont } from "./textures";

export function shareText(r: RunResult) {
  const f = FACTION_INFO[r.faction];
  const article = r.faction === "dot" ? "a" : "a";
  const lines = r.won
    ? [`I survived the whole war in AI MASCOT BATTLE as ${article} ${f.name}.`]
    : [`I survived ${fmtTime(r.time)} in AI MASCOT BATTLE as ${article} ${f.name}.`];
  lines.push("", `${r.kills} enemies defeated.`, `${r.bestCombo} combo.`, `Score: ${r.score.toLocaleString()} (${r.title})`, "", r.won ? "The internet survives another day." : "The internet is not safe.");
  return lines.join("\n");
}

export function tweetUrl(text: string, url?: string) {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  if (url) u.searchParams.set("url", url);
  return u.toString();
}

/** A shareable 1200x675 result card, drawn locally. */
export async function makeCard(r: RunResult): Promise<Blob | null> {
  const W = 1200, H = 675;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const f = FACTION_INFO[r.faction];
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, "#160a33");
  grd.addColorStop(0.55, "#3b0f52");
  grd.addColorStop(1, "#ff5ea8");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // confetti dots
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `hsla(${Math.random() * 360},100%,70%,${0.25 + Math.random() * 0.5})`;
    const s = 4 + Math.random() * 10;
    g.beginPath();
    g.arc(Math.random() * W, Math.random() * H, s / 2, 0, Math.PI * 2);
    g.fill();
  }
  // big mascot dot
  const cx = 960, cy = 360;
  const glow = g.createRadialGradient(cx, cy, 30, cx, cy, 260);
  glow.addColorStop(0, f.css + "cc");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(cx - 280, cy - 280, 560, 560);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(cx, cy, 140, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = f.css;
  g.globalAlpha = 0.35;
  g.beginPath();
  g.arc(cx, cy, 140, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = "#140a24";
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 46, cy - 10, 18, 26, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 9;
  g.lineCap = "round";
  g.strokeStyle = "#140a24";
  g.beginPath();
  if (r.won) g.arc(cx, cy + 30, 30, 0.15 * Math.PI, 0.85 * Math.PI);
  else g.arc(cx, cy + 60, 26, 1.15 * Math.PI, 1.85 * Math.PI);
  g.stroke();
  g.fillStyle = "#ffffff";
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * 46 + 6, cy - 20, 6, 0, Math.PI * 2);
    g.fill();
  }

  const font = displayFont();
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ffffff";
  g.font = `40px ${font}`;
  g.fillText("AI MASCOT BATTLE", 70, 100);
  g.font = `28px ${font}`;
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.fillText(r.won ? "THE INTERNET SURVIVES ANOTHER DAY." : "YOU HAVE BEEN CONTEXT-WINDOWED.", 70, 145);
  g.font = `30px ${font}`;
  g.fillStyle = f.css;
  g.fillText("YOUR INTERNET WAR SCORE", 70, 250);
  g.font = `140px ${font}`;
  g.fillStyle = "#ffffff";
  g.lineWidth = 12;
  g.strokeStyle = "#1b0b30";
  const sc = r.score.toLocaleString();
  g.strokeText(sc, 64, 385);
  g.fillText(sc, 64, 385);
  g.font = `46px ${font}`;
  g.fillStyle = "#ffd23f";
  g.fillText(`"${r.title}"`, 70, 450);
  g.font = `30px ${font}`;
  g.fillStyle = "#ffffff";
  const stats = [`${f.name}`, `${fmtTime(r.time)} survived`, `${r.kills} defeated`, `${r.bestCombo} best combo`];
  stats.forEach((s, i) => {
    const x = 70 + i * 205;
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    g.roundRect(x - 10, 510, 190, 70, 18);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `${s.length > 13 ? 22 : 26}px ${font}`;
    g.fillText(s, x + 4, 554);
  });
  g.font = `22px ${font}`;
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillText("DOTS vs MUSES vs GROK BOTS · nobody approved this", 70, 635);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}
