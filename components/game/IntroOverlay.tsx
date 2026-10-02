"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useUI } from "@/lib/game/store";
import { getGame } from "@/lib/game/engine";

const lines: Record<number, string> = {
  1: "THE INTERNET WAS PEACEFUL.",
  2: "THEN SOMEONE DEPLOYED ANOTHER MODEL.",
};

export function TitleStack({ compact = false }: { compact?: boolean }) {
  const words = ["AI", "MASCOT", "BATTLE"];
  return (
    <div className={`amb-title ${compact ? "compact" : ""}`}>
      {words.map((w, i) => (
        <motion.div
          key={w}
          className={`amb-title-word w${i}`}
          initial={compact ? false : { scale: 3.2, opacity: 0, rotate: i % 2 ? 6 : -6 }}
          animate={{ scale: 1, opacity: 1, rotate: i === 1 ? -2 : 1.5 }}
          transition={{ type: "spring", stiffness: 380, damping: 16, delay: compact ? 0 : i * 0.12 }}
        >
          {w}
        </motion.div>
      ))}
    </div>
  );
}

export function IntroOverlay() {
  const phase = useUI((s) => s.phase);
  const step = useUI((s) => s.introStep);
  const ready = useUI((s) => s.ready);
  const begin = () => getGame()?.startIntro();
  const skip = (e: React.MouseEvent) => {
    e.stopPropagation();
    getGame()?.skipIntro();
  };

  return (
    <div className="amb-intro" onClick={phase === "boot" ? begin : undefined}>
      {phase === "boot" && !ready && (
        <motion.div className="amb-boot-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }}>
          <div className="amb-boot-sub amb-loading">waking up the mascots…</div>
        </motion.div>
      )}
      {phase === "boot" && ready && (
        <motion.div className="amb-boot-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 1 }}>
          <div className="amb-boot-click">click the dot</div>
          <div className="amb-boot-sub">🔊 sound on · best on desktop</div>
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        {(step === 1 || step === 2) && (
          <motion.div
            key={step}
            className="amb-intro-line"
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.7 }}
          >
            {lines[step]}
          </motion.div>
        )}
      </AnimatePresence>
      {step >= 4 && (
        <div className="amb-intro-title">
          <TitleStack />
          <motion.div className="amb-choose" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
            Choose your fighter.
          </motion.div>
        </div>
      )}
      {phase === "intro" && (
        <button className="amb-skip" onClick={skip}>
          skip intro →
        </button>
      )}
      {phase === "boot" && ready && (
        <button className="amb-skip" onClick={skip}>
          skip intro →
        </button>
      )}
    </div>
  );
}
