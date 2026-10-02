import * as THREE from "three";
import type { Arena } from "./world";
import { bubbleTexture, emojiTexture, textTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ------------------------------------------------------------------ glow points (GPU sprites)

const glowVert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vShape = aShape;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 220.0);
  gl_Position = projectionMatrix * mv;
}`;
const glowFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a;
  if (vShape < 0.5) {
    a = smoothstep(0.5, 0.0, d);
    a = a * a;
  } else {
    float cross = max(smoothstep(0.08, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)), smoothstep(0.08, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x)));
    a = max(cross, smoothstep(0.22, 0.0, d));
  }
  if (a * vAlpha < 0.003) discard;
  gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);
}`;

class GlowPoints {
  max: number;
  count = 0;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  shape: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  geo: THREE.BufferGeometry;
  points: THREE.Points;
  mat: THREE.ShaderMaterial;

  constructor(max: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aShape", new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, opts: { grav?: number; drag?: number; shape?: number; endSize?: number } = {}) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size;
    this.s1[i] = opts.endSize ?? 0;
    this.grav[i] = opts.grav ?? 0;
    this.drag[i] = opts.drag ?? 2;
    this.shape[i] = opts.shape ?? 0;
    this.size[i] = size;
    this.alpha[i] = 1;
  }

  update(dt: number) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * f;
      this.alpha[i] = Math.min(1, f * 2.5);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    for (const name of ["position", "aColor", "aSize", "aAlpha", "aShape"]) {
      const a = this.geo.attributes[name] as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k];
      this.vel[i * 3 + k] = this.vel[last * 3 + k];
      this.col[i * 3 + k] = this.col[last * 3 + k];
    }
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.s0[i] = this.s0[last];
    this.s1[i] = this.s1[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.shape[i] = this.shape[last];
    this.size[i] = this.size[last];
    this.alpha[i] = this.alpha[last];
  }

  clear() {
    this.count = 0;
  }
}

// ------------------------------------------------------------------ instanced chunks (pixels, stars, confetti)

class Chunks {
  max: number;
  count = 0;
  mesh: THREE.InstancedMesh;
  p: Float32Array;
  v: Float32Array;
  r: Float32Array;
  rv: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  scale: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  flat: Uint8Array;
  colors: THREE.Color[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private t = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, max: number, private arena: Arena) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.r = new Float32Array(max * 3);
    this.rv = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.scale = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.flat = new Uint8Array(max);
    for (let i = 0; i < max; i++) this.colors.push(new THREE.Color());
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, scale: number, life: number, grav = 22, drag = 0.6, flat = false) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.count++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.r.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3);
    this.rv.set([rand(-14, 14), rand(-14, 14), rand(-14, 14)], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.scale[i] = scale;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.flat[i] = flat ? 1 : 0;
    this.colors[i].copy(color);
  }

  update(dt: number) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swap(i, --this.count);
        continue;
      }
      const o = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.v[o] *= k;
      this.v[o + 2] *= k;
      this.v[o + 1] = this.v[o + 1] * (this.flat[i] ? Math.max(0, 1 - 3 * dt) : 1) - this.grav[i] * dt;
      this.p[o] += this.v[o] * dt;
      this.p[o + 1] += this.v[o + 1] * dt;
      this.p[o + 2] += this.v[o + 2] * dt;
      if (this.v[o + 1] < 0) {
        const g = this.arena.groundAt(this.p[o], this.p[o + 2], this.p[o + 1] + 0.3, 0.3);
        if (this.p[o + 1] < g + 0.05) {
          this.p[o + 1] = g + 0.05;
          this.v[o + 1] *= -0.45;
          this.v[o] *= 0.6;
          this.v[o + 2] *= 0.6;
          this.rv[o] *= 0.5;
          this.rv[o + 1] *= 0.5;
          this.rv[o + 2] *= 0.5;
        }
      }
      this.r[o] += this.rv[o] * dt;
      this.r[o + 1] += this.rv[o + 1] * dt;
      this.r[o + 2] += this.rv[o + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      const sc = this.scale[i] * Math.min(1, f * 4);
      this.e.set(this.r[o], this.r[o + 1], this.r[o + 2]);
      this.q.setFromEuler(this.e);
      this.s.set(sc, this.flat[i] ? sc * 0.15 : sc, sc);
      this.t.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.m4.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, this.colors[i]);
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private swap(i: number, last: number) {
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.p[i * 3 + k] = this.p[last * 3 + k];
      this.v[i * 3 + k] = this.v[last * 3 + k];
      this.r[i * 3 + k] = this.r[last * 3 + k];
      this.rv[i * 3 + k] = this.rv[last * 3 + k];
    }
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.scale[i] = this.scale[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.flat[i] = this.flat[last];
    this.colors[i].copy(this.colors[last]);
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

// ------------------------------------------------------------------ sprites (text, emoji, bubbles)

interface SpriteFx {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  rise: number;
  baseH: number;
  aspect: number;
  follow: THREE.Object3D | null;
  offset: number;
  pop: boolean;
  wobble: number;
  vx: number;
  vz: number;
}

// ------------------------------------------------------------------ rings & beams

interface RingFx { mesh: THREE.Mesh; life: number; maxLife: number; r0: number; r1: number; active: boolean }
interface BeamFx { mesh: THREE.Mesh; life: number; maxLife: number; width: number; active: boolean }

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
  g.center();
  return g;
}

