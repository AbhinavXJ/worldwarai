import * as THREE from "three";
import type { Game } from "./engine";
import type { Actor, NpcMood } from "./types";
import { phoneMesh, setExpression } from "./characters";
import { audio } from "./audio";
import { signTexture } from "./textures";
import { lerpAngle } from "./ai";

const _v = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const SIGNS = ["I use all three.", "WHERE IS CLAUDE?", "is this AGI?", "pls no nerf", "context window: 2", "mom get the camera", "honk if ur aligned"];

export function makeSign(text: string) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
  stick.position.y = 0.6;
  g.add(stick);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: signTexture(text), side: THREE.DoubleSide }));
  board.position.y = 1.5;
  g.add(board);
  g.userData.text = text;
  return g;
}

export function setMood(n: Actor, m: NpcMood, time: number) {
  if (n.mood === "uninterested" && m !== "celebrate") return;
  n.mood = m;
  n.moodTime = time;
  n.stateTime = 0;
}

export function giveSign(g: Game, n: Actor, text?: string) {
  if (n.sign) n.sign.removeFromParent();
  const s = makeSign(text ?? SIGNS[Math.floor(Math.random() * SIGNS.length)]);
  s.position.set(0.5, 0.2, 0);
  s.scale.setScalar(1.25);
  n.rig.root.add(s);
  n.sign = s;
  n.mood = "sign";
  n.moodTime = rand(14, 22);
  void g;
}

export function dropSign(n: Actor) {
  if (n.sign) {
    n.sign.removeFromParent();
    n.sign = undefined;
  }
}

/** React to something loud nearby. */
export function npcReact(g: Game, n: Actor, p: THREE.Vector3, big: boolean) {
  if (n.mood === "uninterested" || n.mood === "trip") return;
  const d = n.pos.distanceTo(p);
  if (d > (big ? 16 : 9)) return;
  const r = Math.random();
  n.lookAt = p.clone();
  if (r < 0.45) {
    setMood(n, "flee", rand(1.6, 2.6));
    setExpression(n.rig.face, "surprised", 1);
  } else if (r < 0.65) {
    setMood(n, "stare", rand(1.2, 2));
    if (Math.random() < 0.4) g.fx.emoji(n.pos.clone().setY(n.pos.y + 1.4), Math.random() < 0.5 ? "👀" : "‼️", 0.6, 1);
  } else if (r < 0.82) {
    setMood(n, "hide", rand(3, 5));
  } else {
    setMood(n, "cheer", rand(1.2, 2));
  }
}

