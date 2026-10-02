import * as THREE from "three";
import type { Game } from "./engine";
import { audio } from "./audio";
import { ui } from "./store";
import { setMood } from "./npcs";
import { setExpression } from "./characters";
import { glowTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

export type EventKind = "server" | "context" | "ratelimit" | "hallucination" | "ceo";

function buildCeo() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9b8d8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.2, 6, 12), dark);
  body.position.y = 1.7;
  g.add(body);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2a3550 }));
    leg.position.set(s * 0.25, 0.6, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.9, 4, 8), dark);
    arm.position.set(s * 0.7, 1.6, 0);
    arm.rotation.z = s * 0.15;
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), skin);
  head.position.y = 2.95;
  g.add(head);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), dark);
  hood.position.y = 3.0;
  hood.rotation.x = -0.5;
  g.add(hood);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), toneMapped: false }));
  visor.position.set(0, 3.0, 0.36);
  g.add(visor);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb9a6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.scale.set(5, 7, 1);
  aura.position.y = 2;
  g.add(aura);
  g.scale.setScalar(4.2);
  return g;
}

const CEO_LINES = ["ship it.", "this is fine.", "we're so back.", "carry on.", "great demo.", "scale is all you need.", "ok."];

export class RandomEvents {
  next = rand(28, 40);
  active: EventKind | null = null;
  t = 0;
  stage = 0;
  ceo: THREE.Group | null = null;
  private order: EventKind[] = [];
  private lastBro = 0;

  constructor(private g: Game) {}

  reset() {
    this.end(true);
    this.next = rand(26, 36);
    this.order = [];
  }

  private pick(): EventKind {
    if (!this.order.length) {
      this.order = (["server", "context", "ratelimit", "hallucination", "ceo", "hallucination"] as EventKind[]).sort(() => Math.random() - 0.5);
    }
    return this.order.pop()!;
  }

  trigger(kind?: EventKind) {
    if (this.active) return;
    const k = kind ?? this.pick();
    this.active = k;
    this.t = 0;
    this.stage = 0;
    const g = this.g;
    switch (k) {
      case "server":
        ui().showBanner("SERVER UPDATE", "please do not turn off the internet.", "event");
        g.worldFreeze = true;
        g.playerFrozen = true;
        ui().set({ overlay: "updating", overlayProgress: 0 });
        audio.play("updating");
        audio.muffle(0.8);
        break;
      case "context":
        ui().showBanner("CONTEXT LIMIT", "too many tokens. everyone is slower.", "warn");
        ui().set({ overlay: "context" });
        g.worldSpeed = 0.55;
        g.playerSpeed = 0.75;
        break;
      case "ratelimit":
        ui().showBanner("RATE LIMIT", "429: too many requests.", "warn");
        ui().set({ overlay: "ratelimit" });
        g.worldSpeed = 0.2;
        g.playerSpeed = 0.42;
        audio.muffle(0.6);
        this.lastBro = 0;
        break;
      case "hallucination": {
        const name = g.props.dropHallucination();
        ui().showBanner("MODEL HALLUCINATION", `${name} has been generated. nobody asked.`, "event");
        break;
      }
      case "ceo":
        this.spawnCeo();
        break;
    }
  }

  private spawnCeo() {
    const g = this.g;
    const is = g.arena.islands[1];
    this.ceo = buildCeo();
    this.ceo.position.set(is.x, is.y, is.z - 1);
    this.ceo.rotation.y = 0;
    g.scene.add(this.ceo);
    ui().showBanner("CEO SPAWN", "a mysterious figure has entered the chat.", "event");
    audio.play("vineboom");
    g.fx.burst(this.ceo.position.clone().setY(is.y + 8), 0xb9a6ff, 80, 12, { size: 1.6, life: 1.2 });
    g.fx.ring(this.ceo.position, 1, 12, 1, 0xb9a6ff);
    const look = this.ceo.position.clone().setY(is.y + 10);
    for (const a of g.actors) {
      if (a.isPlayer || !a.alive) continue;
      a.frozen = true;
      a.lookAt = look;
      if (a.isNpc) setMood(a, "stare", 4);
      setExpression(a.rig.face, "surprised", 3);
    }
    g.ceoLook = look;
    if (g.player) g.player.invuln = Math.max(g.player.invuln, 4);
    ui().set({ letterbox: true });
  }

