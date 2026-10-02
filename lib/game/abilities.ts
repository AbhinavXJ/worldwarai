import * as THREE from "three";
import type { Game } from "./engine";
import type { Actor, Faction, Rig } from "./types";
import { ABILITY_CD, FACTION_INFO } from "./config";
import { audio } from "./audio";
import { damage, explode, nearestEnemyOf, segmentHits } from "./combat";
import { animateRig, buildRig, initFlashColors, kickSquash, setExpression } from "./characters";
import { setMood } from "./npcs";
import { ui } from "./store";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ CONTEXT OVERFLOW rain of dots

class DotRain {
  n = 1700;
  mesh: THREE.InstancedMesh;
  p = new Float32Array(this.n * 3);
  v = new Float32Array(this.n * 3);
  delay = new Float32Array(this.n);
  landed = new Uint8Array(this.n);
  s = new Float32Array(this.n);
  t = 0;
  boomed = false;
  active = false;
  center = new THREE.Vector3();
  private m4 = new THREE.Matrix4();

  constructor(private g: Game) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.n; i++) {
      const r = Math.random();
      _c.set(r < 0.7 ? 0xeafffb : r < 0.85 ? 0x7df9e0 : r < 0.93 ? 0xff9be8 : 0xffd23f).multiplyScalar(rand(1.2, 2));
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    g.scene.add(this.mesh);
  }

  start(center: THREE.Vector3) {
    this.center.copy(center);
    this.active = true;
    this.boomed = false;
    this.t = 0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 24;
      this.p[i * 3] = center.x + Math.cos(a) * r;
      this.p[i * 3 + 1] = center.y + rand(28, 60);
      this.p[i * 3 + 2] = center.z + Math.sin(a) * r;
      this.v[i * 3] = 0;
      this.v[i * 3 + 1] = -rand(8, 18);
      this.v[i * 3 + 2] = 0;
      this.delay[i] = Math.pow(Math.random(), 0.7) * 2.1;
      this.landed[i] = 0;
      this.s[i] = rand(0.7, 1.5);
    }
  }

  boom() {
    this.boomed = true;
    const c = this.center;
    for (let i = 0; i < this.n; i++) {
      const dx = this.p[i * 3] - c.x, dz = this.p[i * 3 + 2] - c.z;
      const d = Math.hypot(dx, dz) || 1;
      const s = rand(10, 30);
      this.v[i * 3] = (dx / d) * s + rand(-4, 4);
      this.v[i * 3 + 1] = rand(14, 38);
      this.v[i * 3 + 2] = (dz / d) * s + rand(-4, 4);
      this.landed[i] = 0;
      this.delay[i] = 0;
    }
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const ar = this.g.arena;
    let count = 0;
    const pile = Math.min(1.6, this.t * 0.55);
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        continue;
      }
      if (!this.landed[i]) {
        this.v[o + 1] -= (this.boomed ? 30 : 45) * dt;
        this.p[o] += this.v[o] * dt;
        this.p[o + 1] += this.v[o + 1] * dt;
        this.p[o + 2] += this.v[o + 2] * dt;
        if (!this.boomed) {
          const gy = ar.groundAt(this.p[o], this.p[o + 2], this.p[o + 1] + 1);
          const top = gy + Math.random() * pile + 0.2;
          if (gy > -Infinity && this.p[o + 1] < top) {
            this.p[o + 1] = top;
            this.landed[i] = 1;
            if (Math.random() < 0.02) this.g.fx.burst(_v.set(this.p[o], top, this.p[o + 2]), 0xeafffb, 2, 3, { size: 0.4, life: 0.25 });
          }
        }
      }
      const sc = this.s[i] * (this.boomed ? Math.max(0, 1 - (this.t - 3) / 2.2) : 1);
      const j = this.landed[i] ? Math.sin(this.t * 8 + i) * 0.04 : 0;
      this.m4.makeScale(sc, sc, sc);
      this.m4.setPosition(this.p[o], this.p[o + 1] + j, this.p[o + 2]);
      this.mesh.setMatrixAt(count++, this.m4);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.boomed && this.t > 5.3) {
      this.active = false;
      this.mesh.count = 0;
    }
  }
}

// ------------------------------------------------------------------ WHO GAVE HIM ACCESS?