export function updateNpc(g: Game, n: Actor, dt: number) {
  n.moodTime -= dt;
  n.stateTime += dt;
  n.bubbleCd -= dt;
  const speed = n.speed;
  let dir = _v.set(0, 0, 0);
  let sp = 0;
  n.action = "none";
  if (n.frozen) {
    n.move.set(0, 0);
    if (n.lookAt) n.yaw = lerpAngle(n.yaw, Math.atan2(n.lookAt.x - n.pos.x, n.lookAt.z - n.pos.z), Math.min(1, dt * 5));
    return;
  }

  switch (n.mood) {
    case "wander":
      if (n.pos.distanceTo(n.wander) < 1 || n.stateTime > 8) {
        n.wander.copy(g.arena.randomPointOnIsland(2, Math.random() < 0.8 ? 0 : undefined));
        n.stateTime = 0;
      }
      dir.subVectors(n.wander, n.pos);
      sp = speed * 0.45;
      if (n.moodTime <= 0) pickIdleMood(g, n);
      if (Math.random() < 0.0015 && n.grounded) {
        // trip over absolutely nothing
        n.rig.fallTimer = 1.6;
        setMood(n, "trip", 1.6);
        audio.play("bonk");
      }
      break;
    case "flee": {
      const from = n.lookAt ?? g.danger.pos;
      dir.subVectors(n.pos, from);
      sp = speed * 1.25;
      n.action = "scared";
      // running into each other
      for (const o of g.npcs) {
        if (o === n || o.mood !== "flee") continue;
        if (o.pos.distanceToSquared(n.pos) < 0.3 && n.rig.fallTimer <= 0) {
          n.rig.fallTimer = 1.6;
          o.rig.fallTimer = 1.6;
          setMood(n, "trip", 1.6);
          setMood(o, "trip", 1.6);
          audio.play("bonk");
          g.fx.text(n.pos.clone().setY(n.pos.y + 1.2), "bonk", "#ffffff", { size: 0.5, life: 0.6 });
          break;
        }
      }
      if (n.moodTime <= 0) setMood(n, "wander", rand(4, 8));
      break;
    }
    case "stare":
      if (n.lookAt) n.yaw = lerpAngle(n.yaw, Math.atan2(n.lookAt.x - n.pos.x, n.lookAt.z - n.pos.z), Math.min(1, dt * 8));
      setExpression(n.rig.face, "surprised", 0.2);
      if (n.moodTime <= 0) setMood(n, "wander", rand(3, 6));
      break;
    case "hide": {
      const from = n.lookAt ?? g.danger.pos;
      // find nearest obstacle and get behind it
      let best = null as null | { x: number; z: number; r: number };
      let bd = 400;
      for (const ob of g.arena.obstacles) {
        if (!ob.alive) continue;
        const d = (ob.x - n.pos.x) ** 2 + (ob.z - n.pos.z) ** 2;
        if (d < bd) {
          bd = d;
          best = ob;
        }
      }
      if (best) {
        const away = new THREE.Vector3(best.x - from.x, 0, best.z - from.z).normalize();
        const spot = new THREE.Vector3(best.x + away.x * (best.r + 0.6), 0, best.z + away.z * (best.r + 0.6));
        dir.subVectors(spot, n.pos);
        if (dir.lengthSq() < 0.3) {
          dir.set(0, 0, 0);
          n.action = "sit";
          n.yaw = lerpAngle(n.yaw, Math.atan2(from.x - n.pos.x, from.z - n.pos.z), Math.min(1, dt * 6));
          if (Math.random() < 0.003) g.fx.emoji(n.pos.clone().setY(n.pos.y + 1), "🫣", 0.5, 1);
        }
        sp = speed;
      }
      if (n.moodTime <= 0) setMood(n, "wander", rand(4, 8));
      break;
    }
    case "cheer":
    case "celebrate":
      n.action = "cheer";
      if (g.player) n.yaw = lerpAngle(n.yaw, Math.atan2(g.camRig.pos.x - n.pos.x, g.camRig.pos.z - n.pos.z), Math.min(1, dt * 4));
      if (n.moodTime <= 0 && n.mood === "cheer") setMood(n, "wander", rand(4, 8));
      if (n.mood === "celebrate" && n.grounded && Math.random() < 0.02) n.vel.y = 6;
      break;
    case "dance":
      n.action = "dance";
      if (n.moodTime <= 0) setMood(n, "wander", rand(4, 8));
      break;
    case "selfie":
      n.action = "selfie";
      if (n.stateTime < 0.05 && !n.rig.armR.userData.phone) {
        const ph = phoneMesh();
        ph.position.set(0.1, -0.45, 0.12);
        n.rig.armR.add(ph);
        n.rig.armR.userData.phone = ph;
      }
      if (Math.floor(n.stateTime * 1.5) !== Math.floor((n.stateTime - dt) * 1.5)) {
        const ph = n.rig.armR.userData.phone as THREE.Object3D | undefined;
        if (ph) {
          ph.getWorldPosition(_v);
          g.fx.spark(_v, 0xffffff, 2.2, 0.15);
          if (g.player && g.player.pos.distanceTo(n.pos) < 10) audio.play("shutter");
        }
        setExpression(n.rig.face, Math.random() < 0.5 ? "happy" : "smug", 0.6);
      }
      if (n.moodTime <= 0) {
        const ph = n.rig.armR.userData.phone as THREE.Object3D | undefined;
        ph?.removeFromParent();
        n.rig.armR.userData.phone = undefined;
        setMood(n, "wander", rand(4, 8));
      }
      break;
    case "trip":
      if (n.moodTime <= 0) setMood(n, "wander", rand(3, 6));
      break;
    case "uninterested":
      dir.copy(n.aim);
      sp = speed * 0.4;
      if (n.bubbleCd <= 0) {
        g.fx.bubble(n.rig.root, Math.random() < 0.5 ? "☕" : "anyway", n.rig.height * n.scale + 0.5, 2);
        n.bubbleCd = 6;
      }
      if (!g.arena.walkable(n.pos.x + n.aim.x * 1.2, n.pos.z + n.aim.z * 1.2)) {
        // made it across. turn around and do it again, still not interested
        n.aim.multiplyScalar(-1);
      }
      if (n.moodTime <= 0) {
        n.mood = "wander";
        n.moodTime = rand(4, 8);
      }
      break;
    case "sign":
      if (n.pos.distanceTo(n.wander) < 1 || n.stateTime > 10) {
        n.wander.copy(g.arena.randomPointOnIsland(3, 0));
        n.stateTime = 0;
      }
      dir.subVectors(n.wander, n.pos);
      sp = speed * 0.3;
      if (n.moodTime <= 0) {
        if (n.sign?.userData.text === "WHERE IS CLAUDE?") g.secrets.claudeRun();
        dropSign(n);
        setMood(n, "wander", rand(4, 8));
      }
      break;
  }

  dir.y = 0;
  if (dir.lengthSq() > 0.0001) dir.normalize();
  if (dir.lengthSq() > 0 && n.mood !== "uninterested") {
    if (!g.arena.walkable(n.pos.x + dir.x * 1.4, n.pos.z + dir.z * 1.4)) {
      const is = g.arena.islandAt(n.pos.x, n.pos.z);
      if (is) dir.set(is.x - n.pos.x, 0, is.z - n.pos.z).normalize();
    }
  }
  n.move.set(dir.x * sp, dir.z * sp);
  if (sp > 0 && dir.lengthSq() > 0) n.yaw = lerpAngle(n.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 8));
}

function pickIdleMood(g: Game, n: Actor) {
  const r = Math.random();
  if (r < 0.2) setMood(n, "dance", rand(2.5, 4.5));
  else if (r < 0.38) setMood(n, "selfie", rand(2, 3.5));
  else if (r < 0.48) setMood(n, "cheer", rand(1.5, 2.5));
  else if (r < 0.56 && !g.npcs.some((o) => o.sign)) giveSign(g, n);
  else setMood(n, "wander", rand(5, 10));
}

export function makeUninterested(g: Game, n: Actor) {
  const a = Math.random() * Math.PI * 2;
  n.pos.set(Math.cos(a) * 19, 0, Math.sin(a) * 19);
  n.aim.set(-Math.cos(a), 0, -Math.sin(a));
  n.mood = "uninterested";
  n.moodTime = 22;
  n.bubbleCd = 0.5;
  void g;
}
