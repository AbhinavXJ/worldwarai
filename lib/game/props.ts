import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Game } from "./engine";
import type { Obstacle } from "./world";
import { audio } from "./audio";
import { explode } from "./combat";
import { emojiTexture, glowTexture, textTexture } from "./textures";
import { setMood } from "./npcs";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });

export type HallucinationKind = "banana" | "toaster" | "duck" | "emoji" | "computer" | "keyboard";
const KINDS: HallucinationKind[] = ["banana", "toaster", "duck", "emoji", "computer", "keyboard"];
const NAMES: Record<HallucinationKind, string> = {
  banana: "a giant banana",
  toaster: "a toaster",
  duck: "a rubber duck",
  emoji: "an enormous emoji",
  computer: "a spinning computer",
  keyboard: "a giant keyboard",
};

function buildBanana() {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-3, 1.6, 0), new THREE.Vector3(-1.5, 0.3, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.5, 0.3, 0), new THREE.Vector3(3, 1.6, 0)]);
  const tube = new THREE.TubeGeometry(curve, 40, 0.85, 7, false);
  const m = new THREE.Mesh(tube, std(0xffe04a, { flatShading: true, emissive: 0x806000, emissiveIntensity: 0.2 }));
  g.add(m);
  for (const x of [-3, 3]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), std(0x5a3a10));
    tip.position.set(x * 1.02, 1.65, 0);
    g.add(tip);
  }
  g.position.y = 0.9;
  const w = new THREE.Group();
  w.add(g);
  return { obj: w, r: 2.6, h: 3 };
}

function buildToaster() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.2, 3, 2.6, 4, 0.5), std(0xd8dde6, { metalness: 0.85, roughness: 0.18 }));
  body.position.y = 1.5;
  g.add(body);
  for (const x of [-0.9, 0.9]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.8), std(0x111111));
    slot.position.set(x, 3.02, 0);
    g.add(slot);
    const toast = new THREE.Mesh(new RoundedBoxGeometry(1.05, 1.5, 1.6, 2, 0.2), std(0xd99a4e, { roughness: 0.9 }));
    toast.position.set(x, 2.6, 0);
    toast.userData.toast = true;
    g.add(toast);
  }
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), std(0x222222));
  lever.position.set(2.2, 2, 0);
  g.add(lever);
  return { obj: g, r: 2.5, h: 3.2 };
}

function buildDuck() {
  const g = new THREE.Group();
  const yellow = std(0xffd23f, { roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 16), yellow);
  body.scale.set(1.3, 0.95, 1);
  body.position.y = 1.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), yellow);
  head.position.set(1.4, 3.9, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10), std(0xff7a1a));
  beak.scale.set(1.2, 0.4, 0.8);
  beak.position.set(2.6, 3.7, 0);
  g.add(beak);
  for (const z of [-0.55, 0.55]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), std(0x111111, { roughness: 0.1 }));
    e.position.set(2.3, 4.25, z);
    g.add(e);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 10), yellow);
  tail.position.set(-2.5, 2.6, 0);
  tail.rotation.z = 0.9;
  g.add(tail);
  return { obj: g, r: 2.6, h: 5 };
}

function buildEmoji() {
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(["😂", "💀", "🤡", "🗿", "🫠"][Math.floor(Math.random() * 5)]).tex, transparent: true }));
  s.scale.set(7.5, 7.5, 1);
  s.position.y = 3.4;
  g.add(s);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd23f, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(12);
  glow.position.y = 3.4;
  g.add(glow);
  return { obj: g, r: 2.6, h: 6.5 };
}

function buildComputer() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const beige = std(0xe8dcc0, { roughness: 0.6 });
  const crt = new THREE.Mesh(new RoundedBoxGeometry(4, 3.4, 3.4, 3, 0.4), beige);
  crt.position.y = 2.6;
  spin.add(crt);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.3), new THREE.MeshBasicMaterial({ map: textTexture(":)", "#7df9e0", { size: 120, bg: "#05223a" }).tex, toneMapped: false }));
  scr.position.set(0, 2.7, 1.71);
  spin.add(scr);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.2), beige);
  stand.position.y = 0.4;
  spin.add(stand);
  spin.userData.spin = true;
  return { obj: g, r: 2.4, h: 4.4 };
}

