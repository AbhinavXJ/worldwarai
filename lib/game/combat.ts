import * as THREE from "three";
import type { Game } from "./engine";
import type { Actor, Faction } from "./types";
import { setExpression, kickSquash } from "./characters";
import { audio } from "./audio";
import { FACTION_INFO } from "./config";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export type ProjKind = "dot" | "swarm" | "spark" | "enemy" | "missile" | "paint" | "laserball" | "rain";

export interface Projectile {
  active: boolean;
  kind: ProjKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  t: number;
  dmg: number;
  radius: number;
  size: number;
  faction: Faction | "ally";
  owner: Actor | null;
  color: THREE.Color;
  homing: Actor | null;
  homingStr: number;
  pierce: number;
  hit: number[];
  bounces: number;
  wobble: number;
  wobblePhase: number;
  gravity: number;
  knock: number;
  trail: number;
  speed: number;
  missile?: THREE.Group;
}

export interface FireOpts {
  kind: ProjKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  dmg: number;
  owner: Actor | null;
  faction: Faction | "ally";
  color: number;
  size?: number;
  radius?: number;
  life?: number;
  homing?: Actor | null;
  homingStr?: number;
  pierce?: number;
  bounces?: number;
  wobble?: number;
  gravity?: number;
  knock?: number;
  trail?: number;
}

function buildMissile() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xff6a2b, roughness: 0.4, metalness: 0.3, emissive: 0xff3a00, emissiveIntensity: 0.4 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.57;
  g.add(nose);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  eye.position.set(0.1, 0.08, 0.35);
  g.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = -0.1;
  g.add(eye2);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.25), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
    fin.position.z = -0.35;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.x = Math.cos((i * Math.PI) / 2 + Math.PI / 2) * 0.17;
    fin.position.y = Math.sin((i * Math.PI) / 2 + Math.PI / 2) * 0.17;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(3), toneMapped: false }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -0.65;
  g.add(flame);
  g.scale.setScalar(1.25);
  return g;
}

export class Projectiles {
  list: Projectile[] = [];
  mesh: THREE.InstancedMesh;
  max = 900;
  private missiles: THREE.Group[] = [];

  constructor(private g: Game) {
    const geo = new THREE.SphereGeometry(1, 12, 8);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    g.scene.add(this.mesh);
    for (let i = 0; i < this.max; i++) {
      this.list.push({
        active: false, kind: "dot", pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, t: 0, dmg: 0, radius: 0.3, size: 0.2,
        faction: "dot", owner: null, color: new THREE.Color(), homing: null, homingStr: 0, pierce: 0, hit: [], bounces: 0, wobble: 0,
        wobblePhase: 0, gravity: 0, knock: 4, trail: 0, speed: 0,
      });
    }
    for (let i = 0; i < 6; i++) {
      const m = buildMissile();
      m.visible = false;
      g.scene.add(m);
      this.missiles.push(m);
    }
  }

  fire(o: FireOpts) {
    const p = this.list.find((x) => !x.active);
    if (!p) return null;
    p.active = true;
    p.kind = o.kind;
    p.pos.copy(o.pos);
    p.vel.copy(o.vel);
    p.speed = o.vel.length();
    p.life = o.life ?? 1.6;
    p.t = 0;
    p.dmg = o.dmg;
    p.radius = o.radius ?? 0.45;
    p.size = o.size ?? 0.18;
    p.faction = o.faction;
    p.owner = o.owner;
    p.color.set(o.color);
    p.homing = o.homing ?? null;
    p.homingStr = o.homingStr ?? 0;
    p.pierce = o.pierce ?? 0;
    p.hit.length = 0;
    p.bounces = o.bounces ?? 0;
    p.wobble = o.wobble ?? 0;
    p.wobblePhase = Math.random() * 6;
    p.gravity = o.gravity ?? 0;
    p.knock = o.knock ?? 4;
    p.trail = o.trail ?? 0;
    if (o.kind === "missile") {
      const m = this.missiles.find((x) => !x.visible);
      if (m) {
        m.visible = true;
        p.missile = m;
      }
    }
    return p;
  }

