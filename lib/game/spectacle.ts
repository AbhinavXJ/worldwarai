import * as THREE from "three";
import { beat, beatPosU, beatU, hypeU } from "./beat";
import { glowTexture, textTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const HSV = /* glsl */ `
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

// ------------------------------------------------------------------ dance floor

export const WAVES = 10;
const floorVert = /* glsl */ `
varying vec3 vW;
varying vec2 vL;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vL = position.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const floorFrag = /* glsl */ `
uniform float uBeat;
uniform float uBeatPos;
uniform float uHype;
uniform float uTime;
uniform float uRadius;
uniform float uHue;
uniform vec2 uCenter;
uniform vec3 uPlayer;
uniform vec4 uWaves[${WAVES}];
uniform float uFade;
varying vec3 vW;
varying vec2 vL;
${HSV}
const vec2 S = vec2(1.0, 1.7320508);
vec4 hexCoords(vec2 uv) {
  vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / S.xyxy) + 0.5;
  vec4 h = vec4(uv - hC.xy * S, uv - (hC.zw + 0.5) * S);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}
float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(S)), p.x);
}
void main() {
  float cell = 1.45;
  vec4 h = hexCoords(vW.xz / cell);
  float d = hexDist(h.xy);
  vec2 cw = h.zw * S * cell;
  float rn = length(vL) / uRadius;
  float rd = length(cw - uCenter);
  float bp = fract(uBeatPos);
  float bn = floor(uBeatPos);

  // random tiles pop on every beat
  float rnd = hash12(h.zw + bn * 1.37);
  float pop = step(0.9 - uHype * 0.22, rnd) * uBeat;
  // a ring of light leaves the centre every beat
  float ripple = smoothstep(2.4, 0.0, abs(rd - bp * uRadius * 1.25)) * (1.0 - bp);
  // spinning spokes on the bar
  float ang = atan(cw.y - uCenter.y, cw.x - uCenter.x);
  float spokes = pow(max(0.0, sin(ang * 4.0 + uBeatPos * 1.5708)), 24.0) * (0.25 + uHype * 0.6);
  // shockwaves from explosions and stomps
  float wave = 0.0;
  for (int i = 0; i < ${WAVES}; i++) {
    vec4 wv = uWaves[i];
    float age = uTime - wv.z;
    if (age > 0.0 && age < 1.4) {
      float r = age * 20.0 * (0.6 + wv.w * 0.4);
      wave += smoothstep(2.6, 0.0, abs(length(cw - wv.xy) - r)) * (1.0 - age / 1.4) * wv.w;
    }
  }
  float under = smoothstep(3.6, 0.6, length(cw - uPlayer.xz)) * step(abs(uPlayer.y - vW.y), 3.0);

  float hue = fract(uHue + rd * 0.035 + ang * 0.159 - uBeatPos * 0.0625 + rnd * 0.18);
  vec3 col = hsv(hue, 1.0, 1.0);
  vec3 edgeCol = hsv(fract(hue + 0.5 + uTime * 0.03), 0.9, 1.0);
  float fill = min(0.85, pop * 0.75 + ripple * 0.22 + wave * 0.45 + under * 0.3 + spokes * 0.2);
  float inner = 1.0 - smoothstep(0.30, 0.45, d);
  float edge = smoothstep(0.445, 0.49, d);
  float edgeA = min(1.6, 0.05 + ripple * 0.7 + wave * 1.4 + uHype * 0.14 + uBeat * 0.08 + under * 0.6 + spokes * 0.5);
  vec3 outc = col * fill * mix(0.25, 0.9, inner) + edgeCol * edge * edgeA;
  outc = mix(outc, vec3(length(outc)), clamp(wave * 0.2, 0.0, 0.3));
  outc *= smoothstep(1.0, 0.93, rn) * uFade * 1.15;
  gl_FragColor = vec4(outc, 1.0);
}`;

export class DanceFloor {
  mats: THREE.ShaderMaterial[] = [];
  waves: THREE.Vector4[] = Array.from({ length: WAVES }, () => new THREE.Vector4(0, 0, -99, 0));
  private wi = 0;
  player = new THREE.Vector3(0, -99, 0);
  fade = { value: 1 };
  hue = { value: 0 };

  constructor(private timeU: { value: number }) {}

  make(cx: number, cz: number, radius: number, hue: number) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      uniforms: {
        uBeat: beatU,
        uBeatPos: beatPosU,
        uHype: hypeU,
        uTime: this.timeU,
        uRadius: { value: radius },
        uHue: { value: hue / 360 },
        uCenter: { value: new THREE.Vector2(cx, cz) },
        uPlayer: { value: this.player },
        uWaves: { value: this.waves },
        uFade: this.fade,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
      fog: false,
    });
    this.mats.push(mat);
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.renderOrder = 2;
    return m;
  }

  shockwave(x: number, z: number, strength: number, t: number) {
    const w = this.waves[this.wi++ % WAVES];
    w.set(x, z, t, Math.min(1.6, strength));
  }

  clear() {
    for (const w of this.waves) w.z = -99;
  }
}

// ------------------------------------------------------------------ searchlights

