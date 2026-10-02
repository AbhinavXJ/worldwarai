"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUI } from "@/lib/game/store";
import { getGame } from "@/lib/game/engine";
import { FACTION_INFO } from "@/lib/game/config";
import { fmtTime, titleFor } from "@/lib/game/scoring";
import type { Faction } from "@/lib/game/types";
import { MascotIcon } from "./MascotIcon";

const ULT_ICON: Record<Faction, string> = { dot: "🌧️", muse: "📸", grok: "🦾" };
const ICONS: Record<Faction, { primary: string; special: string; dash: string }> = {
  dot: { primary: "●", special: "⁘", dash: "»" },
  muse: { primary: "✦", special: "🌪️", dash: "🌀" },
  grok: { primary: "😂", special: "🚀", dash: "🔥" },
};

/** Layers whose per-frame style is written by the engine, never by React. */
function EngineLayers({ uiRef }: { uiRef: React.RefObject<HTMLDivElement | null> }) {
  const flash = useRef<HTMLDivElement>(null);
  const hurt = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = 0;
    const attach = () => {
      const g = getGame();
      if (!g) {
        id = window.setTimeout(attach, 100);
        return;
      }
      g.dom = { flash: flash.current, hurt: hurt.current, cursor: cursor.current, ui: uiRef.current, edge: edge.current, speed: speed.current };
    };
    attach();
    return () => {
      window.clearTimeout(id);
      const g = getGame();
      if (g) g.dom = {};
    };
  }, []);
  return (
    <>
      <div ref={speed} className="amb-speed" />
      <div ref={edge} className="amb-edge" />
      <div ref={hurt} className="amb-hurt" />
      <div ref={flash} className="amb-flash" />
      <div ref={cursor} className="amb-cursor">
        <span />
      </div>
    </>
  );
}

