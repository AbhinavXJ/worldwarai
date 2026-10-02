import * as THREE from "three";
import type { Actor, Faction, Personality, Phase, Rig } from "./types";
import { FACTIONS, FACTION_INFO, SKILL_ISSUE_LINES, SURVIVE_SECONDS } from "./config";
import { Arena } from "./world";
import { FX } from "./particles";
import { Input } from "./input";
import { CameraRig } from "./camera";
import { Projectiles, damage, type Projectile } from "./combat";
import { Props, type PickupKind } from "./props";
import { Spawner } from "./spawning";
import { RandomEvents } from "./events";
import { Secrets } from "./secrets";
import { Abilities, type DotRain } from "./abilities";
import { separate, stepActor } from "./physics";
import { updateEnemyAI, lerpAngle, lineFor } from "./ai";
import { giveSign, makeUninterested, npcReact, setMood, updateNpc, dropSign } from "./npcs";
import { acquireRig, animateRig, buildRig, initFlashColors, kickSquash, releaseRig, setExpression, setFlash } from "./characters";
import { Score, titleFor } from "./scoring";
import { audio } from "./audio";
import { ui } from "./store";
import type { Obstacle } from "./world";
import { beat, setHype, updateBeat } from "./beat";
import { RIM } from "./characters";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _mv = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let nextId = 1;

const MARKER = {
  player: new THREE.Color(0xffffff).multiplyScalar(1.6),
  ally: new THREE.Color(0x6bff9a).multiplyScalar(1.2),
  dot: new THREE.Color(0x7df9e0).multiplyScalar(1.4),
  muse: new THREE.Color(0xff6bd6).multiplyScalar(1.4),
  grok: new THREE.Color(0xff6a2b).multiplyScalar(1.5),
};

const RIM_BASE: Record<Faction, number> = { dot: 0.55, muse: 0.6, grok: 1.0 };

const STREAKS: Record<number, string> = {
  2: "DOUBLE KILL",
  3: "TRIPLE KILL",
  4: "MEGA KILL",
  5: "OVERFITTED",
  6: "ULTRA KILL",
  8: "MODEL COLLAPSE",
  11: "AGI ACHIEVED (INTERNALLY)",
  15: "SOMEONE STOP THIS PERSON",
};

export interface DomRefs {
  flash?: HTMLElement | null;
  hurt?: HTMLElement | null;
  cursor?: HTMLElement | null;
  ui?: HTMLElement | null;
  edge?: HTMLElement | null;
  speed?: HTMLElement | null;
}

export class Game {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  arena = new Arena();
  fx: FX;
  input = new Input();
  camRig: CameraRig;
  projectiles: Projectiles;
  props: Props;
  spawner: Spawner;
  events: RandomEvents;
  secrets: Secrets;
  abilities: Abilities | null = null;
  dotRain?: DotRain;
  score = new Score();

  actors: Actor[] = [];
  npcs: Actor[] = [];
  player: Actor | null = null;
  playerFaction: Faction | null = null;
  phase: Phase = "boot";
  phaseT = 0;

  time = 0;
  runTime = 0;
  slowT = 0;
  slowScale = 1;
  hitstop = 0;
  worldSpeed = 1;
  playerSpeed = 1;
  worldFreeze = false;
  playerFrozen = false;
  gravityScale = 1;
  energy = 0;
  damageMult = 1;
  incomingMult = 0.85;
  difficulty = 1;
  secretMode = false;
  paused = false;

  aimPoint = new THREE.Vector3();
  aimDir = new THREE.Vector3(0, 0, -1);
  cine: { pos: THREE.Vector3; look: THREE.Vector3; smooth: number } | null = null;
  private cineStore = { pos: new THREE.Vector3(), look: new THREE.Vector3(), smooth: 3 };
  ceoLook: THREE.Vector3 | null = null;
  danger = { pos: new THREE.Vector3(), t: 99 };

  chroma = 0;
  private flashV = 0;
  private hurtV = 0;
  dom: DomRefs = {};

  // intro / select / attract
  introT = 0;
  private introStep = -1;
  private introRigs: { rig: Rig; pos: THREE.Vector3; vy: number; shown: boolean }[] = [];
  private reveal = 0;
  selectRigs: { rig: Rig; base: THREE.Vector3; y: number; vy: number; react: number; faction: Faction }[] = [];
  private lastHover: Faction | null = null;
  private selectT = -1;
  attract = false;
  private npcsShown = true;
  private streakN = 0;
  private streakT = -9;
  /** short bursts of extra hype from multi-kills and big moments */
  hypeKick = 0;
  /** 0..1 speed-line intensity, set by dashes, launch pads and ults */
  speedLines = 0;
  private attractGag = 4;
  private gagT = 20;
  private claudeSignDone = false;
  private uninterestedT = 25;

  // victory / death
  private endT = 0;
  private victoryDot: Rig | null = null;
  enemiesDance = false;

