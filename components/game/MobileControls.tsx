"use client";
import { useRef, useState } from "react";
import { useUI } from "@/lib/game/store";
import { getGame } from "@/lib/game/engine";
import { FACTION_INFO } from "@/lib/game/config";

const R = 56;

export function MobileControls() {
  const touch = useUI((s) => s.touch);
  const faction = useUI((s) => s.faction);
  const energy = useUI((s) => s.hud.energy);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const pid = useRef<number | null>(null);

  if (!touch) return null;
  const input = () => getGame()?.input;

  const onStickDown = (e: React.PointerEvent) => {
    if (pid.current !== null) return;
    pid.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    const i = input();
    if (i) {
      i.usingTouch = true;
      i.touchActive = true;
      i.touchMove.set(0, 0);
    }
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current || !stick) return;
    let dx = e.clientX - stick.x;
    let dy = e.clientY - stick.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    setStick({ ...stick, dx, dy });
    const i = input();
    if (i) i.touchMove.set(dx / R, dy / R);
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current) return;
    pid.current = null;
    setStick(null);
    const i = input();
    if (i) {
      i.touchActive = false;
      i.touchMove.set(0, 0);
    }
  };

  const tap = (k: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const i = input();
    if (!i) return;
    i.usingTouch = true;
    i.press(k);
  };
  const fire = (on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    const i = input();
    if (!i) return;
    i.usingTouch = true;
    i.touchFire = on;
  };

  const info = faction ? FACTION_INFO[faction] : null;
  return (
    <div className="amb-touch" style={info ? { ["--fc" as string]: info.css, ["--fa" as string]: info.cssAccent } : undefined}>
      <div className="zone" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        {stick ? (
          <div className="stick" style={{ left: stick.x, top: stick.y }}>
            <div className="knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
          </div>
        ) : (
          <div className="hint">drag to move</div>
        )}
      </div>
      <div className="btns">
        <button className="b fire" onPointerDown={fire(true)} onPointerUp={fire(false)} onPointerCancel={fire(false)} onPointerLeave={fire(false)}>
          {info?.abilities.primary ?? "FIRE"}
        </button>
        <button className="b special" onPointerDown={tap("special")}>
          {info?.abilities.special ?? "SPECIAL"}
        </button>
        <button className="b dash" onPointerDown={tap("dash")}>
          DASH
        </button>
        <button className={`b ult ${energy >= 100 ? "ready" : ""}`} onPointerDown={tap("ult")}>
          ULT
          <i style={{ transform: `scaleY(${Math.min(1, energy / 100)})` }} />
        </button>
        <button className="b interact" onPointerDown={tap("interact")}>
          E
        </button>
        <button className="b pause" onPointerDown={tap("p")}>
          ❚❚
        </button>
      </div>
    </div>
  );
}