const beamVert = /* glsl */ `
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uBeat;
uniform float uHype;
uniform float uFade;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(abs(dot(vN, vV)), 1.6);
  float a = f * (1.0 - vY) * (0.16 + uBeat * 0.1 + uHype * 0.12) * uFade;
  gl_FragColor = vec4(uColor * a * 2.0, 1.0);
}`;

// ------------------------------------------------------------------ fireworks

const FW_BURSTS = 36;
const FW_PER = 140;
const fwVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aOrigin;
attribute vec3 aVel;
attribute vec3 aColor;
varying vec3 vColor;
varying float vA;
void main() {
  float age = uTime - aOrigin.w;
  float life = 2.2;
  vec3 p = aOrigin.xyz;
  if (age > 0.0 && age < life) {
    float drag = (1.0 - exp(-age * 2.2)) / 2.2;
    p += aVel * drag;
    p.y -= 4.0 * age * age;
    vA = (1.0 - age / life);
    vA *= vA;
    vA *= 0.75 + 0.25 * sin(age * 40.0 + aVel.x * 3.0);
  } else {
    vA = 0.0;
  }
  vColor = mix(vec3(1.0), aColor, smoothstep(0.0, 0.25, age));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = vA > 0.0 ? uScale * (2.4 + 2.0 * vA) / -mv.z : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const fwFrag = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * vA * 3.0, 1.0);
}`;

const CANDY = [0xff6bd6, 0x7df9e0, 0xffd23f, 0x8f7bff, 0xff6a2b, 0x6bd6ff, 0xb6ff6b];

export class Spectacle {
  root = new THREE.Group();
  private beams: { mesh: THREE.Mesh; ph: number; speed: number; base: THREE.Euler }[] = [];
  private fw!: THREE.Points;
  private fwGeo!: THREE.BufferGeometry;
  private fwNext = 0;
  private fwT = 0.5;
  private fwScale = { value: 900 };
  blimp = new THREE.Group();
  private blimpEyes: THREE.Object3D[] = [];
  private blimpBlink = 2;
  private fade = { value: 1 };
  private disco!: THREE.Group;
  private discoSparks: THREE.Sprite[] = [];

  constructor(private timeU: { value: number }) {
    this.buildBeams();
    this.buildFireworks();
    this.buildBlimp();
    this.buildDisco();
  }

  setFade(f: number) {
    this.fade.value = f;
    this.root.visible = f > 0.01;
  }

  setViewport(h: number) {
    this.fwScale.value = h * 1.1;
  }

  private buildBeams() {
    const geo = new THREE.CylinderGeometry(9, 0.6, 340, 24, 1, true);
    geo.translate(0, 170, 0);
    // uv.y: 0 at the lamp, 1 at the far end
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uColor: { value: new THREE.Color(CANDY[i % CANDY.length]) }, uBeat: beatU, uHype: hypeU, uFade: this.fade },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = rand(120, 190);
      m.position.set(Math.cos(a) * r, -90, Math.sin(a) * r);
      const base = new THREE.Euler(rand(-0.35, 0.35), 0, rand(-0.35, 0.35));
      m.rotation.copy(base);
      m.frustumCulled = false;
      this.root.add(m);
      this.beams.push({ mesh: m, ph: Math.random() * 6, speed: rand(0.25, 0.6), base });
    }
  }

  private buildFireworks() {
    const n = FW_BURSTS * FW_PER;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aOrigin", new THREE.BufferAttribute(new Float32Array(n * 4).fill(-999), 4));
    g.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.fwGeo = g;
    this.fw = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: fwVert,
        fragmentShader: fwFrag,
        uniforms: { uTime: this.timeU, uScale: this.fwScale },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.fw.frustumCulled = false;
    this.root.add(this.fw);
  }

  /** a firework burst; `low` ones go off below the islands, where the gameplay camera can see them */
  firework(at?: THREE.Vector3, color?: number, big = 1) {
    const g = this.fwGeo;
    const o = g.attributes.aOrigin as THREE.BufferAttribute;
    const v = g.attributes.aVel as THREE.BufferAttribute;
    const c = g.attributes.aColor as THREE.BufferAttribute;
    const b = this.fwNext++ % FW_BURSTS;
    let x: number, y: number, z: number;
    if (at) {
      x = at.x; y = at.y; z = at.z;
    } else {
      const low = Math.random() < 0.6;
      const a = Math.random() * Math.PI * 2;
      const r = low ? rand(40, 95) : rand(90, 220);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r - (low ? 0 : 40);
      y = low ? rand(-34, -6) : rand(40, 130);
    }
    const col = new THREE.Color(color ?? CANDY[Math.floor(Math.random() * CANDY.length)]);
    const col2 = new THREE.Color(CANDY[Math.floor(Math.random() * CANDY.length)]);
    const t = this.timeU.value;
    const ring = Math.random() < 0.3;
    const speed = rand(16, 26) * big;
    for (let i = 0; i < FW_PER; i++) {
      const k = b * FW_PER + i;
      let dx: number, dy: number, dz: number;
      if (ring) {
        const a = (i / FW_PER) * Math.PI * 2;
        dx = Math.cos(a); dy = Math.sin(a) * 0.3; dz = Math.sin(a);
      } else {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        dx = s * Math.cos(th); dy = u; dz = s * Math.sin(th);
      }
      const sp = speed * (ring ? 1 : rand(0.6, 1));
      o.setXYZW(k, x, y, z, t + rand(0, 0.05));
      v.setXYZ(k, dx * sp, dy * sp, dz * sp);
      const cc = i % 3 === 0 ? col2 : col;
      c.setXYZ(k, cc.r, cc.g, cc.b);
    }
    o.needsUpdate = v.needsUpdate = c.needsUpdate = true;
  }

  private buildBlimp() {
    const g = this.blimp;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeafffb, emissive: 0x7df9e0, emissiveIntensity: 0.55, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 20), bodyMat);
    body.scale.set(1.35, 1, 1);
    g.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x140a24 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), eyeMat);
      e.scale.set(0.9, 1.4, 0.5);
      e.position.set(6.4, 1.2, s * 2.2);
      e.rotation.y = Math.PI / 2;
      g.add(e);
      this.blimpEyes.push(e);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      sh.position.set(7.2, 1.7, s * 2.2 + 0.3);
      g.add(sh);
      this.blimpEyes.push(sh);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.22, 6, 16, Math.PI), eyeMat);
    mouth.position.set(6.7, -1.1, 0);
    mouth.rotation.set(0, Math.PI / 2, Math.PI);
    g.add(mouth);
    const finMat = new THREE.MeshStandardMaterial({ color: 0xff6bd6, emissive: 0xff2ea0, emissiveIntensity: 0.4 });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 0.3), finMat);
      fin.position.set(-9, 0, 0);
      fin.rotation.x = (i / 3) * Math.PI * 2;
      fin.geometry.translate(0, 1.6, 0);
      g.add(fin);
    }
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: 0x241a48, emissive: 0xffd23f, emissiveIntensity: 0.3 }));
    gondola.position.y = -7.4;
    g.add(gondola);
    // trailing banner
    const label = textTexture("DOTS > MUSES > GROK · AGI SOON™ · PLEASE CLAP", "#ffffff", { size: 72, outline: "#ff3d7f" });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(4 * label.aspect, 4),
      new THREE.MeshBasicMaterial({ map: label.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }),
    );
    banner.position.set(-10 - 2 * label.aspect, -1, 0);
    banner.rotation.y = 0;
    g.add(banner);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7df9e0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    lamp.scale.setScalar(36);
    g.add(lamp);
    this.root.add(g);
  }

  private buildDisco() {
    const g = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xdddde8, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0x6b5aff, emissiveIntensity: 0.25 });
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 2), ballMat);
    g.add(ball);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 40, 6), new THREE.MeshBasicMaterial({ color: 0x8a7ab8 }));
    chain.position.y = 21;
    g.add(chain);
    const tex = glowTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: CANDY[i % CANDY.length], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      s.position.set(r * Math.cos(th) * 3.3, u * 3.3, r * Math.sin(th) * 3.3);
      s.scale.setScalar(2.4);
      g.add(s);
      this.discoSparks.push(s);
    }
    g.position.set(0, 34, -6);
    this.disco = g;
    this.root.add(g);
  }

  update(dt: number, t: number) {
    for (const b of this.beams) {
      const k = t * b.speed + b.ph;
      b.mesh.rotation.set(b.base.x + Math.sin(k) * 0.45, 0, b.base.z + Math.cos(k * 0.8) * 0.45);
    }
    // fireworks: steady, faster when things get unhinged, and a volley on every bar
    this.fwT -= dt;
    if (this.fwT <= 0) {
      this.fwT = rand(0.7, 1.6) * (1 - beat.hype * 0.6);
      this.firework();
    }
    if (beat.onBeat && beat.count % 4 === 0 && beat.hype > 0.35) {
      this.firework();
      this.firework();
    }
    // the blimp does laps of the city, looking smug
    const a = t * 0.05;
    const R = 92;
    this.blimp.position.set(Math.cos(a) * R, 34 + Math.sin(t * 0.4) * 2, Math.sin(a) * R - 10);
    this.blimp.rotation.set(Math.sin(t * 0.5) * 0.05, -a - Math.PI / 2, Math.sin(t * 0.3) * 0.04);
    this.blimpBlink -= dt;
    const blink = this.blimpBlink < 0.12;
    if (this.blimpBlink < 0) this.blimpBlink = rand(2, 5);
    for (let i = 0; i < this.blimpEyes.length; i += 2) this.blimpEyes[i].scale.y = blink ? 0.15 : 1.4;
    const bs = 1 + beat.pulse * 0.04;
    this.blimp.scale.set(bs, 2 - bs, bs);

    this.disco.rotation.y = t * 0.6;
    for (let i = 0; i < this.discoSparks.length; i++) {
      const s = this.discoSparks[i];
      const on = ((beat.count + i) % 3 === 0 ? beat.pulse : 0) + Math.max(0, Math.sin(t * 7 + i * 1.7)) * 0.3;
      s.material.opacity = Math.min(1, on);
    }
  }
}