class GiantRobot {
  rig: Rig;
  pos = new THREE.Vector3();
  vy = 0;
  t = 0;
  phase: "fall" | "confused" | "rampage" | "leave" | "done" = "fall";
  yaw = 0;
  stepT = 0;
  laserT = 0;
  walkTarget = new THREE.Vector3();
  scale = 8;
  ground = 0;
  actor: Actor;

  constructor(private g: Game, at: THREE.Vector3) {
    this.rig = buildRig("grok");
    initFlashColors(this.rig);
    this.rig.root.scale.setScalar(this.scale);
    this.ground = g.arena.groundAt(at.x, at.z, 50);
    if (this.ground === -Infinity) this.ground = 0;
    this.pos.set(at.x, this.ground + 90, at.z);
    this.vy = -30;
    g.scene.add(this.rig.root);
    setExpression(this.rig.face, "neutral");
    // stand-in actor so explosions credit the player and nothing targets it
    this.actor = g.makeGhostActor(this.rig, true);
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    const r = this.rig;
    if (this.phase === "fall") {
      this.vy -= 50 * dt;
      this.pos.y += this.vy * dt;
      r.root.rotation.z = Math.sin(this.t * 3) * 0.3;
      g.arena.pushShadow(this.pos.x, this.pos.z, this.pos.y, 9 * Math.min(1, 1.2 - (this.pos.y - this.ground) / 100));
      if (this.pos.y <= this.ground) {
        this.pos.y = this.ground;
        r.root.rotation.z = 0;
        this.phase = "confused";
        this.t = 0;
        kickSquash(r, 14);
        audio.play("stomp");
        audio.play("vineboom");
        explode(g, this.pos, 12, 120, this.actor, { color: 0xff6a2b, launch: 22, knock: 26, shake: 1.2, faction: "ally" });
        g.fx.ring(this.pos, 2, 22, 0.9, 0xffd23f);
        g.fx.pixelBurst(this.pos, [0xffffff, 0xff6a2b, 0xffd23f], 80, 18, 0.3, 14);
        g.slowmo(0.7, 0.2);
        g.climax(this.pos);
        setExpression(r.face, "derp", 2);
        for (const a of g.actors) {
          if (a.isNpc && a.pos.distanceTo(this.pos) < 30) {
            a.lookAt = this.pos.clone();
            setMood(a, "stare", 2);
          }
        }
      }
    } else if (this.phase === "confused") {
      r.lookYaw = Math.sin(this.t * 3) * 0.9;
      if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && this.t < 1.2) {
        g.fx.text(_v.copy(this.pos).setY(this.ground + 11), this.t < 0.6 ? "?" : "??", "#ffffff", { size: 3, life: 0.9 });
      }
      if (this.t > 1.4) {
        this.phase = "rampage";
        this.t = 0;
        r.lookYaw = 0;
        setExpression(r.face, "angry", 20);
        g.fx.bubble(r.root, "lol.", 11, 1.6, 2.4);
        audio.play("lol");
      }
    } else if (this.phase === "rampage") {
      // stomp toward the juiciest cluster of enemies
      const tgt = nearestEnemyOf(g, this.pos, "ally", 60);
      if (tgt) this.walkTarget.copy(tgt.pos);
      _v.subVectors(this.walkTarget, this.pos).setY(0);
      const d = _v.length();
      if (d > 2) {
        _v.normalize();
        const nx = this.pos.x + _v.x * 5 * dt, nz = this.pos.z + _v.z * 5 * dt;
        if (g.arena.walkable(nx, nz)) {
          this.pos.x = nx;
          this.pos.z = nz;
        }
        this.yaw = Math.atan2(_v.x, _v.z);
      }
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.55;
        audio.play("stomp");
        g.camRig.shake(0.3);
        const foot = _v2.set(Math.cos(this.yaw) * (Math.random() < 0.5 ? 1.2 : -1.2), 0, 0).add(this.pos);
        explode(g, foot, 4.5, 40, this.actor, { color: 0xffd23f, launch: 12, shake: 0.2, sound: false, faction: "ally" });
      }
      this.laserT -= dt;
      if (this.laserT <= 0) {
        this.laserT = 0.38;
        const victim = randomEnemy(g, this.pos, 26);
        if (victim) {
          const eye = _v3.copy(this.pos).setY(this.ground + r.height * this.scale * 0.62);
          g.fx.beam(eye, victim.pos, 0.35, 0xffb347, 0.2, 3);
          audio.play("laser");
          explode(g, victim.pos, 2.5, 55, this.actor, { color: 0xff6a2b, launch: 14, shake: 0.15, sound: false, faction: "ally" });
        }
      }
      if (Math.random() < 0.01) g.fx.bubble(r.root, ["who am i", "AAAA", "lmao", "i have root"][Math.floor(Math.random() * 4)], 11, 1.4, 2.2);
      if (this.t > 8) {
        this.phase = "leave";
        this.t = 0;
        g.fx.bubble(r.root, "ok bye", 11, 1.2, 2.2);
        audio.play("missile");
      }
    } else if (this.phase === "leave") {
      this.vy += 40 * dt;
      this.pos.y += this.vy * dt * 0.5;
      g.fx.burst(_v.copy(this.pos), 0xffb347, 6, 6, { size: 1.5, life: 0.5, up: -10 });
      if (this.t > 2) {
        this.phase = "done";
        g.fx.confetti(this.pos, 60, 10, 4);
        r.root.removeFromParent();
        g.removeGhostActor(this.actor);
      }
    }
    if (this.phase !== "leave" && this.phase !== "done") g.arena.pushShadow(this.pos.x, this.pos.z, this.pos.y, 8);
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    this.actor.pos.copy(this.pos);
    animateRig(r, { speed: this.phase === "rampage" ? 0.6 : 0, grounded: this.phase !== "fall" && this.phase !== "leave", vy: this.vy, action: this.phase === "leave" ? "cheer" : "none", actionT: this.t, t: g.time }, dt);
  }
}

