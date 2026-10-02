"use client";
import { useEffect, useState } from "react";
import { Canvas, advance, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { Game, getGame, setGame } from "@/lib/game/engine";
import { setDisplayFont } from "@/lib/game/textures";
import * as characters from "@/lib/game/characters";
const { loadCharacterAssets } = characters;
import { ui } from "@/lib/game/store";
import { Effects } from "./Effects";

/** Owns the Game instance. React only mounts it; three.js state lives in plain objects. */
function EngineBridge({ skipIntro }: { skipIntro: boolean }) {
  const { scene, camera, gl, size } = useThree();

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    (async () => {
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-display");
      setDisplayFont(fam);
      try {
        await Promise.all([
          Promise.race([document.fonts.load(`40px ${fam}`), new Promise((r) => setTimeout(r, 1500))]),
          loadCharacterAssets(),
        ]);
      } catch {}
      if (cancelled) return;
      game = new Game(scene, camera as THREE.PerspectiveCamera, gl.domElement);
      setGame(game);
      if (process.env.NODE_ENV !== "production") Object.assign(window, { __amb: game, __ambChars: characters, __ambGl: gl });
      game.resize(gl.domElement.height);
      gl.shadowMap.autoUpdate = false;
      if (skipIntro) game.skipIntro();
      ui().set({ skipIntro, ready: true });
    })();
    return () => {
      cancelled = true;
      game?.dispose();
      setGame(null);
      ui().set({ ready: false });
    };
  }, [scene, camera, gl, skipIntro]);

  useEffect(() => {
    getGame()?.resize(gl.domElement.height);
  }, [size, gl]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __ambAdvance?: (frames: number) => void; __ambDt?: number };
    w.__ambAdvance = (frames: number) => {
      w.__ambDt = 1 / 60;
      for (let i = 0; i < frames; i++) advance(performance.now() + i * 16.7);
      w.__ambDt = undefined;
    };
  }, []);

  useFrame((_, dt) => {
    const g = getGame();
    if (!g) return;
    const dev = window as unknown as { __ambDt?: number; __ambFreeze?: boolean };
    if (dev.__ambFreeze && dev.__ambDt === undefined) return;
    g.update(dev.__ambDt ?? dt);
    if (g.arena.shadowDirty) {
      g.arena.shadowDirty = false;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}

export default function GameCanvas({ skipIntro = false }: { skipIntro?: boolean }) {
  const [dpr, setDpr] = useState(1.5);
  const [quality, setQuality] = useState<"high" | "low">("high");
  return (
    <Canvas
      className="amb-canvas"
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false, depth: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      dpr={dpr}
      camera={{ fov: 55, near: 0.1, far: 2500, position: [0, 1, 3.4] }}
      shadows={{ type: THREE.PCFShadowMap }}
      frameloop="always"
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 1);
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          window.setTimeout(() => window.location.reload(), 300);
        });
      }}
    >
      <PerformanceMonitor
        bounds={() => [48, 75]}
        onDecline={() => {
          setDpr((d) => Math.max(0.85, d - 0.25));
          setQuality("low");
        }}
        onIncline={() => setDpr((d) => Math.min(Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1.5), d + 0.25))}
        flipflops={4}
      />
      <EngineBridge skipIntro={skipIntro} />
      <Effects quality={quality} />
    </Canvas>
  );
}
