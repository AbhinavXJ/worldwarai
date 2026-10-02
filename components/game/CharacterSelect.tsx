"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUI } from "@/lib/game/store";
import { getGame } from "@/lib/game/engine";
import { FACTION_INFO, FACTIONS } from "@/lib/game/config";
import { audio } from "@/lib/game/audio";
import type { Faction } from "@/lib/game/types";
import { TitleStack } from "./IntroOverlay";
import { MascotIcon } from "./MascotIcon";

const LABEL: Record<Faction, string> = { dot: "DOTS", muse: "MUSES", grok: "GROK BOTS" };
const YOU_ARE: Record<Faction, string> = { dot: "YOU ARE NOW A DOT.", muse: "YOU ARE NOW A MUSE.", grok: "YOU ARE NOW A GROK BOT." };
const SUB: Record<Faction, string> = { dot: "beep.", muse: "try to keep up, darling.", grok: "nobody approved this." };

export function CharacterSelect() {
  const hover = useUI((s) => s.hoverFaction);
  const selected = useUI((s) => s.selected);
  const set = useUI((s) => s.set);
  const [best, setBest] = useState(0);

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem("amb.best") || 0));
    } catch {}
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) getGame()?.select(FACTIONS[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (f: Faction) => getGame()?.select(f);

  return (
    <div className="amb-select">
      <motion.div className="amb-select-head" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: selected ? 0 : 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
        <TitleStack compact />
        <div className="amb-choose small">Choose your fighter.</div>
      </motion.div>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="amb-you-are"
            style={{ ["--fc" as string]: FACTION_INFO[selected].css, ["--fa" as string]: FACTION_INFO[selected].cssAccent }}
            initial={{ scale: 3, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -2 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 14 }}
          >
            <div className="big">{YOU_ARE[selected]}</div>
            <div className="sub">{SUB[selected]}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selected && (
        <div className="amb-fighters">
          {FACTIONS.map((f, i) => {
            const info = FACTION_INFO[f];
            const on = hover === f;
            return (
              <div key={f} className="amb-fighter-col">
                <AnimatePresence>
                  {on && (
                    <motion.div
                      className="amb-hover-bubble"
                      initial={{ scale: 0, y: 20, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 600, damping: 18 }}
                    >
                      {info.hover}
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  className={`amb-faction-btn f-${f} ${on ? "on" : ""}`}
                  style={{ ["--fc" as string]: info.css, ["--fa" as string]: info.cssAccent }}
                  initial={{ y: 120, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 + i * 0.09 }}
                  whileHover={{ scale: 1.07, rotate: i === 1 ? 0 : i === 0 ? -2 : 2 }}
                  whileTap={{ scale: 0.92 }}
                  onPointerEnter={() => {
                    audio.init();
                    set({ hoverFaction: f });
                  }}
                  onPointerLeave={() => set({ hoverFaction: null })}
                  onFocus={() => set({ hoverFaction: f })}
                  onClick={() => pick(f)}
                >
                  <span className="amb-fb-label">
                    <MascotIcon faction={f} />
                    {LABEL[f]}
                  </span>
                  <span className="amb-fb-tag">{info.tagline}</span>
                  <span className="amb-fb-key">{i + 1}</span>
                </motion.button>
                <motion.div className="amb-fb-abilities" animate={{ opacity: on ? 1 : 0, y: on ? 0 : -6 }}>
                  <span>
                    <b>LMB</b> {info.abilities.primary}
                  </span>
                  <span>
                    <b>RMB</b> {info.abilities.special}
                  </span>
                  <span>
                    <b>SPACE</b> {info.abilities.dash}
                  </span>
                  <span className="ult">
                    <b>Q</b> {info.abilities.ult}
                  </span>
                  <span className="hp">
                    HP {info.hp} · SPEED {info.speed}
                  </span>
                </motion.div>
              </div>
            );
          })}
        </div>
      )}

      {!selected && (
        <div className="amb-select-foot">
          <span>WASD move · mouse aim · LMB / RMB attack · SPACE dash · E interact · Q ultimate</span>
          {best > 0 && <span className="best">best score: {best.toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
