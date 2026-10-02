"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, Effect, EffectPass, ToneMappingMode } from "postprocessing";
import { Uniform } from "three";
import { getGame } from "@/lib/game/engine";
import { beat } from "@/lib/game/beat";

const gradeFrag = /* glsl */ `
uniform float uChroma;
uniform float uSat;

// a single NaN would be smeared across the screen by the bloom mip chain
vec3 finite(vec3 c) {
  bvec3 bad = equal(floatBitsToUint(c) & uvec3(0x7F800000u), uvec3(0x7F800000u));
  c = mix(c, vec3(0.0), bad);
  return clamp(c, vec3(0.0), vec3(64.0));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = finite(inputColor.rgb);
  if (uChroma > 0.001) {
    vec2 d = (uv - 0.5) * uChroma * 0.018;
    c.r = finite(texture2D(inputBuffer, uv + d).rgb).r;
    c.b = finite(texture2D(inputBuffer, uv - d).rgb).b;
  }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  outputColor = vec4(c, 1.0);
}
`;

class GradeEffect extends Effect {
  constructor() {
    super("MascotGrade", gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uChroma", new Uniform(0)],
        ["uSat", new Uniform(1.12)],
      ]),
    });
  }
}

export function Effects({ quality }: { quality: "high" | "low" }) {
  const camera = useThree((s) => s.camera);
  const grade = useMemo(() => new GradeEffect(), []);
  const pass = useMemo(() => new EffectPass(camera, grade), [camera, grade]);
  useEffect(() => () => pass.dispose(), [pass]);
  useFrame(() => {
    const g = getGame();
    grade.uniforms.get("uChroma")!.value = g ? Math.min(1.2, g.chroma + beat.hype * 0.12 + g.speedLines * 0.5) : 0;
    grade.uniforms.get("uSat")!.value = 1.15 + beat.hype * 0.25;
  });
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <primitive object={pass} />
      <Bloom mipmapBlur intensity={quality === "high" ? 0.85 : 0.6} luminanceThreshold={1.0} luminanceSmoothing={0.3} radius={0.72} levels={quality === "high" ? 7 : 5} />
      <Vignette eskil={false} offset={0.3} darkness={0.55} />
      {quality === "high" ? <SMAA /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