function randomEnemy(g: Game, p: THREE.Vector3, maxD: number): Actor | null {
  const list = g.actors.filter((a) => a.alive && !a.isNpc && !a.isPlayer && !a.ally && a.pos.distanceTo(p) < maxD);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

// ------------------------------------------------------------------ the kit

export class Abilities {
  faction: Faction;
  cd = { primary: 0, special: 0, dash: 0 };
  cdMax: { primary: number; special: number; dash: number };
  dashT = 0;
  dashDir = new THREE.Vector3();
  dashHits: number[] = [];
  rapid = 0;
  side = 1;
  shots = 0;
  swarmQueue = 0;
  storm: { pos: THREE.Vector3; t: number; tick: number } | null = null;
  ult: { kind: Faction; t: number; stage: number } | null = null;
  rain: DotRain;
  giant: GiantRobot | null = null;
  private lastPos = new THREE.Vector3();

  constructor(private g: Game, faction: Faction) {
    this.faction = faction;
    this.cdMax = { ...ABILITY_CD[faction] };
    this.rain = g.dotRain ?? (g.dotRain = new DotRain(g));
  }

  get busy() {
    return !!this.ult;
  }

  reset(faction: Faction) {
    this.faction = faction;
    this.cdMax = { ...ABILITY_CD[faction] };
    this.cd = { primary: 0, special: 0, dash: 0 };
    this.dashT = 0;
    this.rapid = 0;
    this.storm = null;
    this.ult = null;
    this.swarmQueue = 0;
    if (this.giant) {
      this.giant.rig.root.removeFromParent();
      this.g.removeGhostActor(this.giant.actor);
      this.giant = null;
    }
    this.rain.active = false;
    this.rain.mesh.count = 0;
  }

  private muzzle(): THREE.Vector3 {
    const p = this.g.player!;
    const right = _v3.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.side *= -1;
    return new THREE.Vector3(p.pos.x, p.pos.y + p.rig.height * 0.55, p.pos.z)
      .addScaledVector(this.g.aimDir, 0.6)
      .addScaledVector(right, this.faction === "dot" ? 0.25 * this.side : 0.2);
  }

  // ---------------------------------------------------------------- primary

  primary() {
    const g = this.g;
    const p = g.player!;
    const rate = this.rapid > 0 ? 0.5 : 1;
    if (this.cd.primary > 0) return;
    this.cd.primary = this.cdMax.primary * rate;
    p.atkT = 0;
    this.shots++;
    const from = this.muzzle();
    const dir = _v.copy(g.aimDir);
    const fc = FACTION_INFO[this.faction];
    if (this.faction === "dot") {
      dir.applyAxisAngle(UP, rand(-0.04, 0.04));
      const secret = g.secretMode;
      g.projectiles.fire({ kind: "dot", pos: from, vel: dir.clone().multiplyScalar(34), dmg: 11, owner: p, faction: p.faction, color: secret ? new THREE.Color().setHSL(Math.random(), 1, 0.7).getHex() : 0xeafffb, size: secret ? 0.3 : 0.17, radius: 0.5, life: 1.1, trail: 0.7, knock: 5 });
      g.fx.spark(from, 0xffffff, 0.9, 0.08);
      audio.play("pew");
      kickSquash(p.rig, 2);
    } else if (this.faction === "muse") {
      dir.applyAxisAngle(UP, rand(-0.03, 0.03));
      g.projectiles.fire({ kind: "spark", pos: from, vel: dir.clone().multiplyScalar(27), dmg: 14, owner: p, faction: p.faction, color: Math.random() < 0.5 ? 0xff6bd6 : 0x9b8cff, size: 0.15, radius: 0.55, life: 1.2, wobble: 1.6, pierce: 1, trail: 1, knock: 6 });
      g.fx.burst(from, 0xff6bd6, 4, 3, { size: 0.4, life: 0.2 });
      audio.play("spark");
    } else {
      // LOL LASER: hitscan, a little drunk
      const oops = Math.random() < 0.04;
      dir.applyAxisAngle(UP, oops ? rand(-0.7, 0.7) : rand(-0.09, 0.09));
      const len = this.laserLength(from, dir, 21);
      const to = _v2.copy(from).addScaledVector(dir, len);
      const col = [0xff6a2b, 0xffd23f, 0xff3b6b][this.shots % 3];
      g.fx.beam(from, to, 0.13, col, 0.09, 3);
      g.fx.beam(from, to, 0.04, 0xffffff, 0.06, 3);
      g.fx.spark(to, col, 1.2, 0.1);
      g.fx.burst(to, col, 3, 4, { size: 0.35, life: 0.2 });
      const hits = segmentHits(g, from, to, 0.45, (x) => !x.isPlayer && !x.ally && !x.isNpc && x.faction !== p.faction);
      for (const h of hits) damage(g, h, 8.5, p, { dir: dir.clone().setY(0), knock: 4, color: col });
      g.props.hitTest(to, 0.6, 9);
      if (this.shots % 9 === 0 || oops) g.fx.text(to.clone().setY(to.y + 0.6), oops ? "oops" : "lol", "#ffd23f", { size: 0.6, life: 0.5 });
      audio.play("laser");
    }
    void fc;
    g.camRig.shake(0.03);
  }

  private laserLength(from: THREE.Vector3, dir: THREE.Vector3, max: number) {
    for (let d = 0.5; d < max; d += 0.5) {
      _v3.copy(from).addScaledVector(dir, d);
      for (const ob of this.g.arena.obstacles) {
        if (!ob.alive || _v3.y > ob.top || _v3.y < ob.y) continue;
        if ((_v3.x - ob.x) ** 2 + (_v3.z - ob.z) ** 2 < ob.r * ob.r) return d;
      }
    }
    return max;
  }

  // ---------------------------------------------------------------- special

  special() {
    const g = this.g;
    const p = g.player!;
    if (this.cd.special > 0) return false;
    this.cd.special = this.cdMax.special;
    g.score.add(50);
    p.atkT = 0;
    if (this.faction === "dot") {
      this.swarmQueue = 110;
      g.fx.text(p.pos.clone().setY(p.pos.y + 2.2), "DOT SWARM", "#7df9e0", { size: 0.9, life: 1 });
      audio.play("sparkle");
      audio.play("whistle");
      g.fx.ring(p.pos, 0.3, 5, 0.4, 0x7df9e0);
    } else if (this.faction === "muse") {
      const at = g.aimPoint.clone();
      _v.subVectors(at, p.pos).setY(0);
      if (_v.length() > 14) at.copy(p.pos).add(_v.setLength(14));
      const gy = g.arena.groundAt(at.x, at.z, p.pos.y + 3);
      at.y = gy === -Infinity ? p.pos.y : gy;
      this.storm = { pos: at, t: 0, tick: 0 };
      g.fx.text(at.clone().setY(at.y + 3), "CREATIVE STORM", "#ff6bd6", { size: 1, life: 1.2 });
      audio.play("sparkle");
      audio.play("portal");
    } else {
      const from = this.muzzle();
      g.projectiles.fire({ kind: "missile", pos: from, vel: g.aimDir.clone().multiplyScalar(15), dmg: 75, owner: p, faction: p.faction, color: 0xff6a2b, radius: 0.6, life: 7, bounces: 4 + Math.floor(Math.random() * 2), trail: 1 });
      g.fx.text(p.pos.clone().setY(p.pos.y + 2.4), "CHAOS MISSILE", "#ff6a2b", { size: 0.9, life: 1 });
      audio.play("missile");
      kickSquash(p.rig, 5);
    }
    g.camRig.shake(0.12);
    return true;
  }

  // ---------------------------------------------------------------- dash

  dash(move: THREE.Vector3) {
    const g = this.g;
    const p = g.player!;
    if (this.cd.dash > 0) return false;
    this.cd.dash = this.cdMax.dash;
    const dir = move.lengthSq() > 0.01 ? move.clone().normalize() : g.aimDir.clone();
    this.dashDir.copy(dir);
    this.dashHits.length = 0;
    this.lastPos.copy(p.pos);
    g.camRig.fovKick = 9;
    g.score.add(5);
    if (this.faction === "dot") {
      this.dashT = 0.2;
      p.invuln = Math.max(p.invuln, 0.3);
      audio.play("dash");
      kickSquash(p.rig, -8);
    } else if (this.faction === "muse") {
      // Reality Shift: step through a portal
      const start = p.pos.clone();
      let dist = 8;
      while (dist > 1 && !g.arena.walkable(p.pos.x + dir.x * dist, p.pos.z + dir.z * dist)) dist -= 0.5;
      const end = start.clone().addScaledVector(dir, dist);
      end.y = g.arena.groundAt(end.x, end.z, start.y + 3);
      if (end.y === -Infinity) end.y = start.y;
      const mid = _v.copy(start).setY(start.y + 1);
      g.fx.verticalRing(mid.clone(), dir, 0.2, 1.6, 0.45, 0xff6bd6);
      g.fx.burst(mid, 0xff6bd6, 30, 6, { size: 0.6, life: 0.5 });
      p.pos.copy(end);
      p.vel.set(0, 3, 0);
      p.invuln = Math.max(p.invuln, 0.45);
      const endMid = end.clone().setY(end.y + 1);
      g.fx.verticalRing(endMid, dir, 1.6, 0.2, 0.45, 0x6bd6ff);
      g.fx.burst(endMid, 0x6bd6ff, 30, 6, { size: 0.6, life: 0.5 });
      for (let i = 0; i < 12; i++) g.fx.trail(start.clone().lerp(end, i / 12).setY(start.y + 1), 0xd9b8ff, 0.8, 0.5);
      explode(g, end, 2.8, 16, p, { color: 0xff6bd6, launch: 6, knock: 10, shake: 0.1, sound: false });
      audio.play("portal");
      kickSquash(p.rig, 8);
    } else {
      // YOLO BOOST: you are a passenger now
      this.dashT = 0.55;
      this.dashDir.copy(g.aimDir);
      p.invuln = Math.max(p.invuln, 0.3);
      audio.play("dash");
      audio.play("missile");
      g.fx.bubble(p.rig.root, "YOLO", p.rig.height + 0.7, 0.8);
    }
    return true;
  }

  // ---------------------------------------------------------------- ultimate

  ultimate() {
    const g = this.g;
    const p = g.player!;
    if (g.energy < 100 || this.ult) return false;
    g.energy = 0;
    g.score.add(250);
    this.ult = { kind: this.faction, t: 0, stage: 0 };
    p.invuln = 6;
    audio.play("ult");
    ui().set({ letterbox: true });
    const name = FACTION_INFO[this.faction].abilities.ult;
    ui().showBanner(name, this.faction === "dot" ? "the sky is full of dots." : this.faction === "muse" ? "everyone hold still. she's posing." : "nobody approved this deployment.", "ult");
    if (this.faction === "dot") {
      // everyone looks up
      for (const a of g.actors) {
        if (a.isPlayer || !a.alive) continue;
        if (a.pos.distanceTo(p.pos) < 30) {
          if (!a.isNpc) a.stun = Math.max(a.stun, 3.2);
          a.lookAt = a.pos.clone().setY(a.pos.y + 30);
          if (Math.random() < 0.3) g.fx.bubble(a.rig.root, ["?", "uh oh", "o."][Math.floor(Math.random() * 3)], a.rig.height + 0.6, 1.5);
        }
      }
      this.rain.start(p.pos);
    } else if (this.faction === "muse") {
      g.worldFreeze = true;
      ui().set({ overlay: "muse" });
      setExpression(p.rig.face, "smug", 2);
    } else {
      const drop = p.pos.clone().addScaledVector(g.aimDir, 7);
      if (!g.arena.walkable(drop.x, drop.z)) drop.copy(p.pos).addScaledVector(g.aimDir, 2);
      if (!g.arena.walkable(drop.x, drop.z)) drop.set(0, 0, 0);
      this.giant = new GiantRobot(g, drop);
      audio.play("whistleDown");
    }
    return true;
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number) {
    const g = this.g;
    const p = g.player;
    this.cd.primary = Math.max(0, this.cd.primary - dt);
    this.cd.special = Math.max(0, this.cd.special - dt);
    this.cd.dash = Math.max(0, this.cd.dash - dt);
    if (this.rapid > 0) this.rapid -= dt;
    this.rain.update(dt);
    if (this.giant) {
      this.giant.update(dt);
      if (this.giant.phase === "done") this.giant = null;
    }
    if (!p) return;

    // dot swarm release, a few per frame so it reads as a stream
    if (this.swarmQueue > 0) {
      const k = Math.min(this.swarmQueue, 6);
      this.swarmQueue -= k;
      for (let i = 0; i < k; i++) {
        _v.randomDirection();
        _v.y = Math.abs(_v.y) + 0.3;
        const from = p.pos.clone().setY(p.pos.y + 0.8).addScaledVector(_v, 0.6);
        const tgt = nearestEnemyOf(g, p.pos, p.faction, 30);
        g.projectiles.fire({ kind: "swarm", pos: from, vel: _v.clone().multiplyScalar(rand(10, 16)), dmg: 5, owner: p, faction: p.faction, color: Math.random() < 0.8 ? 0xeafffb : 0x7df9e0, size: 0.1, radius: 0.45, life: 3, homing: tgt, homingStr: rand(3, 6), trail: 0.35, knock: 2 });
      }
      if (this.swarmQueue % 18 === 0) audio.play("pew");
    }

    if (this.dashT > 0) this.updateDash(dt, p);
    if (this.storm) this.updateStorm(dt);
    if (this.ult) this.updateUlt(dt, p);
  }

  private updateDash(dt: number, p: Actor) {
    const g = this.g;
    this.dashT -= dt;
    const speed = this.faction === "dot" ? 40 : 26;
    if (this.faction === "grok" && this.dashT > 0.1) {
      // drift a bit, it is a YOLO after all
      this.dashDir.applyAxisAngle(UP, Math.sin(g.time * 13) * dt * 1.2);
    }
    p.vel.x = this.dashDir.x * speed;
    p.vel.z = this.dashDir.z * speed;
    if (p.grounded && this.faction === "grok") p.vel.y = 2.5;
    p.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    const from = this.lastPos;
    const to = p.pos;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      _v.copy(from).lerp(to, i / steps).setY(to.y + 0.6 + rand(-0.2, 0.2));
      if (this.faction === "dot") {
        g.fx.trail(_v, 0xeafffb, 1, 0.35);
        g.fx.trail(_v, 0x7df9e0, 0.5, 0.5);
      } else {
        g.fx.trail(_v, Math.random() < 0.5 ? 0xffb347 : 0xff5a1f, 0.9, 0.35);
      }
    }
    if (this.faction === "dot" && Math.random() < 0.25) g.fx.text(_v.clone(), ["tok", "en", "##", "▁the"][Math.floor(Math.random() * 4)], "#bafff2", { size: 0.35, life: 0.5, rise: 0.5 });
    if (this.faction === "grok") p.rig.root.rotation.y += dt * 30;
    const hits = segmentHits(g, from, to, 0.9, (x) => !x.isPlayer && !x.isNpc && !x.ally && x.faction !== p.faction && !this.dashHits.includes(x.id));
    for (const h of hits) {
      this.dashHits.push(h.id);
      _v.set(-this.dashDir.z, 0, this.dashDir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1).add(this.dashDir).normalize();
      damage(g, h, this.faction === "dot" ? 14 : 22, p, { dir: _v, knock: this.faction === "dot" ? 12 : 22, launch: this.faction === "dot" ? 6 : 10 });
    }
    // npcs get bowled over
    for (const n of g.npcs) {
      if (n.pos.distanceToSquared(to) < 1.2) damage(g, n, 0, p, { dir: this.dashDir, knock: 14, launch: 7 });
    }
    this.lastPos.copy(p.pos);
    if (this.dashT <= 0) {
      p.vel.x *= 0.3;
      p.vel.z *= 0.3;
      if (this.faction === "grok" && Math.random() < 0.3) {
        p.rig.fallTimer = 1.0;
        g.fx.bubble(p.rig.root, "oof", p.rig.height + 0.6, 0.8);
        audio.play("bonk");
      }
    }
  }

  private updateStorm(dt: number) {
    const g = this.g;
    const s = this.storm!;
    s.t += dt;
    const c = s.pos;
    const R = 6.5;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.5, R);
      const h = rand(0, 5);
      _v.set(c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r);
      const tang = 9 + (R - r) * 1.5;
      _c.setHSL(Math.random(), 1, 0.6);
      g.fx.glow.spawn(_v.x, _v.y, _v.z, -Math.sin(a) * tang, rand(1, 4), Math.cos(a) * tang, _c, rand(0.4, 1), rand(0.3, 0.6), { drag: 0.5 });
    }
    if (Math.random() < 0.5) {
      _v.set(c.x, c.y + 2, c.z);
      _v2.randomDirection().setY(rand(0.4, 1)).multiplyScalar(rand(6, 12));
      g.projectiles.fire({ kind: "paint", pos: _v, vel: _v2, dmg: 4, owner: g.player, faction: g.player!.faction, color: new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex(), size: 0.22, radius: 0.5, life: 2, gravity: 20, trail: 0.4 });
    }
    s.tick -= dt;
    const tick = s.tick <= 0;
    if (tick) s.tick = 0.25;
    for (const a of g.actors) {
      if (!a.alive || a.isPlayer || a.ally) continue;
      _v.subVectors(c, a.pos).setY(0);
      const d = _v.length();
      if (d > R + 1) continue;
      _v.normalize();
      a.knock.addScaledVector(_v, dt * 30);
      a.knock.addScaledVector(_v2.set(-_v.z, 0, _v.x), dt * 22);
      if (!a.isNpc) {
        a.vel.y = Math.max(a.vel.y, 2.5);
        a.grounded = false;
        if (tick) damage(g, a, 6, g.player, { color: new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex(), quiet: true, silent: true });
      }
    }
    if (s.t > 4.5) {
      explode(g, c, 7, 32, g.player, { color: 0xff6bd6, launch: 14, knock: 18 });
      for (let i = 0; i < 30; i++) g.arena.splat(c.x + rand(-6, 6), c.z + rand(-6, 6), c.y, rand(0.4, 1.4), new THREE.Color().setHSL(Math.random(), 1, 0.6).multiplyScalar(1.3));
      this.storm = null;
    }
  }

  private updateUlt(dt: number, p: Actor) {
    const g = this.g;
    const u = this.ult!;
    u.t += dt;
    if (u.kind === "dot") {
      g.setCine(_v.set(p.pos.x, p.pos.y + 34, p.pos.z + 22), _v2.set(p.pos.x, p.pos.y, p.pos.z - 2), 2.5);
      if (u.stage === 0 && u.t > 0.2) {
        u.stage = 1;
        audio.play("whistleDown");
      }
      if (u.stage === 1 && u.t > 3.0) {
        u.stage = 2;
        this.rain.boom();
        const kills = explode(g, p.pos, 27, 220, p, { color: 0x7df9e0, launch: 26, knock: 30, shake: 1.3 });
        g.fx.explosion(p.pos, 10, 0xff6bd6);
        g.fx.ring(p.pos, 1, 40, 1, 0x7df9e0);
        g.fx.ring(p.pos, 1, 30, 0.8, 0xff6bd6);
        g.fx.text(p.pos.clone().setY(p.pos.y + 4), "BOOM.", "#ff6bd6", { size: 4.5, life: 1.6, rise: 2 });
        audio.play("vineboom");
        audio.play("airhorn");
        g.flash(1);
        g.slowmo(0.7, 0.2);
        g.climax(p.pos);
        g.score.add(kills * 150);
      }
      if (u.stage === 2 && u.t > 4.6) this.endUlt();
    } else if (u.kind === "muse") {
      // cinematic orbit on the pose
      const a = 0.5 + Math.min(u.t, 1.7) * 0.35;
      if (u.stage < 2) g.setCine(_v.set(p.pos.x + Math.sin(a) * 4.2, p.pos.y + 1.6, p.pos.z + Math.cos(a) * 4.2), _v2.set(p.pos.x, p.pos.y + 1.2, p.pos.z), 4);
      else g.setCine(_v.set(p.pos.x + Math.sin(a) * 15, p.pos.y + 10, p.pos.z + Math.cos(a) * 15), _v2.set(p.pos.x, p.pos.y + 1, p.pos.z), 6);
      p.action = "pose";
      p.actionT = u.t;
      if (Math.random() < 0.4) g.fx.spark(_v3.set(p.pos.x + rand(-1.5, 1.5), p.pos.y + rand(0, 2.5), p.pos.z + rand(-1.5, 1.5)), 0xffffff, rand(0.5, 1.2), 0.4);
      if (u.stage === 0 && u.t > 0.2) {
        u.stage = 1;
        audio.play("sparkle");
        g.fx.flashLight(p.pos, 0xff6bd6, 10, 1.4);
      }
      if (u.stage === 1 && u.t > 1.7) {
        u.stage = 2;
        g.worldFreeze = false;
        ui().set({ overlay: "none" });
        g.arena.art = 1;
        const c = p.pos.clone().setY(p.pos.y + 1);
        for (let i = 0; i < 260; i++) {
          _v.randomDirection().multiplyScalar(rand(8, 32));
          _c.setHSL(Math.random(), 1, 0.6);
          g.fx.glow.spawn(c.x, c.y, c.z, _v.x, Math.abs(_v.y) * 0.8, _v.z, _c, rand(0.35, 1.0), rand(0.8, 1.8), { drag: 1.2, grav: 3 });
        }
        g.fx.confetti(c, 160, 14, 14);
        for (let i = 0; i < 70; i++) {
          _v.randomDirection().setY(rand(0.3, 1)).multiplyScalar(rand(8, 22));
          g.projectiles.fire({ kind: "paint", pos: c, vel: _v.clone(), dmg: 10, owner: p, faction: p.faction, color: new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex(), size: 0.3, radius: 0.6, life: 3, gravity: 18, trail: 0.6 });
        }
        for (let i = 0; i < 90; i++) {
          const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 21;
          g.arena.splat(Math.cos(ang) * rr, Math.sin(ang) * rr, 0, rand(0.5, 2), new THREE.Color().setHSL(Math.random(), 1, 0.6).multiplyScalar(1.3));
        }
        const kills = explode(g, p.pos, 30, 180, p, { color: 0xff6bd6, launch: 22, knock: 26, shake: 1.2 });
        g.fx.ring(p.pos, 1, 40, 1.1, 0xff6bd6);
        g.fx.ring(p.pos, 1, 32, 0.9, 0x6bd6ff);
        g.fx.text(c.clone().setY(c.y + 3), "✨ ART ✨", "#ffd23f", { size: 3, life: 1.6, rise: 2 });
        audio.play("airhorn");
        audio.play("vineboom");
        g.flash(0.8);
        g.slowmo(0.6, 0.25);
        g.climax(p.pos);
        g.score.add(kills * 150);
      }
      if (u.stage === 2 && u.t > 2.8) this.endUlt();
    } else {
      const giant = this.giant;
      if (giant && giant.phase === "fall") {
        g.setCine(_v.set(giant.pos.x, giant.ground + 14, giant.pos.z + 26), _v2.set(giant.pos.x, Math.max(giant.ground + 4, giant.pos.y * 0.4), giant.pos.z), 3);
      } else if (giant && giant.phase === "confused") {
        g.setCine(_v.set(giant.pos.x + 6, giant.ground + 9, giant.pos.z + 22), _v2.set(giant.pos.x, giant.ground + 7, giant.pos.z), 3);
      } else {
        this.endUlt();
      }
    }
  }

  private endUlt() {
    this.ult = null;
    this.g.cine = null;
    this.g.worldFreeze = false;
    ui().set({ letterbox: false, overlay: "none" });
    if (this.g.player) this.g.player.invuln = Math.max(this.g.player.invuln, 0.8);
  }
}

export type { DotRain };