function buildKeyboard() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(9, 0.7, 3.4, 3, 0.25), std(0x1b1b24, { metalness: 0.4 }));
  base.position.y = 0.35;
  g.add(base);
  const cols = 12, rows = 4;
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.6, 0.35, 0.6, 2, 0.1), new THREE.MeshBasicMaterial({ toneMapped: false }), cols * rows);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k;
      m4.makeTranslation(-3.85 + k * 0.7, 0.85, -1.1 + r * 0.72);
      keys.setMatrixAt(i, m4);
      c.setHSL((k / cols + r * 0.1) % 1, 1, 0.55).multiplyScalar(1.6);
      keys.setColorAt(i, c);
    }
  g.add(keys);
  g.rotation.y = rand(0, 3);
  return { obj: g, r: 3.4, h: 1.2 };
}

const BUILDERS: Record<HallucinationKind, () => { obj: THREE.Object3D; r: number; h: number }> = {
  banana: buildBanana,
  toaster: buildToaster,
  duck: buildDuck,
  emoji: buildEmoji,
  computer: buildComputer,
  keyboard: buildKeyboard,
};

interface Hallucination {
  id: number;
  kind: HallucinationKind;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vy: number;
  landed: boolean;
  life: number;
  hp: number;
  maxHp: number;
  r: number;
  h: number;
  ob: Obstacle | null;
  spinX: number;
  spinZ: number;
  flash: number;
  ground: number;
}

export type PickupKind = "crate" | "gpu" | "jar" | "golden";
interface Pickup { kind: PickupKind; obj: THREE.Group; pos: THREE.Vector3; t: number; life: number }
interface Orb { pos: THREE.Vector3; vel: THREE.Vector3; t: number; value: number }

const PICKUP_LABEL: Record<PickupKind, string> = { crate: "COMPUTE CRATE (+HP)", gpu: "SPARE GPU (RAPID FIRE)", jar: "TOKEN JAR (+ENERGY)", golden: "THE GOLDEN DOT" };

export class Props {
  items: Hallucination[] = [];
  pickups: Pickup[] = [];
  orbs: Orb[] = [];
  orbMesh: THREE.InstancedMesh;
  private nextId = 1;
  private m4 = new THREE.Matrix4();

