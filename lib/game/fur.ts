import * as THREE from "three";

/** Uniform refs shared with the faction rim light in characters.ts. */
export interface RimRef {
  color: { value: THREE.Color };
  strength: { value: number };
}

export interface FurOpts {
  /** noise frequency in geometry units; higher = finer felt */
  scale: number;
  /** velvet edge glow in the material's own colour */
  fuzz: number;
  /** how far the outermost shell sits off the surface, in geometry units */
  shell?: number;
  /** ellipsoids (centre, radii) in geometry space where shells are cut away, e.g. a face patch or eyes */
  masks?: { c: THREE.Vector3; r: THREE.Vector3 }[];
}

const MAX_MASKS = 2;

const NOISE = /* glsl */ `
varying vec3 vFurP;
float furHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float furNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(furHash(i), furHash(i + vec3(1, 0, 0)), f.x), mix(furHash(i + vec3(0, 1, 0)), furHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(furHash(i + vec3(0, 0, 1)), furHash(i + vec3(1, 0, 1)), f.x), mix(furHash(i + vec3(0, 1, 1)), furHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

/**
 * Patches a standard material with the faction rim light and, optionally, a plush felt look:
 * object-space grain, a fuzzy perturbed normal and a soft velvet edge. When `shellLayer` is set
 * the material renders fur shells (geometry built by `shellGeometry`).
 */
export function decorate(mat: THREE.MeshStandardMaterial, rim: RimRef, key: string, fur?: FurOpts, shells = false) {
  const furOn = !!fur;
  const masks = fur?.masks ?? [];
  const u = {
    uFurScale: { value: fur?.scale ?? 1 },
    uFuzz: { value: fur?.fuzz ?? 0 },
    uShellDist: { value: fur?.shell ?? 0 },
    uMaskC: { value: Array.from({ length: MAX_MASKS }, (_, i) => masks[i]?.c ?? new THREE.Vector3()) },
    uMaskR: { value: Array.from({ length: MAX_MASKS }, (_, i) => masks[i]?.r ?? new THREE.Vector3()) },
  };
  mat.userData.fur = u;
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRimColor = rim.color;
    s.uniforms.uRimStrength = rim.strength;
    Object.assign(s.uniforms, u);
    if (furOn) {
      s.vertexShader = s.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          ${NOISE}
          uniform float uShellDist;
          ${shells ? "attribute float aLayer; varying float vLayer;" : ""}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vFurP = position;
          ${shells ? "vLayer = aLayer; transformed += normalize(normal) * uShellDist * aLayer; transformed.y -= uShellDist * aLayer * aLayer * 0.35;" : ""}`,
        );
    }
    s.fragmentShader =
      `uniform vec3 uRimColor;
      uniform float uRimStrength;
      ${furOn ? NOISE : ""}
      uniform float uFurScale;
      uniform float uFuzz;
      uniform vec3 uMaskC[${MAX_MASKS}];
      uniform vec3 uMaskR[${MAX_MASKS}];
      ${shells ? "varying float vLayer;" : ""}
      ` + s.fragmentShader;
    if (furOn) {
      s.fragmentShader = s.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec3 fp = vFurP * uFurScale;
          float grain = furNoise(fp) * 0.55 + furNoise(fp * 2.7 + 3.1) * 0.45;
          ${
            shells
              ? `float strand = furNoise(fp * 4.2 + 7.0) * 0.6 + furNoise(fp * 9.3) * 0.4;
          if (strand < 0.24 + vLayer * 0.56) discard;
          for (int mi = 0; mi < ${MAX_MASKS}; mi++) {
            if (uMaskR[mi].x > 0.0 && length((vFurP - uMaskC[mi]) / uMaskR[mi]) < 1.0) discard;
          }
          diffuseColor.rgb *= mix(0.84, 1.1, vLayer);`
              : ""
          }
          diffuseColor.rgb *= mix(0.88, 1.06, grain);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          vec3 fpn = vFurP * uFurScale * 3.4;
          normal = normalize(normal + (vec3(furNoise(fpn), furNoise(fpn + 19.1), furNoise(fpn + 41.7)) - 0.5) * 0.55);`,
        );
    }
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += uRimColor * pow(rimF, 2.6) * uRimStrength;
      totalEmissiveRadiance += diffuseColor.rgb * pow(rimF, 1.6) * uFuzz;`,
    );
  };
  mat.customProgramCacheKey = () => `amb-${key}-${furOn ? "fur" : "rim"}${shells ? "-shell" : ""}`;
  mat.userData.rim = key;
}

const shellCache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();

/**
 * Stacks `layers` copies of a geometry into one buffer with a per-copy `aLayer` attribute,
 * so a whole fur coat is a single draw call (works for skinned geometry too).
 */
export function shellGeometry(src: THREE.BufferGeometry, layers: number) {
  let byN = shellCache.get(src);
  if (!byN) shellCache.set(src, (byN = new Map()));
  const hit = byN.get(layers);
  if (hit) return hit;
  const g = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  for (const name of Object.keys(src.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "skinIndex" && name !== "skinWeight") continue;
    const a = src.attributes[name] as THREE.BufferAttribute;
    const Arr = a.array.constructor as new (len: number) => THREE.TypedArray;
    const out = new Arr(a.array.length * layers);
    for (let l = 0; l < layers; l++) {
      for (let i = 0; i < n; i++) for (let c = 0; c < a.itemSize; c++) out[(l * n + i) * a.itemSize + c] = a.getComponent(i, c);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
  }
  const layer = new Float32Array(n * layers);
  for (let l = 0; l < layers; l++) layer.fill((l + 1) / layers, l * n, (l + 1) * n);
  g.setAttribute("aLayer", new THREE.BufferAttribute(layer, 1));
  if (src.index) {
    const idx = src.index.array;
    const out = new Uint32Array(idx.length * layers);
    for (let l = 0; l < layers; l++) for (let i = 0; i < idx.length; i++) out[l * idx.length + i] = idx[i] + l * n;
    g.setIndex(new THREE.BufferAttribute(out, 1));
  }
  g.boundingSphere = src.boundingSphere?.clone() ?? null;
  if (!g.boundingSphere) {
    src.computeBoundingSphere();
    g.boundingSphere = src.boundingSphere!.clone();
  }
  g.boundingSphere.radius *= 1.15;
  byN.set(layers, g);
  return g;
}