  update(dt: number) {
    const g = this.g;
    if (g.phase !== "playing") return;
    if (!this.active) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = rand(30, 55);
        this.trigger();
      }
      return;
    }
    this.t += dt;
    switch (this.active) {
      case "server":
        if (this.stage === 0) {
          ui().set({ overlayProgress: Math.min(1, this.t / 2) });
          if (this.t >= 2.1) {
            this.stage = 1;
            g.worldFreeze = false;
            g.playerFrozen = false;
            g.worldSpeed = 2;
            g.playerSpeed = 1.5;
            ui().set({ overlay: "none" });
            ui().showBanner("UPDATE COMPLETE", "everything is now twice as fast. no changelog.", "info");
            audio.play("resume");
            audio.muffle(0);
          }
        } else if (this.t > 8.5) this.end();
        break;
      case "context":
        for (let i = 0; i < 6; i++) {
          const p = g.player?.pos ?? _v.set(0, 0, 0);
          g.fx.glow.spawn(p.x + rand(-22, 22), p.y + rand(12, 20), p.z + rand(-18, 14), 0, -rand(4, 9), 0, new THREE.Color().setHSL(rand(0.45, 0.55), 1, 0.7), rand(0.3, 0.6), 2.5, { drag: 0, shape: 1 });
        }
        if (this.t > 8) this.end();
        break;
      case "ratelimit":
        if (this.t > 1 && this.lastBro === 0) {
          this.lastBro = 1;
          const near = g.actors.filter((a) => a.alive && !a.isPlayer && !a.isNpc && g.player && a.pos.distanceTo(g.player.pos) < 18);
          const who = near[Math.floor(Math.random() * near.length)] ?? g.npcs[0];
          if (who) g.fx.bubble(who.rig.root, "bro.", who.rig.height * who.scale + 0.6, 2.4, 0.9);
        }
        if (this.t > 5.5) this.end();
        break;
      case "hallucination":
        if (this.stage === 0 && this.t > 2.3) {
          this.stage = 1;
          ui().showBanner("???", "nobody understands what happened.", "info");
        }
        if (this.t > 4) this.end();
        break;
      case "ceo":
        if (this.ceo) {
          const c = this.ceo.position;
          g.setCine(_v.set(c.x * 0.6, c.y + 9, c.z + 30), new THREE.Vector3(c.x, c.y + 9, c.z), 2.2);
          this.ceo.rotation.y = Math.sin(this.t * 0.8) * 0.15;
          if (this.stage === 0 && this.t > 1.4) {
            this.stage = 1;
            g.fx.text(c.clone().setY(c.y + 17), CEO_LINES[Math.floor(Math.random() * CEO_LINES.length)], "#ffffff", { size: 2.4, life: 1.8, rise: 0.3, bubble: true });
          }
          if (this.stage === 1 && this.t > 3.4) {
            this.stage = 2;
            g.fx.burst(c.clone().setY(c.y + 8), 0xb9a6ff, 90, 14, { size: 1.6, life: 1 });
            g.fx.confetti(c.clone().setY(c.y + 6), 40, 8, 6);
            audio.play("pop");
            this.ceo.removeFromParent();
            this.ceo = null;
            this.end();
            ui().showBanner("THE BATTLE RESUMES", "as if nothing happened.", "info");
          }
        }
        break;
    }
  }

  end(silent = false) {
    const g = this.g;
    const was = this.active;
    this.active = null;
    g.worldFreeze = false;
    g.playerFrozen = false;
    g.worldSpeed = 1;
    g.playerSpeed = 1;
    audio.muffle(0);
    if (this.ceo) {
      this.ceo.removeFromParent();
      this.ceo = null;
    }
    if (was === "ceo" || silent) {
      for (const a of g.actors) {
        a.frozen = false;
        a.lookAt = null;
      }
      g.ceoLook = null;
      g.cine = null;
      ui().set({ letterbox: false });
    }
    if (!silent) {
      ui().set({ overlay: "none" });
      if (was && g.phase === "playing") {
        g.score.add(250);
        if (g.player) g.fx.text(g.player.pos.clone().setY(g.player.pos.y + 2.6), "+250 SURVIVED THE EVENT", "#ffd23f", { size: 0.7, life: 1.4 });
      }
    }
  }
}