export class FX {
  root = new THREE.Group();
  glow: GlowPoints;
  pixels: Chunks;
  stars: Chunks;
  sprites: SpriteFx[] = [];
  private spriteFree: THREE.Sprite[] = [];
  rings: RingFx[] = [];
  beams: BeamFx[] = [];
  lights: { light: THREE.PointLight; life: number; max: number; peak: number }[] = [];
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private arena: Arena) {
    this.glow = new GlowPoints(5000);
    this.pixels = new Chunks(new THREE.BoxGeometry(1, 1, 1), 2200, arena);
    this.stars = new Chunks(starGeometry(), 900, arena);
    this.root.add(this.glow.points, this.pixels.mesh, this.stars.mesh);
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      s.renderOrder = 20;
      s.visible = false;
      this.root.add(s);
      this.spriteFree.push(s);
    }
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      this.root.add(m);
      this.rings.push({ mesh: m, life: 0, maxLife: 1, r0: 0, r1: 1, active: false });
    }
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.visible = false;
      m.frustumCulled = false;
      this.root.add(m);
      this.beams.push({ mesh: m, life: 0, maxLife: 1, width: 0.1, active: false });
    }
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 18, 1.6);
      this.root.add(l);
      this.lights.push({ light: l, life: 0, max: 1, peak: 0 });
    }
  }

  setViewport(height: number, fov: number) {
    this.glow.mat.uniforms.uScale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }

  // ---------------------------------------------------------------- presets

  burst(p: THREE.Vector3, color: THREE.Color | number, n: number, speed: number, opts: { size?: number; life?: number; grav?: number; up?: number; shape?: number; drag?: number } = {}) {
    const c = color instanceof THREE.Color ? color : _c.set(color);
    for (let i = 0; i < n; i++) {
      _v.randomDirection().multiplyScalar(speed * rand(0.3, 1));
      this.glow.spawn(p.x, p.y, p.z, _v.x, _v.y + (opts.up ?? 0), _v.z, c, (opts.size ?? 0.5) * rand(0.6, 1.3), (opts.life ?? 0.5) * rand(0.6, 1.2), {
        grav: opts.grav ?? 0,
        drag: opts.drag ?? 3,
        shape: opts.shape ?? (Math.random() < 0.25 ? 1 : 0),
      });
    }
  }

  spark(p: THREE.Vector3, color: THREE.Color | number, size = 0.6, life = 0.25) {
    const c = color instanceof THREE.Color ? color : _c.set(color);
    this.glow.spawn(p.x, p.y, p.z, 0, 0, 0, c, size, life, { shape: 1, drag: 0, endSize: size * 0.2 });
  }

  trail(p: THREE.Vector3, color: THREE.Color | number, size = 0.35, life = 0.3) {
    const c = color instanceof THREE.Color ? color : _c.set(color);
    this.glow.spawn(p.x + rand(-0.05, 0.05), p.y + rand(-0.05, 0.05), p.z + rand(-0.05, 0.05), 0, 0, 0, c, size, life, { drag: 0, endSize: 0 });
  }

  pixelBurst(p: THREE.Vector3, colors: number[], n: number, speed: number, scale = 0.14, up = 6) {
    for (let i = 0; i < n; i++) {
      _v.randomDirection().multiplyScalar(speed * rand(0.4, 1));
      _c.set(colors[i % colors.length]).multiplyScalar(rand(1, 1.8));
      this.pixels.spawn(p.x, p.y, p.z, _v.x, Math.abs(_v.y) + up * rand(0.5, 1.2), _v.z, _c, scale * rand(0.6, 1.4), rand(0.9, 1.8));
    }
  }

  starBurst(p: THREE.Vector3, colors: number[], n: number, speed: number, scale = 0.16) {
    for (let i = 0; i < n; i++) {
      _v.randomDirection().multiplyScalar(speed * rand(0.4, 1));
      _c.set(colors[i % colors.length]).multiplyScalar(1.7);
      this.stars.spawn(p.x, p.y, p.z, _v.x, Math.abs(_v.y) + 5, _v.z, _c, scale * rand(0.7, 1.4), rand(1, 1.8), 16);
    }
  }

  confetti(p: THREE.Vector3, n: number, spread = 6, up = 8) {
    for (let i = 0; i < n; i++) {
      _c.setHSL(Math.random(), 1, 0.6).multiplyScalar(1.3);
      this.pixels.spawn(p.x + rand(-1, 1), p.y, p.z + rand(-1, 1), rand(-spread, spread), rand(up * 0.5, up * 1.4), rand(-spread, spread), _c, rand(0.14, 0.24), rand(2, 3.5), 5, 1.4, true);
    }
  }

  /** Cartoon defeat: ~100 cheerful bits instead of anything gross. */
  defeatPop(p: THREE.Vector3, colors: number[], scale = 1) {
    this.pixelBurst(p, colors, Math.round(46 * scale), 9, 0.16, 7);
    this.starBurst(p, [0xffe26b, 0xffffff, colors[0]], Math.round(18 * scale), 9);
    this.confetti(p, Math.round(16 * scale), 5, 9);
    this.burst(p, colors[0], Math.round(22 * scale), 10, { size: 0.9, life: 0.55 });
    this.burst(p, 0xffffff, 8, 4, { size: 1.6, life: 0.25 });
    this.ring(p, 0.3, 3.2 * scale, 0.35, colors[0]);
    this.flashLight(p, colors[0], 6, 0.25);
  }

  explosion(p: THREE.Vector3, radius: number, color: number) {
    this.burst(p, color, 50, radius * 3.2, { size: 1.4, life: 0.7, drag: 3.5 });
    this.burst(p, 0xffffff, 14, radius * 1.2, { size: 2.6, life: 0.3 });
    this.burst(p, 0xffb347, 26, radius * 2.2, { size: 1, life: 0.9, grav: -2, drag: 2 });
    this.pixelBurst(p, [color, 0xffffff, 0xffd23f], 30, radius * 3, 0.2, 9);
    this.ring(p, 0.5, radius * 1.4, 0.45, color);
    this.ring(p, 0.2, radius * 0.9, 0.3, 0xffffff);
    this.flashLight(p, color, 14, 0.35);
  }

  ring(p: THREE.Vector3, r0: number, r1: number, life: number, color: number, y = 0.15) {
    const r = this.rings.find((x) => !x.active) ?? this.rings[0];
    r.active = true;
    r.life = life;
    r.maxLife = life;
    r.r0 = r0;
    r.r1 = r1;
    r.mesh.visible = true;
    r.mesh.position.set(p.x, p.y + y, p.z);
    r.mesh.quaternion.identity();
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(2);
    return r;
  }

  verticalRing(p: THREE.Vector3, normal: THREE.Vector3, r0: number, r1: number, life: number, color: number) {
    const r = this.ring(p, r0, r1, life, color, 0);
    r.mesh.quaternion.setFromUnitVectors(this.up, normal);
  }

  beam(a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, life: number, intensity = 2) {
    const bm = this.beams.find((x) => !x.active) ?? this.beams[0];
    bm.active = true;
    bm.life = life;
    bm.maxLife = life;
    bm.width = width;
    const m = bm.mesh;
    m.visible = true;
    m.position.copy(a);
    _v.subVectors(b, a);
    const len = _v.length();
    m.quaternion.setFromUnitVectors(this.up, _v.normalize());
    m.scale.set(width, len, width);
    (m.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(intensity);
    (m.material as THREE.MeshBasicMaterial).opacity = 1;
    return bm;
  }

  flashLight(p: THREE.Vector3, color: number, peak: number, life: number) {
    const l = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    l.light.position.set(p.x, p.y + 1.5, p.z);
    l.light.color.set(color);
    l.life = life;
    l.max = life;
    l.peak = peak;
  }

  text(p: THREE.Vector3, text: string, color = "#ffffff", opts: { size?: number; life?: number; rise?: number; follow?: THREE.Object3D; offset?: number; emoji?: boolean; bubble?: boolean; pop?: boolean; wobble?: number; drift?: boolean } = {}) {
    const sprite = this.spriteFree.pop() ?? this.sprites.shift()?.sprite;
    if (!sprite) return null;
    const entry = opts.bubble ? bubbleTexture(text) : opts.emoji ? emojiTexture(text) : textTexture(text, color);
    const mat = sprite.material;
    mat.map = entry.tex;
    mat.opacity = 1;
    mat.needsUpdate = true;
    sprite.visible = true;
    sprite.position.copy(p);
    const h = opts.size ?? 0.8;
    sprite.scale.set(h * entry.aspect, h, 1);
    const fx: SpriteFx = {
      sprite,
      life: opts.life ?? 0.9,
      maxLife: opts.life ?? 0.9,
      rise: opts.rise ?? 1.6,
      baseH: h,
      aspect: entry.aspect,
      follow: opts.follow ?? null,
      offset: opts.offset ?? 0,
      pop: opts.pop ?? true,
      wobble: opts.wobble ?? 0,
      vx: opts.drift ? rand(-1, 1) : 0,
      vz: opts.drift ? rand(-1, 1) : 0,
    };
    this.sprites.push(fx);
    return fx;
  }

  emoji(p: THREE.Vector3, e: string, size = 1, life = 1) {
    return this.text(p, e, "#fff", { emoji: true, size, life, rise: 2.2, drift: true });
  }

  bubble(target: THREE.Object3D, text: string, offset: number, life = 1.6, size = 0.75) {
    return this.text(target.position, text, "#fff", { bubble: true, follow: target, offset, life, size, rise: 0 });
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number) {
    this.glow.update(dt);
    this.pixels.update(dt);
    this.stars.update(dt);
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.life -= dt;
      if (s.life <= 0 || (s.follow && !s.follow.parent)) {
        s.sprite.visible = false;
        this.spriteFree.push(s.sprite);
        this.sprites.splice(i, 1);
        continue;
      }
      const age = s.maxLife - s.life;
      if (s.follow) {
        s.sprite.position.copy(s.follow.position);
        s.sprite.position.y += s.offset + Math.sin(age * 8) * 0.03;
      } else {
        s.sprite.position.y += s.rise * dt * Math.max(0.2, 1 - age / s.maxLife);
        s.sprite.position.x += s.vx * dt;
        s.sprite.position.z += s.vz * dt;
      }
      let k = 1;
      if (s.pop) k = age < 0.12 ? 0.3 + (age / 0.12) * 1.0 : age < 0.22 ? 1.3 - ((age - 0.12) / 0.1) * 0.3 : 1;
      if (s.wobble) s.sprite.material.rotation = Math.sin(age * 12) * s.wobble;
      s.sprite.scale.set(s.baseH * s.aspect * k, s.baseH * k, 1);
      s.sprite.material.opacity = Math.min(1, s.life / Math.min(0.3, s.maxLife * 0.4));
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const f = 1 - r.life / r.maxLife;
      const e = 1 - Math.pow(1 - f, 3);
      const rr = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(rr, rr, rr);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - f) * 0.9;
    }
    for (const b of this.beams) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      const f = b.life / b.maxLife;
      const w = b.width * (0.4 + f * 0.6);
      b.mesh.scale.x = b.mesh.scale.z = w;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = f;
    }
    for (const l of this.lights) {
      if (l.life <= 0) {
        l.light.intensity = 0;
        continue;
      }
      l.life -= dt;
      l.light.intensity = Math.max(0, (l.life / l.max) * l.peak) * 30;
    }
  }

  clear() {
    this.glow.clear();
    this.pixels.clear();
    this.stars.clear();
    for (const s of this.sprites) {
      s.sprite.visible = false;
      this.spriteFree.push(s.sprite);
    }
    this.sprites.length = 0;
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
    for (const b of this.beams) {
      b.active = false;
      b.mesh.visible = false;
    }
  }
}
