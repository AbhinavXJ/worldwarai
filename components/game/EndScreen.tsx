"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, animate } from "framer-motion";
import { useUI } from "@/lib/game/store";
import { getGame } from "@/lib/game/engine";
import { FACTION_INFO } from "@/lib/game/config";
import { fmtTime } from "@/lib/game/scoring";
import { makeCard, shareText, tweetUrl } from "@/lib/game/share";
import { audio } from "@/lib/game/audio";
import type { RunResult } from "@/lib/game/types";

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = animate(0, to, {
      duration: 1.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
      },
    });
    return () => c.stop();
  }, [to]);
  return <span ref={ref}>0</span>;
}

function ShareModal({ r, onClose }: { r: RunResult; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const text = shareText(r);
  useEffect(() => {
    let u: string | null = null;
    makeCard(r).then((b) => {
      if (!b) return;
      setBlob(b);
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [r]);

  const site = typeof window !== "undefined" ? window.location.origin : undefined;
  const nativeShare = async () => {
    if (!blob) return;
    const file = new File([blob], "ai-mascot-battle.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, title: "AI MASCOT BATTLE" });
      else await navigator.share({ text, url: site, title: "AI MASCOT BATTLE" });
    } catch {}
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site ? `${text}\n${site}` : text);
      setCopied(true);
      audio.play("pickup");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-mascot-battle-${r.score}.png`;
    a.click();
  };

  return (
    <motion.div className="amb-share" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="card" initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 22 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview">{url ? <img src={url} alt="your result card" /> : <div className="loading">drawing your card…</div>}</div>
        <pre className="text">{text}</pre>
        <div className="btns">
          <a className="amb-btn x" href={tweetUrl(text, site)} target="_blank" rel="noreferrer">
            POST ON 𝕏
          </a>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="amb-btn" onClick={nativeShare}>
              SHARE…
            </button>
          )}
          <button className="amb-btn" onClick={copy}>
            {copied ? "COPIED ✓" : "COPY TEXT"}
          </button>
          <button className="amb-btn" onClick={download} disabled={!url}>
            SAVE IMAGE
          </button>
        </div>
        <button className="amb-close" onClick={onClose} aria-label="close">
          ✕
        </button>
      </motion.div>
    </motion.div>
  );
}

export function EndScreen() {
  const r = useUI((s) => s.result);
  const phase = useUI((s) => s.phase);
  const [share, setShare] = useState(false);
  const [best, setBest] = useState(0);

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem("amb.best") || 0));
    } catch {}
  }, [r]);

  useEffect(() => {
    if (!r) return;
    const onKey = (e: KeyboardEvent) => {
      if (share) return;
      if (e.key === "Enter" || e.key.toLowerCase() === "r") getGame()?.startRun(r.faction);
      if (e.key.toLowerCase() === "c") getGame()?.toSelect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r, share]);

  if (!r) return null;
  const info = FACTION_INFO[r.faction];
  const won = phase === "victory" || r.won;
  const isBest = r.score > 0 && r.score >= best;
  const d = won ? 1.6 : 0.2;

  return (
    <div className={`amb-end ${won ? "won" : "lost"}`} style={{ ["--fc" as string]: info.css, ["--fa" as string]: info.cssAccent }}>
      {won ? (
        <div className="amb-credits">
          <motion.div className="hands" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
            DOTS 🤝 MUSES 🤝 GROK BOTS
          </motion.div>
          <motion.div className="survives" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8 }}>
            THE INTERNET SURVIVES ANOTHER DAY.
          </motion.div>
        </div>
      ) : (
        <motion.div className="amb-end-title" initial={{ scale: 2.6, opacity: 0, rotate: 6 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ type: "spring", stiffness: 300, damping: 13 }}>
          YOU HAVE BEEN
          <br />
          <span>CONTEXT-WINDOWED.</span>
        </motion.div>
      )}

      <motion.div className="amb-end-card" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: d, type: "spring", stiffness: 240, damping: 22 }}>
        <div className="lbl">YOUR INTERNET WAR SCORE</div>
        <div className="score">
          <CountUp to={r.score} />
        </div>
        <motion.div className="title" initial={{ scale: 0 }} animate={{ scale: 1, rotate: -2 }} transition={{ delay: d + 1.4, type: "spring", stiffness: 500, damping: 12 }}>
          “{r.title}”{isBest && <span className="pb">NEW BEST</span>}
        </motion.div>
        <div className="stats">
          <div>
            <b>{fmtTime(r.time)}</b>
            <span>survived</span>
          </div>
          <div>
            <b>{r.kills}</b>
            <span>defeated</span>
          </div>
          <div>
            <b>x{r.bestCombo}</b>
            <span>best combo</span>
          </div>
          <div>
            <b>{info.name}</b>
            <span>faction</span>
          </div>
        </div>
        <div className="btns">
          <motion.button className="amb-btn primary" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => getGame()?.startRun(r.faction)}>
            PLAY AGAIN
          </motion.button>
          <motion.button className="amb-btn" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => getGame()?.toSelect()}>
            CHANGE FACTION
          </motion.button>
          <motion.button
            className="amb-btn share"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              audio.play("click");
              setShare(true);
            }}
          >
            SHARE RESULT
          </motion.button>
        </div>
        {!won && <div className="quip">skill issue? no. context issue.</div>}
      </motion.div>

      <AnimatePresence>{share && <ShareModal r={r} onClose={() => setShare(false)} />}</AnimatePresence>
    </div>
  );
}
