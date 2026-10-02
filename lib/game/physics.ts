import * as THREE from "three";
import type { Game } from "./engine";
import type { Actor } from "./types";
import { kickSquash } from "./characters";
import { audio } from "./audio";

const _v = new THREE.Vector3();

export const GRAVITY = 34;

/** Ballistic velocity that lands at `to` after `T` seconds. */
export function ballisticTo(from: THREE.Vector3, to: THREE.Vector3, T: number, grav: number, out: THREE.Vector3) {
  out.set((to.x - from.x) / T, (to.y - from.y + 0.5 * grav * T * T) / T, (to.z - from.z) / T);
  return out;
}

/** Arcade physics: exaggerated, bouncy and forgiving. */
export function stepActor(g: Game, a: Actor, dt: number) {
  const grav = GRAVITY * g.gravityScale;
  const arena = g.arena;

  if (a.ballistic) {
    // launched: no steering, just a glorious arc
  } else {
    const accel = a.grounded ? 60 : 14;
    const k = Math.min(1, accel * dt * 0.1);
    a.vel.x += (a.move.x - a.vel.x) * k * (a.grounded ? 1.6 : 0.6);
    a.vel.z += (a.move.y - a.vel.z) * k * (a.grounded ? 1.6 : 0.6);
  }

  a.vel.y -= grav * dt;
  a.pos.x += (a.vel.x + a.knock.x) * dt;
  a.pos.y += (a.vel.y + a.knock.y) * dt;
  a.pos.z += (a.vel.z + a.knock.z) * dt;
  const fr = Math.exp(-(a.grounded ? 6 : 1.2) * dt);
  a.knock.x *= fr;
  a.knock.z *= fr;
  a.knock.y *= Math.exp(-4 * dt);

  const gy = arena.groundAt(a.pos.x, a.pos.z, a.pos.y);
  const wasGrounded = a.grounded;
  if (gy > -Infinity && a.pos.y <= gy + 0.001 && a.vel.y + a.knock.y <= 0.01) {
    if (!wasGrounded && a.airTime > 0.25) onLand(g, a, -a.vel.y);
    a.pos.y = gy;
    a.vel.y = 0;
    a.knock.y = 0;
    a.grounded = true;
    a.airTime = 0;
    a.lastGroundY = gy;
    if (a.ballistic) {
      a.ballistic = false;
      a.vel.x *= 0.3;
      a.vel.z *= 0.3;
    }
    a.tumble = 0;
  } else {
    a.grounded = a.grounded && gy > -Infinity && a.pos.y - gy < 0.08;
    if (!a.grounded) a.airTime += dt;
  }

  // obstacles: push out, report big hits (idiots love this)
  for (const ob of arena.obstacles) {
    if (!ob.alive || a.pos.y > ob.top || a.pos.y < ob.y - 1.5) continue;
    const dx = a.pos.x - ob.x, dz = a.pos.z - ob.z;
    const rr = ob.r + a.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = rr - d;
      const nx = dx / d, nz = dz / d;
      a.pos.x += nx * push;
      a.pos.z += nz * push;
      const vn = a.vel.x * nx + a.vel.z * nz;
      const kn = a.knock.x * nx + a.knock.z * nz;
      if (vn < 0) {
        a.vel.x -= vn * nx;
        a.vel.z -= vn * nz;
      }
      if (kn < 0) {
        a.knock.x -= kn * nx * 1.6;
        a.knock.z -= kn * nz * 1.6;
      }
      if (-vn - kn > 6) g.onObstacleHit(a, ob, -vn - kn);
    }
  }

  // launch pads
  if (a.grounded && !a.ballistic) {
    for (const p of arena.pads) {
      if ((a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2 < p.r * p.r && Math.abs(a.pos.y - p.y) < 0.5) {
        _v.set(p.tx + (Math.random() - 0.5) * 2, p.ty, p.tz + (Math.random() - 0.5) * 2);
        ballisticTo(a.pos, _v, 1.35, grav, a.vel);
        a.knock.set(0, 0, 0);
        a.ballistic = true;
        a.grounded = false;
        a.pos.y += 0.1;
        p.pulse = 1;
        kickSquash(a.rig, -9);
        if (a.isPlayer || Math.random() < 0.3) audio.play("boing");
        g.fx.ring(a.pos, 0.4, 2.4, 0.4, 0xffd23f);
        g.fx.burst(a.pos, 0xffd23f, 14, 6, { size: 0.5, up: 4 });
        if (!a.isPlayer && Math.random() < 0.5) g.fx.bubble(a.rig.root, Math.random() < 0.5 ? "wheee" : "AAAA", a.rig.height + 0.7, 1.2);
        break;
      }
    }
  }

  // portals
  if (a.portalCd > 0) a.portalCd -= dt;
  else {
    for (const p of arena.portals) {
      const dx = a.pos.x - p.x, dz = a.pos.z - p.z;
      if (dx * dx + dz * dz < 1.1 && Math.abs(a.pos.y - p.y) < 1.5) {
        const to = arena.portals[p.to];
        g.fx.burst(a.pos.clone().setY(a.pos.y + 1), 0x6bd6ff, 24, 6, { size: 0.6 });
        a.pos.set(to.x + Math.sin(to.mesh.rotation.y) * 2.2, to.y + 0.2, to.z + Math.cos(to.mesh.rotation.y) * 2.2);
        a.vel.set(0, 6, 0);
        a.portalCd = 2;
        g.fx.burst(a.pos.clone().setY(a.pos.y + 1), 0xff6bd6, 24, 6, { size: 0.6 });
        if (a.isPlayer) {
          audio.play("portal");
          g.camRig.snap();
        }
        break;
      }
    }
  }

  if (a.pos.y < -38) g.onFallOut(a);
}

function onLand(g: Game, a: Actor, impact: number) {
  kickSquash(a.rig, Math.min(14, impact * 0.55));
  if (impact > 9) {
    g.fx.ring(a.pos, 0.2, 1.4 + impact * 0.04, 0.3, 0xffffff);
    g.fx.pixelBurst(a.pos, [0xffffff, 0xd9c8ff], 6, 3, 0.08, 2);
  }
  if (a.isPlayer) {
    audio.play("land");
    if (impact > 18) g.camRig.shake(0.25);
  } else if (impact > 20 && a.alive && Math.random() < 0.4) {
    // splat landing gag
    a.rig.fallTimer = 1.6;
    if (Math.random() < 0.5) g.fx.emoji(a.pos.clone().setY(a.pos.y + a.rig.height + 0.4), "💫", 0.7, 0.9);
  }
}

/** Soft circle separation so crowds squish instead of overlapping. */
export function separate(actors: Actor[]) {
  const n = actors.length;
  for (let i = 0; i < n; i++) {
    const a = actors[i];
    if (!a.alive && a.dying <= 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = actors[j];
      if (!b.alive && b.dying <= 0) continue;
      if (a.phaseThrough > 0 || b.phaseThrough > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || Math.abs(a.pos.y - b.pos.y) > 1.4) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = (rr - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      const wa = a.isPlayer ? 0.35 : b.isPlayer ? 1.65 : 1;
      const wb = 2 - wa;
      if (a.alive) {
        a.pos.x -= nx * push * wa;
        a.pos.z -= nz * push * wa;
      }
      if (b.alive) {
        b.pos.x += nx * push * wb;
        b.pos.z += nz * push * wb;
      }
    }
  }
}
