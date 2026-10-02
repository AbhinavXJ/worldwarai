import * as THREE from "three";
import type { Game } from "./engine";
import type { Rig } from "./types";
import { audio } from "./audio";
import { ui } from "./store";
import { animateRig, buildRig, initFlashColors, setExpression } from "./characters";
import { glowTexture, textTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

const LATENT_Y = -1600;

function buildPaperclip() {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  // a paperclip, the hard way
  const path: [number, number][] = [
    [0, -0.9], [0, 0.9], [0.18, 1.1], [0.36, 0.9], [0.36, -1.1], [0.6, -1.3], [0.84, -1.1], [0.84, 1.2], [0.6, 1.45], [0.36, 1.3],
  ];
  for (const [x, y] of path) pts.push(new THREE.Vector3(x - 0.42, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.06, 8, false), new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.2 }));
  g.add(tube);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    eye.position.set(s * 0.22, 0.75, 0.12);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(s * 0.22, 0.75, 0.26);
    g.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    brow.position.set(s * 0.22, 1.0, 0.14);
    brow.rotation.z = s * -0.25;
    g.add(brow);
  }
  g.position.y = 1.4;
  const w = new THREE.Group();
  w.add(g);
  return w;
}

export class Secrets {
  moonClicks = 0;
  moonMode = 0;
  still = 0;
  paperclip: { obj: THREE.Group; t: number } | null = null;
  paperclipDone = false;
  goldenSpawned = false;
  latent: { t: number; stage: number } | null = null;
  latentRoot: THREE.Group | null = null;
  private latentRings: THREE.Mesh[] = [];
  private latentEyes: THREE.Group[] = [];
  private latentCatcher: Rig | null = null;
  claude: { rig: Rig; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private claudeCd = 0;
  falls = 0;
  private ray = new THREE.Raycaster();

  constructor(private g: Game) {}

  reset() {
    this.still = 0;
    this.goldenSpawned = false;
    this.paperclipDone = false;
    if (this.paperclip) {
      this.paperclip.obj.removeFromParent();
      this.paperclip = null;
    }
    if (this.latent) this.exitLatent(true);
    this.moonMode = 0;
    this.g.gravityScale = 1;
  }

  // ---------------------------------------------------------------- moon

  /** returns true if the click was eaten by the moon */
  tryMoonClick(ndc: { x: number; y: number }) {
    const g = this.g;
    this.ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), g.camera);
    const hit = this.ray.intersectObject(g.arena.moon, false);
    if (!hit.length) return false;
    this.moonClicks++;
    audio.play(this.moonClicks >= 10 ? "vineboom" : "pop");
    g.arena.moon.scale.setScalar(1.08);
    if (this.moonClicks === 3) ui().showBanner("...", "the moon felt that.", "info");
    if (this.moonClicks === 7) ui().showBanner("STOP POKING THE MOON", "it has feelings. probably.", "info");
    if (this.moonClicks === 10) this.wakeMoon();
    return true;
  }

  private wakeMoon() {
    const g = this.g;
    g.arena.moonFace.visible = true;
    this.moonMode = 25;
    g.gravityScale = 0.32;
    g.arena.art = 0.6;
    ui().showBanner("THE MOON HAS NOTICED YOU", "low gravity enabled. the moon is also a model.", "secret");
    audio.play("airhorn");
    g.camRig.shake(0.5);
    g.score.add(1000);
    for (const a of g.actors) {
      if (a.alive && !a.isPlayer) {
        a.vel.y = rand(6, 14);
        a.grounded = false;
      }
    }
  }

  // ---------------------------------------------------------------- golden dot

  maybeSpawnGolden() {
    const g = this.g;
    if (this.goldenSpawned || g.runTime < 45) return;
    this.goldenSpawned = true;
    const idx = 1 + Math.floor(Math.random() * (g.arena.islands.length - 1));
    const p = g.arena.randomPointOnIsland(0, idx);
    g.props.spawnPickup("golden", p);
    g.fx.text(p.clone().setY(p.y + 3), "✦", "#ffd23f", { size: 1, life: 2, rise: 0.4 });
    audio.play("sparkle");
  }

  unlockSecretMode() {
    const g = this.g;
    g.secretMode = true;
    g.score.mult = 2;
    ui().showBanner("SECRET MODE: GOLDEN WEIGHTS", "big heads. double score. no regrets.", "secret");
    audio.play("airhorn");
    audio.play("victory");
    for (const a of g.actors) if (!a.isPlayer) a.rig.head.scale.setScalar(1.7);
    g.fx.confetti(g.player!.pos.clone().setY(g.player!.pos.y + 2), 120, 10, 12);
  }

  // ---------------------------------------------------------------- stillness

  updateStill(dt: number, moved: boolean) {
    const g = this.g;
    if (moved || g.phase !== "playing") {
      this.still = 0;
      return;
    }
    this.still += dt;
    if (this.still > 30 && !this.paperclip && !this.paperclipDone) this.spawnPaperclip();
  }

  private spawnPaperclip() {
    const g = this.g;
    const p = g.player!;
    const obj = buildPaperclip();
    obj.position.set(p.pos.x + 2, p.pos.y, p.pos.z + 1);
    g.scene.add(obj);
    this.paperclip = { obj, t: 0 };
    this.paperclipDone = true;
    audio.play("boing");
    g.fx.burst(obj.position.clone().setY(obj.position.y + 1.4), 0xffffff, 30, 5, { size: 0.6 });
    ui().showBanner("SECRET: THE ASSISTANT", "it looks like you're standing still. would you like help?", "secret");
  }

  private updatePaperclip(dt: number) {
    const g = this.g;
    const pc = this.paperclip!;
    pc.t += dt;
    const o = pc.obj;
    o.children[0].position.y = 1.4 + Math.abs(Math.sin(pc.t * 5)) * 0.4;
    if (g.player) o.lookAt(g.player.pos.x, o.position.y, g.player.pos.z);
    if (pc.t > 0.6 && pc.t - dt <= 0.6) g.fx.text(o.position.clone().setY(o.position.y + 3.4), "need help?", "#fff", { bubble: true, size: 0.8, life: 2.2, rise: 0 });
    if (pc.t > 2.8 && pc.t - dt <= 2.8 && g.player) {
      g.energy = 100;
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.5);
      g.fx.text(g.player.pos.clone().setY(g.player.pos.y + 2.4), "+FULL ENERGY +HP", "#7df9e0", { size: 0.8, life: 1.5 });
      g.fx.starBurst(g.player.pos.clone().setY(g.player.pos.y + 1), [0xffffff, 0xffd23f], 20, 6);
      audio.play("pickup");
      g.score.add(500);
    }
    if (pc.t > 4.5) {
      o.position.y += dt * 12;
      o.rotation.y += dt * 10;
    }
    if (pc.t > 6) {
      o.removeFromParent();
      this.paperclip = null;
    }
  }

  // ---------------------------------------------------------------- the latent space

  private buildLatent() {
    const root = new THREE.Group();
    root.position.set(0, LATENT_Y, 0);
    const ringGeo = new THREE.TorusGeometry(9, 0.25, 8, 64);
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 46, 1, 0.6).multiplyScalar(2.2), toneMapped: false, fog: false }));
      m.rotation.x = Math.PI / 2;
      m.position.y = -i * 7;
      m.scale.setScalar(1 + Math.sin(i * 0.5) * 0.25);
      root.add(m);
      this.latentRings.push(m);
    }
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const irisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8f7bff).multiplyScalar(1.5), toneMapped: false, fog: false });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    for (let i = 0; i < 16; i++) {
      const e = new THREE.Group();
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), eyeWhite);
      e.add(s);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), irisMat);
      iris.position.z = 0.65;
      e.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), pupilMat);
      pupil.position.z = 0.98;
      e.add(pupil);
      const a = Math.random() * Math.PI * 2;
      e.position.set(Math.cos(a) * rand(13, 26), -rand(0, 300), Math.sin(a) * rand(13, 26));
      e.scale.setScalar(rand(1.5, 4));
      root.add(e);
      this.latentEyes.push(e);
    }
    const words = ["attention", "softmax", "embedding", "∞", "you are a vector now", "dimension 4,096", "temperature: 2.0", "gradient descent", "the latent space", "loss: NaN", "hello?", "▁the", "<|endoftext|>"];
    for (let i = 0; i < 30; i++) {
      const w = words[i % words.length];
      const tx = textTexture(w, `hsl(${(i * 37) % 360},100%,75%)`);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.tex, transparent: true, fog: false, depthWrite: false }));
      const a = Math.random() * Math.PI * 2;
      sp.position.set(Math.cos(a) * rand(4, 16), -rand(0, 300), Math.sin(a) * rand(4, 16));
      const h = rand(1.2, 3);
      sp.scale.set(h * tx.aspect, h, 1);
      root.add(sp);
    }
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(60, 1), new THREE.MeshBasicMaterial({ color: 0x8f7bff, wireframe: true, transparent: true, opacity: 0.25, fog: false }));
    ico.position.y = -150;
    ico.userData.spin = true;
    root.add(ico);
    const ico2 = new THREE.Mesh(new THREE.IcosahedronGeometry(110, 0), new THREE.MeshBasicMaterial({ color: 0xff6bd6, wireframe: true, transparent: true, opacity: 0.2, fog: false }));
    ico2.position.y = -150;
    ico2.userData.spin = true;
    root.add(ico2);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(80);
    glow.position.y = -330;
    root.add(glow);
    // a giant dot waits at the bottom to catch you
    const catcher = buildRig("dot");
    initFlashColors(catcher);
    catcher.root.scale.setScalar(16);
    catcher.root.position.set(0, -322, 0);
    catcher.root.rotation.x = -Math.PI / 2 + 0.3;
    root.add(catcher.root);
    this.latentCatcher = catcher;
    root.visible = false;
    this.g.scene.add(root);
    this.latentRoot = root;
  }

  enterLatent() {
    const g = this.g;
    const p = g.player;
    if (!p || this.latent) return;
    if (!this.latentRoot) this.buildLatent();
    this.falls++;
    this.latentRoot!.visible = true;
    this.latent = { t: 0, stage: 0 };
    p.pos.set(0, LATENT_Y + 10, 0);
    p.vel.set(0, -14, 0);
    p.knock.set(0, 0, 0);
    p.ballistic = false;
    p.tumble = 1;
    p.tumbleAxis.set(1, 0, 0.3).normalize();
    g.worldFreeze = true;
    g.camRig.snap();
    ui().set({ overlay: "latent" });
    ui().showBanner(this.falls === 1 ? "YOU FELL INTO THE LATENT SPACE" : "THE LATENT SPACE AGAIN", this.falls === 1 ? "secret dimension discovered." : "you really like it here.", "secret");
    audio.play("portal");
    audio.play("whistleDown");
    audio.muffle(0.5);
    if (this.falls === 1) g.score.add(777);
    if (this.latentCatcher) setExpression(this.latentCatcher.face, "surprised", 99);
  }

  private updateLatent(dt: number) {
    const g = this.g;
    const L = this.latent!;
    const p = g.player!;
    L.t += dt;
    const root = this.latentRoot!;
    for (let i = 0; i < this.latentRings.length; i++) {
      const r = this.latentRings[i];
      r.rotation.z = g.time * (i % 2 ? 0.6 : -0.6);
      const s = 1 + Math.sin(g.time * 2 + i * 0.4) * 0.15;
      r.scale.setScalar(s);
    }
    for (const e of this.latentEyes) e.lookAt(p.pos);
    root.children.forEach((c) => {
      if (c.userData.spin) {
        c.rotation.y += dt * 0.2;
        c.rotation.x += dt * 0.1;
      }
    });
    // controlled fall through the tunnel
    p.vel.y = Math.max(p.vel.y - 20 * dt, -34);
    p.pos.y += p.vel.y * dt;
    const mv = g.input.moveVector(new THREE.Vector2());
    p.pos.x = THREE.MathUtils.clamp(p.pos.x + mv.x * 10 * dt, -7, 7);
    p.pos.z = THREE.MathUtils.clamp(p.pos.z + mv.y * 10 * dt, -7, 7);
    p.tumbleAngle += dt * 4;
    g.setCine(_v.set(p.pos.x * 0.5, p.pos.y + 9, p.pos.z + 4), new THREE.Vector3(p.pos.x, p.pos.y - 6, p.pos.z), 6);
    if (Math.random() < 0.6) g.fx.trail(p.pos.clone().setY(p.pos.y + 0.6), new THREE.Color().setHSL(Math.random(), 1, 0.7).getHex(), 0.8, 0.5);
    if (this.latentCatcher) {
      const c = this.latentCatcher;
      animateRig(c, { speed: 0, grounded: true, vy: 0, action: "none", actionT: 0, t: g.time }, dt);
      if (L.stage === 0 && p.pos.y < LATENT_Y - 270) {
        L.stage = 1;
        setExpression(c.face, "happy", 99);
        g.fx.text(c.root.position.clone().add(root.position).setY(p.pos.y - 6), "u ok?", "#fff", { bubble: true, size: 3, life: 2, rise: 0 });
        audio.play("beep");
      }
    }
    if (p.pos.y < LATENT_Y - 305) this.exitLatent(false);
  }

  exitLatent(silent: boolean) {
    const g = this.g;
    this.latent = null;
    if (this.latentRoot) this.latentRoot.visible = false;
    g.worldFreeze = false;
    g.cine = null;
    ui().set({ overlay: "none" });
    audio.muffle(0);
    const p = g.player;
    if (!p || silent) return;
    p.pos.set(rand(-3, 3), 26, rand(-3, 3));
    p.vel.set(0, -5, 0);
    p.tumble = 0;
    p.tumbleAngle = 0;
    p.invuln = 2.5;
    p.hp = Math.max(1, p.hp - 8);
    g.camRig.snap();
    ui().showBanner("WELCOME BACK", "the latent space has returned you. mostly intact.", "info");
    audio.play("boing");
  }

  // ---------------------------------------------------------------- where is claude?

  claudeRun() {
    const g = this.g;
    if (this.claude || this.claudeCd > 0) return;
    this.claudeCd = 40;
    const rig = buildRig("dot", 0xb07bff);
    initFlashColors(rig);
    rig.root.scale.setScalar(0.42);
    const c = g.camRig.look;
    const from = new THREE.Vector3(c.x - 16, 0, c.z + 3);
    const to = new THREE.Vector3(c.x + 16, 0, c.z + 3);
    from.y = Math.max(0, g.arena.groundAt(from.x, from.z, 20));
    to.y = from.y;
    g.scene.add(rig.root);
    this.claude = { rig, t: 0, from, to };
  }

  private updateClaude(dt: number) {
    const g = this.g;
    const c = this.claude!;
    c.t += dt;
    const k = c.t / 1.6;
    const p = _v.copy(c.from).lerp(c.to, k);
    const gy = g.arena.groundAt(p.x, p.z, p.y + 2);
    p.y = gy === -Infinity ? c.from.y : gy;
    c.rig.root.position.copy(p);
    c.rig.root.rotation.y = Math.PI / 2;
    animateRig(c.rig, { speed: 1.4, grounded: true, vy: 0, action: "none", actionT: 0, t: g.time }, dt * 1.6);
    if (Math.random() < 0.5) g.fx.trail(p.clone().setY(p.y + 0.3), 0xd9b8ff, 0.4, 0.4);
    if (k >= 1) {
      c.rig.root.removeFromParent();
      this.claude = null;
    }
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number) {
    const g = this.g;
    if (this.claudeCd > 0) this.claudeCd -= dt;
    if (this.claude) this.updateClaude(dt);
    if (this.paperclip) this.updatePaperclip(dt);
    if (this.latent) this.updateLatent(dt);
    if (g.arena.moon.scale.x > 1) g.arena.moon.scale.setScalar(Math.max(1, g.arena.moon.scale.x - dt * 0.5));
    if (this.moonMode > 0) {
      this.moonMode -= dt;
      g.arena.hueShift += dt * 0.1;
      const face = g.arena.moonFace;
      face.children.forEach((ch, i) => {
        if (i === 0 || i === 2) ch.scale.y = Math.sin(g.time * 1.5) > 0.95 ? 1 : 10;
      });
      if (this.moonMode <= 0) {
        g.gravityScale = 1;
        g.arena.art = 0;
        ui().showBanner("GRAVITY RESTORED", "the moon went back to sleep.", "info");
      }
    }
    if (g.phase === "playing") this.maybeSpawnGolden();
  }
}