  clear() {
    for (const p of this.list) this.deactivate(p);
  }

  private deactivate(p: Projectile) {
    p.active = false;
    if (p.missile) {
      p.missile.visible = false;
      p.missile = undefined;
    }
  }

  update(dt: number) {
    const g = this.g;
    let n = 0;
    for (const p of this.list) {
      if (!p.active) continue;
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === "missile") explode(g, p.pos, 4.5, p.dmg, p.owner, { color: 0xff6a2b, launch: 13 });
        this.deactivate(p);
        continue;
      }
      // steering
      if (p.homing && (!p.homing.alive || p.homing.dying > 0)) p.homing = p.kind === "swarm" || p.kind === "missile" ? nearestEnemyOf(g, p.pos, p.faction, 30) : null;
      if (p.homing && p.homingStr > 0 && (p.kind !== "missile" || p.bounces <= 0)) {
        _v.copy(p.homing.pos);
        _v.y += p.homing.rig.height * 0.5;
        _v.sub(p.pos).normalize().multiplyScalar(p.speed);
        p.vel.lerp(_v, Math.min(1, p.homingStr * dt));
        if (p.kind === "swarm") p.vel.setLength(p.speed);
      }
      if (p.kind === "missile" && p.bounces > 0) {
        // chaos: random little swerves
        p.vel.x += Math.sin(p.t * 9 + p.wobblePhase) * 26 * dt;
        p.vel.z += Math.cos(p.t * 7 + p.wobblePhase) * 26 * dt;
        p.vel.y = Math.sin(p.t * 5) * 1.2;
        p.vel.setLength(p.speed);
      }
      if (p.gravity) p.vel.y -= p.gravity * dt;
      let wx = 0, wz = 0;
      if (p.wobble) {
        const s = Math.sin(p.t * 22 + p.wobblePhase) * p.wobble;
        wx = -p.vel.z / p.speed * s;
        wz = p.vel.x / p.speed * s;
      }
      p.pos.x += (p.vel.x + wx) * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += (p.vel.z + wz) * dt;

      // trails
      if (p.trail > 0 && Math.random() < p.trail) {
        if (p.kind === "missile") {
          g.fx.trail(p.pos, 0xffb347, 0.6, 0.25);
          g.fx.burst(p.pos, 0x8a7a9a, 1, 0.6, { size: 0.9, life: 0.8, drag: 1, shape: 0 });
        } else if (p.kind === "spark") {
          g.fx.trail(p.pos, Math.random() < 0.5 ? 0xff6bd6 : 0x8f7bff, p.size * 2.4, 0.35);
        } else g.fx.trail(p.pos, p.color, p.size * 2.2, 0.18);
      }

