import * as THREE from "three";
import type { Game } from "./engine";
import type { Actor, Personality } from "./types";
import { damage, segmentHits } from "./combat";
import { setExpression, kickSquash } from "./characters";
import { audio } from "./audio";
import { DOT_LINES, GROK_LINES, MUSE_LINES } from "./config";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const PERSONALITY_WEIGHTS: [Personality, number][] = [
  ["aggressive", 0.42],
  ["menace", 0.2],
  ["confused", 0.14],
  ["idiot", 0.13],
  ["coward", 0.11],
];

export function rollPersonality(): Personality {
  let r = Math.random();
  for (const [p, w] of PERSONALITY_WEIGHTS) {
    if ((r -= w) <= 0) return p;
  }
  return "aggressive";
}

const SPEED_MULT: Record<Personality, number> = { aggressive: 0.78, menace: 0.8, coward: 0.82, confused: 0.5, idiot: 0.95 };

export function lineFor(a: Actor) {
  const pool = a.faction === "dot" ? DOT_LINES : a.faction === "muse" ? MUSE_LINES : GROK_LINES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickTarget(g: Game, a: Actor): Actor | null {
  const p = g.player && g.player.alive && g.phase === "playing" ? g.player : null;
  const nearestOther = (includePlayer: boolean) => {
    let best: Actor | null = null;
    let bd = 30 * 30;
    for (const o of g.actors) {
      if (!o.alive || o.isNpc || o === a || o.faction === a.faction || o.ally) continue;
      if (o.isPlayer && !includePlayer) continue;
      const d = o.pos.distanceToSquared(a.pos);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  switch (a.personality) {
    case "menace":
      return nearestOther(false) ?? p;
    case "confused":
      return Math.random() < 0.4 ? nearestOther(true) : null;
    default: {
      if (!p) return nearestOther(false);
      // aggressive ones still get distracted by a rival right next to them
      const o = nearestOther(false);
      if (o && o.pos.distanceToSquared(a.pos) < 9 && Math.random() < 0.35) return o;
      return p;
    }
  }
}

function attackRange(a: Actor) {
  return a.faction === "muse" ? 11 : a.faction === "grok" ? 9 : 8;
}

export function updateEnemyAI(g: Game, a: Actor, dt: number) {
  a.attackCd -= dt;
  a.stateTime += dt;
  a.bubbleCd -= dt;
  if (a.frozen) {
    a.move.set(0, 0);
    return;
  }
  if (a.spawnT > 0) {
    a.spawnT -= dt;
    a.move.set(0, 0);
    a.state = "idle";
    return;
  }
  if (a.stun > 0) {
    a.stun -= dt;
    a.state = "stunned";
    a.action = "stun";
    a.move.set(0, 0);
    if (a.stun <= 0) a.action = "none";
    return;
  }
  if (a.telegraph > 0) {
    a.move.set(0, 0);
    a.telegraph -= dt;
    faceToward(a, a.aim, dt, 10);
    if (a.telegraph <= 0) fireLaser(g, a);
    return;
  }

  a.think -= dt;
  if (a.think <= 0) {
    a.think = rand(0.18, 0.32);
    decide(g, a);
  }
  steer(g, a, dt);
  flavour(g, a, dt);
}

function decide(g: Game, a: Actor) {
  const t = a.target && a.target.alive ? a.target : null;
  if (!t || Math.random() < 0.15) a.target = pickTarget(g, a);
  const tgt = a.target;

  if (a.personality === "confused") {
    if (tgt && a.attackCd <= 0 && Math.random() < 0.35) setState(a, "attack");
    else if (a.state !== "patrol" || a.pos.distanceTo(a.wander) < 1.5) {
      setState(a, "patrol");
      a.wander.copy(g.arena.randomPointOnIsland(0, g.arena.islands.indexOf(g.arena.islandAt(a.pos.x, a.pos.z) ?? g.arena.islands[0])));
    }
    return;
  }
  if (!tgt) {
    if (a.state !== "patrol" || a.pos.distanceTo(a.wander) < 1.5) {
      setState(a, "patrol");
      a.wander.copy(g.arena.randomPointOnIsland(0, 0));
    }
    return;
  }
  const d = a.pos.distanceTo(tgt.pos);
  const lowHp = a.hp < a.maxHp * 0.3;
  if (a.personality === "coward" && (d < 8 || lowHp)) {
    setState(a, "flee");
    return;
  }
  if (lowHp && a.personality !== "idiot" && Math.random() < 0.08) {
    setState(a, "flee");
    if (a.bubbleCd <= 0) bubble(g, a, ["nope", "brb", "AAAA", "mom?"][Math.floor(Math.random() * 4)]);
    return;
  }
  // dodge incoming player projectiles
  if ((a.personality === "aggressive" || a.personality === "coward") && a.state !== "dodge" && Math.random() < (a.personality === "coward" ? 0.5 : 0.25)) {
    if (g.threatNear(a, 5)) {
      setState(a, "dodge");
      const side = Math.random() < 0.5 ? 1 : -1;
      _v.subVectors(tgt.pos, a.pos).normalize();
      a.aim.set(-_v.z * side, 0, _v.x * side);
      a.vel.y = 7;
      a.grounded = false;
      kickSquash(a.rig, -6);
      return;
    }
  }
  if (a.state === "dodge" && a.stateTime < 0.35) return;
  if (a.personality === "idiot") {
    if (a.state !== "chase" || a.stateTime > 2.2) {
      setState(a, "chase");
      // idiots commit to one heading and never look back
      a.aim.subVectors(tgt.pos, a.pos).setY(0).normalize();
    }
    if (d < 2.5 && a.attackCd <= 0) setState(a, "attack");
    return;
  }
  if (d > attackRange(a) || !sameLevel(g, a, tgt)) setState(a, "chase");
  else setState(a, "attack");
}

function setState(a: Actor, s: Actor["state"]) {
  if (a.state !== s) {
    a.state = s;
    a.stateTime = 0;
  }
}

function sameLevel(g: Game, a: Actor, b: Actor) {
  return g.arena.islandAt(a.pos.x, a.pos.z) === g.arena.islandAt(b.pos.x, b.pos.z) || a.pos.distanceTo(b.pos) < 6;
}

/** Waypoint toward another island: bridge mouth or launch pad, otherwise straight at it. */
function navTarget(g: Game, a: Actor, goal: THREE.Vector3, out: THREE.Vector3) {
  const ar = g.arena;
  const from = ar.islandAt(a.pos.x, a.pos.z);
  const to = ar.islandAt(goal.x, goal.z);
  out.copy(goal);
  if (!from || !to || from === to) return out;
  const fi = ar.islands.indexOf(from);
  const ti = ar.islands.indexOf(to);
  const hop = fi !== 0 && ti !== 0 ? 0 : ti;
  for (const b of ar.bridges) {
    const bi = ar.islands.indexOf(ar.islandAt(b.bx, b.bz)!);
    if (fi === 0 && bi === hop) return out.set(b.ax, 0, b.az);
    if (bi === fi && hop === 0) return out.set(b.bx, from.y, b.bz);
  }
  for (const p of ar.pads) {
    const pi = ar.islands.indexOf(ar.islandAt(p.x, p.z)!);
    const qi = ar.islands.indexOf(ar.islandAt(p.tx, p.tz)!);
    if (pi === fi && qi === hop) return out.set(p.x, p.y, p.z);
  }
  return out;
}

function steer(g: Game, a: Actor, dt: number) {
  const speed = a.speed * SPEED_MULT[a.personality];
  const tgt = a.target && a.target.alive ? a.target : null;
  const dir = _v.set(0, 0, 0);
  let sp = speed;
  a.action = "none";
  switch (a.state) {
    case "chase":
      if (a.personality === "idiot") dir.copy(a.aim);
      else if (tgt) dir.subVectors(navTarget(g, a, tgt.pos, _v2), a.pos);
      break;
    case "attack":
      if (tgt) {
        _v2.subVectors(tgt.pos, a.pos).setY(0);
        const d = _v2.length();
        _v2.normalize();
        const want = a.faction === "dot" ? 4 : attackRange(a) * 0.65;
        const strafe = Math.sin(a.stateTime * 1.3 + a.id) > 0 ? 1 : -1;
        dir.set(-_v2.z * strafe * 0.7, 0, _v2.x * strafe * 0.7);
        if (d > want + 1) dir.addScaledVector(_v2, 1);
        else if (d < want - 1) dir.addScaledVector(_v2, -0.8);
        sp = speed * 0.55;
        if (a.attackCd <= 0) performAttack(g, a, tgt);
        faceToward(a, tgt.pos, dt, 8);
      }
      break;
    case "flee": {
      const threat = tgt ?? g.player;
      if (threat) dir.subVectors(a.pos, threat.pos);
      sp = speed * 1.15;
      a.action = "scared";
      if (a.stateTime > 3) a.state = "chase";
      break;
    }
    case "patrol":
      dir.subVectors(a.wander, a.pos);
      sp = speed * 0.55;
      break;
    case "dodge":
      dir.copy(a.aim);
      sp = speed * 1.8;
      break;
    default:
      break;
  }
  dir.y = 0;
  if (dir.lengthSq() > 0.0001) dir.normalize();
  // edge avoidance for everyone but the idiots
  if (a.personality !== "idiot" && dir.lengthSq() > 0) {
    const ax = a.pos.x + dir.x * 1.6, az = a.pos.z + dir.z * 1.6;
    if (!g.arena.walkable(ax, az)) {
      const is = g.arena.islandAt(a.pos.x, a.pos.z);
      if (is) {
        const towardCenter = _v2.set(is.x - a.pos.x, 0, is.z - a.pos.z).normalize();
        dir.lerp(towardCenter, 0.85).normalize();
      }
    }
  }
  a.move.set(dir.x * sp, dir.z * sp);
  if (a.state !== "attack" && dir.lengthSq() > 0.01) a.yaw = lerpAngle(a.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 10));
}

function faceToward(a: Actor, p: THREE.Vector3, dt: number, k: number) {
  a.yaw = lerpAngle(a.yaw, Math.atan2(p.x - a.pos.x, p.z - a.pos.z), Math.min(1, dt * k));
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function performAttack(g: Game, a: Actor, t: Actor) {
  const d = a.pos.distanceTo(t.pos);
  const diff = g.difficulty;
  a.atkT = 0;
  if (a.faction === "dot") {
    if (d < 2.4) {
      // headbonk
      _v.subVectors(t.pos, a.pos).setY(0).normalize();
      a.knock.addScaledVector(_v, 10);
      damage(g, t, 6 * diff, a, { dir: _v, knock: 9, launch: 4 });
      audio.play("bonk");
      g.fx.text(t.pos.clone().setY(t.pos.y + 1.6), "bonk", "#7df9e0", { size: 0.6, life: 0.6 });
      a.attackCd = rand(1.1, 1.6);
    } else {
      shoot(g, a, t, 16, 4.5 * diff, 0x9ffff0, 0);
      a.attackCd = rand(1.2, 1.9);
    }
  } else if (a.faction === "muse") {
    const triple = Math.random() < 0.25;
    for (let i = triple ? -1 : 0; i <= (triple ? 1 : 0); i++) shoot(g, a, t, 14, 5.5 * diff, i === 0 ? 0xff6bd6 : 0x8f7bff, i * 0.22, 0.6);
    audio.play("enemyShot");
    a.attackCd = rand(1.5, 2.3);
    if (Math.random() < 0.15) a.rig.poseTimer = 0.8;
  } else {
    if (d < 2.6) {
      _v.subVectors(t.pos, a.pos).setY(0).normalize();
      damage(g, t, 8 * diff, a, { dir: _v, knock: 15, launch: 6 });
      audio.play("bonk");
      g.fx.text(t.pos.clone().setY(t.pos.y + 1.6), "POW", "#ffd23f", { size: 0.7, life: 0.6 });
      a.attackCd = rand(1.4, 2);
    } else {
      a.telegraph = 0.6;
      a.aim.copy(t.pos);
      a.aim.y += 0.6;
      a.attackCd = rand(2.2, 3);
      _v.copy(a.pos).setY(a.pos.y + 1.1);
      g.fx.beam(_v, _v2.copy(a.aim).sub(_v).setLength(16).add(_v), 0.03, 0xff2a2a, 0.6, 2);
    }
  }
}

function shoot(g: Game, a: Actor, t: Actor, speed: number, dmg: number, color: number, spread: number, wobble = 0) {
  const from = _v.copy(a.pos);
  from.y += a.rig.height * 0.55;
  const to = _v2.copy(t.pos);
  to.y += t.rig.height * 0.45;
  const dir = to.sub(from).normalize();
  if (spread) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
  g.projectiles.fire({ kind: "enemy", pos: from, vel: dir.multiplyScalar(speed), dmg, owner: a, faction: a.faction, color, size: 0.2, radius: 0.35, life: 2, wobble, trail: 0.5, knock: 5 });
}

function fireLaser(g: Game, a: Actor) {
  const from = _v.copy(a.pos);
  from.y += 1.1;
  const dir = _v2.copy(a.aim).sub(from).normalize();
  const to = dir.clone().multiplyScalar(16).add(from);
  g.fx.beam(from, to, 0.16, 0xff4a2a, 0.25, 3);
  g.fx.spark(from, 0xffffff, 1.2, 0.15);
  audio.play("laser");
  const hits = segmentHits(g, from, to, 0.5, (x) => !x.isNpc && x.faction !== a.faction && !x.ally);
  hits.sort((p, q) => p.pos.distanceToSquared(from) - q.pos.distanceToSquared(from));
  if (hits[0]) damage(g, hits[0], 9 * g.difficulty, a, { dir: dir.clone().setY(0).normalize(), knock: 10, launch: 3, color: 0xff4a2a });
}

function bubble(g: Game, a: Actor, text: string) {
  g.fx.bubble(a.rig.root, text, a.rig.height * a.scale + 0.6, 1.4);
  a.bubbleCd = rand(6, 12);
}

/** Little personality beats that make the crowd feel alive. */
function flavour(g: Game, a: Actor, dt: number) {
  if (a.bubbleCd <= 0 && Math.random() < 0.004) {
    bubble(g, a, a.personality === "confused" ? "?" : a.personality === "idiot" ? "hehe" : lineFor(a));
    if (a.personality === "confused") setExpression(a.rig.face, "derp", 1.2);
  }
  if (a.faction === "grok" && a.state === "patrol" && a.rig.fallTimer <= 0 && Math.random() < 0.003) {
    a.rig.fallTimer = 1.6;
    audio.play("bonk");
  }
  if (a.faction === "muse" && (a.state === "patrol" || a.state === "attack") && a.rig.poseTimer <= 0 && Math.random() < 0.002) {
    a.rig.poseTimer = 1.4;
    if (a.bubbleCd <= 0) bubble(g, a, "✨ iconic ✨");
  }
  if (a.rig.poseTimer > 0) {
    a.rig.poseTimer -= dt;
    a.move.set(0, 0);
    a.action = "pose";
    a.actionT += dt;
  }
}