  constructor(private g: Game) {
    this.orbMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7df9ff).multiplyScalar(2.4), toneMapped: false }), 240);
    this.orbMesh.count = 0;
    this.orbMesh.frustumCulled = false;
    g.scene.add(this.orbMesh);
  }

  clear() {
    for (const it of this.items) this.removeItem(it, false);
    this.items.length = 0;
    for (const p of this.pickups) p.obj.removeFromParent();
    this.pickups.length = 0;
    this.orbs.length = 0;
    this.orbMesh.count = 0;
  }

  // ---------------------------------------------------------------- hallucinations

  dropHallucination(kind?: HallucinationKind, at?: THREE.Vector3) {
    const k = kind ?? KINDS[Math.floor(Math.random() * KINDS.length)];
    const built = BUILDERS[k]();
    const pos = at?.clone() ?? this.g.arena.randomPointOnIsland(4, 0);
    const ground = this.g.arena.groundAt(pos.x, pos.z, 50);
    const it: Hallucination = {
      id: this.nextId++, kind: k, obj: built.obj, pos: new THREE.Vector3(pos.x, ground + 70, pos.z), vy: -10, landed: false, life: 32,
      hp: 260, maxHp: 260, r: built.r, h: built.h, ob: null, spinX: rand(-2, 2), spinZ: rand(-2, 2), flash: 0, ground,
    };
    built.obj.position.copy(it.pos);
    built.obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
    this.g.scene.add(built.obj);
    this.items.push(it);
    audio.play("whistleDown");
    return NAMES[k];
  }

  private land(it: Hallucination) {
    const g = this.g;
    it.landed = true;
    it.pos.y = it.ground;
    it.obj.rotation.x = 0;
    it.obj.rotation.z = 0;
    it.obj.position.copy(it.pos);
    audio.play("vineboom");
    explode(g, it.pos, 6.5, 45, null, { color: 0xffffff, launch: 15, knock: 18, shake: 0.9, sound: false, faction: "ally" });
    if (g.player && g.player.alive && g.player.pos.distanceTo(it.pos) < it.r + 1) {
      g.player.knock.add(new THREE.Vector3(g.player.pos.x - it.pos.x, 0, g.player.pos.z - it.pos.z).setLength(22));
      g.player.vel.y = 10;
    }
    g.fx.ring(it.pos, 1, 14, 0.7, 0xffffff);
    g.fx.pixelBurst(it.pos, [0xffffff, 0xd8c8ff, 0xffd23f], 40, 12, 0.25, 10);
    it.ob = { x: it.pos.x, z: it.pos.z, r: it.r, top: it.ground + it.h, y: it.ground, kind: "prop", alive: true, hp: it.hp, propId: it.id };
    g.arena.obstacles.push(it.ob);
    g.slowmo(0.5, 0.3);
    // everyone stops to look
    for (const a of g.actors) {
      if (!a.alive || a.isPlayer || a.ally) continue;
      if (a.pos.distanceTo(it.pos) < 22) {
        a.lookAt = it.pos.clone();
        if (a.isNpc) setMood(a, "stare", rand(1.5, 2.5));
        else {
          a.stun = Math.max(a.stun, rand(0.8, 1.4));
          if (Math.random() < 0.35) g.fx.bubble(a.rig.root, ["?", "??", "what", "huh", "is that canon"][Math.floor(Math.random() * 5)], a.rig.height + 0.6, 1.4);
        }
      }
    }
  }

  hitTest(p: THREE.Vector3, r: number, dmg: number) {
    for (const it of this.items) {
      if (!it.landed || it.hp <= 0) continue;
      const dx = p.x - it.pos.x, dz = p.z - it.pos.z;
      if (dx * dx + dz * dz < (it.r + r) ** 2 && p.y < it.ground + it.h + 0.5 && p.y > it.ground - 0.5) {
        if (dmg > 0) this.damageItem(it, dmg);
        return true;
      }
    }
    return false;
  }

  damageItem(it: Hallucination, dmg: number) {
    it.hp -= dmg;
    it.flash = 1;
    if (it.hp <= 0) {
      const g = this.g;
      g.fx.confetti(it.pos.clone().setY(it.ground + 2), 70, 9, 12);
      g.fx.explosion(it.pos.clone().setY(it.ground + 1.5), 5, 0xffd23f);
      audio.play("boom", 2);
      audio.play("airhorn");
      g.score.add(500);
      g.fx.text(it.pos.clone().setY(it.ground + it.h + 1), "+500 ENVIRONMENTAL DESTRUCTION", "#ffd23f", { size: 1, life: 1.8, rise: 1 });
      g.camRig.shake(0.6);
      this.removeItem(it, true);
    }
  }

  private removeItem(it: Hallucination, splice: boolean) {
    it.obj.removeFromParent();
    if (it.ob) {
      it.ob.alive = false;
      const idx = this.g.arena.obstacles.indexOf(it.ob);
      if (idx >= 0) this.g.arena.obstacles.splice(idx, 1);
    }
    if (splice) {
      const i = this.items.indexOf(it);
      if (i >= 0) this.items.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- pickups

  spawnPickup(kind: PickupKind, at: THREE.Vector3) {
    const grp = new THREE.Group();
    if (kind === "golden") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.15, emissive: 0xffa500, emissiveIntensity: 0.9 }));
      m.position.y = 0.9;
      grp.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd23f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(3);
      glow.position.y = 0.9;
      grp.add(glow);
    } else {
      const color = kind === "crate" ? 0xff5b8a : kind === "gpu" ? 0x76ff6b : 0x7df9ff;
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.8, 0.8, 3, 0.14), new THREE.MeshStandardMaterial({ color: 0x241a48, metalness: 0.5, roughness: 0.3, emissive: color, emissiveIntensity: 0.25 }));
      box.position.y = 0.8;
      grp.add(box);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(kind === "crate" ? "❤️" : kind === "gpu" ? "⚡" : "🪙").tex, transparent: true, depthWrite: false }));
      icon.scale.setScalar(0.75);
      icon.position.y = 1.75;
      grp.add(icon);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false, transparent: true, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      grp.add(ring);
    }
    const gy = this.g.arena.groundAt(at.x, at.z, at.y + 2);
    grp.position.set(at.x, gy === -Infinity ? 0 : gy, at.z);
    this.g.scene.add(grp);
    this.pickups.push({ kind, obj: grp, pos: grp.position, t: 0, life: kind === "golden" ? 60 : 25 });
  }

  /** nearest pickup within reach, for the [E] prompt */
  nearestPickup(p: THREE.Vector3, reach = 2.4) {
    let best: Pickup | null = null;
    let bd = reach * reach;
    for (const pk of this.pickups) {
      const d = pk.pos.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = pk;
      }
    }
    return best;
  }

  label(pk: Pickup) {
    return PICKUP_LABEL[pk.kind];
  }

  collect(pk: Pickup) {
    const g = this.g;
    const i = this.pickups.indexOf(pk);
    if (i >= 0) this.pickups.splice(i, 1);
    pk.obj.removeFromParent();
    audio.play("pickup");
    g.fx.burst(pk.pos.clone().setY(pk.pos.y + 1), 0xffffff, 30, 7, { size: 0.6 });
    g.fx.starBurst(pk.pos.clone().setY(pk.pos.y + 1), [0xffd23f, 0x7df9e0, 0xff6bd6], 10, 5);
    g.onPickup(pk.kind, pk.pos);
  }

  dropOrbs(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n && this.orbs.length < 240; i++) {
      this.orbs.push({ pos: at.clone().setY(at.y + 0.8), vel: new THREE.Vector3(rand(-4, 4), rand(5, 9), rand(-4, 4)), t: 0, value: 4 });
    }
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number, t: number) {
    const g = this.g;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.landed) {
        it.vy -= 40 * dt;
        it.pos.y += it.vy * dt;
        it.obj.rotation.x += it.spinX * dt;
        it.obj.rotation.z += it.spinZ * dt;
        if (it.pos.y <= it.ground) this.land(it);
        it.obj.position.copy(it.pos);
        g.arena.pushShadow(it.pos.x, it.pos.z, it.pos.y, it.r * 2.6 * (1 - Math.min(1, (it.pos.y - it.ground) / 80)) + 1);
      } else {
        it.life -= dt;
        it.obj.traverse((o) => {
          if (o.userData.spin) o.rotation.y += dt * 2.5;
          if (o.userData.toast) o.position.y = 2.6 + Math.max(0, Math.sin(t * 2 + o.position.x)) * 1.8;
        });
        if (it.flash > 0) {
          it.flash -= dt * 6;
          it.obj.scale.setScalar(1 + Math.max(0, it.flash) * 0.06);
        }
        if (it.life < 1) it.obj.scale.setScalar(Math.max(0.001, it.life));
        if (it.life <= 0) {
          g.fx.burst(it.pos.clone().setY(it.ground + 1.5), 0xffffff, 30, 6, { size: 0.8 });
          this.removeItem(it, true);
          continue;
        }
        g.arena.pushShadow(it.pos.x, it.pos.z, it.pos.y, it.r * 2.6);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.life -= dt;
      const c = pk.obj.children[0];
      c.rotation.y += dt * 2;
      c.position.y = 0.8 + Math.sin(pk.t * 3) * 0.15 + (pk.kind === "golden" ? 0.1 : 0);
      if (pk.kind === "golden" && Math.random() < 0.2) g.fx.spark(pk.pos.clone().setY(pk.pos.y + 0.9 + rand(-0.5, 0.5)).add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), 0xffd23f, 0.8, 0.4);
      if (pk.life < 3) pk.obj.visible = Math.sin(pk.t * 20) > 0;
      if (pk.life <= 0) {
        pk.obj.removeFromParent();
        this.pickups.splice(i, 1);
      }
    }

    // energy orbs: pop out, then get vacuumed into the player
    const pl = g.player && g.player.alive ? g.player : null;
    let n = 0;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      if (pl && o.t > 0.35) {
        const tx = pl.pos.x - o.pos.x, ty = pl.pos.y + 0.8 - o.pos.y, tz = pl.pos.z - o.pos.z;
        const d = Math.hypot(tx, ty, tz);
        if (d < 7 || o.t > 2.5) {
          const s = 18 + o.t * 12;
          o.vel.set((tx / d) * s, (ty / d) * s, (tz / d) * s);
        }
        if (d < 0.8) {
          g.onOrb(o.value);
          this.orbs.splice(i, 1);
          continue;
        }
      } else {
        o.vel.y -= 20 * dt;
        const gy = g.arena.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.3);
        if (o.pos.y < gy + 0.3) {
          o.pos.y = gy + 0.3;
          o.vel.y = Math.abs(o.vel.y) * 0.4;
          o.vel.x *= 0.8;
          o.vel.z *= 0.8;
        }
      }
      o.pos.addScaledVector(o.vel, dt);
      if (o.t > 12) {
        this.orbs.splice(i, 1);
        continue;
      }
      this.m4.makeRotationY(o.t * 6);
      this.m4.setPosition(o.pos);
      this.orbMesh.setMatrixAt(n++, this.m4);
    }
    this.orbMesh.count = n;
    this.orbMesh.instanceMatrix.needsUpdate = true;
  }
}