      // world collision
      const gy = g.arena.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.2, 0.2);
      if (p.kind === "missile") {
        if (this.missileBounce(p)) continue;
      } else if (p.pos.y < gy) {
        if (p.kind === "paint") g.arena.splat(p.pos.x, p.pos.z, p.pos.y, 0.4 + Math.random() * 0.6, p.color.clone().multiplyScalar(1.4));
        if (p.kind === "rain") {
          g.onRainLand(p);
        } else g.fx.burst(p.pos, p.color, 4, 3, { size: 0.35, life: 0.25 });
        this.deactivate(p);
        continue;
      } else if (p.pos.y < -30) {
        this.deactivate(p);
        continue;
      }
      if (p.kind !== "missile" && p.kind !== "rain" && hitsObstacle(g, p.pos, p.radius * 0.5)) {
        g.fx.burst(p.pos, p.color, 5, 3, { size: 0.35, life: 0.25 });
        this.deactivate(p);
        continue;
      }
      if (p.kind !== "rain" && g.props.hitTest(p.pos, p.radius, p.faction === g.playerFaction || p.faction === "ally" ? p.dmg : 0)) {
        g.fx.burst(p.pos, p.color, 6, 4, { size: 0.4, life: 0.3 });
        if (p.kind === "missile") explode(g, p.pos, 4.5, p.dmg, p.owner, { color: 0xff6a2b, launch: 13 });
        this.deactivate(p);
        continue;
      }

      // actor collision
      if (p.kind !== "rain") {
        const target = this.hitActor(p);
        if (target) {
          if (p.kind === "missile") {
            explode(g, p.pos, 4.8, p.dmg, p.owner, { color: 0xff6a2b, launch: 14 });
            this.deactivate(p);
            continue;
          }
          _v.copy(p.vel).setY(0).normalize();
          damage(g, target, p.dmg, p.owner, { dir: _v, knock: p.knock, color: p.color.getHex(), at: p.pos, launch: p.kind === "spark" ? 2 : 0 });
          if (p.pierce > 0) {
            p.pierce--;
            p.hit.push(target.id);
          } else {
            this.deactivate(p);
            continue;
          }
        }
      }

      // render
      if (n < this.max && !p.missile) {
        const stretch = p.kind === "spark" ? 3.2 : p.kind === "swarm" ? 1.8 : p.kind === "rain" ? 1.6 : 1.4;
        _v.copy(p.vel).normalize();
        _q.setFromUnitVectors(UP, _v);
        _s.set(p.size, p.size * stretch, p.size);
        _m4.compose(p.pos, _q, _s);
        this.mesh.setMatrixAt(n, _m4);
        _c.copy(p.color).multiplyScalar(p.kind === "enemy" ? 2.2 : 2.6);
        this.mesh.setColorAt(n, _c);
        n++;
      }
      if (p.missile) {
        p.missile.position.copy(p.pos);
        _v.copy(p.pos).add(p.vel);
        p.missile.lookAt(_v);
        p.missile.rotateZ(p.t * 10);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private hitActor(p: Projectile): Actor | null {
    for (const a of this.g.actors) {
      if (!a.alive || a.isNpc || a.ally) continue;
      if (p.faction === "ally") {
        if (a.isPlayer) continue;
      } else if (a.faction === p.faction) continue;
      if (a.isPlayer && p.owner?.isPlayer) continue;
      if (p.hit.length && p.hit.includes(a.id)) continue;
      const cy = a.pos.y + a.rig.height * 0.5 * a.scale;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, dy = cy - p.pos.y;
      const rr = a.radius * a.scale + p.radius;
      if (dx * dx + dz * dz < rr * rr && Math.abs(dy) < a.rig.height * 0.6 * a.scale + p.radius) return a;
    }
    return null;
  }

  /** The chaos missile reflects off trees, rocks and the edges of the island like a pinball. */
  private missileBounce(p: Projectile) {
    const g = this.g;
    const ahead = _v2.copy(p.vel).normalize().multiplyScalar(0.7).add(p.pos);
    const edge = g.arena.groundAt(ahead.x, ahead.z, p.pos.y + 1, 2) === -Infinity;
    let nx = 0, nz = 0;
    let hit = false;
    if (edge) {
      const is = g.arena.islandAt(p.pos.x, p.pos.z);
      const cx = is ? is.x : 0, cz = is ? is.z : 0;
      nx = cx - p.pos.x;
      nz = cz - p.pos.z;
      hit = true;
    } else {
      for (const ob of g.arena.obstacles) {
        if (!ob.alive) continue;
        const dx = p.pos.x - ob.x, dz = p.pos.z - ob.z;
        if (dx * dx + dz * dz < (ob.r + 0.4) ** 2 && p.pos.y < ob.top) {
          nx = dx;
          nz = dz;
          hit = true;
          break;
        }
      }
    }
    if (!hit) return false;
    if (p.bounces <= 0) {
      explode(g, p.pos, 4.5, p.dmg, p.owner, { color: 0xff6a2b, launch: 13 });
      this.deactivate(p);
      return true;
    }
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    const d = p.vel.x * nx + p.vel.z * nz;
    if (d < 0) {
      p.vel.x -= 2 * d * nx;
      p.vel.z -= 2 * d * nz;
    }
    // a little random english on every bounce
    const ang = (Math.random() - 0.5) * 0.9;
    const c = Math.cos(ang), s = Math.sin(ang);
    const vx = p.vel.x * c - p.vel.z * s;
    p.vel.z = p.vel.x * s + p.vel.z * c;
    p.vel.x = vx;
    p.pos.x += nx * 0.3;
    p.pos.z += nz * 0.3;
    p.bounces--;
    p.speed *= 1.12;
    p.vel.setLength(p.speed);
    audio.play("boing");
    g.fx.ring(p.pos, 0.2, 1.6, 0.3, 0xffd23f, 0);
    g.fx.text(p.pos.clone().setY(p.pos.y + 0.8), ["BOINK", "BOING", "WHEE", "lol"][Math.floor(Math.random() * 4)], "#ffd23f", { size: 0.7, life: 0.6 });
    if (p.bounces <= 0) {
      p.homing = nearestEnemyOf(g, p.pos, p.faction, 40);
      p.homingStr = 6;
    }
    return false;
  }
}

