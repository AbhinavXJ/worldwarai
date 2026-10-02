"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useUI } from "@/lib/game/store";
import { IntroOverlay } from "./game/IntroOverlay";
import { CharacterSelect } from "./game/CharacterSelect";
import { GameUI } from "./game/GameUI";
import { EndScreen } from "./game/EndScreen";
import { MobileControls } from "./game/MobileControls";
import { audio } from "@/lib/game/audio";

const GameCanvas = dynamic(() => import("./game/GameCanvas"), { ssr: false });

export function Experience({ skipIntro = false }: { skipIntro?: boolean }) {
  const phase = useUI((s) => s.phase);
  const muted = useUI((s) => s.muted);
  const set = useUI((s) => s.set);

  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    set({ touch });
    try {
      if (localStorage.getItem("amb.muted") === "1") {
        set({ muted: true });
        audio.setMuted(true);
      }
    } catch {}
  }, [set]);

  const toggleMute = () => {
    const m = !muted;
    set({ muted: m });
    audio.setMuted(m);
    try {
      localStorage.setItem("amb.muted", m ? "1" : "0");
    } catch {}
  };

  const inGame = phase === "playing" || phase === "deploying" || phase === "dying";

  return (
    <main className="amb-root" data-phase={phase}>
      <GameCanvas skipIntro={skipIntro} />
      {(phase === "boot" || phase === "intro") && <IntroOverlay />}
      {phase === "select" && <CharacterSelect />}
      <GameUI />
      {(phase === "dead" || phase === "victory") && <EndScreen />}
      {inGame && <MobileControls />}
      <button className="amb-mute" onClick={toggleMute} aria-label={muted ? "unmute" : "mute"}>
        {muted ? "🔇" : "🔊"}
      </button>
    </main>
  );
}
