import * as THREE from "three";
import type { Game } from "./engine";
import type { Faction, Personality } from "./types";
import { FACTIONS, FACTION_INFO, SURVIVE_SECONDS } from "./config";
import { rollPersonality } from "./ai";
import { audio } from "./audio";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

export class Spawner {
  timer = 1.2;
  squadT = 18;

  reset() {
    this.timer = 1.2;
    this.squadT = 18;
  }

  enemyFactions(): Faction[] {
    return FACTIONS.filter((f) => f !== this.g.playerFaction);
  }

  constructor(private g: Game) {}

  update(dt: number) {
    const g = this.g;
    if (g.phase !== "playing" || g.worldFreeze) return;
    const t = g.runTime;
    const final = t > SURVIVE_SECONDS - 30;
    const max = Math.min(final ? 30 : 24, 5 + Math.floor(t / 7) + (final ? 6 : 0));
    const interval = final ? 0.35 : Math.max(0.5, 1.7 - t / 110);
    const alive = g.actors.reduce((n, a) => n + (a.alive && !a.isNpc && !a.isPlayer && !a.ally ? 1 : 0), 0);
    this.timer -= dt;
    if (this.timer <= 0 && alive < max) {
      this.timer = interval * rand(0.7, 1.3);
      this.spawn();
    }
    this.squadT -= dt;
    if (this.squadT <= 0 && alive < max + 3) {
      // a little squad of the same faction drops in together
      this.squadT = rand(16, 26);
      const f = this.enemyFactions()[Math.floor(Math.random() * 2)];
      const base = this.pickSpot(10);
      for (let i = 0; i < 3; i++) this.spawn(f, base.clone().add(_v.set(rand(-2.5, 2.5), 0, rand(-2.5, 2.5))));
      g.fx.text(base.clone().setY(base.y + 4), `${FACTION_INFO[f].plural} SQUAD DEPLOYED`, FACTION_INFO[f].css, { size: 0.9, life: 1.6, rise: 0.6 });
    }
  }

  pickSpot(minDist: number) {
    const g = this.g;
    const p = g.player?.pos ?? new THREE.Vector3();
    let best = g.arena.randomPointOnIsland(0);
    for (let i = 0; i < 12; i++) {
      const c = g.arena.randomPointOnIsland(0);
      if (c.distanceTo(p) >= minDist && c.distanceTo(p) < 26) return c;
      best = c;
    }
    return best;
  }

  spawn(faction?: Faction, at?: THREE.Vector3, personality?: Personality) {
    const g = this.g;
    const f = faction ?? this.enemyFactions()[Math.floor(Math.random() * 2)];
    const pos = at ?? this.pickSpot(9);
    if (!g.arena.walkable(pos.x, pos.z)) return null;
    pos.y = g.arena.groundAt(pos.x, pos.z, 50);
    const a = g.spawnActor(f, pos.clone().setY(pos.y + 16), { personality: personality ?? rollPersonality() });
    a.vel.y = -24;
    a.spawnT = 0.5;
    a.invuln = 0.4;
    const col = FACTION_INFO[f].color;
    g.fx.beam(pos.clone().setY(pos.y + 40), pos, 0.7, col, 0.6, 1.4);
    g.fx.beam(pos.clone().setY(pos.y + 40), pos, 0.2, 0xffffff, 0.5, 2);
    g.fx.ring(pos, 0.3, 2.4, 0.5, col);
    audio.play("spawn");
    return a;
  }
}
