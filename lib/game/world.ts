import * as THREE from "three";
import { BILLBOARD_LINES } from "./config";
import { beat, beatU, hypeU } from "./beat";
import { DanceFloor, Spectacle } from "./spectacle";
import {
  billboardTexture, blobShadowTexture, cloudTexture, displayFont, glowTexture, moonTexture, uiFragmentTexture, windowsTexture, textTexture,
} from "./textures";

export interface Island { x: number; z: number; y: number; r: number; hue: number; group?: THREE.Group }
export interface Bridge { ax: number; az: number; ay: number; bx: number; bz: number; by: number; w: number }
export interface Obstacle { x: number; z: number; r: number; top: number; y: number; kind: "tree" | "rock" | "pole" | "prop"; alive: boolean; obj?: THREE.Object3D; hp?: number; maxHp?: number; propId?: number }
export interface LaunchPad { x: number; z: number; y: number; r: number; tx: number; tz: number; ty: number; mesh: THREE.Object3D; pulse: number }
export interface Portal { x: number; z: number; y: number; to: number; mesh: THREE.Group }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _occ = new THREE.Vector3();
const _seg = new THREE.Vector3();

function islandTopTexture(hue: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  // a dark, saturated club floor: the neon overlay does the shouting
  const grd = g.createRadialGradient(256, 256, 10, 256, 256, 256);
  grd.addColorStop(0, `hsl(${hue + 100},70%,26%)`);
  grd.addColorStop(0.55, `hsl(${hue + 80},75%,19%)`);
  grd.addColorStop(0.9, `hsl(${hue + 50},85%,16%)`);
  grd.addColorStop(1, `hsl(${hue},100%,45%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2200; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 250;
    g.fillStyle = `hsla(${hue + rand(40, 140)},90%,${rand(25, 50)}%,${rand(0.15, 0.45)})`;
    g.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, rand(2, 6), rand(2, 6));
  }
  // soft hex hint
  g.strokeStyle = "rgba(255,255,255,0.07)";
  g.lineWidth = 2;
  const s = 30;
  for (let y = 0; y < 512 + s; y += s * 1.5) {
    for (let x = 0; x < 512 + s; x += s * Math.sqrt(3)) {
      const ox = (Math.round(y / (s * 1.5)) % 2) * (s * Math.sqrt(3)) / 2;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k + Math.PI / 6;
        const px = x + ox + Math.cos(ang) * s * 0.95;
        const py = y + Math.sin(ang) * s * 0.95;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform float uTime;
uniform float uHue;
uniform float uArt;
uniform float uFade;
uniform float uBeat;
uniform float uHype;
varying vec3 vDir;
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
void main() {
  float y = vDir.y;
  vec3 top = vec3(0.05, 0.03, 0.16);
  vec3 mid = vec3(0.32, 0.12, 0.45);
  vec3 hor = vec3(0.95, 0.42, 0.62);
  vec3 low = vec3(0.12, 0.06, 0.28);
  vec3 c = y > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.18, y)), top, smoothstep(0.15, 0.7, y)) : mix(hor, low, smoothstep(0.0, -0.35, y));
  // aurora curtains, brighter and faster when things get unhinged
  float sp = 1.0 + uHype * 2.0;
  float band = sin(vDir.x * 6.0 + uTime * 0.15 * sp + sin(vDir.z * 3.0 + uTime * 0.2) * 1.5) * sin(vDir.z * 5.0 - uTime * 0.1 * sp);
  float curtain = smoothstep(0.45, 1.0, band) * smoothstep(0.02, 0.35, y) * (1.0 - smoothstep(0.5, 0.95, y));
  vec3 aur = hsv(fract(0.45 + vDir.x * 0.25 + uTime * 0.02), 0.8, 1.0);
  c += aur * curtain * (0.35 + uHype * 0.5 + uBeat * 0.12);
  // the horizon thumps with the kick drum
  c += vec3(1.0, 0.45, 0.75) * exp(-abs(y) * 9.0) * uBeat * (0.18 + uHype * 0.3);
  if (uArt > 0.0) {
    float h = fract(uHue + vDir.x * 0.3 + vDir.y * 0.8 + sin(vDir.z * 8.0 + uTime) * 0.1);
    c = mix(c, hsv(h, 0.75, 1.0), uArt * 0.8);
  }
  gl_FragColor = vec4(c * uFade, 1.0);
}`;

const motesVert = /* glsl */ `
uniform float uTime;
attribute float aSpeed;
attribute vec3 aColor;
varying vec3 vColor;
varying float vFade;
void main() {
  vec3 p = position;
  p.y = mod(p.y + uTime * aSpeed, 60.0) - 12.0;
  p.x += sin(uTime * 0.4 + position.z) * 1.5;
  vColor = aColor;
  vFade = smoothstep(-12.0, -6.0, p.y) * (1.0 - smoothstep(38.0, 48.0, p.y));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (120.0 / -mv.z) * (0.6 + aSpeed * 0.4);
  gl_Position = projectionMatrix * mv;
}`;
const motesFrag = /* glsl */ `
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  // little square "pixels" mixed in
  gl_FragColor = vec4(vColor * 1.6, a * vFade * 0.85);
}`;

export class Arena {
  root = new THREE.Group();
  islands: Island[] = [];
  bridges: Bridge[] = [];
  obstacles: Obstacle[] = [];
  pads: LaunchPad[] = [];
  portals: Portal[] = [];
  timeU = { value: 0 };
  sky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  moon!: THREE.Mesh;
  moonFace!: THREE.Group;
  moonGlow!: THREE.Sprite;
  billboards: { mesh: THREE.Mesh; tex: THREE.Texture[]; i: number; t: number }[] = [];
  jumbo: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number }[] = [];
  clouds: THREE.Sprite[] = [];
  floaters: { obj: THREE.Object3D; base: THREE.Vector3; ph: number; spin: number }[] = [];
  shadows!: THREE.InstancedMesh;
  shadowCount = 0;
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  fog!: THREE.FogExp2;
  selectStage = new THREE.Group();
  selectPlatforms: THREE.Group[] = [];
  crowd!: THREE.InstancedMesh;
  crowdData: { x: number; y: number; z: number; ph: number; s: number; sy: number }[] = [];
  paint!: THREE.InstancedMesh;
  paintCount = 0;
  hueShift = 0;
  art = 0;
  floor = new DanceFloor(this.timeU);
  spectacle = new Spectacle(this.timeU);
  private trees: THREE.Object3D[] = [];
  private pulseMats: { mat: THREE.MeshBasicMaterial; base: THREE.Color; amt: number }[] = [];
  markers!: THREE.InstancedMesh;
  private markerCount = 0;
  private cityMat!: THREE.MeshStandardMaterial;
  jumboLines: string[] = ["LIVE", "AI MASCOT BATTLE"];

  build(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.root);
    this.fog = new THREE.FogExp2(0x2a1250, 0.0042);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x0b0620);

    this.buildSky();
    this.buildLights(scene);
    this.buildLayout();
    this.islands.forEach((is, i) => this.buildIsland(is, i === 0));
    this.bridges.forEach((b) => this.buildBridge(b));
    this.buildDecor();
    this.buildPads();
    this.buildPortals();
    this.buildCity();
    this.buildClouds();
    this.buildMotes();
    this.buildBillboards();
    this.buildJumbotrons();
    this.buildFloaters();
    this.buildMoon();
    this.buildShadows();
    this.buildMarkers();
    this.root.add(this.spectacle.root);
    this.buildCrowd();
    this.buildPaint();
    this.buildSelectStage();
  }

  // ---------------------------------------------------------------- layout

  private buildLayout() {
    this.islands.push({ x: 0, z: 0, y: 0, r: 22, hue: 160 });
    const sides: [number, number, number, number, number][] = [
      [0, -41, 3.2, 9, 190],
      [37, -15, 1.5, 8, 280],
      [-37, -13, 4.5, 8, 130],
      [31, 27, -1.2, 7.5, 320],
      [-31, 27, 2, 7, 210],
    ];
    for (const [x, z, y, r, hue] of sides) this.islands.push({ x, z, y, r, hue });
    // bridges from main to the first three
    for (const i of [1, 2, 3]) {
      const is = this.islands[i];
      const d = Math.hypot(is.x, is.z);
      const ux = is.x / d, uz = is.z / d;
      this.bridges.push({ ax: ux * 20.8, az: uz * 20.8, ay: 0, bx: is.x - ux * (is.r - 1.2), bz: is.z - uz * (is.r - 1.2), by: is.y, w: 3.2 });
    }
  }

  // ---------------------------------------------------------------- queries

  /** Highest walkable surface at or slightly above `y` (step-up height). -Infinity means void. */
  groundAt(x: number, z: number, y: number, step = 0.75): number {
    let best = -Infinity;
    for (const is of this.islands) {
      const dx = x - is.x, dz = z - is.z;
      if (dx * dx + dz * dz < is.r * is.r && is.y <= y + step && is.y > best) best = is.y;
    }
    for (const b of this.bridges) {
      const vx = b.bx - b.ax, vz = b.bz - b.az;
      const len2 = vx * vx + vz * vz;
      const t = ((x - b.ax) * vx + (z - b.az) * vz) / len2;
      if (t < -0.02 || t > 1.02) continue;
      const px = b.ax + vx * t, pz = b.az + vz * t;
      const lat = Math.hypot(x - px, z - pz);
      if (lat > b.w / 2) continue;
      const h = b.ay + (b.by - b.ay) * Math.min(1, Math.max(0, t));
      if (h <= y + step && h > best) best = h;
    }
    return best;
  }

  walkable(x: number, z: number) {
    return this.groundAt(x, z, 100, 0) > -Infinity;
  }

  islandAt(x: number, z: number): Island | null {
    for (const is of this.islands) if ((x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) return is;
    return null;
  }

  randomPointOnIsland(minR = 0, which?: number) {
    const idx = which ?? (Math.random() < 0.75 ? 0 : 1 + Math.floor(Math.random() * (this.islands.length - 1)));
    const is = this.islands[idx];
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.sqrt(Math.random()) * (is.r - 1.8 - minR);
    return new THREE.Vector3(is.x + Math.cos(a) * r, is.y, is.z + Math.sin(a) * r);
  }

  // ---------------------------------------------------------------- visuals

  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: { uTime: this.timeU, uHue: { value: 0 }, uArt: { value: 0 }, uFade: { value: 1 }, uBeat: beatU, uHype: hypeU },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.root.add(this.sky);

    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.5 + 0.5;
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 800;
      pos[i * 3 + 1] = Math.cos(ph) * 800 * 0.9 + 40;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 800;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    this.root.add(this.stars);
  }

  stars!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  /** static environment shadows are rendered once, the frame after the world becomes visible */
  shadowDirty = false;
  private shadowsBaked = false;
  private scene!: THREE.Scene;
  private fogBase = new THREE.Color(0x2a1250);
  private bgBase = new THREE.Color(0x0b0620);

  /** 0 = the black void of the intro, 1 = the whole ridiculous world */
  setReveal(f: number) {
    const k = THREE.MathUtils.clamp(f, 0, 1);
    this.root.visible = k > 0.001;
    if (this.root.visible && !this.shadowsBaked) {
      this.shadowsBaked = true;
      this.shadowDirty = true;
    }
    const e = 1 - Math.pow(1 - k, 2);
    this.fog.density = THREE.MathUtils.lerp(0.12, 0.0042, e);
    this.fog.color.setRGB(0, 0, 0).lerp(this.fogBase, e);
    (this.scene.background as THREE.Color).setRGB(0, 0, 0).lerp(this.bgBase, e);
    this.sky.material.uniforms.uFade.value = e;
    this.floor.fade.value = e;
    this.spectacle.setFade(e);
    this.stars.material.opacity = 0.8 * e;
    (this.moon.material as THREE.MeshBasicMaterial).color.setRGB(1.5 * e, 1.4 * e, 1.6 * e);
    this.moonGlow.material.opacity = 0.55 * e;
    this.hemi.intensity = THREE.MathUtils.lerp(0.25, 0.9, e);
    this.sun.intensity = THREE.MathUtils.lerp(0.3, 2.1, e);
  }

  private buildLights(scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xc8b8ff, 0x3a1a6a, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0e6, 2.4);
    this.sun.position.set(-30, 60, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 160;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    scene.add(this.sun);
    scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight(0xff4fc8, 1.8);
    rim.position.set(30, 20, -50);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x3fe8ff, 1.1);
    fill.position.set(-40, 10, 40);
    scene.add(fill);
  }

  private buildIsland(is: Island, main: boolean) {
    const g = new THREE.Group();
    g.position.set(is.x, is.y, is.z);
    const topMat = new THREE.MeshStandardMaterial({ map: islandTopTexture(is.hue), roughness: 0.85, metalness: 0 });
    const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((is.hue + 60) % 360) / 360, 0.45, 0.28), roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(is.r, is.r * 0.97, 0.9, main ? 96 : 48), [sideMat, topMat, sideMat]);
    top.position.y = -0.45;
    top.receiveShadow = true;
    g.add(top);

    // rocky underside with a little jitter so it reads hand-made
    const cone = new THREE.ConeGeometry(is.r * 0.96, is.r * 1.5, main ? 14 : 9, 5);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < cone.parameters.height / 2 - 0.01) {
        p.setX(i, p.getX(i) * rand(0.82, 1.12));
        p.setZ(i, p.getZ(i) * rand(0.82, 1.12));
        p.setY(i, y + rand(-0.6, 0.6));
      }
    }
    cone.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.74, 0.35, 0.22), roughness: 0.95, flatShading: true });
    const under = new THREE.Mesh(cone, rockMat);
    under.rotation.x = Math.PI;
    under.position.y = -0.9 - is.r * 0.75;
    g.add(under);
    // crystals under the island
    const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(((is.hue + 140) % 360) / 360, 1, 0.65).multiplyScalar(1.6), toneMapped: false });
    const cg = new THREE.OctahedronGeometry(1, 0);
    for (let i = 0; i < (main ? 14 : 6); i++) {
      const c = new THREE.Mesh(cg, crystalMat);
      const a = Math.random() * Math.PI * 2;
      const d = rand(0.2, 0.7) * is.r;
      c.position.set(Math.cos(a) * d, -1.5 - rand(0, 1) * (is.r * 1.5 - d * 1.3) * 0.6, Math.sin(a) * d);
      c.scale.set(rand(0.3, 0.7), rand(0.8, 2), rand(0.3, 0.7));
      c.rotation.set(rand(-0.4, 0.4), rand(0, 3), Math.PI + rand(-0.4, 0.4));
      g.add(c);
    }
    // neon rim
    const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(((is.hue + 90) % 360) / 360, 1, 0.65).multiplyScalar(2), toneMapped: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(is.r, 0.11, 6, main ? 160 : 80), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    g.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(is.r * 0.97, 0.06, 6, main ? 160 : 80), rimMat);
    rim2.rotation.x = Math.PI / 2;
    rim2.position.y = -0.9;
    g.add(rim2);
    this.pulseMats.push({ mat: rimMat, base: rimMat.color.clone(), amt: 1.2 }, { mat: crystalMat, base: crystalMat.color.clone(), amt: 0.8 });
    g.add(this.floor.make(is.x, is.z, is.r - 0.15, is.hue));

    if (main) {
      // arena ring markings
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6bd6).multiplyScalar(1.4), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      this.pulseMats.push({ mat: ringMat, base: ringMat.color.clone(), amt: 1.5 });
      for (const rr of [6, 13]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 0.12, rr + 0.12, 128), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.015;
        g.add(ring);
      }
      const logo = textTexture("● ✦ ◼", "#ffffff", { size: 120 });
      const logoMat = new THREE.MeshBasicMaterial({ map: logo.tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(0x7df9e0) });
      this.pulseMats.push({ mat: logoMat, base: logoMat.color.clone(), amt: 1.8 });
      const lm = new THREE.Mesh(new THREE.PlaneGeometry(6 * logo.aspect, 6), logoMat);
      lm.rotation.x = -Math.PI / 2;
      lm.position.y = 0.02;
      g.add(lm);
    }
    is.group = g;
    this.root.add(g);
  }

  private buildBridge(b: Bridge) {
    const len = Math.hypot(b.bx - b.ax, b.bz - b.az, b.by - b.ay);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2048, roughness: 0.4, metalness: 0.5, emissive: 0x3a1a8a, emissiveIntensity: 0.3 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.35, len), mat);
    m.position.set((b.ax + b.bx) / 2, (b.ay + b.by) / 2 - 0.18, (b.az + b.bz) / 2);
    m.rotation.order = "YXZ";
    m.rotation.y = Math.atan2(b.bx - b.ax, b.bz - b.az);
    m.rotation.x = -Math.atan2(b.by - b.ay, Math.hypot(b.bx - b.ax, b.bz - b.az));
    m.receiveShadow = true;
    this.root.add(m);
    const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6bd6ff).multiplyScalar(2), toneMapped: false });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), railMat);
      rail.position.set(s * (b.w / 2 - 0.05), 0.2, 0);
      m.add(rail);
    }
    // glowing chevrons
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6bd6).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.8 });
    for (let i = 1; i < len / 2.2; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), chevMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set(0, 0.19, -len / 2 + i * 2.2);
      m.add(c);
    }
  }

  private addObstacle(o: Omit<Obstacle, "alive">) {
    const ob: Obstacle = { ...o, alive: true };
    this.obstacles.push(ob);
    return ob;
  }

  private buildDecor() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a1f5c, roughness: 0.8 });
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 2.4, 7);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
    const canopyMats = [0xff7ad9, 0x7df9e0, 0xffd36b, 0x9b8cff].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true, emissive: c, emissiveIntensity: 0.18 }),
    );
    const treeSpots: [number, number, number][] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rand(-0.15, 0.15);
      const r = rand(15.5, 19.5);
      treeSpots.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
    }
    treeSpots.push([7, 0, -8], [-8, 0, 6.5]);
    for (let k = 1; k < this.islands.length; k++) {
      const is = this.islands[k];
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        treeSpots.push([is.x + Math.cos(a) * is.r * 0.6, is.y, is.z + Math.sin(a) * is.r * 0.6]);
      }
    }
    // keep bridge mouths clear
    const clear = (x: number, z: number) => this.bridges.every((b) => Math.hypot(x - b.ax, z - b.az) > 4.5 && Math.hypot(x - b.bx, z - b.bz) > 4);
    for (const [x, y, z] of treeSpots) {
      if (!clear(x, z)) continue;
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      trunk.castShadow = true;
      tree.add(trunk);
      const mat = canopyMats[Math.floor(Math.random() * canopyMats.length)].clone();
      tree.userData.mat = mat;
      tree.userData.op = 1;
      const s = rand(0.9, 1.3);
      for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(canopyGeo, mat);
        c.position.set(rand(-0.5, 0.5), 2.6 + j * 0.75, rand(-0.5, 0.5));
        c.scale.setScalar((1.3 - j * 0.3) * s);
        c.castShadow = true;
        tree.add(c);
      }
      tree.rotation.y = Math.random() * 6;
      tree.userData.ph = Math.random() < 0.5 ? 0 : 0.5;
      this.trees.push(tree);
      this.root.add(tree);
      this.addObstacle({ x, z, r: 0.75, top: y + 4.5, y, kind: "tree", obj: tree });
    }
    // rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5a9a, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const p = this.randomPointOnIsland(6, 0);
      if (!clear(p.x, p.z)) continue;
      const s = rand(0.7, 1.4);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(p.x, s * 0.5, p.z);
      rock.scale.set(s, s * 0.8, s);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.root.add(rock);
      this.addObstacle({ x: p.x, z: p.z, r: s * 0.95, top: s, y: 0, kind: "rock", obj: rock });
    }

    // grass tufts, instanced with wind
    const blade = new THREE.ConeGeometry(0.07, 0.55, 4, 1);
    blade.translate(0, 0.27, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x000000 });
    grassMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.timeU;
      s.uniforms.uBeat = beatU;
      s.vertexShader = "uniform float uTime;\nuniform float uBeat;\nvarying float vTip;\n" + s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hh = max(position.y, 0.0);
        vTip = hh / 0.55;
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        transformed.x += sin(uTime * 2.2 + wp.x * 0.35 + wp.z * 0.2) * hh * 0.4;
        transformed.z += cos(uTime * 1.7 + wp.x * 0.2) * hh * 0.25;
        transformed.y *= 1.0 + uBeat * 0.25;`,
      );
      s.fragmentShader = "varying float vTip;\n" + s.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * pow(vTip, 2.0) * 1.6;`,
      );
    };
    const count = 2000;
    const grass = new THREE.InstancedMesh(blade, grassMat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const isl = i < 1300 ? 0 : 1 + (i % (this.islands.length - 1));
      const p = this.randomPointOnIsland(isl === 0 ? 13.5 : 0.5, isl);
      q.setFromEuler(new THREE.Euler(rand(-0.25, 0.25), rand(0, 6), rand(-0.25, 0.25)));
      const s = rand(0.6, 1.5);
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, s * rand(0.7, 1.4), s));
      grass.setMatrixAt(n, m4);
      col.setHSL((this.islands[isl].hue + rand(-30, 60)) / 360, 1, rand(0.45, 0.62));
      grass.setColorAt(n, col);
      n++;
    }
    grass.count = n;
    grass.receiveShadow = true;
    this.root.add(grass);

    // glowing flowers
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), 260);
    for (let i = 0; i < 260; i++) {
      const p = this.randomPointOnIsland(1, i < 200 ? 0 : undefined);
      m4.makeTranslation(p.x, p.y + rand(0.2, 0.45), p.z);
      fl.setMatrixAt(i, m4);
      col.setHSL(rand(0, 1), 1, 0.7).multiplyScalar(1.8);
      fl.setColorAt(i, col);
    }
    this.root.add(fl);
  }

  private buildPads() {
    const defs: [number, number][] = [
      [3, 4],
      [4, 5],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 2],
      [5, 0],
      [2, 0],
    ];
    const used = new Set<string>();
    for (const [from, to] of defs) {
      const A = this.islands[from], B = this.islands[to];
      const dx = B.x - A.x, dz = B.z - A.z;
      const d = Math.hypot(dx, dz);
      const k = from === 0 ? (A.r - 3.2) / d : (A.r - 2.2) / d;
      const x = A.x + dx * k, z = A.z + dz * k;
      const key = `${from}-${to}`;
      if (used.has(key)) continue;
      used.add(key);
      const grp = new THREE.Group();
      grp.position.set(x, A.y + 0.02, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.22, 24), new THREE.MeshStandardMaterial({ color: 0x1b1238, metalness: 0.6, roughness: 0.3 }));
      base.position.y = 0.11;
      grp.add(base);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23f).multiplyScalar(2), toneMapped: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.23;
      grp.add(glow);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 3), new THREE.MeshBasicMaterial({ color: 0x1b1238 }));
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = -Math.atan2(dx, dz) + Math.PI;
      arrow.position.y = 0.26;
      arrow.scale.y = 0.15;
      grp.add(arrow);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 3, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.y = 1.5;
      grp.add(beam);
      this.root.add(grp);
      const tx = B.x - (dx / d) * B.r * 0.25, tz = B.z - (dz / d) * B.r * 0.25;
      this.pads.push({ x, z, y: A.y, r: 1.15, tx, tz, ty: B.y, mesh: grp, pulse: 0 });
    }
  }

  private buildPortals() {
    const spots: [number, number, number][] = [
      [-12, -12, 0],
      [this.islands[1].x + 4, this.islands[1].z - 2, this.islands[1].y],
      [12, 13, 0],
      [this.islands[4].x - 1, this.islands[4].z + 2, this.islands[4].y],
    ];
    spots.forEach(([x, z, y], i) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.14, 10, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(i < 2 ? 0x6bd6ff : 0xff6bd6).multiplyScalar(2.2), toneMapped: false }));
      ring.position.y = 1.6;
      g.add(ring);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.25, 40),
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.timeU, uCol: { value: new THREE.Color(i < 2 ? 0x6bd6ff : 0xff6bd6) } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
          fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
            void main(){ vec2 c = vUv - 0.5; float r = length(c); float a = atan(c.y, c.x);
            float s = sin(a * 5.0 + r * 30.0 - uTime * 6.0) * 0.5 + 0.5;
            vec3 col = mix(uCol, vec3(1.0), s * smoothstep(0.5, 0.0, r));
            gl_FragColor = vec4(col * 1.6, smoothstep(0.5, 0.35, r) * (0.55 + s * 0.4)); }`,
        }),
      );
      disc.position.y = 1.6;
      g.add(disc);
      g.rotation.y = Math.random() * Math.PI;
      this.root.add(g);
      this.portals.push({ x, z, y, to: i % 2 === 0 ? i + 1 : i - 1, mesh: g });
    });
  }

  private buildCity() {
    const n = 520;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const wtex = windowsTexture();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1236, roughness: 0.6, metalness: 0.4, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 1.3 });
    const city = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    const tops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false, fog: true }), n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(110, 460);
      const w = rand(8, 22);
      const h = rand(40, 190) * (r > 250 ? 1.3 : 1);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const base = -170;
      m4.compose(new THREE.Vector3(x, base, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 3)), new THREE.Vector3(w, h, w * rand(0.7, 1.3)));
      city.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, base + h + 1.2, z), new THREE.Quaternion(), new THREE.Vector3(1.2, 1.2, 1.2));
      tops.setMatrixAt(i, m4);
      col.setHSL(Math.random() < 0.5 ? 0.88 : 0.5, 1, 0.6).multiplyScalar(3);
      tops.setColorAt(i, col);
    }
    this.root.add(city, tops);
    const tm = tops.material as THREE.MeshBasicMaterial;
    this.pulseMats.push({ mat: tm, base: tm.color.clone(), amt: 1.4 });
    this.cityMat = mat;
  }

  private buildClouds() {
    const tex = cloudTexture();
    for (let i = 0; i < 34; i++) {
      const below = i < 20;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color().setHSL(below ? 0.83 : 0.9, 0.6, below ? 0.72 : 0.85),
        transparent: true,
        opacity: below ? 0.55 : 0.32,
        depthWrite: false,
        fog: true,
      });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const r = below ? rand(10, 160) : rand(70, 220);
      s.position.set(Math.cos(a) * r, below ? rand(-60, -25) : rand(10, 50), Math.sin(a) * r);
      const sc = below ? rand(50, 110) : rand(40, 90);
      s.scale.set(sc, sc * 0.5, 1);
      s.userData.speed = rand(0.5, 2);
      this.clouds.push(s);
      this.root.add(s);
    }
  }

  private buildMotes() {
    const n = 1100;
    const pos = new Float32Array(n * 3);
    const sp = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 70;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 60;
      pos[i * 3 + 2] = Math.sin(a) * r;
      sp[i] = rand(0.3, 1.6);
      c.setHSL([0.47, 0.75, 0.88, 0.13][i % 4], 1, 0.7);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({ vertexShader: motesVert, fragmentShader: motesFrag, uniforms: { uTime: this.timeU }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pts.frustumCulled = false;
    this.root.add(pts);
  }

  private buildBillboards() {
    const spots: [number, number, number, number][] = [
      [0, -47, 3.2, 0],
      [-41, -16, 4.5, 0.9],
      [42, -18, 1.5, -0.9],
      [-15, -19, 0, 0.4],
      [17, -17, 0, -0.5],
    ];
    spots.forEach(([x, z, y, rot], i) => {
      const texs = [0, 1, 2].map((k) => billboardTexture(BILLBOARD_LINES[(i * 3 + k) % BILLBOARD_LINES.length], (i * 70 + k * 40) % 360));
      const big = i < 3;
      const w = big ? 9 : 5.5, h = w / 2;
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = rot;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, big ? 6 : 4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2045, metalness: 0.7, roughness: 0.3 }));
      pole.position.y = big ? 3 : 2;
      pole.castShadow = true;
      grp.add(pole);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texs[0], transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }),
      );
      screen.position.y = (big ? 6 : 4) + h / 2;
      grp.add(screen);
      const frame = new THREE.Mesh(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + 0.2, h + 0.2)), new THREE.LineBasicMaterial({ color: 0xffffff }));
      frame.position.copy(screen.position);
      grp.add(frame);
      this.root.add(grp);
      this.billboards.push({ mesh: screen, tex: texs, i: 0, t: rand(3, 7) });
      this.addObstacle({ x, z, r: 0.35, top: y + 20, y, kind: "pole" });
    });
  }

  private buildJumbotrons() {
    const spots: [number, number, number, number][] = [
      [-70, 26, -95, 0.55],
      [78, 18, -80, -0.7],
    ];
    for (const [x, y, z, rot] of spots) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 288;
      const ctx = c.getContext("2d")!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 22.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
      m.position.set(x, y, z);
      m.rotation.y = rot;
      const back = new THREE.Mesh(new THREE.BoxGeometry(41.5, 24, 1), new THREE.MeshStandardMaterial({ color: 0x120c26, metalness: 0.6, roughness: 0.3 }));
      back.position.z = -0.6;
      m.add(back);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8), new THREE.MeshStandardMaterial({ color: 0x120c26 }));
      strut.position.set(0, -70, -1);
      m.add(strut);
      this.root.add(m);
      this.jumbo.push({ canvas: c, ctx, tex, t: 0 });
    }
  }

  private buildFloaters() {
    for (let i = 0; i < 12; i++) {
      const tex = uiFragmentTexture(i);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      );
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const r = rand(30, 52);
      const base = new THREE.Vector3(Math.cos(a) * r, rand(9, 22), Math.sin(a) * r - 8);
      m.position.copy(base);
      m.lookAt(0, base.y, 0);
      this.root.add(m);
      this.floaters.push({ obj: m, base, ph: Math.random() * 6, spin: 0 });
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b4a8a, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      const a = Math.random() * Math.PI * 2;
      const d = rand(26, 70);
      const base = new THREE.Vector3(Math.cos(a) * d, rand(-12, 16), Math.sin(a) * d);
      r.position.copy(base);
      r.scale.setScalar(rand(0.5, 2.2));
      this.root.add(r);
      this.floaters.push({ obj: r, base, ph: Math.random() * 6, spin: rand(0.1, 0.5) });
    }
  }

  private buildMoon() {
    const mat = new THREE.MeshBasicMaterial({ map: moonTexture(), fog: false, toneMapped: false, color: new THREE.Color(1.5, 1.4, 1.6) });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), mat);
    this.moon.position.set(60, -20, -380);
    this.moon.rotation.y = -0.4;
    this.root.add(this.moon);
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9be8, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.moonGlow.scale.setScalar(380);
    this.moonGlow.position.copy(this.moon.position);
    this.root.add(this.moonGlow);
    // the face, hidden until someone pokes the moon enough
    this.moonFace = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x2a1040, fog: false });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dark);
      e.scale.set(7, 10, 3);
      e.position.set(s * 20, 10, 64);
      this.moonFace.add(e);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      sh.position.set(s * 20 + 2.5, 14, 67);
      this.moonFace.add(sh);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(12, 2.2, 8, 24, Math.PI), dark);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -10, 64);
    this.moonFace.add(mouth);
    this.moonFace.visible = false;
    this.moon.add(this.moonFace);
  }

  private buildShadows() {
    const mat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(geo, mat, 220);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.root.add(this.shadows);
  }

  private buildMarkers() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.strokeStyle = "#fff";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(64, 64, 60, (i / 3) * Math.PI * 2, (i / 3) * Math.PI * 2 + 1.1);
      g.stroke();
    }
    const grd = g.createRadialGradient(64, 64, 10, 64, 64, 52);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(1, "rgba(255,255,255,0.35)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5 });
    this.markers = new THREE.InstancedMesh(geo, mat, 160);
    this.markers.frustumCulled = false;
    this.markers.count = 0;
    this.markers.renderOrder = 3;
    this.markers.setColorAt(0, new THREE.Color());
    this.root.add(this.markers);
  }
  private _q = new THREE.Quaternion();
  private _s = new THREE.Vector3();
  private _p = new THREE.Vector3();
  private _yAxis = new THREE.Vector3(0, 1, 0);
  /** glowing faction ring under a fighter, so the chaos stays readable */
  pushMarker(x: number, z: number, y: number, size: number, color: THREE.Color, spin: number) {
    if (this.markerCount >= 160) return;
    const g = this.groundAt(x, z, y + 0.1, 0.4);
    if (g === -Infinity || y - g > 6) return;
    const s = size * (1 + beat.pulse * 0.12);
    this._q.setFromAxisAngle(this._yAxis, spin);
    this._m4.compose(this._p.set(x, g + 0.05, z), this._q, this._s.set(s, 1, s));
    this.markers.setMatrixAt(this.markerCount, this._m4);
    this.markers.setColorAt(this.markerCount, color);
    this.markerCount++;
  }

  shockwave(x: number, z: number, strength: number) {
    this.floor.shockwave(x, z, strength, this.timeU.value);
  }

  private _m4 = new THREE.Matrix4();
  beginShadows() {
    this.shadowCount = 0;
    this.markerCount = 0;
  }
  pushShadow(x: number, z: number, y: number, size: number) {
    if (this.shadowCount >= 220) return;
    const g = this.groundAt(x, z, y + 0.1, 0.4);
    if (g === -Infinity) return;
    const h = y - g;
    const s = size * Math.max(0.25, 1 - h * 0.08);
    this._m4.makeScale(s, 1, s);
    this._m4.setPosition(x, g + 0.03, z);
    this.shadows.setMatrixAt(this.shadowCount++, this._m4);
  }
  endShadows() {
    this.shadows.count = this.shadowCount;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.markers.count = this.markerCount;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
  }

  /** Thousands of tiny distant mascots for the intro reveal. */
  private buildCrowd() {
    const n = 2400;
    const geo = new THREE.SphereGeometry(0.5, 12, 8);
    // 0 = felt Dot, 1 = Jolly, 2 = Grok Bot
    const kinds = new Float32Array(n);
    geo.setAttribute("aKind", new THREE.InstancedBufferAttribute(kinds, 1));
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    // each mascot's face is painted in the shader so thousands of them stay one draw call
    mat.onBeforeCompile = (s) => {
      s.vertexShader =
        "attribute float aKind;\nvarying float vKind;\nvarying vec3 vLocal;\n" +
        s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;\nvKind = aKind;");
      s.fragmentShader = "varying float vKind;\nvarying vec3 vLocal;\n" + s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float front = step(0.16, vLocal.z);
        vec2 p = vLocal.xy;
        if (vKind < 0.5) {
          float eye = smoothstep(0.06, 0.04, length(vec2(abs(p.x) - 0.13, p.y - 0.06)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), eye * front);
        } else if (vKind < 1.5) {
          float face = smoothstep(1.0, 0.92, length((p - vec2(0.0, 0.1)) / vec2(0.3, 0.22)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.72), face * front);
          float eye = smoothstep(0.045, 0.028, length(vec2(abs(p.x) - 0.12, p.y - 0.12)));
          float smile = smoothstep(0.025, 0.01, abs(length(p - vec2(0.0, 0.1)) - 0.06)) * step(p.y, 0.07) * step(abs(p.x), 0.05);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), max(eye, smile) * front);
        } else {
          mat2 tilt = mat2(0.951, 0.309, -0.309, 0.951);
          vec2 a = tilt * (p - vec2(0.02, 0.1));
          vec2 b = tilt * (p - vec2(0.24, 0.06));
          float eye = max(smoothstep(1.0, 0.8, length(a / vec2(0.045, 0.1))), smoothstep(1.0, 0.8, length(b / vec2(0.04, 0.1))));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), eye * front);
        }`,
      );
    };
    this.crowd = new THREE.InstancedMesh(geo, mat, n);
    const col = new THREE.Color();
    // Alfred, Todd, Felipe, Jojo, Jolly, Grok Bot
    const palette = [0xffb40a, 0xb5e93d, 0x2f86f2, 0xd85ed4, 0xf1d9ad, 0x16161a];
    const kindOf = [0, 0, 0, 0, 1, 2];
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      // spread on all islands and in a halo of floating rafts around them
      let x: number, y: number, z: number;
      if (i < 1600) {
        const is = this.islands[i % this.islands.length];
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (is.r - 0.8);
        x = is.x + Math.cos(a) * r;
        z = is.z + Math.sin(a) * r;
        y = is.y + 0.35;
      } else {
        const a = Math.random() * Math.PI * 2, r = rand(60, 140);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        y = rand(-20, 25);
      }
      const s = rand(0.5, 0.9);
      const pick = Math.floor(Math.random() * palette.length);
      const k = kindOf[pick];
      kinds[i] = k;
      const sy = k === 1 ? 1.4 : k === 0 ? 0.85 : 1;
      this.crowdData.push({ x, y, z, ph: Math.random() * 6, s, sy });
      m4.makeScale(s, s * sy, s);
      m4.setPosition(x, y, z);
      this.crowd.setMatrixAt(i, m4);
      col.set(palette[pick]);
      this.crowd.setColorAt(i, col);
    }
    this.crowd.visible = false;
    this.root.add(this.crowd);
  }

  updateCrowd(t: number, reveal: number) {
    if (!this.crowd.visible) return;
    const m4 = this._m4;
    const n = Math.floor(this.crowdData.length * Math.min(1, reveal));
    for (let i = 0; i < n; i++) {
      const d = this.crowdData[i];
      const hop = (i & 1 ? Math.pow(1 - beat.phase, 2) : Math.abs(Math.sin(t * 6 + d.ph))) * 0.55;
      m4.makeScale(d.s, d.s * d.sy * (1 + hop * 0.3), d.s);
      m4.setPosition(d.x + Math.sin(t + d.ph) * 0.4, d.y + hop, d.z);
      this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.count = n;
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  private buildPaint() {
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    this.paint = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 400);
    this.paint.count = 0;
    this.paint.frustumCulled = false;
    this.root.add(this.paint);
  }

  splat(x: number, z: number, y: number, size: number, color: THREE.Color) {
    const i = this.paintCount % 400;
    this.paintCount++;
    const g = this.groundAt(x, z, y + 1, 1);
    if (g === -Infinity) return;
    this._m4.makeScale(size, 1, size * rand(0.7, 1.3));
    this._m4.setPosition(x, g + 0.02 + (i % 7) * 0.002, z);
    this.paint.setMatrixAt(i, this._m4);
    this.paint.setColorAt(i, color);
    this.paint.count = Math.min(400, this.paintCount);
    this.paint.instanceMatrix.needsUpdate = true;
    if (this.paint.instanceColor) this.paint.instanceColor.needsUpdate = true;
  }

  clearPaint() {
    this.paintCount = 0;
    this.paint.count = 0;
  }

  private buildSelectStage() {
    const g = this.selectStage;
    g.position.set(0, 14, 34);
    const colors = [0x7df9e0, 0x8f7bff, 0xff6a2b];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      p.position.set((i - 1) * 3.6, i === 1 ? 0.35 : 0, i === 1 ? -0.6 : 0);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.2, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x241a48, roughness: 0.35, metalness: 0.6 }));
      top.position.y = -0.2;
      p.add(top);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.06, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i]).multiplyScalar(2.2), toneMapped: false }));
      glow.position.y = 0.0;
      p.add(glow);
      const under = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a6a, flatShading: true }));
      under.rotation.x = Math.PI;
      under.position.y = -1.3;
      p.add(under);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 0.2, 8, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.y = -6;
      p.add(beam);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 6, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i]).multiplyScalar(2), toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      ring.userData.ring = true;
      p.add(ring);
      g.add(p);
      this.selectPlatforms.push(p);
    }
    g.visible = false;
    this.root.add(g);
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number, t: number, cam: THREE.Camera) {
    this.timeU.value = t;
    const sm = this.sky.material;
    sm.uniforms.uArt.value = this.art;
    sm.uniforms.uHue.value = this.hueShift;
    this.sky.position.copy(cam.position);
    this.spectacle.update(dt, t);

    // the whole place is a nightclub
    const pulse = beat.pulse;
    const hype = beat.hype;
    for (const p of this.pulseMats) p.mat.color.copy(p.base).multiplyScalar(0.75 + pulse * p.amt * (0.6 + hype) + hype * 0.4);
    this.cityMat.emissiveIntensity = 1.1 + pulse * 0.5 + hype * 0.8;
    for (const tr of this.trees) {
      const k = Math.pow(1 - ((beat.phase + tr.userData.ph) % 1), 3) * (0.07 + hype * 0.08);
      tr.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
      // canopies between the camera and the player go see-through
      const pl = this.floor.player;
      let want = 1;
      if (pl.y > -50) {
        _occ.set(tr.position.x, tr.position.y + 3, tr.position.z);
        _seg.subVectors(pl, cam.position);
        const len = _seg.length();
        const along = _occ.sub(cam.position).dot(_seg) / (len * len);
        if (along > 0 && along < 1.05) {
          const off = _occ.addScaledVector(_seg, -along).length();
          if (off < 2.6) want = 0.18 + 0.82 * Math.max(0, (off - 1.4) / 1.2);
        }
      }
      const mat = tr.userData.mat as THREE.MeshStandardMaterial;
      tr.userData.op += (want - tr.userData.op) * Math.min(1, dt * 10);
      const op = tr.userData.op;
      const tp = op < 0.99;
      if (tp !== mat.transparent) {
        mat.transparent = tp;
        mat.depthWrite = !tp;
        mat.needsUpdate = true;
      }
      mat.opacity = op;
    }

    for (const b of this.billboards) {
      b.t -= dt;
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      if (b.t < 0) {
        b.t = rand(4, 8);
        b.i = (b.i + 1) % b.tex.length;
        mat.map = b.tex[b.i];
        mat.opacity = 0.2;
      }
      mat.opacity += (0.92 - mat.opacity) * Math.min(1, dt * 6);
      if (Math.random() < 0.01) mat.opacity = 0.4;
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 240) c.position.x = -240;
    }
    for (const f of this.floaters) {
      f.obj.position.y = f.base.y + Math.sin(t * 0.6 + f.ph) * 1.2;
      if (f.spin) {
        f.obj.rotation.x += f.spin * dt;
        f.obj.rotation.y += f.spin * dt * 0.7;
      } else f.obj.rotation.z = Math.sin(t * 0.5 + f.ph) * 0.08;
    }
    for (const p of this.pads) {
      p.pulse = Math.max(0, p.pulse - dt * 2);
      p.mesh.scale.setScalar(1 + p.pulse * 0.3);
      const beam = p.mesh.children[3] as THREE.Mesh;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 4) * 0.04 + p.pulse * 0.5;
    }
    for (const p of this.portals) p.mesh.children[0].rotation.z = t * 0.8;
    for (const pl of this.selectPlatforms) for (const c of pl.children) if (c.userData.ring) c.rotation.z = t * 0.5;

    for (const j of this.jumbo) {
      j.t -= dt;
      if (j.t > 0) continue;
      j.t = 0.5;
      this.drawJumbo(j.ctx, t);
      j.tex.needsUpdate = true;
    }
  }

  private drawJumbo(g: CanvasRenderingContext2D, t: number) {
    const w = 512, h = 288;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#1a0b3a");
    grd.addColorStop(1, "#3a0b4a");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    g.fillStyle = "#ff3b5c";
    g.beginPath();
    g.arc(30, 30, 9 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
    g.fill();
    const F = displayFont();
    g.font = `26px ${F}`;
    g.fillStyle = "#fff";
    g.textAlign = "left";
    g.fillText("LIVE", 48, 39);
    g.textAlign = "center";
    const line = this.jumboLines[Math.floor(t / 2.5) % this.jumboLines.length] ?? "";
    g.font = `${line.length > 14 ? 44 : 64}px ${F}`;
    g.fillStyle = `hsl(${(t * 40) % 360},100%,75%)`;
    g.fillText(line, w / 2, h / 2 + 18);
    g.font = `20px ${F}`;
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillText("brought to you by: nobody. nobody approved this.", w / 2, h - 24);
  }
}
