import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Expression, Face, Faction, Rig } from "./types";
import { decorate, shellGeometry, type FurOpts } from "./fur";
import { GROK_EYES, GROK_HEADS, type GrokHead } from "./grokMark";

// ------------------------------------------------------------------ shared geometry

const G = {
  sphereHi: new THREE.SphereGeometry(1, 48, 32),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 4, 0.18),
  arc: new THREE.TorusGeometry(1, 0.26, 8, 20, Math.PI),
  ring: new THREE.TorusGeometry(1, 0.3, 8, 24),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
};

/** Agrippa's toga: a diagonal draped band cut out of a slightly inflated copy of the body. */
function togaMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xfbf6ec, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xfff3e0, emissiveIntensity: 0.18 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTogaP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTogaP = position;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTogaP;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float band = dot(vTogaP - vec3(0.0, 0.66, 0.0), normalize(vec3(0.62, 1.0, 0.0)));
        bool skirt = vTogaP.y < 0.36 && vTogaP.y > 0.16;
        if (abs(band) > 0.13 && !skirt) discard;
        diffuseColor.rgb *= 0.94 + 0.06 * sin(band * 38.0 + vTogaP.x * 6.0);`,
      );
  };
  m.customProgramCacheKey = () => "toga";
  return m;
}

const M = {
  eye: new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.12, metalness: 0.1 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x2a1512, roughness: 0.5 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  blush: new THREE.MeshBasicMaterial({ color: 0xff8f8f, transparent: true, opacity: 0.42, depthWrite: false }),
  phone: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, emissive: 0x335577, emissiveIntensity: 0.6 }),
  brow: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6 }),
  museSkin: new THREE.MeshStandardMaterial({ color: 0xffd8bf, roughness: 0.7, emissive: 0xc77f5f, emissiveIntensity: 0.32 }),
  laurel: new THREE.MeshStandardMaterial({ color: 0x86b84a, roughness: 0.5, emissive: 0x24420f, emissiveIntensity: 0.5 }),
  toga: togaMaterial(),
  spotify: new THREE.MeshStandardMaterial({ color: 0x1ed760, roughness: 0.35 }),
  cup: new THREE.MeshStandardMaterial({ color: 0x191414, roughness: 0.4 }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  return m;
}

/** Shared per-faction rim light, so every character pops off the floor and pulses with the music. */
export const RIM: Record<Faction, { color: { value: THREE.Color }; strength: { value: number } }> = {
  dot: { color: { value: new THREE.Color(0xfff0d2) }, strength: { value: 0.6 } },
  muse: { color: { value: new THREE.Color(0xd2e2ff) }, strength: { value: 0.6 } },
  grok: { color: { value: new THREE.Color(0xc9bfff) }, strength: { value: 0.9 } },
};
const NO_RIM = new Set<THREE.Material>([M.eye, M.mouth, M.ink, M.brow, M.phone, M.museSkin, M.toga]);

// ------------------------------------------------------------------ faces

type Surf = (x: number, y: number) => { z: number; rx: number; ry: number };

/**
 * Builds a full face kit on a surface: a sphere of radius R, a custom surface, or a plane when R is 0.
 * Every expression lives in the kit; switching expression is only toggling visibility.
 */
function buildFace(R: number, o: { eyeX: number; eyeY: number; eyeW: number; eyeH: number; mouthY: number; surf?: Surf; brows?: boolean }) {
  const root = new THREE.Group();
  const place = (obj: THREE.Object3D, x: number, y: number, push = 0) => {
    if (o.surf) {
      const s = o.surf(x, y);
      obj.position.set(x, y, s.z + push);
      obj.rotation.set(s.rx, s.ry, obj.rotation.z);
    } else if (R > 0) {
      const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
      obj.position.set(x, y, z + push);
      obj.rotation.y = Math.asin(x / R);
      obj.rotation.x = -Math.asin(y / R);
    } else obj.position.set(x, y, push);
    root.add(obj);
    return obj;
  };
  const eyes: THREE.Object3D[] = [];
  const xEyes: THREE.Object3D[] = [];
  const happyEyes: THREE.Object3D[] = [];
  const brows: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    eg.add(mesh(G.sphere, M.eye, o.eyeW, o.eyeH, o.eyeW * 0.55));
    const sh = mesh(G.sphereLo, M.shine, o.eyeW * 0.3);
    sh.position.set(o.eyeW * 0.3, o.eyeH * 0.36, o.eyeW * 0.42);
    eg.add(sh);
    place(eg, s * o.eyeX, o.eyeY, 0);
    eyes.push(eg);

    const xg = new THREE.Group();
    for (const r of [-1, 1]) {
      const b = mesh(G.box, M.eye, o.eyeW * 2.2, o.eyeW * 0.45, 0.01);
      b.rotation.z = (r * Math.PI) / 4;
      xg.add(b);
    }
    place(xg, s * o.eyeX, o.eyeY, 0.005);
    xg.visible = false;
    xEyes.push(xg);

    const hg = mesh(G.arc, M.eye, o.eyeW * 0.9, o.eyeW * 0.9, o.eyeW * 0.5);
    place(hg, s * o.eyeX, o.eyeY - o.eyeH * 0.3, 0.004);
    hg.visible = false;
    happyEyes.push(hg);

    if (o.brows) {
      const br = mesh(G.rbox, M.brow, o.eyeW * 2.1, o.eyeW * 0.42, 0.01);
      place(br, s * o.eyeX, o.eyeY + o.eyeH * 1.6, 0.004);
      brows.push(br);
    }
  }
  const smile = new THREE.Group();
  const sm = mesh(G.arc, M.mouth, o.eyeW * 1.25, o.eyeW * 1.25, o.eyeW * 0.4);
  sm.rotation.z = Math.PI;
  smile.add(sm);
  place(smile, 0, o.mouthY, 0.002);
  const mouthO = mesh(G.sphere, M.mouth, o.eyeW * 0.5, o.eyeW * 0.65, o.eyeW * 0.2);
  place(mouthO, 0, o.mouthY - o.eyeW * 0.2, 0);
  mouthO.visible = false;
  const mouthFlat = mesh(G.rbox, M.mouth, o.eyeW * 1.4, o.eyeW * 0.28, 0.01);
  place(mouthFlat, 0, o.mouthY, 0.002);
  mouthFlat.visible = false;
  const face: Face = { root, eyes, xEyes, happyEyes, smile, mouthO, mouthFlat, brows, expr: "neutral", exprTimer: 0, blink: 2 + Math.random() * 3 };
  return face;
}

export function setExpression(face: Face, expr: Expression, hold = 0) {
  face.exprTimer = hold;
  if (face.expr === expr) return;
  face.expr = expr;
  const eyesOn = expr === "neutral" || expr === "surprised" || expr === "angry" || expr === "derp" || expr === "smug" || expr === "hurt";
  face.eyes.forEach((e) => (e.visible = eyesOn));
  face.xEyes.forEach((e) => (e.visible = expr === "dead"));
  face.happyEyes.forEach((e) => (e.visible = expr === "happy"));
  face.smile.visible = expr === "neutral" || expr === "happy" || expr === "smug";
  face.mouthO.visible = expr === "surprised" || expr === "dead" || expr === "hurt" || expr === "derp";
  face.mouthFlat.visible = expr === "angry";
  const big = expr === "surprised" ? 1.35 : expr === "hurt" ? 0.75 : 1;
  face.eyes.forEach((e, i) => {
    e.scale.setScalar(big);
    if (expr === "derp") e.scale.setScalar(i === 0 ? 1.4 : 0.7);
    if (expr === "smug") e.scale.set(1, 0.55, 1);
  });
  face.brows.forEach((b, i) => {
    b.rotation.z = expr === "angry" ? (i === 0 ? -0.5 : 0.5) : expr === "smug" ? (i === 0 ? 0.3 : -0.1) : 0;
    b.position.y = b.userData.baseY ?? (b.userData.baseY = b.position.y);
    if (expr === "smug" && i === 0) b.position.y += 0.02;
  });
}

// ------------------------------------------------------------------ rig plumbing

function pivot(x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

type RigParts = Omit<Rig, "kind" | "root" | "body" | "walk" | "squash" | "squashVel" | "fall" | "fallTimer" | "pose" | "poseTimer" | "lookYaw" | "wave" | "lite">;
function baseRig(kind: Faction, root: THREE.Group, body: THREE.Group, parts: RigParts): Rig {
  return { kind, lite: false, root, body, ...parts, walk: Math.random() * 10, squash: 0, squashVel: 0, fall: 0, fallTimer: 0, pose: 0, poseTimer: 0, lookYaw: 0, wave: 0 };
}

/** Invisible limb pivots for limbless mascots, so poses / held props still have somewhere to live. */
function ghostLimbs(body: THREE.Group, w: number, h: number) {
  const armL = pivot(-w, h, 0.05);
  const armR = pivot(w, h, 0.05);
  const legL = pivot(-w * 0.4, 0.1, 0);
  const legR = pivot(w * 0.4, 0.1, 0);
  body.add(armL, armR, legL, legR);
  return { armL, armR, legL, legR };
}

function furPair(kind: Faction, color: THREE.ColorRepresentation, fur: FurOpts, glow = 0) {
  const mk = (shells: boolean) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, emissive: color, emissiveIntensity: glow });
    decorate(m, RIM[kind], kind, fur, shells);
    return m;
  };
  return [mk(false), mk(true)] as const;
}

function addShell(src: THREE.Mesh, mat: THREE.Material, layers: number) {
  const geo = shellGeometry(src.geometry, layers);
  let m: THREE.Mesh;
  if ((src as THREE.SkinnedMesh).isSkinnedMesh) {
    const s = src as THREE.SkinnedMesh;
    const sk = new THREE.SkinnedMesh(geo, mat);
    sk.bind(s.skeleton, s.bindMatrix);
    if (s.boundingSphere) {
      sk.boundingSphere = s.boundingSphere.clone();
      sk.boundingSphere.radius *= 1.15;
    }
    m = sk;
  } else m = new THREE.Mesh(geo, mat);
  m.position.copy(src.position);
  m.quaternion.copy(src.quaternion);
  m.scale.copy(src.scale);
  src.parent!.add(m);
  return m;
}

// ------------------------------------------------------------------ OPENAI DOTS (official GLBs)

export const DOT_NAMES = ["alfred", "todd", "felipe", "jojo"] as const;
type DotName = (typeof DOT_NAMES)[number];

interface DotTpl {
  name: DotName;
  root: THREE.Group;
  color: THREE.Color;
  eyes: THREE.Vector3[];
  gap: number;
  mouth: THREE.Vector3;
  eyeBones: { name: string; axis: 0 | 1 | 2 }[];
  masks: NonNullable<FurOpts["masks"]>;
}

const dotTpls: DotTpl[] = [];
const DOT_HOVER = 0.16;
const FUR_DOT: FurOpts = { scale: 15, fuzz: 0.45, shell: 0.05 };
let assets: Promise<void> | null = null;

/** Loads the official mascot models once. Safe to call repeatedly; the game falls back to procedural Dots without them. */
export function loadCharacterAssets() {
  if (!assets) {
    const loader = new GLTFLoader();
    assets = Promise.all(
      DOT_NAMES.map((n) =>
        loadDot(loader, n).catch((e) => {
          console.warn(`[amb] dot ${n} unavailable`, e);
          return null;
        }),
      ),
    ).then((list) => {
      for (const t of list) if (t) dotTpls.push(t);
      for (const k of GROK_KINDS) grokGeometry(k);
      jollyGeometry();
    });
  }
  return assets;
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

async function loadDot(loader: GLTFLoader, name: DotName): Promise<DotTpl> {
  const gltf = await loader.loadAsync(`/assets/dots/${name}.glb`);
  const scene = gltf.scene;
  const norm = new THREE.Group();
  norm.add(scene);
  const root = new THREE.Group();
  root.add(norm);
  root.updateMatrixWorld(true);

  let body: THREE.SkinnedMesh | null = null;
  const eyes: THREE.Mesh[] = [];
  const glasses: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const n = (m.name + " " + (m.parent?.name ?? "")).toUpperCase();
    if (n.includes("BODY")) body = m as THREE.SkinnedMesh;
    else if (n.includes("EYE")) eyes.push(m);
    else if (n.includes("GLASSES") && !n.includes("ARM")) glasses.push(m);
  });
  if (!body) throw new Error("no body mesh");
  const bodyMesh = body as THREE.SkinnedMesh;
  const faceMeshes = eyes.length ? eyes : glasses;

  // face the model down +z, feet on y=0, exactly 1 unit tall
  const all = new THREE.Box3().setFromObject(scene, true);
  const fbox = new THREE.Box3();
  for (const m of faceMeshes) fbox.union(_box.setFromObject(m, true));
  const c = all.getCenter(new THREE.Vector3());
  const fc = fbox.getCenter(new THREE.Vector3());
  norm.rotation.y = -Math.atan2(fc.x - c.x, fc.z - c.z);
  root.updateMatrixWorld(true);
  const nb = new THREE.Box3().setFromObject(norm, true);
  const k = 1 / (nb.max.y - nb.min.y);
  const nc = nb.getCenter(new THREE.Vector3());
  norm.scale.setScalar(k);
  norm.position.set(-nc.x * k, -nb.min.y * k, -nc.z * k);
  root.updateMatrixWorld(true);

  // eye anchors for expression overlays
  const left = new THREE.Box3(), right = new THREE.Box3();
  for (const m of faceMeshes) {
    _box.setFromObject(m, true);
    (_box.getCenter(_v).x < 0 ? left : right).union(_box);
  }
  const anchors: THREE.Vector3[] = [];
  if (!left.isEmpty() && !right.isEmpty()) {
    for (const b of [left, right]) {
      const p = b.getCenter(new THREE.Vector3());
      p.z = b.max.z;
      anchors.push(p);
    }
  } else {
    const b = left.isEmpty() ? right : left;
    const p = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const off = size.x * (eyes.length ? 0.365 : 0.25);
    anchors.push(new THREE.Vector3(p.x - off, p.y, b.max.z), new THREE.Vector3(p.x + off, p.y, b.max.z));
  }
  const gap = anchors[0].distanceTo(anchors[1]);
  const mouth = new THREE.Vector3(0, (anchors[0].y + anchors[1].y) / 2 - gap * 0.55, anchors[0].z);
  bodyMesh.computeBoundingSphere();
  const ray = new THREE.Raycaster(new THREE.Vector3(mouth.x, mouth.y, 5), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(bodyMesh, false)[0];
  if (hit) mouth.z = hit.point.z;
  for (const a of anchors) {
    ray.set(new THREE.Vector3(a.x, a.y, 5), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObject(bodyMesh, false)[0];
    if (h) a.z = Math.max(a.z, h.point.z);
  }

  // eyes sunk into the body (Todd) would be buried under fur shells: cut them out in geometry space
  const masks: NonNullable<FurOpts["masks"]> = [];
  if (eyes.some((m) => /INTEGRATED/i.test(m.name + (m.parent?.name ?? "")))) {
    const pos = bodyMesh.geometry.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const side of [left, right]) {
      if (side.isEmpty()) continue;
      const ex = side.clone().expandByScalar(side.getSize(p).x * 0.12);
      const gb = new THREE.Box3();
      for (let i = 0; i < pos.count; i++) {
        bodyMesh.getVertexPosition(i, p).applyMatrix4(bodyMesh.matrixWorld);
        if (ex.containsPoint(p)) gb.expandByPoint(q.fromBufferAttribute(pos, i));
      }
      if (!gb.isEmpty()) masks.push({ c: gb.getCenter(new THREE.Vector3()), r: gb.getSize(new THREE.Vector3()).multiplyScalar(0.56).addScalar(0.01) });
    }
  }

  // eye bones scale along whichever local axis points up in the bind pose (used for blinking)
  const eyeBones: DotTpl["eyeBones"] = [];
  for (const bn of ["Eye_L_CTRL", "Eye_R_CTRL"]) {
    const b = scene.getObjectByName(bn);
    if (!b) continue;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
    const ax = [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)];
    eyeBones.push({ name: bn, axis: ax.indexOf(Math.max(...ax)) as 0 | 1 | 2 });
  }

  const color = (bodyMesh.material as THREE.MeshStandardMaterial).color.clone();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = false;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).computeBoundingSphere();
    const src = m.material as THREE.MeshStandardMaterial;
    if (m === bodyMesh) {
      m.userData.part = "body";
    } else if (faceMeshes.includes(m)) {
      m.userData.part = "eye";
      NO_RIM.add(src);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: src.color, roughness: Math.max(0.45, src.roughness), metalness: 0 });
      decorate(mat, RIM.dot, "dot");
      m.material = mat;
    }
  });
  return { name, root, color, eyes: anchors, gap, mouth, eyeBones, masks };
}

let dotTurn = 0;

function buildDot(tint?: number, variant?: string): Rig {
  const tpl = dotTpls.find((t) => t.name === variant) ?? dotTpls[dotTurn++ % Math.max(1, dotTpls.length)];
  if (!tpl) return buildDotFallback(tint);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const head = new THREE.Group();
  head.position.y = DOT_HOVER + 0.5;
  body.add(head);
  const model = cloneSkinned(tpl.root) as THREE.Group;
  model.position.y = -0.5;
  head.add(model);

  const [fur, shell] = furPair("dot", tint !== undefined ? new THREE.Color(tint) : tpl.color, { ...FUR_DOT, masks: tpl.masks });
  let bodyMesh: THREE.Mesh | null = null;
  const eyeMeshes: THREE.Object3D[] = [];
  model.traverse((o) => {
    if (o.userData.part === "body") bodyMesh = o as THREE.Mesh;
    else if (o.userData.part === "eye") eyeMeshes.push(o);
  });
  bodyMesh!.material = fur;
  addShell(bodyMesh!, shell, 5);

  // expression overlays drawn in felt-black on the plush
  const face = dotFace(tpl);
  model.add(face.root);
  const bones = tpl.eyeBones
    .map((b) => ({ bone: model.getObjectByName(b.name)!, axis: b.axis }))
    .filter((b) => b.bone)
    .map((b) => ({ ...b, base: b.bone.scale.clone() }));
  const phase = Math.random() * 10;

  return baseRig("dot", root, body, {
    head,
    ...ghostLimbs(body, 0.55, 0.55),
    face,
    flashMats: [fur, shell],
    baseEmissive: [0, 0],
    height: 1.2,
    variant: tpl.name,
    post: (r, moving, t) => {
      const vis = face.eyes[0].visible;
      for (const m of eyeMeshes) m.visible = vis;
      for (let i = 0; i < bones.length; i++) {
        const p = face.eyes[i] ?? face.eyes[0];
        const b = bones[i];
        b.bone.scale.copy(b.base).multiplyScalar(p.scale.x);
        b.bone.scale.setComponent(b.axis, b.base.getComponent(b.axis) * p.scale.y);
      }
      head.position.y = DOT_HOVER + 0.5 + Math.sin(t * 2.3 + phase) * 0.04;
      head.rotation.z = moving ? Math.sin(r.walk) * 0.1 : Math.sin(t * 1.7 + phase) * 0.04;
    },
  });
}

function dotFace(tpl: DotTpl): Face {
  const root = new THREE.Group();
  const g = tpl.gap;
  const eyes: THREE.Object3D[] = [];
  const xEyes: THREE.Object3D[] = [];
  const happyEyes: THREE.Object3D[] = [];
  for (const a of tpl.eyes) {
    const proxy = new THREE.Object3D();
    proxy.position.copy(a);
    root.add(proxy);
    eyes.push(proxy);
    const xg = new THREE.Group();
    for (const r of [-1, 1]) {
      const b = mesh(G.rbox, M.ink, g * 0.34, g * 0.075, g * 0.04);
      b.rotation.z = (r * Math.PI) / 4;
      xg.add(b);
    }
    xg.position.copy(a).setZ(a.z + g * 0.02);
    xg.visible = false;
    root.add(xg);
    xEyes.push(xg);
    const hg = mesh(G.arc, M.ink, g * 0.15, g * 0.15, g * 0.08);
    hg.position.copy(a).setZ(a.z + g * 0.02);
    hg.visible = false;
    root.add(hg);
    happyEyes.push(hg);
  }
  const mouthO = mesh(G.sphere, M.ink, g * 0.09, g * 0.12, g * 0.04);
  mouthO.position.copy(tpl.mouth).setZ(tpl.mouth.z + g * 0.01);
  mouthO.visible = false;
  root.add(mouthO);
  return { root, eyes, xEyes, happyEyes, smile: new THREE.Group(), mouthO, mouthFlat: new THREE.Group(), brows: [], expr: "neutral", exprTimer: 0, blink: 2 + Math.random() * 3 };
}

/** Procedural stand-in when the Dot models are missing: a felt Felipe-ish blob. */
function buildDotFallback(tint?: number): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const head = new THREE.Group();
  head.position.y = DOT_HOVER + 0.5;
  body.add(head);
  const [fur, shell] = furPair("dot", tint ?? 0x2f86f2, { scale: 30, fuzz: 0.32, shell: 0.035 });
  const blob = mesh(G.sphereHi, fur, 0.56, 0.48, 0.46);
  head.add(blob);
  addShell(blob, shell, 5);
  const face = buildFace(0, { eyeX: 0.13, eyeY: 0.05, eyeW: 0.045, eyeH: 0.05, mouthY: -0.1 });
  face.root.position.z = 0.44;
  head.add(face.root);
  return baseRig("dot", root, body, { head, ...ghostLimbs(body, 0.55, 0.55), face, flashMats: [fur, shell], baseEmissive: [0, 0], height: 1.2, variant: "felt" });
}

// ------------------------------------------------------------------ META MUSE - Jolly

const MUSE_GLOW = 0.16;
const JOLLY_FUR: FurOpts = { scale: 40, fuzz: 0.3, shell: 0.028, masks: [{ c: new THREE.Vector3(0, 1.1, 0.3), r: new THREE.Vector3(0.255, 0.195, 0.2) }] };
const FACE_C = new THREE.Vector3(0, 1.1, 0.255);
const FACE_R = new THREE.Vector3(0.25, 0.19, 0.105);
let jollyGeo: { body: THREE.BufferGeometry; arm: THREE.BufferGeometry; leg: THREE.BufferGeometry } | null = null;

function jollyGeometry() {
  if (jollyGeo) return jollyGeo;
  // silhouette traced from Meta's Jolly: round hood, soft shoulders, pear belly
  const prof: [number, number][] = [
    [0, 0.13], [0.27, 0.15], [0.392, 0.22], [0.45, 0.34], [0.452, 0.49], [0.4, 0.68], [0.36, 0.83],
    [0.372, 0.98], [0.382, 1.12], [0.336, 1.27], [0.22, 1.37], [0.001, 1.42],
  ];
  const curve = new THREE.SplineCurve(prof.map(([r, h]) => new THREE.Vector2(r, h)));
  const pts = curve.getPoints(64).map((p) => new THREE.Vector2(Math.max(0.0005, p.x), p.y));
  pts[0].x = pts[pts.length - 1].x = 0.0005;
  const body = new THREE.LatheGeometry(pts, 64, Math.PI);
  body.scale(1, 1, 0.84);
  body.computeVertexNormals();
  const arm = new THREE.CapsuleGeometry(0.085, 0.32, 8, 16);
  const leg = new THREE.CapsuleGeometry(0.105, 0.06, 8, 16);
  jollyGeo = { body, arm, leg };
  return jollyGeo;
}

const MUSE_VARIANTS = ["jolly", "agrippa", "jolly", "spotify", "jolly"] as const;
let museTurn = 0;

function buildMuse(variant?: string): Rig {
  const v = variant ?? MUSE_VARIANTS[museTurn++ % MUSE_VARIANTS.length];
  const geo = jollyGeometry();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const [fur, shell] = furPair("muse", 0xf1d9ad, JOLLY_FUR, MUSE_GLOW);

  const torso = new THREE.Mesh(geo.body, fur);
  body.add(torso);
  addShell(torso, shell, 5);

  // the "head" is the hood region; everything face-related hangs off it
  const head = new THREE.Group();
  head.position.y = FACE_C.y;
  body.add(head);
  const faceMesh = mesh(G.sphereHi, M.museSkin, FACE_R.x, FACE_R.y, FACE_R.z);
  faceMesh.position.z = FACE_C.z;
  head.add(faceMesh);

  const surf: Surf = (x, y) => {
    const q = Math.max(0, 1 - (x / FACE_R.x) ** 2 - (y / FACE_R.y) ** 2);
    return { z: FACE_C.z + FACE_R.z * Math.sqrt(q), ry: Math.atan((x / FACE_R.x) * 0.55), rx: -Math.atan((y / FACE_R.y) * 0.5) };
  };
  const face = buildFace(0, { eyeX: 0.142, eyeY: 0.012, eyeW: 0.027, eyeH: 0.031, mouthY: -0.058, surf });
  head.add(face.root);
  for (const s of [-1, 1]) {
    const b = mesh(G.sphereLo, M.blush, 0.045, 0.026, 0.01);
    const p = surf(s * 0.19, -0.055);
    b.position.set(s * 0.19, -0.055, p.z + 0.001);
    b.rotation.set(p.rx, p.ry, 0);
    head.add(b);
  }

  const armL = pivot(-0.37, 0.77, 0);
  const armR = pivot(0.37, 0.77, 0);
  for (const [a, s] of [[armL, -1], [armR, 1]] as const) {
    const arm = new THREE.Mesh(geo.arm, fur);
    arm.position.set(s * 0.05, -0.25, 0.02);
    arm.rotation.z = s * 0.2;
    a.add(arm);
    addShell(arm, shell, 4);
    body.add(a);
  }
  const legL = pivot(-0.155, 0.2, 0.02);
  const legR = pivot(0.155, 0.2, 0.02);
  for (const l of [legL, legR]) {
    const leg = new THREE.Mesh(geo.leg, fur);
    leg.position.y = -0.09;
    l.add(leg);
    addShell(leg, shell, 4);
    body.add(l);
  }

  if (v === "agrippa") {
    const wreath = new THREE.Group();
    wreath.position.set(0, 1.27 - FACE_C.y, -0.02);
    wreath.rotation.x = -0.18;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      if (Math.abs(Math.sin(a / 2)) < 0.12) continue;
      const leaf = mesh(G.sphereLo, M.laurel, 0.068, 0.028, 0.036);
      leaf.position.set(Math.sin(a) * 0.32, Math.sin(i * 1.7) * 0.015, Math.cos(a) * 0.28);
      leaf.rotation.set(0.5 * Math.sign(Math.sin(i)), a + Math.PI / 2, 0.4);
      wreath.add(leaf);
    }
    head.add(wreath);
    const toga = new THREE.Mesh(geo.body, M.toga);
    toga.scale.set(1.1, 1.0, 1.11);
    body.add(toga);
  } else if (v === "spotify") {
    const band = mesh(new THREE.TorusGeometry(0.395, 0.032, 10, 40, Math.PI), M.spotify);
    band.position.set(0, 0, -0.02);
    head.add(band);
    for (const s of [-1, 1]) {
      const cupMesh = mesh(G.cyl, M.cup, 0.105, 0.09, 0.105);
      cupMesh.rotation.z = Math.PI / 2;
      cupMesh.position.set(s * 0.395, 0, -0.02);
      head.add(cupMesh);
      const ring = mesh(G.ring, M.spotify, 0.1, 0.1, 0.12);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(s * 0.44, 0, -0.02);
      head.add(ring);
    }
  }

  return baseRig("muse", root, body, {
    head,
    armL, armR, legL, legR, face,
    flashMats: [fur, shell],
    baseEmissive: [MUSE_GLOW, MUSE_GLOW],
    height: 1.42,
    variant: v,
    post: (r, moving) => {
      r.body.rotation.z = moving ? Math.sin(r.walk) * 0.1 : 0;
    },
  });
}

// ------------------------------------------------------------------ GROK BOTS (official mark)

const GROK_KINDS: GrokHead[] = ["circle", "triangle", "diamond"];
const GROK_HOVER = 0.06;
const grokGeo: Partial<Record<GrokHead, { head: THREE.BufferGeometry; eyes: { x: number; y: number; geo: THREE.BufferGeometry; len: number }[]; front: number }>> = {};
let grokTurn = 0;

function grokGeometry(kind: GrokHead) {
  const hit = grokGeo[kind];
  if (hit) return hit;
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${GROK_HEADS[kind]}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 46,
    bevelEnabled: true,
    bevelThickness: 36,
    bevelSize: 18,
    bevelSegments: 10,
    curveSegments: kind === "diamond" ? 4 : 28,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const c = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.y);
  geo.translate(-c.x, -c.y, -c.z);
  // flip svg y-down to y-up as a proper rotation so the winding stays outward
  geo.scale(k, -k, -k);
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  const eyes = GROK_EYES[kind].map(([cx, cy, len, w]) => ({
    x: (cx - c.x) * k,
    y: -(cy - c.y) * k,
    len: len * k,
    geo: new THREE.CapsuleGeometry((w / 2) * k, (len - w) * k, 6, 16),
  }));
  const out = { head: geo, eyes, front: (size.z / 2) * k };
  grokGeo[kind] = out;
  return out;
}

function buildGrok(variant?: string): Rig {
  const kind = (GROK_KINDS as string[]).includes(variant ?? "") ? (variant as GrokHead) : GROK_KINDS[grokTurn++ % GROK_KINDS.length];
  const geo = grokGeometry(kind);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const head = new THREE.Group();
  head.position.y = GROK_HOVER + 0.5;
  body.add(head);
  const mat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.34, metalness: 0.05 });
  head.add(new THREE.Mesh(geo.head, mat));

  const fr = new THREE.Group();
  fr.position.z = geo.front + 0.004;
  head.add(fr);
  const eyes: THREE.Object3D[] = [];
  const xEyes: THREE.Object3D[] = [];
  const happyEyes: THREE.Object3D[] = [];
  for (const e of geo.eyes) {
    const eg = new THREE.Group();
    eg.position.set(e.x, e.y, 0);
    const pill = mesh(e.geo, M.white, 1, 1, 0.3);
    pill.rotation.z = 0.314;
    eg.add(pill);
    fr.add(eg);
    eyes.push(eg);
    const xg = new THREE.Group();
    xg.position.set(e.x, e.y, 0.004);
    for (const r of [-1, 1]) {
      const b = mesh(G.rbox, M.white, e.len * 0.75, e.len * 0.17, 0.01);
      b.rotation.z = (r * Math.PI) / 4;
      xg.add(b);
    }
    xg.visible = false;
    fr.add(xg);
    xEyes.push(xg);
    const hg = mesh(G.arc, M.white, e.len * 0.32, e.len * 0.32, 0.05);
    hg.position.set(e.x, e.y - e.len * 0.1, 0.004);
    hg.visible = false;
    fr.add(hg);
    happyEyes.push(hg);
  }
  const mx = (geo.eyes[0].x + geo.eyes[1].x) / 2;
  const my = Math.min(geo.eyes[0].y, geo.eyes[1].y) - geo.eyes[0].len * 0.95;
  const mouthO = mesh(G.ring, M.white, 0.045, 0.06, 0.02);
  mouthO.position.set(mx, my, 0.004);
  mouthO.visible = false;
  fr.add(mouthO);
  const mouthFlat = mesh(G.rbox, M.white, 0.12, 0.022, 0.01);
  mouthFlat.position.set(mx, my, 0.004);
  mouthFlat.rotation.z = -0.15;
  mouthFlat.visible = false;
  fr.add(mouthFlat);
  const face: Face = { root: fr, eyes, xEyes, happyEyes, smile: new THREE.Group(), mouthO, mouthFlat, brows: [], expr: "neutral", exprTimer: 0, blink: 2 + Math.random() * 3 };
  const phase = Math.random() * 10;

  return baseRig("grok", root, body, {
    head,
    ...ghostLimbs(body, 0.55, 0.5),
    face,
    flashMats: [mat],
    baseEmissive: [0],
    height: 1.12,
    variant: kind,
    post: (r, moving, t) => {
      head.rotation.z = moving ? Math.sin(r.walk) * 0.14 : Math.sin(t * 1.3 + phase) * 0.05;
      // the mark's eyes glance around while idle
      const look = moving ? 0 : Math.sin(t * 0.7 + phase) > 0.6 ? 0.03 : 0;
      fr.position.x += (look - fr.position.x) * 0.15;
    },
  });
}

// ------------------------------------------------------------------ public rig api

export function buildRig(kind: Faction, tint?: number, variant?: string): Rig {
  const rig = kind === "dot" ? buildDot(tint, variant) : kind === "muse" ? buildMuse(variant) : buildGrok(variant);
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.isMeshStandardMaterial && !mat.userData.rim && !NO_RIM.has(mat)) decorate(mat, RIM[kind], kind);
  });
  setExpression(rig.face, "happy");
  setExpression(rig.face, "neutral");
  return rig;
}

// rig pools keep shader programs warm and avoid allocation churn mid-fight
const pools: Record<Faction, Rig[]> = { dot: [], muse: [], grok: [] };
export function acquireRig(kind: Faction): Rig {
  const r = pools[kind].pop() ?? buildRig(kind);
  resetRig(r);
  return r;
}
export function releaseRig(r: Rig) {
  r.root.removeFromParent();
  if (pools[r.kind].length < 40) pools[r.kind].push(r);
}

function resetRig(r: Rig) {
  r.root.visible = true;
  r.root.scale.setScalar(1);
  r.root.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  r.body.position.set(0, 0, 0);
  r.body.scale.set(1, 1, 1);
  r.fall = 0;
  r.fallTimer = 0;
  r.pose = 0;
  r.squash = 0;
  r.squashVel = 0;
  r.head.scale.setScalar(1);
  r.lookYaw = 0;
  setFlash(r, 0);
  setExpression(r.face, "neutral");
}

let phone: THREE.Mesh | null = null;
export function phoneMesh() {
  if (!phone) phone = mesh(G.rbox, M.phone, 0.12, 0.2, 0.03);
  return phone.clone();
}

// ------------------------------------------------------------------ animation

export interface AnimIn {
  speed: number;
  grounded: boolean;
  vy: number;
  action: "none" | "attack" | "cheer" | "dance" | "selfie" | "pose" | "stun" | "scared" | "dead" | "dash" | "sit";
  actionT: number;
  t: number;
}

const white = new THREE.Color(0xffffff);

export function setFlash(r: Rig, f: number) {
  for (let i = 0; i < r.flashMats.length; i++) {
    const m = r.flashMats[i];
    if (f > 0) {
      m.emissive.copy(white);
      m.emissiveIntensity = f * 1.6;
    } else {
      m.emissiveIntensity = r.baseEmissive[i];
      if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
    }
  }
}

export function initFlashColors(r: Rig) {
  for (const m of r.flashMats) m.userData.baseEmissive = m.emissive.clone();
}

export function kickSquash(r: Rig, amount: number) {
  r.squashVel += amount;
}

const BOB: Record<Faction, number> = { dot: 0.16, muse: 0.05, grok: 0.24 };
const FREQ: Record<Faction, number> = { dot: 15, muse: 10, grok: 11 };

/** Procedural animation for every character. Cheap, springy, readable. */
export function animateRig(r: Rig, a: AnimIn, dt: number) {
  const t = a.t;
  const sp = Math.min(1.4, a.speed);
  const kind = r.kind;
  r.walk += dt * FREQ[kind] * Math.max(0.15, sp);
  const w = r.walk;
  const moving = sp > 0.08 && a.grounded;
  const swing = moving ? Math.sin(w) * (kind === "muse" ? 0.75 : 0.9) * Math.min(1, sp) : 0;

  // squash spring
  r.squashVel += (-r.squash * 180 - r.squashVel * 14) * dt;
  r.squash += r.squashVel * dt;
  let sq = r.squash;
  if (!a.grounded) sq += THREE.MathUtils.clamp(-a.vy * 0.012, -0.18, 0.12);
  if (moving && kind === "grok") sq += Math.max(0, -Math.cos(w * 2)) * 0.12 * Math.min(1, sp);
  const sy = 1 - sq;
  const sxz = 1 + sq * 0.55;
  r.body.scale.set(sxz, sy, sxz);

  // bob
  let bob = 0;
  if (moving) bob = Math.abs(Math.sin(w)) * BOB[kind] * Math.min(1, sp);
  else bob = Math.sin(t * 2.4 + r.walk) * 0.015;
  r.body.position.y = bob;

  // limbs
  let armLX = -swing, armRX = swing, armLZ = 0, armRZ = 0, legLX = swing, legRX = -swing;
  let bodyTiltX = moving ? 0.08 * sp : 0;
  let bodyYaw = 0;
  let headX = 0;
  const at = a.actionT;
  switch (a.action) {
    case "attack":
      armRX = -1.6;
      armRZ = 0.2;
      bodyTiltX = 0.12;
      break;
    case "dash":
      armLX = armRX = 1.2;
      bodyTiltX = 0.4;
      legLX = 0.8;
      legRX = 0.6;
      break;
    case "cheer":
      armLZ = -2.6 + Math.sin(t * 18) * 0.3;
      armRZ = 2.6 - Math.sin(t * 18) * 0.3;
      r.body.position.y += Math.abs(Math.sin(t * 9)) * 0.3;
      break;
    case "dance":
      bodyYaw = Math.sin(t * 8) * 0.6;
      armLZ = -1.5 + Math.sin(t * 8) * 1.2;
      armRZ = 1.5 + Math.sin(t * 8 + 1) * 1.2;
      r.body.position.y += Math.abs(Math.sin(t * 8)) * 0.12;
      legLX = Math.sin(t * 8) * 0.5;
      legRX = -Math.sin(t * 8) * 0.5;
      break;
    case "selfie":
      armRX = -2.2;
      armRZ = -0.4;
      armLZ = -2.4;
      headX = -0.15;
      break;
    case "pose": {
      const p = Math.min(1, at * 4);
      armRZ = -2.8 * p;
      armLZ = 0.6 * p;
      armLX = -0.4 * p;
      headX = -0.25 * p;
      bodyYaw = 0.4 * p;
      break;
    }
    case "stun":
      bodyYaw = Math.sin(t * 6) * 0.25;
      headX = Math.sin(t * 9) * 0.2;
      armLZ = -0.4;
      armRZ = 0.4;
      break;
    case "scared":
      armLZ = -2.8;
      armRZ = 2.8;
      armLX = armRX = Math.sin(t * 30) * 0.4;
      break;
    case "dead":
      armLZ = -2.2;
      armRZ = 2.2;
      break;
    case "sit":
      legLX = legRX = -1.4;
      r.body.position.y -= kind === "muse" ? 0.12 : 0.1;
      break;
  }
  if (!a.grounded && a.action === "none") {
    armLZ = -1.4 + Math.sin(t * 20) * 0.4;
    armRZ = 1.4 - Math.sin(t * 20) * 0.4;
    legLX = 0.5;
    legRX = -0.3;
  }
  const k = Math.min(1, dt * 18);
  r.armL.rotation.x += (armLX - r.armL.rotation.x) * k;
  r.armR.rotation.x += (armRX - r.armR.rotation.x) * k;
  r.armL.rotation.z += (armLZ - r.armL.rotation.z) * k;
  r.armR.rotation.z += (armRZ - r.armR.rotation.z) * k;
  r.legL.rotation.x += (legLX - r.legL.rotation.x) * k;
  r.legR.rotation.x += (legRX - r.legR.rotation.x) * k;

  // fall-over gag
  if (r.fallTimer > 0) {
    r.fallTimer -= dt;
    const total = 1.6;
    const e = total - r.fallTimer;
    const target = e < 0.25 ? e / 0.25 : e < 1.1 ? 1 : Math.max(0, 1 - (e - 1.1) / 0.5);
    r.fall = target;
    if (r.fallTimer <= 0) r.fall = 0;
  }
  r.body.rotation.x = bodyTiltX + r.fall * (Math.PI / 2 - 0.1);
  if (r.fall > 0.9 && kind === "grok") r.body.position.y += 0.05;
  r.body.rotation.y = bodyYaw;

  // head look (Jolly's head is her body, so she turns whole)
  const look = kind === "muse" ? r.body : r.head;
  if (kind === "muse") r.body.rotation.y += r.lookYaw * 0.6;
  else r.head.rotation.y += (r.lookYaw - r.head.rotation.y) * Math.min(1, dt * 6);
  look.rotation.x += kind === "muse" ? headX * 0.4 : (headX - look.rotation.x) * k;

  // face life
  const f = r.face;
  if (f.exprTimer > 0) {
    f.exprTimer -= dt;
    if (f.exprTimer <= 0) setExpression(f, "neutral");
  }
  f.blink -= dt;
  const blinking = f.blink < 0.11 && f.blink > 0;
  if (f.blink < 0) f.blink = 1.8 + Math.random() * 3.5;
  if (f.expr === "neutral" || f.expr === "angry") {
    for (const e of f.eyes) e.scale.y = blinking ? 0.12 : 1;
  }
  r.post?.(r, moving, t, dt);
}