function Banner() {
  const banner = useUI((s) => s.banner);
  const clear = useUI((s) => s.clearBanner);
  useEffect(() => {
    if (!banner) return;
    const id = banner.id;
    const t = window.setTimeout(() => clear(id), banner.tone === "ult" ? 2200 : 2900);
    return () => window.clearTimeout(t);
  }, [banner, clear]);
  return (
    <div className="amb-banner-wrap">
      <AnimatePresence mode="popLayout">
        {banner && (
          <motion.div
            key={banner.id}
            className={`amb-banner tone-${banner.tone}`}
            initial={{ scale: 2.4, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, opacity: 1, rotate: -1.5 }}
            exit={{ scale: 0.6, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
          >
            <div className="t">{banner.title}</div>
            {banner.sub && <div className="s">{banner.sub}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Announcer() {
  const a = useUI((s) => s.announce);
  const set = useUI((s) => s.set);
  useEffect(() => {
    if (!a) return;
    const id = a.id;
    const t = window.setTimeout(() => {
      if (useUI.getState().announce?.id === id) set({ announce: null });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [a, set]);
  return (
    <div className="amb-announce-wrap">
      <AnimatePresence mode="popLayout">
        {a && (
          <motion.div
            key={a.id}
            className={`amb-announce n${Math.min(6, a.n)}`}
            initial={{ scale: 4, opacity: 0, rotate: a.id % 2 ? -14 : 14 }}
            animate={{ scale: 1, opacity: 1, rotate: a.id % 2 ? -5 : 5 }}
            exit={{ scale: 1.6, opacity: 0, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 13 }}
          >
            <span className="burst" />
            <span className="txt">{a.text}</span>
            <span className="x">x{a.n}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bar({ v, max, kind }: { v: number; max: number; kind: "hp" | "en" }) {
  const k = Math.max(0, Math.min(1, v / max));
  const low = kind === "hp" && k < 0.3;
  const full = kind === "en" && k >= 1;
  return (
    <div className={`amb-bar ${kind} ${low ? "low" : ""} ${full ? "full" : ""}`}>
      <div className="lag" style={{ transform: `scaleX(${k})` }} />
      <div className="fill" style={{ transform: `scaleX(${k})` }} />
      <div className="txt">{kind === "hp" ? `${Math.ceil(v)} / ${max}` : full ? "Q · ULTIMATE READY" : `${Math.floor(v)}%`}</div>
    </div>
  );
}

function Ability({ keyLabel, name, icon, cd, max, ult }: { keyLabel: string; name: string; icon: string; cd: number; max: number; ult?: boolean }) {
  const k = max > 0 ? Math.max(0, Math.min(1, cd / max)) : 0;
  const ready = k <= 0.001;
  return (
    <div className={`amb-ability ${ready ? "ready" : ""} ${ult ? "ult" : ""}`} title={name}>
      <div className="ico">{icon}</div>
      {!ready && <div className="sweep" style={{ background: `conic-gradient(rgba(10,4,24,0.72) ${k * 360}deg, transparent 0deg)` }} />}
      {!ready && !ult && cd > 0.4 && <div className="num">{cd.toFixed(cd < 3 ? 1 : 0)}</div>}
      <div className="key">{keyLabel}</div>
      <div className="name">{name}</div>
    </div>
  );
}

function Combo() {
  const combo = useUI((s) => s.combo);
  if (combo.count < 2) return null;
  const hot = combo.count >= 25;
  return (
    <div className={`amb-combo ${hot ? "hot" : ""}`}>
      <motion.div key={combo.id} className="n" initial={{ scale: 1.6, rotate: -8 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: "spring", stiffness: 700, damping: 14 }}>
        {combo.count}
        <span>HIT COMBO</span>
      </motion.div>
      <AnimatePresence>
        {combo.msg && (
          <motion.div key={combo.msg} className="m" initial={{ scale: 0, rotate: 10 }} animate={{ scale: 1, rotate: 3 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: "spring", stiffness: 500, damping: 12 }}>
            {combo.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlays() {
  const overlay = useUI((s) => s.overlay);
  const prog = useUI((s) => s.overlayProgress);
  return (
    <AnimatePresence>
      {overlay === "updating" && (
        <motion.div key="up" className="amb-ov updating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="box">
            <div className="spin" />
            <div className="t">Updating the internet…</div>
            <div className="pb">
              <div style={{ width: `${Math.round(prog * 100)}%` }} />
            </div>
            <div className="s">{Math.round(prog * 100)}% · installing 1 of 1 update · do not turn off your computer</div>
          </div>
        </motion.div>
      )}
      {overlay === "ratelimit" && (
        <motion.div key="rl" className="amb-ov ratelimit" initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
          <div className="code">429</div>
          <div className="t">TOO MANY REQUESTS</div>
          <div className="s">your attacks have been rate limited. bro.</div>
        </motion.div>
      )}
      {overlay === "context" && (
        <motion.div key="cx" className="amb-ov context" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="tokens">
            {Array.from({ length: 26 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.23) % 2}s`, animationDuration: `${2.2 + (i % 5) * 0.4}s` }}>
                {["token", "tok", "<eos>", "…", "▁the", "##ing", "[MASK]", "🪙"][i % 8]}
              </span>
            ))}
          </div>
          <div className="meter">
            CONTEXT <b>128k / 128k</b> · everyone is slower
          </div>
        </motion.div>
      )}
      {overlay === "muse" && (
        <motion.div key="mu" className="amb-ov muse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="t">✨ MUSE MOMENT ✨</div>
          <div className="s">a masterpiece. obviously.</div>
        </motion.div>
      )}
      {overlay === "latent" && (
        <motion.div key="la" className="amb-ov latent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="t">LATENT SPACE</div>
          <div className="s">dimension 4,096 of 12,288 · you are being embedded</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Hud() {
  const hud = useUI((s) => s.hud);
  const faction = useUI((s) => s.faction);
  const phase = useUI((s) => s.phase);
  if (!faction) return null;
  const info = FACTION_INFO[faction];
  const ic = ICONS[faction];
  const finale = hud.survive <= 30;
  return (
    <motion.div className="amb-hud" style={{ ["--fc" as string]: info.css, ["--fa" as string]: info.cssAccent }} initial={{ opacity: 0 }} animate={{ opacity: phase === "dying" ? 0.25 : 1 }} transition={{ duration: 0.4 }}>
      <div className="amb-hud-tl">
        <div className="who">
          <div className={`badge f-${faction}`}>
            <MascotIcon faction={faction} />
          </div>
          <div>
            <div className="nm">YOU · {info.name}</div>
            <div className="tt">{titleFor(hud.score)}</div>
          </div>
        </div>
        <Bar v={hud.hp} max={hud.maxHp} kind="hp" />
        <Bar v={hud.energy} max={100} kind="en" />
        {hud.secret && <div className="secret">★ GOLDEN WEIGHTS ★ 2x score</div>}
      </div>

      <div className="amb-hud-tr">
        <motion.div key={Math.floor(hud.score / 500)} className="score" initial={{ scale: 1.18 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 15 }}>
          {hud.score.toLocaleString()}
        </motion.div>
        <div className="row">
          <span>💀 {hud.kills}</span>
          <span>🔥 x{hud.bestCombo}</span>
        </div>
        <div className={`timer ${finale ? "finale" : ""}`}>
          {finale ? "FINAL WAVE · " : "SURVIVE · "}
          <b>{fmtTime(hud.survive)}</b>
        </div>
      </div>

      <Combo />

      <div className="amb-hud-br">
        <Ability keyLabel="LMB" name={info.abilities.primary} icon={ic.primary} cd={hud.cd.primary} max={hud.cdMax.primary} />
        <Ability keyLabel="RMB" name={info.abilities.special} icon={ic.special} cd={hud.cd.special} max={hud.cdMax.special} />
        <Ability keyLabel="SPACE" name={info.abilities.dash} icon={ic.dash} cd={hud.cd.dash} max={hud.cdMax.dash} />
        <Ability keyLabel="Q" name={info.abilities.ult} icon={ULT_ICON[faction]} cd={hud.cd.ult} max={hud.cdMax.ult} ult />
      </div>

      <AnimatePresence>
        {hud.interact && (
          <motion.div className="amb-interact" initial={{ y: 20, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
            <kbd>E</kbd> {hud.interact}
          </motion.div>
        )}
      </AnimatePresence>
      {typeof window !== "undefined" && window.location.search.includes("fps") && <div className="amb-fps">{hud.fps} fps</div>}
    </motion.div>
  );
}

function Pause() {
  const paused = useUI((s) => s.paused);
  const set = useUI((s) => s.set);
  const resume = () => {
    const g = getGame();
    if (g) g.paused = false;
    set({ paused: false });
  };
  const quit = () => {
    const g = getGame();
    if (!g) return;
    g.paused = false;
    set({ paused: false });
    g.toSelect();
  };
  return (
    <AnimatePresence>
      {paused && (
        <motion.div className="amb-pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="card" initial={{ scale: 0.8, rotate: -3 }} animate={{ scale: 1, rotate: -1 }} transition={{ type: "spring", stiffness: 400, damping: 16 }}>
            <div className="t">PAUSED</div>
            <div className="s">the mascots are waiting. impatiently.</div>
            <div className="btns">
              <button className="amb-btn primary" onClick={resume}>
                RESUME
              </button>
              <button className="amb-btn" onClick={quit}>
                CHANGE FACTION
              </button>
            </div>
            <div className="controls">
              WASD move · mouse aim · LMB primary · RMB special · SPACE dash · E interact · Q ultimate · P / ESC pause
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GameUI() {
  const phase = useUI((s) => s.phase);
  const letterbox = useUI((s) => s.letterbox);
  const set = useUI((s) => s.set);
  const inGame = phase === "playing" || phase === "deploying" || phase === "dying";
  const uiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHide = () => {
      const g = getGame();
      if (document.hidden && g && g.phase === "playing" && !g.paused) {
        g.paused = true;
        set({ paused: true });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [set]);

  return (
    <div className="amb-ui" ref={uiRef}>
      <EngineLayers uiRef={uiRef} />
      <div className={`amb-letterbox ${letterbox ? "on" : ""}`}>
        <div className="top" />
        <div className="bot" />
      </div>
      <Overlays />
      {inGame && <Hud />}
      {inGame && <Announcer />}
      <Banner />
      {inGame && <Pause />}
    </div>
  );
}