  private hudT = 0;
  private comboShown = -1;
  private comboT = 0;
  private stepT = 0;
  private jumboT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 60;
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.camRig = new CameraRig(camera);
    this.arena.build(scene);
    this.fx = new FX(this.arena);
    scene.add(this.fx.root);
    this.projectiles = new Projectiles(this);
    this.props = new Props(this);
    this.spawner = new Spawner(this);
    this.events = new RandomEvents(this);
    this.secrets = new Secrets(this);
    this.input.attach(el);
    this.buildNpcs();
    this.buildIntro();
    this.buildSelect();
    this.arena.setReveal(0);
    this.camRig.targetPos.set(0, 0.95, 3.4);
    this.camRig.targetLook.set(0, 0.7, 0);
    this.camRig.snap();
  }

  dispose() {
    this.input.detach();
  }

  // ================================================================ actors

  spawnActor(faction: Faction, pos: THREE.Vector3, o: { personality?: Personality; npc?: boolean; player?: boolean; scale?: number; rig?: Rig } = {}): Actor {
    const rig = o.rig ?? acquireRig(faction);
    if (!rig.root.userData.init) {
      initFlashColors(rig);
      rig.root.userData.init = true;
    }
    rig.root.position.copy(pos);
    rig.head.scale.setScalar(this.secretMode && !o.player ? 1.7 : 1);
    this.scene.add(rig.root);
    const info = FACTION_INFO[faction];
    const scale = o.scale ?? (o.player ? 1.3 : 1.2);
    const hpBase = o.player ? info.hp : faction === "grok" ? 46 : faction === "muse" ? 34 : 28;
    const hp = o.player ? hpBase : Math.round(hpBase * (1 + this.runTime / 220));
    const a: Actor = {
      id: nextId++, faction, isPlayer: !!o.player, isNpc: !!o.npc, rig, pos: pos.clone(), vel: new THREE.Vector3(), move: new THREE.Vector2(),
      knock: new THREE.Vector3(), yaw: Math.random() * Math.PI * 2, radius: info.radius * scale, hp, maxHp: hp, alive: true, dying: 0,
      grounded: false, airTime: 0, lastGroundY: 0, tumble: 0, tumbleAxis: new THREE.Vector3(1, 0, 0), tumbleAngle: 0, stun: 0, flash: 0,
      invuln: 0, speed: o.npc ? rand(2.6, 3.6) : info.speed, scale, personality: o.personality ?? "aggressive", state: "idle", stateTime: 0,
      think: Math.random() * 0.3, target: null, attackCd: rand(0.8, 2), wander: pos.clone(), telegraph: 0, dashT: 0, lastHitBy: null,
      mood: "wander", moodTime: rand(3, 8), phaseThrough: 0, bubbleCd: rand(2, 8), spawnT: 0, frozen: false, ally: false, shadowIdx: -1,
      ballistic: false, portalCd: 0, stepT: 0, action: "none", actionT: 0, lookAt: null, aim: new THREE.Vector3(), navT: 0, atkT: 9,
    };
    rig.root.scale.setScalar(scale);
    this.actors.push(a);
    if (a.isNpc) this.npcs.push(a);
    return a;
  }

  removeActor(a: Actor) {
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
    if (a.isNpc) {
      const j = this.npcs.indexOf(a);
      if (j >= 0) this.npcs.splice(j, 1);
    }
    dropSign(a);
    releaseRig(a.rig);
    if (a === this.player) this.player = null;
  }

  makeGhostActor(rig: Rig, ally: boolean): Actor {
    return {
      id: nextId++, faction: this.playerFaction ?? "grok", isPlayer: false, isNpc: false, rig, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      move: new THREE.Vector2(), knock: new THREE.Vector3(), yaw: 0, radius: 3, hp: 1e9, maxHp: 1e9, alive: true, dying: 0, grounded: true,
      airTime: 0, lastGroundY: 0, tumble: 0, tumbleAxis: new THREE.Vector3(), tumbleAngle: 0, stun: 0, flash: 0, invuln: 99, speed: 0, scale: 6,
      personality: "aggressive", state: "idle", stateTime: 0, think: 0, target: null, attackCd: 0, wander: new THREE.Vector3(), telegraph: 0,
      dashT: 0, lastHitBy: null, mood: "wander", moodTime: 0, phaseThrough: 0, bubbleCd: 0, spawnT: 0, frozen: false, ally, shadowIdx: -1,
      ballistic: false, portalCd: 0, stepT: 0, action: "none", actionT: 0, lookAt: null, aim: new THREE.Vector3(), navT: 0, atkT: 9,
    };
  }

  removeGhostActor(a: Actor) {
    a.alive = false;
  }

  private buildNpcs() {
    for (let i = 0; i < 16; i++) {
      const f = FACTIONS[i % 3];
      const p = this.arena.randomPointOnIsland(3, i < 12 ? 0 : 1 + (i % 5));
      const n = this.spawnActor(f, p, { npc: true, scale: 0.52 });
      n.grounded = true;
      n.pos.y = this.arena.groundAt(p.x, p.z, 20);
      n.wander.copy(n.pos);
    }
  }

  // ================================================================ intro

  private buildIntro() {
    const defs: [Faction, number, number, number][] = [
      ["dot", 0, 0, 0],
      ["dot", 1.15, 0, 0.25],
      ["muse", -1.5, 0, -0.6],
      ["grok", 2.6, 0, -1.1],
    ];
    for (const [f, x, y, z] of defs) {
      const rig = buildRig(f);
      initFlashColors(rig);
      rig.root.position.set(x, y + (this.introRigs.length === 0 ? 0 : 30), z);
      rig.root.visible = this.introRigs.length === 0;
      this.scene.add(rig.root);
      this.introRigs.push({ rig, pos: new THREE.Vector3(x, y, z), vy: 0, shown: this.introRigs.length === 0 });
    }
    this.introRigs[0].rig.root.scale.setScalar(0.001);
  }

  startIntro() {
    if (this.phase !== "boot") return;
    audio.init();
    audio.setMusic("ambient");
    this.setPhase("intro");
    this.introT = 0;
    audio.play("pop");
  }

  skipIntro() {
    audio.init();
    this.cleanupIntro();
    this.reveal = 1;
    this.arena.setReveal(1);
    this.arena.crowd.visible = false;
    this.startAttract();
    this.toSelect();
  }

  private cleanupIntro() {
    for (const r of this.introRigs) r.rig.root.removeFromParent();
    this.introStep = 99;
  }

  private updateIntro(dt: number) {
    this.introT += dt;
    const t = this.introT;
    const [A, B, M, R] = this.introRigs;
    const setStep = (n: number) => {
      if (this.introStep < n) {
        this.introStep = n;
        ui().set({ introStep: n });
        return true;
      }
      return false;
    };
    // dot A wakes up
    const s = Math.min(1, t / 0.5);
    A.rig.root.scale.setScalar(Math.max(0.001, s < 1 ? s * 1.2 : 1));
    A.rig.lookYaw = t > 4.2 ? 0.9 : Math.sin(t * 0.8) * 0.2;
    if (t > 0.6 && setStep(1)) audio.play("beep");
    if (t > 3.8 && !B.shown) {
      B.shown = true;
      B.rig.root.visible = true;
      B.rig.root.position.y = 8;
      B.vy = -16;
      B.rig.root.rotation.y = -0.7;
    }
    if (t > 4.2 && setStep(2)) {
      setExpression(A.rig.face, "surprised", 2.5);
    }
    if (t > 5.6 && !M.shown) {
      M.shown = true;
      M.rig.root.visible = true;
      M.rig.root.position.copy(M.pos);
      M.rig.root.rotation.y = 0.4;
      this.fx.beam(M.pos.clone().setY(30), M.pos, 0.8, 0x8f7bff, 0.6, 1.4);
      this.fx.burst(M.pos.clone().setY(1), 0xff6bd6, 30, 6, { size: 0.6 });
      audio.play("sparkle");
      setExpression(M.rig.face, "smug", 3);
    }
    if (t > 6.3 && !R.shown) {
      R.shown = true;
      R.rig.root.visible = true;
      R.rig.root.position.set(R.pos.x, 10, R.pos.z);
      R.vy = -22;
      R.rig.root.rotation.y = -0.5;
    }
    for (const r of [B, R]) {
      if (!r.shown || r.vy === 0) continue;
      r.vy -= 40 * dt;
      r.rig.root.position.y += r.vy * dt;
      if (r.rig.root.position.y <= 0) {
        r.rig.root.position.y = 0;
        r.vy = 0;
        kickSquash(r.rig, 12);
        audio.play(r === R ? "bonk" : "land");
        this.fx.ring(r.pos, 0.2, 1.6, 0.4, 0xffffff);
        if (r === R) {
          r.rig.fallTimer = 1.6;
          this.fx.bubble(r.rig.root, "lol.", 2.1, 1.6, 0.6);
          audio.play("lol");
        } else this.fx.bubble(r.rig.root, "beep.", 1.8, 1.4, 0.5);
      }
    }
    for (const r of this.introRigs) {
      if (!r.shown) continue;
      animateRig(r.rig, { speed: 0, grounded: r.vy === 0, vy: r.vy, action: "none", actionT: 0, t: this.time }, dt);
    }
    // camera: intimate, then the big pull back
    const pull = THREE.MathUtils.clamp((t - 7.4) / 5.2, 0, 1);
    const e = ease(pull);
    if (t > 7.4 && setStep(3)) {
      this.arena.crowd.visible = true;
      audio.setMusic("title");
      audio.play("whistleDown");
    }
    if (t > 8.6 && !this.attract) this.startAttract();
    if (pull > 0) {
      this.reveal = Math.min(1, (t - 7.4) / 3.2);
      this.arena.setReveal(this.reveal);
      this.arena.updateCrowd(this.time, this.reveal * 1.2);
    }
    const close = _v.set(0.4, 0.95, 3.4 + t * 0.06);
    const far = _v2.set(0, 25, 46);
    this.camRig.targetPos.lerpVectors(close, far, e);
    this.camRig.targetLook.lerpVectors(new THREE.Vector3(0.4, 0.75, 0), new THREE.Vector3(0, 0, -6), e);
    this.camRig.smooth = 10;
    this.camRig.lookSmooth = 10;
    if (t > 12.6 && setStep(4)) {
      audio.play("title");
      this.camRig.shake(0.7);
      this.flash(0.5);
    }
    if (t > 12.6) this.camRig.targetPos.x = Math.sin((t - 12.6) * 0.15) * 6;
    if (t > 16.2) {
      this.cleanupIntro();
      this.arena.crowd.visible = false;
      this.toSelect();
    }
  }

  // ================================================================ attract mode (title background war)

  private startAttract() {
    this.attract = true;
    for (let i = 0; i < 12; i++) this.spawnAttractFighter();
  }

  private spawnAttractFighter() {
    const f = FACTIONS[Math.floor(Math.random() * 3)];
    const p = this.arena.randomPointOnIsland(0, 0);
    const a = this.spawner.spawn(f, p, Math.random() < 0.7 ? "menace" : Math.random() < 0.5 ? "idiot" : "confused");
    if (a) a.hp = a.maxHp = 60;
  }

  private updateAttract(dt: number) {
    const fighters = this.actors.filter((a) => a.alive && !a.isNpc && !a.isPlayer);
    if (fighters.length < 12 && Math.random() < dt * 2) this.spawnAttractFighter();
    this.attractGag -= dt;
    if (this.attractGag > 0) return;
    this.attractGag = rand(5, 8);
    const r = Math.random();
    const muse = fighters.find((a) => a.faction === "muse");
    const grok = fighters.find((a) => a.faction === "grok" && a.grounded && muse && a.pos.distanceTo(muse.pos) < 14);
    if (r < 0.55 && muse && grok) {
      // the muse yeets a grok bot off the screen. it comes back.
      muse.yaw = Math.atan2(grok.pos.x - muse.pos.x, grok.pos.z - muse.pos.z);
      muse.atkT = 0;
      const from = muse.pos.clone().setY(muse.pos.y + 1.1);
      const dir = grok.pos.clone().setY(grok.pos.y + 0.8).sub(from).normalize();
      this.projectiles.fire({ kind: "spark", pos: from, vel: dir.multiplyScalar(22), dmg: 0.01, owner: muse, faction: "muse", color: 0xff6bd6, size: 0.25, radius: 0.7, life: 1.5, homing: grok, homingStr: 10, trail: 1, wobble: 1 });
      audio.play("spark");
      const target = grok;
      setTimeout(() => {
        if (!target.alive) return;
        _v.set(target.pos.x - muse.pos.x, 0, target.pos.z - muse.pos.z).normalize();
        target.knock.set(_v.x * 26, 0, _v.z * 26);
        target.vel.y = 26;
        target.grounded = false;
        target.tumble = 1;
        target.tumbleAxis.set(1, 0, 0.4).normalize();
        setExpression(target.rig.face, "surprised", 3);
        this.fx.bubble(target.rig.root, "AAAAA", 2, 1.2, 0.8);
        audio.play("whistle");
        this.fx.burst(target.pos.clone().setY(target.pos.y + 1), 0xff6bd6, 24, 8, { size: 0.6 });
      }, 550);
    } else {
      // a tiny dot flies across the screen
      const dot = this.npcs.find((n) => n.faction === "dot" && n.grounded) ?? fighters.find((a) => a.faction === "dot");
      if (dot) {
        const look = this.camRig.look;
        dot.pos.set(look.x - 18, Math.max(2, look.y + 3), look.z + rand(-2, 4));
        dot.vel.set(34, 9, rand(-2, 2));
        dot.ballistic = true;
        dot.grounded = false;
        dot.tumble = 1;
        dot.tumbleAxis.set(0, 0, 1);
        this.fx.bubble(dot.rig.root, "wheeee", 1.2, 1.4, 0.6);
        audio.play("whistle");
      }
    }
  }

  // ================================================================ select

  private buildSelect() {
    const st = this.arena.selectStage;
    FACTIONS.forEach((f, i) => {
      const rig = buildRig(f);
      initFlashColors(rig);
      const base = st.position.clone().add(this.arena.selectPlatforms[i].position);
      rig.root.position.copy(base);
      rig.root.visible = false;
      rig.root.scale.setScalar(f === "dot" ? 1.25 : 1);
      this.scene.add(rig.root);
      this.selectRigs.push({ rig, base, y: 0, vy: 0, react: 0, faction: f });
    });
  }

  toSelect() {
    this.clearRun(false);
    if (!this.attract) this.startAttract();
    this.setPhase("select");
    this.selectT = -1;
    this.arena.selectStage.visible = true;
    for (const s of this.selectRigs) {
      s.rig.root.visible = true;
      s.y = 0;
      s.vy = 0;
      s.rig.root.scale.setScalar(s.faction === "dot" ? 1.25 : 1);
    }
    ui().set({ selected: null, hoverFaction: null, result: null, letterbox: false, overlay: "none" });
    audio.setMusic("title");
  }

  hoverFromScene() {
    if (this.phase !== "select" || this.input.usingTouch) return;
    this.raycaster.setFromCamera(this.input.mouse, this.camera);
    let hit: Faction | null = null;
    for (const s of this.selectRigs) {
      _v.copy(s.base).setY(s.base.y + 0.9);
      if (this.raycaster.ray.distanceSqToPoint(_v) < 1.3) hit = s.faction;
    }
    const cur = ui().hoverFaction;
    if (hit !== cur && (hit || this.lastHoverFromScene)) {
      ui().set({ hoverFaction: hit });
      this.lastHoverFromScene = !!hit;
    }
    if (hit && this.input.consume("mouse0")) this.select(hit);
  }
  private lastHoverFromScene = false;

  private react(s: (typeof this.selectRigs)[number]) {
    s.react = 1.4;
    const r = s.rig;
    if (s.faction === "dot") {
      s.vy = 6;
      setExpression(r.face, "happy", 1.2);
      audio.play("beep");
    } else if (s.faction === "muse") {
      r.poseTimer = 1.4;
      setExpression(r.face, "smug", 1.4);
      audio.play("sparkle");
      this.fx.burst(s.base.clone().setY(s.base.y + 1.5), 0xff6bd6, 16, 4, { size: 0.4, shape: 1 });
    } else {
      r.fallTimer = 1.6;
      setExpression(r.face, "happy", 1.6);
      audio.play("lol");
    }
    audio.play("hover");
  }

  select(f: Faction) {
    if (this.phase !== "select" || this.selectT >= 0) return;
    audio.init();
    this.selectT = 0;
    const s = this.selectRigs.find((x) => x.faction === f)!;
    s.vy = 13;
    kickSquash(s.rig, -12);
    setExpression(s.rig.face, "happy", 3);
    const p = s.base.clone().setY(s.base.y + 1);
    this.fx.burst(p, FACTION_INFO[f].color, 70, 12, { size: 0.8, life: 0.9 });
    this.fx.starBurst(p, [FACTION_INFO[f].color, 0xffffff, 0xffd23f], 30, 10);
    this.fx.confetti(p, 50, 6, 10);
    this.fx.ring(s.base, 0.3, 5, 0.6, FACTION_INFO[f].color);
    this.camRig.shake(0.35);
    audio.play("select");
    audio.play("airhorn");
    ui().set({ selected: f, faction: f });
  }

  private updateSelect(dt: number) {
    const hover = ui().hoverFaction;
    if (hover !== this.lastHover) {
      this.lastHover = hover;
      const s = this.selectRigs.find((x) => x.faction === hover);
      if (s && this.selectT < 0) this.react(s);
    }
    this.hoverFromScene();
    for (const s of this.selectRigs) {
      s.vy -= 30 * dt;
      s.y += s.vy * dt;
      if (s.y <= 0) {
        if (s.vy < -4) kickSquash(s.rig, 8);
        s.y = 0;
        s.vy = 0;
        if (s.faction === "dot" && Math.random() < dt * 0.6 && this.selectT < 0) s.vy = 4;
      }
      const r = s.rig;
      r.root.position.set(s.base.x, s.base.y + s.y, s.base.z);
      // characters face the camera, mostly
      const toCam = Math.atan2(this.camera.position.x - s.base.x, this.camera.position.z - s.base.z);
      r.root.rotation.y = toCam + Math.sin(this.time * 0.6 + s.base.x) * 0.25;
      if (s.faction === "muse") {
        // the judging look
        const judge = Math.sin(this.time * 0.5) > 0.3;
        r.lookYaw = judge ? -Math.sin(this.time * 0.6 + s.base.x) * 0.25 : 0.5;
        if (judge && r.face.expr === "neutral") setExpression(r.face, "smug", 1.5);
      }
      if (s.faction === "grok" && r.fallTimer <= 0 && Math.random() < dt * 0.18 && this.selectT < 0) {
        r.fallTimer = 1.6;
        audio.play("bonk");
      }
      if (r.poseTimer > 0) r.poseTimer -= dt;
      const sel = ui().selected === s.faction;
      animateRig(r, { speed: 0, grounded: s.y <= 0, vy: s.vy, action: r.poseTimer > 0 ? "pose" : sel ? "cheer" : "none", actionT: 1.4 - r.poseTimer, t: this.time }, dt);
    }
    // camera: three heroes, the war behind them
    const st = this.arena.selectStage.position;
    const hx = hover === "dot" ? -1 : hover === "grok" ? 1 : 0;
    this.camRig.targetPos.set(st.x + hx * 0.8 + Math.sin(this.time * 0.2) * 0.4, st.y + 2.5, st.z + 8.6);
    this.camRig.targetLook.set(st.x + hx * 1.2, st.y + 0.9, st.z);
    this.camRig.smooth = this.phaseT < 2 ? 2.2 : 4;
    this.camRig.lookSmooth = this.phaseT < 2 ? 2.5 : 5;
    if (this.selectT >= 0) {
      this.selectT += dt;
      if (this.selectT > 1.9) this.startRun(ui().selected!);
    }
  }

  // ================================================================ run lifecycle

  private clearRun(keepNpcs = true) {
    for (const a of [...this.actors]) if (!a.isNpc) this.removeActor(a);
    this.player = null;
    this.projectiles.clear();
    this.props.clear();
    this.fx.clear();
    this.arena.clearPaint();
    this.events.reset();
    this.secrets.reset();
    this.spawner.reset();
    this.abilities?.reset(this.playerFaction ?? "dot");
    this.score.reset();
    this.energy = 0;
    this.runTime = 0;
    this.worldFreeze = false;
    this.playerFrozen = false;
    this.worldSpeed = 1;
    this.playerSpeed = 1;
    this.gravityScale = 1;
    this.secretMode = false;
    this.enemiesDance = false;
    this.cine = null;
    this.ceoLook = null;
    this.slowT = 0;
    this.difficulty = 1;
    this.arena.art = 0;
    this.arena.moonFace.visible = false;
    this.comboShown = -1;
    if (this.victoryDot) {
      this.victoryDot.root.removeFromParent();
      this.victoryDot = null;
    }
    for (const n of this.npcs) {
      n.frozen = false;
      n.lookAt = null;
      n.mood = "wander";
      n.moodTime = rand(3, 8);
      n.rig.head.scale.setScalar(1);
      if (!keepNpcs || !this.arena.walkable(n.pos.x, n.pos.z)) {
        const p = this.arena.randomPointOnIsland(3, 0);
        n.pos.copy(p);
      }
    }
    ui().set({ letterbox: false, overlay: "none", combo: { id: 0, count: 0, msg: null } });
  }

  startRun(f: Faction) {
    audio.init();
    this.attract = false;
    this.clearRun(true);
    this.playerFaction = f;
    this.arena.selectStage.visible = false;
    for (const s of this.selectRigs) s.rig.root.visible = false;
    if (!this.abilities) this.abilities = new Abilities(this, f);
    this.abilities.reset(f);
    const p = this.spawnActor(f, new THREE.Vector3(0, 34, 4), { player: true });
    this.player = p;
    p.vel.y = -30;
    p.invuln = 2;
    p.yaw = Math.PI;
    this.fx.beam(new THREE.Vector3(0, 60, 4), new THREE.Vector3(0, 0, 4), 1.2, FACTION_INFO[f].color, 1.4, 1.5);
    this.setPhase("deploying");
    ui().set({ faction: f, result: null, selected: null });
    ui().showBanner("DEPLOYING " + FACTION_INFO[f].name, "survive the chaos.", "info");
    audio.setMusic("battle");
    audio.setIntensity(0.3);
    audio.play("whistleDown");
  }

  // ================================================================ hooks

  setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    ui().setPhase(p);
  }

  setCine(pos: THREE.Vector3, look: THREE.Vector3, smooth: number) {
    this.cineStore.pos.copy(pos);
    this.cineStore.look.copy(look);
    this.cineStore.smooth = smooth;
    this.cine = this.cineStore;
  }

  slowmo(dur: number, scale: number) {
    if (this.slowT > dur && this.slowScale <= scale) return;
    this.slowT = dur;
    this.slowScale = scale;
    audio.play("slowmo");
  }

  flash(v: number) {
    this.flashV = Math.max(this.flashV, v);
    this.chroma = Math.max(this.chroma, v);
  }

  onPlayerHit(target: Actor, amt: number, at: THREE.Vector3) {
    const msg = this.score.hit();
    this.energy = Math.min(100, this.energy + amt * 0.11);
    if (amt >= 8) this.fx.text(at.clone().setY(at.y + 0.4), `${Math.round(amt)}`, amt >= 30 ? "#ffd23f" : "#ffffff", { size: amt >= 30 ? 0.8 : 0.5, life: 0.55, rise: 2.4, drift: true });
    if (amt >= 30) this.hitstop = Math.max(this.hitstop, 0.045);
    this.danger.pos.copy(target.pos);
    this.danger.t = 0;
    if (msg) {
      audio.play("combo", this.score.combo);
      this.pushCombo(true);
      if (this.score.combo >= 50) audio.play("airhorn");
    }
  }

  onPlayerDamaged(amt: number) {
    const p = this.player!;
    this.hurtV = Math.min(1, this.hurtV + 0.35 + amt * 0.03);
    this.camRig.shake(0.22 + amt * 0.015);
    this.chroma = Math.max(this.chroma, 0.4);
    audio.play("hurt");
    setExpression(p.rig.face, "hurt", 0.4);
    p.invuln = Math.max(p.invuln, 0.12);
  }

  /** a ring of fireworks just above the action for the biggest moments */
  climax(at: THREE.Vector3) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.arena.spectacle.firework(_v.set(at.x + Math.cos(a) * 10, at.y + 2 + Math.random() * 4, at.z + Math.sin(a) * 7 - 5), undefined, 0.55);
    }
    for (let i = 0; i < 4; i++) this.arena.spectacle.firework();
    this.arena.shockwave(at.x, at.z, 2);
    this.hypeKick = 1;
    this.chroma = Math.max(this.chroma, 0.8);
  }

  onKill(t: Actor, src: Actor | null) {
    const fromPlayer = !!src && (src.isPlayer || src.ally);
    if (t.isPlayer) {
      this.playerDied();
      return;
    }
    const at = t.pos.clone().setY(t.pos.y + t.rig.height * 0.6);
    this.arena.shockwave(t.pos.x, t.pos.z, fromPlayer ? 0.8 : 0.4);
    if (fromPlayer && this.phase === "playing") {
      this.streakN = this.runTime - this.streakT < 1.8 ? this.streakN + 1 : 1;
      this.streakT = this.runTime;
      const name = STREAKS[this.streakN];
      if (name) {
        ui().set({ announce: { id: (ui().announce?.id ?? 0) + 1, text: name, n: this.streakN } });
        if (this.streakN >= 3) audio.play("airhorn");
        this.arena.spectacle.firework();
        this.arena.spectacle.firework();
        this.chroma = Math.max(this.chroma, 0.5);
        this.hypeKick = Math.min(1, this.hypeKick + 0.25 * this.streakN);
      }
      const v = this.score.kill(t.personality === "menace" ? 40 : 0);
      this.energy = Math.min(100, this.energy + 6);
      this.fx.text(at.clone().setY(at.y + 0.8), `+${v}`, "#ffd23f", { size: 0.75, life: 0.9, rise: 2 });
      audio.play("kill");
      this.camRig.shake(0.12);
      this.hitstop = Math.max(this.hitstop, 0.03);
      this.props.dropOrbs(t.pos, 2 + Math.floor(Math.random() * 2));
      const r = Math.random();
      if (r < 0.07) this.props.spawnPickup("crate", t.pos);
      else if (r < 0.1) this.props.spawnPickup("gpu", t.pos);
      else if (r < 0.13) this.props.spawnPickup("jar", t.pos);
      for (const n of this.npcs) if (n.faction === this.playerFaction && n.pos.distanceTo(t.pos) < 14 && Math.random() < 0.5) setMood(n, "cheer", rand(1, 2));
    } else if (this.phase === "playing" && this.player && t.pos.distanceTo(this.player.pos) < 22) {
      this.score.add(25);
      this.fx.text(at.clone().setY(at.y + 0.8), "+25 CHAOS", "#c9b8ff", { size: 0.5, life: 0.8 });
    }
    for (const n of this.npcs) if (Math.random() < 0.5) npcReact(this, n, t.pos, false);
  }

  private pop(a: Actor) {
    const info = FACTION_INFO[a.faction];
    const at = a.pos.clone().setY(a.pos.y + a.rig.height * 0.55 * a.scale);
    this.fx.defeatPop(at, [info.color, info.accent, 0xffffff, 0xffd23f], a.scale);
    const emo = ["💀", "😵", "✨", "💥", "🫠", "😂", "⭐"][Math.floor(Math.random() * 7)];
    this.fx.emoji(at.clone().setY(at.y + 0.6), emo, 0.9, 0.9);
    audio.play("squeak");
    audio.play("pop");
    if (a.faction === "grok" && Math.random() < 0.35) {
      this.fx.text(at.clone().setY(at.y + 1.3), SKILL_ISSUE_LINES[Math.floor(Math.random() * SKILL_ISSUE_LINES.length)], "#ffffff", { size: 0.7, life: 2.2, rise: 0.5 });
    }
    this.removeActor(a);
  }

  onObstacleHit(a: Actor, ob: Obstacle, speed: number) {
    if (a.isPlayer || !a.alive) return;
    if (a.personality === "idiot" || speed > 14) {
      a.stun = 1.4;
      a.state = "stunned";
      a.knock.set((a.pos.x - ob.x) * 4, 0, (a.pos.z - ob.z) * 4);
      setExpression(a.rig.face, "dead", 1.4);
      kickSquash(a.rig, 10);
      this.fx.text(a.pos.clone().setY(a.pos.y + a.rig.height + 0.4), "BONK", "#ffffff", { size: 0.7, life: 0.7 });
      this.fx.emoji(a.pos.clone().setY(a.pos.y + a.rig.height + 0.2), "💫", 0.6, 1.2);
      this.fx.ring(a.pos.clone().setY(a.pos.y + 0.8), 0.2, 1.2, 0.25, 0xffffff, 0);
      if (this.player && a.pos.distanceTo(this.player.pos) < 25) audio.play("bonk");
      if (a.personality === "idiot") {
        a.aim.multiplyScalar(-1);
        a.state = "idle";
      }
    }
  }

  onFallOut(a: Actor) {
    if (a.isPlayer) {
      if (this.phase === "playing") this.secrets.enterLatent();
      else {
        a.pos.set(0, 20, 0);
        a.vel.set(0, 0, 0);
      }
      return;
    }
    if (a.isNpc || (this.attract && a.alive)) {
      // they always come back
      const p = this.arena.randomPointOnIsland(4, 0);
      a.pos.set(p.x, 28, p.z);
      a.vel.set(0, -10, 0);
      a.knock.set(0, 0, 0);
      a.ballistic = false;
      a.tumble = 0;
      this.fx.bubble(a.rig.root, ["i'm back", "what did i miss", "again?"][Math.floor(Math.random() * 3)], a.rig.height * a.scale + 0.6, 1.6);
      return;
    }
    if (a.alive) {
      const credit = a.lastHitBy?.isPlayer || a.lastHitBy?.ally;
      if (credit && this.phase === "playing") {
        const v = this.score.kill(60);
        this.score.hit();
        this.pushCombo(false);
        if (this.player) this.fx.text(this.player.pos.clone().setY(this.player.pos.y + 2.8), `RING OUT! +${v}`, "#ffd23f", { size: 0.8, life: 1.2 });
        audio.play("whistleDown");
      }
    }
    this.removeActor(a);
  }

  onRainLand(p: Projectile) {
    void p;
  }

  onPickup(kind: PickupKind, pos: THREE.Vector3) {
    const p = this.player;
    if (!p) return;
    this.score.add(100);
    if (kind === "crate") {
      p.hp = Math.min(p.maxHp, p.hp + 35);
      this.fx.text(pos.clone().setY(pos.y + 2), "+35 HP", "#ff8fb0", { size: 0.8, life: 1 });
    } else if (kind === "gpu") {
      this.abilities!.rapid = 8;
      this.fx.text(pos.clone().setY(pos.y + 2), "GPU BOOST: RAPID FIRE", "#76ff6b", { size: 0.8, life: 1.2 });
      ui().showBanner("GPU ACQUIRED", "rapid fire for 8 seconds. jensen would be proud.", "info");
    } else if (kind === "jar") {
      this.energy = Math.min(100, this.energy + 50);
      this.fx.text(pos.clone().setY(pos.y + 2), "+50 ENERGY", "#7df9ff", { size: 0.8, life: 1 });
    } else if (kind === "golden") {
      this.secrets.unlockSecretMode();
    }
  }

  onOrb(v: number) {
    this.energy = Math.min(100, this.energy + v);
    audio.play("orb", this.energy / 10);
    if (this.player) this.fx.spark(this.player.pos.clone().setY(this.player.pos.y + 0.9), 0x7df9ff, 0.8, 0.15);
  }

  threatNear(a: Actor, r: number) {
    for (const p of this.projectiles.list) {
      if (!p.active || !p.owner?.isPlayer) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      if (dx * dx + dz * dz > r * r) continue;
      if (dx * p.vel.x + dz * p.vel.z > 0) return true;
    }
    return false;
  }

  private playerDied() {
    const p = this.player!;
    this.setPhase("dying");
    this.endT = 0;
    this.abilities?.reset(p.faction);
    this.events.end(true);
    this.slowT = 2.2;
    this.slowScale = 0.25;
    p.rig.fallTimer = 0;
    p.rig.fall = 0;
    setExpression(p.rig.face, "dead", 99);
    audio.play("slowmo");
    audio.play("whistleDown");
    audio.setIntensity(0);
    ui().set({ letterbox: true });
    this.fx.defeatPop(p.pos.clone().setY(p.pos.y + 0.8), [FACTION_INFO[p.faction].color, 0xffffff], 0.6);
  }

  private finishRun(won: boolean) {
    const p = this.player;
    const result = {
      faction: this.playerFaction!,
      score: Math.round(this.score.score),
      kills: this.score.kills,
      time: this.runTime,
      bestCombo: this.score.bestCombo,
      title: titleFor(this.score.score),
      won,
    };
    ui().set({ result, letterbox: false });
    try {
      const best = Number(localStorage.getItem("amb.best") || 0);
      if (result.score > best) localStorage.setItem("amb.best", String(result.score));
    } catch {}
    void p;
  }

  private startVictory() {
    this.setPhase("victory");
    this.endT = 0;
    this.events.end(true);
    this.abilities?.reset(this.playerFaction!);
    this.projectiles.clear();
    audio.setMusic("victory");
    audio.play("victory");
    audio.play("airhorn");
    ui().set({ letterbox: true });
    for (const a of this.actors) {
      if (a.isPlayer) continue;
      a.frozen = true;
      a.lookAt = null;
      if (a.isNpc) setMood(a, "celebrate", 99);
    }
    this.score.add(5000);
  }

  // ================================================================ main loop

  update(rawDt: number) {
    const realDt = Math.min(0.05, rawDt);
    this.fpsAcc += rawDt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsN / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (this.input.consume("escape", "p") && this.phase === "playing") {
      this.paused = !this.paused;
      ui().set({ paused: this.paused });
    }
    if (this.paused) {
      this.input.endFrame();
      this.camRig.update(0, this.time);
      return;
    }
    let scale = 1;
    if (this.slowT > 0) {
      this.slowT -= realDt;
      scale = this.slowScale;
      audio.muffle(0.5);
      if (this.slowT <= 0) audio.muffle(0);
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      scale = Math.min(scale, 0.05);
    }
    const dt = realDt * scale;
    this.time += dt;
    this.phaseT += realDt;
    this.danger.t += dt;
    this.updateHype(realDt);

    switch (this.phase) {
      case "boot":
        this.updateBoot(realDt);
        break;
      case "intro":
        this.updateIntro(realDt);
        break;
      case "select":
        this.updateSelect(realDt);
        break;
      case "deploying":
        if (this.player && this.player.grounded && this.phaseT > 0.6) {
          this.setPhase("playing");
          ui().showBanner("SURVIVE THE CHAOS", `last ${Math.round(SURVIVE_SECONDS / 60)} minutes. the internet is counting on you.`, "event");
          this.camRig.shake(0.4);
          this.fx.ring(this.player.pos, 0.4, 7, 0.6, FACTION_INFO[this.player.faction].color);
          this.arena.shockwave(this.player.pos.x, this.player.pos.z, 1.5);
          this.hypeKick = 0.6;
          audio.play("stomp");
        }
        break;
      case "playing":
        this.runTime += dt;
        this.difficulty = 1 + Math.min(0.6, this.runTime / 300);
        this.score.add(10 * dt);
        if (this.runTime >= SURVIVE_SECONDS) this.startVictory();
        break;
      case "dying":
        this.endT += realDt;
        if (this.endT > 2.4) {
          this.setPhase("dead");
          this.finishRun(false);
          audio.play("defeat");
          audio.setMusic("ambient");
          this.enemiesDance = true;
        }
        break;
      case "victory":
        this.updateVictory(realDt);
        break;
    }

    if (this.attract) this.updateAttract(dt);
    if (this.player && (this.phase === "playing" || this.phase === "deploying")) this.updatePlayer(dt);
    this.abilities?.update(dt * (this.worldFreeze && !this.abilities.busy ? 0 : 1));

    const actorDt = this.worldFreeze ? 0 : dt * this.worldSpeed;
    this.updateActors(dt, actorDt);
    if (!this.worldFreeze) {
      this.projectiles.update(dt * this.worldSpeed);
    } else this.projectiles.update(0);
    this.props.update(dt, this.time);
    this.spawner.update(dt);
    this.events.update(realDt);
    this.secrets.update(dt);
    this.score.tick(dt);
    this.updateGags(dt);

    this.fx.update(dt);
    this.arena.update(dt, this.time, this.camera);
    if (this.phase !== "intro" && this.phase !== "boot" && this.reveal < 1) {
      this.reveal = 1;
      this.arena.setReveal(1);
    }
    this.npcsShown = this.reveal > 0.15;
    this.updateCamera(realDt);
    this.updateDom(realDt);
    this.pushHud(realDt);
    this.updateMusic();
    this.input.endFrame();
  }

  private updateHype(dt: number) {
    updateBeat(this.time, dt);
    this.hypeKick = Math.max(0, this.hypeKick - dt * 0.35);
    let h = 0.1;
    const p = this.player;
    if (this.phase === "playing" || this.phase === "deploying") {
      h = 0.18 + Math.min(0.45, this.score.combo / 60) + this.hypeKick;
      if (this.abilities?.busy) h += 0.6;
      if (this.runTime > SURVIVE_SECONDS - 30) h += 0.3;
      if (this.worldSpeed > 1 || this.worldFreeze) h += 0.25;
    } else if (this.phase === "victory") h = 1;
    else if (this.phase === "select") h = 0.4 + (ui().selected ? 0.6 : 0);
    else if (this.phase === "intro") h = this.reveal * 0.45;
    setHype(h);
    for (const f of FACTIONS) RIM[f].strength.value = RIM_BASE[f] * (0.75 + beat.pulse * 0.5 + beat.hype * 0.5);
    if (p && p.alive) this.arena.floor.player.copy(p.pos);
    else this.arena.floor.player.set(0, -99, 0);

    let sl = 0;
    if (p && (this.phase === "playing" || this.phase === "deploying")) {
      if (this.abilities && this.abilities.dashT > 0) sl = 0.85;
      if (p.ballistic || (this.phase === "deploying" && !p.grounded)) sl = 1;
      if (this.abilities?.busy) sl = Math.max(sl, 0.45);
    }
    this.speedLines += (sl - this.speedLines) * Math.min(1, dt * (sl > this.speedLines ? 14 : 4));
  }

  private updateBoot(dt: number) {
    const A = this.introRigs[0];
    const pulse = 0.25 + Math.sin(this.time * 3) * 0.05;
    A.rig.root.scale.setScalar(pulse);
    animateRig(A.rig, { speed: 0, grounded: true, vy: 0, action: "none", actionT: 0, t: this.time }, dt);
    this.camRig.targetPos.set(0, 0.32, 3.4);
    this.camRig.targetLook.set(0, 0.22, 0);
    this.camRig.smooth = 10;
    this.camRig.lookSmooth = 10;
    this.time += dt;
    if (this.input.consume("mouse0", " ", "enter")) this.startIntro();
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number) {
    const p = this.player!;
    if (!p.alive) return;
    const ab = this.abilities!;
    const pdt = dt;
    p.action = "none";

    // aim: mouse on a plane at the player's height, or auto-aim on touch
    const touch = this.input.usingTouch;
    if (!touch) {
      this.raycaster.setFromCamera(this.input.mouse, this.camera);
      this.aimPlane.constant = -(p.pos.y + 0.7);
      if (this.raycaster.ray.intersectPlane(this.aimPlane, _v)) this.aimPoint.copy(_v);
    } else {
      let best: Actor | null = null;
      let bd = 18 * 18;
      for (const a of this.actors) {
        if (!a.alive || a.isNpc || a.isPlayer || a.ally) continue;
        const d = a.pos.distanceToSquared(p.pos);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) this.aimPoint.copy(best.pos);
      else if (p.move.lengthSq() > 0.1) this.aimPoint.set(p.pos.x + p.move.x, p.pos.y, p.pos.z + p.move.y);
    }
    _v.subVectors(this.aimPoint, p.pos).setY(0);
    if (_v.lengthSq() > 0.04) this.aimDir.copy(_v.normalize());

    const frozen = this.playerFrozen || ab.busy && ab.ult?.kind === "muse" && (ab.ult?.stage ?? 0) < 2;
    const mv = this.input.moveVector(_mv);
    const sp = p.speed * this.playerSpeed * (ab.rapid > 0 ? 1.08 : 1);
    if (frozen) p.move.set(0, 0);
    else p.move.set(mv.x * sp, mv.y * sp);
    const moved = mv.lengthSq() > 0.01;

    if (!frozen && this.phase === "playing") {
      for (const c of this.input.clicks) this.secrets.tryMoonClick(c);
      if ((this.input.primary || this.input.touchFire) && !ab.busy) ab.primary();
      if (this.input.consume("mouse2", "special") && !ab.busy) ab.special();
      if (this.input.consume(" ", "shift", "dash") && !ab.busy) ab.dash(_v2.set(p.move.x, 0, p.move.y));
      if (this.input.consume("q", "ult")) {
        if (!ab.ultimate() && this.energy < 100) {
          this.fx.text(p.pos.clone().setY(p.pos.y + 2.2), "not enough energy", "#ffffff", { size: 0.5, life: 0.7 });
          audio.play("click");
        }
      }
      if (this.input.consume("e", "interact")) this.interact();
    }
    if (ab.dashT > 0) p.move.set(p.vel.x, p.vel.z);
    this.secrets.updateStill(pdt, moved || this.input.primary || ab.busy);

    // face where we aim (twin-stick)
    if (ab.dashT <= 0) p.yaw = lerpAngle(p.yaw, Math.atan2(this.aimDir.x, this.aimDir.z), Math.min(1, pdt * 16));
    if (ab.dashT > 0) p.action = "dash";

    // footsteps and passive energy
    if (moved && p.grounded) {
      this.stepT -= pdt;
      if (this.stepT <= 0) {
        this.stepT = 0.26;
        audio.play("footstep");
        if (Math.random() < 0.4) this.fx.pixelBurst(p.pos, [0xffffff, 0xd9c8ff], 2, 1.5, 0.06, 1.5);
      }
    }
    this.energy = Math.min(100, this.energy + pdt * 0.7);
    if (p.invuln > 0) p.invuln -= pdt;

    // happy face on big combos
    if (this.score.combo > 20 && p.rig.face.expr === "neutral") setExpression(p.rig.face, "happy", 0.5);
  }

  private interact() {
    const p = this.player!;
    const pk = this.props.nearestPickup(p.pos);
    if (pk) {
      this.props.collect(pk);
      return;
    }
    let best: Actor | null = null;
    let bd = 3.2 * 3.2;
    for (const n of this.npcs) {
      const d = n.pos.distanceToSquared(p.pos);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) {
      setMood(best, "selfie", 2.2);
      best.yaw = Math.atan2(p.pos.x - best.pos.x, p.pos.z - best.pos.z) + Math.PI;
      this.fx.bubble(best.rig.root, "📸 omg hi", best.rig.height * best.scale + 0.5, 1.6);
      this.score.add(50);
      audio.play("shutter");
      return;
    }
    this.fx.text(p.pos.clone().setY(p.pos.y + 2), ["nothing here", "e?", "*interacts with air*"][Math.floor(Math.random() * 3)], "#ffffff", { size: 0.45, life: 0.7 });
  }

  // ---------------------------------------------------------------- actors

  private updateActors(dt: number, adt: number) {
    const cam = this.camera.position;
    this.arena.beginShadows();
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a) continue;
      const aDt = a.isPlayer ? (this.playerFrozen ? 0 : dt * (this.worldSpeed > 1 ? 1.5 : this.playerSpeed < 1 ? 1 : 1)) : adt;
      a.atkT += aDt;
      if (!a.isPlayer && a.invuln > 0) a.invuln -= adt;
      if (a.phaseThrough > 0) a.phaseThrough -= aDt;
      if (a.flash > 0) {
        a.flash = Math.max(0, a.flash - dt * 9);
        setFlash(a.rig, a.flash);
      }
      if (!a.alive) {
        if (a.isPlayer) {
          // dramatic fall, in slow motion
          a.rig.fall = Math.min(1, a.rig.fall + dt * 1.6);
          a.rig.body.rotation.x = -a.rig.fall * (Math.PI / 2 - 0.05);
          a.rig.root.position.copy(a.pos);
          animateRig(a.rig, { speed: 0, grounded: true, vy: 0, action: "dead", actionT: 0, t: this.time }, dt);
          a.rig.body.rotation.x = -a.rig.fall * (Math.PI / 2 - 0.05);
          this.arena.pushShadow(a.pos.x, a.pos.z, a.pos.y, 1.3);
          continue;
        }
        a.dying -= dt;
        const k = 1 - Math.max(0, a.dying) / 0.55;
        a.rig.root.rotation.y = lerpAngle(a.rig.root.rotation.y, Math.atan2(cam.x - a.pos.x, cam.z - a.pos.z), Math.min(1, dt * 14));
        a.rig.root.rotation.x = 0;
        a.rig.root.rotation.z = 0;
        const inflate = k > 0.6 ? 1 + (k - 0.6) * 0.9 : 1;
        a.rig.root.scale.set(a.scale * inflate * (1 + Math.sin(k * 40) * 0.03 * k), a.scale * inflate, a.scale * inflate);
        a.rig.lookYaw = 0;
        animateRig(a.rig, { speed: 0, grounded: true, vy: 0, action: "dead", actionT: k, t: this.time }, dt * 0.3);
        if (a.dying <= 0) this.pop(a);
        continue;
      }

      if (a.isNpc) updateNpc(this, a, adt);
      else if (!a.isPlayer) {
        if (this.enemiesDance) {
          a.move.set(0, 0);
          a.action = "dance";
        } else updateEnemyAI(this, a, adt);
      }
      if (!a.frozen || a.isPlayer) stepActor(this, a, a.isPlayer ? aDt : adt);
      else if (a.frozen && a.lookAt) a.yaw = lerpAngle(a.yaw, Math.atan2(a.lookAt.x - a.pos.x, a.lookAt.z - a.pos.z), Math.min(1, dt * 5));
      if (this.phase === "victory" && !a.isPlayer && !a.isNpc) {
        a.yaw = lerpAngle(a.yaw, Math.atan2(cam.x - a.pos.x, cam.z - a.pos.z), Math.min(1, dt * 3));
      }
      this.syncRig(a, a.isPlayer ? aDt : adt);
      this.arena.pushShadow(a.pos.x, a.pos.z, a.pos.y, (a.radius * 2.4 + 0.3) * (a.isNpc ? 1 : 1));
      if (!a.isNpc && this.phase !== "select" && !this.attract) {
        if (a.isPlayer) this.arena.pushMarker(a.pos.x, a.pos.z, a.pos.y, 2.6, MARKER.player, this.time * 2);
        else this.arena.pushMarker(a.pos.x, a.pos.z, a.pos.y, a.radius * 3.4, a.ally ? MARKER.ally : MARKER[a.faction], -this.time * 1.5 + i);
      }
    }
    if (adt > 0) separate(this.actors);
    this.arena.endShadows();
  }

  private syncRig(a: Actor, dt: number) {
    const r = a.rig;
    r.root.position.copy(a.pos);
    if (a.tumble > 0 && !a.grounded) {
      a.tumbleAngle += dt * 13 * a.tumble;
      _q.setFromAxisAngle(UP, a.yaw);
      _q2.setFromAxisAngle(a.tumbleAxis, a.tumbleAngle);
      r.root.quaternion.multiplyQuaternions(_q2, _q);
    } else {
      a.tumbleAngle = 0;
      if (!(a.isPlayer && this.abilities && this.abilities.dashT > 0 && this.abilities.faction === "grok")) r.root.quaternion.setFromAxisAngle(UP, a.yaw);
    }
    // head look
    let look = a.lookAt;
    if (this.phase === "victory" && !a.isPlayer) look = this.camera.position;
    if (look) {
      const ang = Math.atan2(look.x - a.pos.x, look.z - a.pos.z);
      let d = ang - a.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.lookYaw = THREE.MathUtils.clamp(d, -1.2, 1.2);
    } else r.lookYaw = 0;

    let action = a.action;
    if (action === "none") {
      if (a.stun > 0) action = "stun";
      else if (a.atkT < 0.18) action = "attack";
    }
    if (a.isPlayer && this.abilities && this.abilities.dashT > 0 && this.abilities.faction === "dot") {
      // stretched into a streak of light
      r.body.scale.set(0.6, 0.6, 2.2);
    }
    const hs = Math.hypot(a.vel.x, a.vel.z);
    animateRig(r, { speed: hs / Math.max(1, a.speed), grounded: a.grounded, vy: a.vel.y, action, actionT: a.actionT, t: this.time }, dt);
    if (a.isPlayer && this.abilities && this.abilities.dashT > 0 && this.abilities.faction === "dot") r.body.scale.set(0.55, 0.55, 2.4);
    if (a.isPlayer && a.invuln > 0 && this.phase === "playing" && !(this.abilities?.busy)) r.root.visible = Math.sin(this.time * 40) > -0.6;
    else r.root.visible = !a.isNpc || this.npcsShown;
  }

  // ---------------------------------------------------------------- comedy timers

  private updateGags(dt: number) {
    if (this.phase !== "playing" && this.phase !== "select") return;
    this.gagT -= dt;
    if (this.gagT <= 0) {
      this.gagT = rand(18, 30);
      // a dot gets stuck inside another dot
      const dots = this.actors.filter((a) => a.alive && a.faction === "dot" && !a.isPlayer && a.grounded);
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          if (dots[i].pos.distanceTo(dots[j].pos) < 5) {
            const a = dots[i], b = dots[j];
            a.phaseThrough = b.phaseThrough = 3;
            a.pos.copy(b.pos).add(_v.set(0.12, 0, 0.05));
            a.stun = b.stun = 3;
            setExpression(a.rig.face, "derp", 3);
            setExpression(b.rig.face, "surprised", 3);
            this.fx.bubble(b.rig.root, "we're stuck", b.rig.height + 0.8, 2.6, 0.7);
            audio.play("squeak");
            i = dots.length;
            break;
          }
        }
      }
    }
    if (this.phase !== "playing") return;
    this.uninterestedT -= dt;
    if (this.uninterestedT <= 0) {
      this.uninterestedT = rand(35, 55);
      const n = this.npcs.find((x) => x.mood === "wander" && !x.sign);
      if (n) makeUninterested(this, n);
    }
    if (!this.claudeSignDone && this.runTime > 55) {
      this.claudeSignDone = true;
      const n = this.npcs.find((x) => !x.sign && x.mood !== "uninterested");
      if (n) {
        giveSign(this, n, "WHERE IS CLAUDE?");
        n.moodTime = 9;
        if (this.player) n.pos.copy(this.player.pos).add(_v.set(rand(-6, 6), 0, rand(-6, -2)));
        if (!this.arena.walkable(n.pos.x, n.pos.z)) n.pos.set(rand(-5, 5), 0, rand(-5, 5));
      }
    }
    // signs that say "I use all three"
    if (Math.random() < dt * 0.02 && !this.npcs.some((x) => x.sign)) {
      const n = this.npcs.find((x) => x.mood === "wander");
      if (n) giveSign(this, n, Math.random() < 0.5 ? "I use all three." : undefined);
    }
  }

  // ---------------------------------------------------------------- victory

  private updateVictory(dt: number) {
    this.endT += dt;
    const t = this.endT;
    const p = this.player;
    if (!p) return;
    if (Math.random() < dt * 3) this.fx.confetti(p.pos.clone().add(_v.set(rand(-14, 14), 10, rand(-14, 8))), 40, 6, 2);
    if (t > 1.4 && !this.victoryDot) {
      const rig = buildRig("dot");
      initFlashColors(rig);
      rig.root.scale.setScalar(0.6);
      rig.root.position.copy(p.pos).add(_v.set(-7, 0, 3));
      this.scene.add(rig.root);
      this.victoryDot = rig;
    }
    if (this.victoryDot) {
      const r = this.victoryDot;
      const goal = _v2.copy(p.pos).add(_v.set(-1.4, 0, 2.2));
      const d = r.root.position.distanceTo(goal);
      if (d > 0.1) {
        _v.subVectors(goal, r.root.position).setY(0).normalize();
        r.root.position.addScaledVector(_v, Math.min(d, dt * 2.6));
        r.root.rotation.y = Math.atan2(_v.x, _v.z);
      } else {
        r.root.rotation.y = lerpAngle(r.root.rotation.y, Math.atan2(this.camera.position.x - r.root.position.x, this.camera.position.z - r.root.position.z), Math.min(1, dt * 4));
      }
      const gy = this.arena.groundAt(r.root.position.x, r.root.position.z, p.pos.y + 2);
      r.root.position.y = gy === -Infinity ? p.pos.y : gy;
      animateRig(r, { speed: d > 0.1 ? 0.8 : 0, grounded: true, vy: 0, action: "none", actionT: 0, t: this.time }, dt);
      if (t > 4.6 && t - dt <= 4.6) {
        this.fx.bubble(r.root, "gg", 1.3, 4, 0.9);
        audio.play("beep");
      }
    }
    if (t > 6.2 && t - dt <= 6.2) this.finishRun(true);
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(dt: number) {
    const cr = this.camRig;
    const p = this.player;
    if (this.cine) {
      cr.targetPos.copy(this.cine.pos);
      cr.targetLook.copy(this.cine.look);
      cr.smooth = this.cine.smooth;
      cr.lookSmooth = this.cine.smooth * 1.4;
    } else if (this.phase === "playing" || this.phase === "deploying") {
      if (p) {
        const look = _v.subVectors(this.aimPoint, p.pos).setY(0);
        if (look.length() > 5) look.setLength(5);
        cr.zoom = 1 + Math.min(0.25, this.actors.length / 200);
        cr.follow(p.pos, this.input.usingTouch ? _v.set(0, 0, 0) : look);
        cr.smooth = this.phase === "deploying" ? 2.5 : 7;
        cr.lookSmooth = this.phase === "deploying" ? 3 : 9;
        if (beat.onBeat) cr.fovKick -= 0.5 + beat.hype * 1.4;
        cr.fovKick += this.speedLines * 0.5;
      }
    } else if (this.phase === "dying" || this.phase === "dead") {
      if (p) {
        const a = this.time * 0.25 + 0.3;
        const dist = this.phase === "dying" ? 6 : 11;
        cr.targetPos.set(p.pos.x + Math.sin(a) * dist, p.pos.y + (this.phase === "dying" ? 3 : 7), p.pos.z + Math.cos(a) * dist);
        cr.targetLook.set(p.pos.x, p.pos.y + 0.6, p.pos.z);
        cr.smooth = 2;
        cr.lookSmooth = 3;
      }
    } else if (this.phase === "victory") {
      if (p) {
        const k = Math.min(1, this.endT / 5);
        const e = ease(k);
        cr.targetPos.set(p.pos.x + 2 - e * 2, p.pos.y + 4 + e * 26, p.pos.z + 8 + e * 30);
        cr.targetLook.set(p.pos.x, p.pos.y + 1 - e * 1, p.pos.z - e * 4);
        cr.smooth = 1.6;
        cr.lookSmooth = 2.5;
      }
    }
    cr.update(dt, this.time);
  }

  // ---------------------------------------------------------------- DOM / HUD / music

  private updateDom(dt: number) {
    this.flashV = Math.max(0, this.flashV - dt * 2.5);
    this.hurtV = Math.max(0, this.hurtV - dt * 1.6);
    this.chroma = Math.max(0, this.chroma - dt * 2);
    const d = this.dom;
    if (d.flash) d.flash.style.opacity = String(this.flashV);
    if (d.hurt) {
      const low = this.player && this.player.alive && this.phase === "playing" ? Math.max(0, 0.35 - this.player.hp / this.player.maxHp) * 1.6 : 0;
      d.hurt.style.opacity = String(Math.min(1, this.hurtV + low * (0.7 + Math.sin(this.time * 6) * 0.3)));
    }
    if (d.cursor) {
      const show = this.phase === "playing" && !this.input.usingTouch;
      d.cursor.style.opacity = show ? "1" : "0";
      d.cursor.style.transform = `translate(${this.input.mousePx.x}px, ${this.input.mousePx.y}px) scale(${1 + beat.pulse * 0.18})`;
    }
    const inRun = this.phase === "playing" || this.phase === "deploying" || this.phase === "victory";
    if (d.ui) d.ui.style.setProperty("--beat", beat.pulse.toFixed(3));
    if (d.edge) d.edge.style.opacity = inRun ? Math.max(0, Math.min(1, beat.hype * 1.4 - 0.4) * (0.7 + beat.pulse * 0.3)).toFixed(3) : "0";
    if (d.speed) d.speed.style.opacity = this.speedLines.toFixed(3);
  }

  private pushCombo(withMsg: boolean) {
    const c = this.score.combo;
    if (c === this.comboShown && !withMsg) return;
    this.comboShown = c;
    const prev = ui().combo;
    ui().set({ combo: { id: prev.id + 1, count: c, msg: withMsg ? this.score.lastMsg : prev.count > 0 && c >= prev.count ? prev.msg : null } });
  }

  private pushHud(dt: number) {
    this.comboT -= dt;
    if (this.comboT <= 0) {
      this.comboT = 0.07;
      if (this.score.combo !== this.comboShown) this.pushCombo(false);
    }
    this.jumboT -= dt;
    if (this.jumboT <= 0) {
      this.jumboT = 2;
      const f = this.playerFaction ? FACTION_INFO[this.playerFaction].plural : "EVERYONE";
      this.arena.jumboLines = this.phase === "playing"
        ? [`SCORE ${Math.round(this.score.score).toLocaleString()}`, `KILLS: ${this.score.kills}`, `BEST COMBO x${this.score.bestCombo}`, `${f} ARE WINNING?`, "😂😂😂", "LIVE FROM THE INTERNET"]
        : ["AI MASCOT BATTLE", "DOTS vs MUSES vs GROK", "LIVE", "nobody approved this", "🍿"];
    }
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.066;
    const p = this.player;
    const ab = this.abilities;
    let interact: string | null = null;
    if (p && this.phase === "playing") {
      const pk = this.props.nearestPickup(p.pos);
      if (pk) interact = this.props.label(pk);
    }
    ui().set({
      hud: {
        hp: p ? Math.max(0, p.hp) : 0,
        maxHp: p ? p.maxHp : 100,
        energy: this.energy,
        score: Math.round(this.score.score),
        kills: this.score.kills,
        combo: this.score.combo,
        bestCombo: this.score.bestCombo,
        time: this.runTime,
        survive: Math.max(0, SURVIVE_SECONDS - this.runTime),
        cd: { primary: ab?.cd.primary ?? 0, special: ab?.cd.special ?? 0, dash: ab?.cd.dash ?? 0, ult: 100 - this.energy },
        cdMax: { primary: ab?.cdMax.primary ?? 1, special: ab?.cdMax.special ?? 1, dash: ab?.cdMax.dash ?? 1, ult: 100 },
        interact,
        secret: this.secretMode,
        fps: this.fps,
      },
    });
  }

  private updateMusic() {
    if (this.phase !== "playing") return;
    const p = this.player;
    if (!p) return;
    let near = 0;
    for (const a of this.actors) if (a.alive && !a.isNpc && !a.isPlayer && a.pos.distanceToSquared(p.pos) < 225) near++;
    const final = this.runTime > SURVIVE_SECONDS - 30 ? 0.3 : 0;
    audio.setIntensity(0.35 + near / 10 + this.score.combo / 40 + final + (this.abilities?.busy ? 0.5 : 0));
  }

  resize(h: number) {
    this.fx.setViewport(h, this.camera.fov);
    this.arena.spectacle.setViewport(h);
  }

  // used by the UI layer
  get lines() {
    return this.player ? lineFor(this.player) : "";
  }
}

// ------------------------------------------------------------------ singleton access for React

let current: Game | null = null;
export function setGame(g: Game | null) {
  current = g;
}
export function getGame() {
  return current;
}

export { damage };