export function hitsObstacle(g: Game, p: THREE.Vector3, r: number) {
  for (const ob of g.arena.obstacles) {
    if (!ob.alive || p.y > ob.top || p.y < ob.y) continue;
    const dx = p.x - ob.x, dz = p.z - ob.z;
    if (dx * dx + dz * dz < (ob.r + r) ** 2) return true;
  }
  return false;
}

export function nearestEnemyOf(g: Game, p: THREE.Vector3, faction: Faction | "ally", maxD: number, exclude?: Actor): Actor | null {
  let best: Actor | null = null;
  let bd = maxD * maxD;
  for (const a of g.actors) {
    if (!a.alive || a.isNpc || a === exclude || a.ally) continue;
    if (faction === "ally" ? a.isPlayer : a.faction === faction) continue;
    if (faction === g.playerFaction && a.isPlayer) continue;
    const d = a.pos.distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

export interface DamageOpts {
  dir?: THREE.Vector3;
  knock?: number;
  launch?: number;
  stun?: number;
  color?: number;
  at?: THREE.Vector3;
  silent?: boolean;
  quiet?: boolean;
}

export function damage(g: Game, target: Actor, amount: number, src: Actor | null, o: DamageOpts = {}) {
  if (!target.alive || target.ally) return;
  if (target.isNpc) {
    npcKnock(g, target, o);
    return;
  }
  // ultimates are allowed to punch through the spawn shield
  if (target.invuln > 0 && (target.isPlayer || amount < 60)) return;
  if (target.isPlayer && g.phase !== "playing") return;
  const fromPlayer = !!src && (src.isPlayer || src.ally);
  const amt = amount * (fromPlayer ? g.damageMult : target.isPlayer ? g.incomingMult : 1);
  target.hp -= amt;
  target.flash = 1;
  target.lastHitBy = src;
  if (o.dir && o.knock) {
    target.knock.x += o.dir.x * o.knock;
    target.knock.z += o.dir.z * o.knock;
  }
  if (o.launch) {
    target.vel.y = Math.max(target.vel.y, o.launch);
    target.grounded = false;
    if (o.launch > 9) {
      target.tumble = 1;
      target.tumbleAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      if (Math.random() < 0.35) audio.play("whistle");
    }
  }
  if (o.stun) target.stun = Math.max(target.stun, o.stun);
  setExpression(target.rig.face, "hurt", 0.3);
  kickSquash(target.rig, 6);
  const at = o.at ?? _v.copy(target.pos).setY(target.pos.y + target.rig.height * 0.5);
  if (!o.quiet) {
    g.fx.spark(at, 0xffffff, 1.4, 0.12);
    g.fx.burst(at, o.color ?? FACTION_INFO[target.faction].color, 6, 5, { size: 0.4, life: 0.3 });
  }
  if (fromPlayer) {
    g.onPlayerHit(target, amt, at);
    if (!o.silent) audio.play("hit");
  }
  if (target.isPlayer) g.onPlayerDamaged(amt);
  if (target.hp <= 0) kill(g, target, src);
}

function npcKnock(g: Game, n: Actor, o: DamageOpts) {
  if (o.dir && o.knock) {
    n.knock.x += o.dir.x * o.knock * 1.3;
    n.knock.z += o.dir.z * o.knock * 1.3;
  }
  if (o.launch) {
    n.vel.y = Math.max(n.vel.y, o.launch * 1.1);
    n.grounded = false;
    n.tumble = 1;
    n.tumbleAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  }
  setExpression(n.rig.face, "surprised", 0.8);
  n.mood = "flee";
  n.moodTime = 2;
  void g;
}

export function kill(g: Game, target: Actor, src: Actor | null) {
  target.alive = false;
  target.dying = target.isPlayer ? 0 : 0.55;
  target.state = "defeated";
  target.vel.set(0, 0, 0);
  target.knock.set(0, 0, 0);
  target.ballistic = false;
  const exprs = ["dead", "derp", "surprised", "dead"] as const;
  setExpression(target.rig.face, exprs[Math.floor(Math.random() * exprs.length)], 5);
  g.onKill(target, src);
}

export interface ExplodeOpts {
  color?: number;
  launch?: number;
  knock?: number;
  faction?: Faction | "ally";
  noPlayer?: boolean;
  shake?: number;
  sound?: boolean;
}

/** Radial damage with cartoon knock-up. Returns the number of actors defeated. */
export function explode(g: Game, pos: THREE.Vector3, radius: number, dmg: number, src: Actor | null, o: ExplodeOpts = {}) {
  const color = o.color ?? 0xffd23f;
  g.fx.explosion(pos, radius, color);
  g.arena.shockwave(pos.x, pos.z, Math.min(1.6, 0.4 + radius / 5));
  if (o.sound !== false) audio.play("boom", radius / 4);
  const dPlayer = g.player ? g.player.pos.distanceTo(pos) : 99;
  g.camRig.shake((o.shake ?? 0.5) * Math.max(0.15, 1 - dPlayer / 40));
  let kills = 0;
  const srcFaction = o.faction ?? (src ? (src.ally ? "ally" : src.faction) : null);
  for (const a of g.actors) {
    if (!a.alive) continue;
    const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, dy = a.pos.y - pos.y;
    const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.5);
    if (d > radius + a.radius) continue;
    if (!a.isNpc) {
      if (srcFaction && srcFaction !== "ally" && a.faction === srcFaction) continue;
      if (srcFaction === "ally" && a.isPlayer) continue;
      if (a.isPlayer && (o.noPlayer || src?.isPlayer)) continue;
    }
    const f = 1 - Math.min(1, d / (radius + a.radius));
    _v.set(dx, 0, dz).normalize();
    const before = a.alive;
    damage(g, a, dmg * (0.4 + 0.6 * f), src, { dir: _v, knock: (o.knock ?? 14) * (0.4 + f), launch: (o.launch ?? 10) * (0.5 + f * 0.6), color, silent: true });
    if (before && !a.alive) kills++;
  }
  if (src?.isPlayer && kills >= 3) g.slowmo(0.55, 0.25);
  return kills;
}

/** Thin capsule hit-test along a segment, used by lasers and dashes. */
export function segmentHits(g: Game, a: THREE.Vector3, b: THREE.Vector3, r: number, filter: (x: Actor) => boolean): Actor[] {
  const out: Actor[] = [];
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  for (const x of g.actors) {
    if (!x.alive || !filter(x)) continue;
    const t = Math.max(0, Math.min(1, ((x.pos.x - a.x) * abx + (x.pos.z - a.z) * abz) / len2));
    const px = a.x + abx * t, pz = a.z + abz * t;
    const py = a.y + (b.y - a.y) * t;
    const dx = x.pos.x - px, dz = x.pos.z - pz;
    if (dx * dx + dz * dz < (r + x.radius * x.scale) ** 2 && py > x.pos.y - 0.6 && py < x.pos.y + x.rig.height * x.scale + 0.6) out.push(x);
  }
  return out;
}
