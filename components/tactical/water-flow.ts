// ============================================================================
// RUNNING WATER ON A PAINTED FLOOR
//
// The river is part of the painting, so the painting itself has to move.
// This patches the floor's own MeshStandardMaterial (onBeforeCompile) rather
// than laying a second plane over it: the water keeps exactly the same
// lighting, tone mapping, emissive self-light and Sobel relief as the stone
// beside it, so there is no seam where the effect starts.
//
// Technique: the classic two-phase FLOW MAP. The art is sampled twice, each
// sample dragged downstream by a phase that loops, and the two are
// cross-faded so neither loop's reset is ever visible. A per-pixel noise
// offset on the phase breaks up the pulse. A mask (white = water) says where
// the painting is allowed to flow — rocks standing in the river stay put.
// Bright foam in the painting gets a scrolling sparkle on top.
//
// Driven by the cells JSON:  render.water_fx = { mask_url, flow, speed, travel, foam }
//   flow    [dx, dy] in IMAGE space (dy +1 = down the picture)
//   speed   loop cycles per second (≈ how fast the rapids run)
//   travel  how far one loop drags the art, in UV (0.03–0.05 reads as water)
//   foam    sparkle strength on the white water
// ============================================================================

import * as THREE from "three"

export interface WaterFx {
  mask_url: string
  flow?: [number, number]
  speed?: number
  travel?: number
  foam?: number
}

export interface WaterFlowHandle {
  tick(t: number): void
}

const NOISE = /* glsl */ `
float aopHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aopNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aopHash(i), aopHash(i + vec2(1.0, 0.0)), u.x),
             mix(aopHash(i + vec2(0.0, 1.0)), aopHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`

export function applyWaterFlow(
  mat: THREE.MeshStandardMaterial,
  fx: WaterFx,
  aspect: number, // board width / height, so the noise is square on screen
): WaterFlowHandle | null {
  if (!mat.map || !fx?.mask_url) return null
  const mask = new THREE.TextureLoader().load(fx.mask_url)
  mask.colorSpace = THREE.NoColorSpace
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping

  const [fx0, fy0] = fx.flow ?? [0, 1]
  const len = Math.hypot(fx0, fy0) || 1
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterMask: { value: mask },
    // Image space → UV space: the texture is flipped, so "down the picture" is -v.
    uWaterDir: { value: new THREE.Vector2(fx0 / len, -fy0 / len) },
    uWaterSpeed: { value: fx.speed ?? 0.55 },
    uWaterTravel: { value: fx.travel ?? 0.035 },
    uWaterFoam: { value: fx.foam ?? 0.45 },
    uWaterAspect: { value: aspect },
  }

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uWaterTime;
uniform sampler2D uWaterMask;
uniform vec2 uWaterDir;
uniform float uWaterSpeed;
uniform float uWaterTravel;
uniform float uWaterFoam;
uniform float uWaterAspect;
${NOISE}`,
      )
      .replace(
        "#include <map_fragment>",
        `
float aopWet = texture2D(uWaterMask, vMapUv).r;
vec4 aopTexel = texture2D(map, vMapUv);
float aopFoam = 0.0;
if (aopWet > 0.003) {
  vec2 np = vMapUv * vec2(uWaterAspect, 1.0);
  float jit = aopNoise(np * 9.0);
  float ph0 = fract(uWaterTime * uWaterSpeed + jit);
  float ph1 = fract(ph0 + 0.5);
  // A little cross-current wobble so the sheet does not slide like glass.
  vec2 side = vec2(-uWaterDir.y, uWaterDir.x);
  float wob = (aopNoise(np * 22.0 - uWaterDir * uWaterTime * 1.3) - 0.5) * uWaterTravel * 0.35;
  vec2 d = uWaterDir * uWaterTravel;
  vec4 s0 = texture2D(map, vMapUv - d * ph0 + side * wob);
  vec4 s1 = texture2D(map, vMapUv - d * ph1 + side * wob);
  float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
  vec4 moving = mix(s1, s0, w0);
  // Cross-fading two samples softens contrast; give it back.
  moving.rgb = mix(vec3(dot(moving.rgb, vec3(0.333))), moving.rgb, 1.12) * 1.04;
  aopTexel = mix(aopTexel, moving, aopWet);
  // Sparkle: streaks racing downstream, only where the paint is already white.
  float lum = dot(aopTexel.rgb, vec3(0.299, 0.587, 0.114));
  vec2 sp = np * vec2(70.0, 38.0) - uWaterDir * uWaterTime * 9.0;
  float streak = pow(aopNoise(sp), 6.0) * 5.0 + pow(aopNoise(sp * 1.9 + 3.1), 8.0) * 4.0;
  aopFoam = streak * smoothstep(0.22, 0.75, lum) * aopWet * uWaterFoam;
}
#ifdef USE_MAP
  diffuseColor *= aopTexel;
#endif
`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `
#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= aopTexel.rgb;
#endif
totalEmissiveRadiance += vec3(0.62, 0.9, 1.0) * aopFoam;
`,
      )
  }
  mat.customProgramCacheKey = () => "aop-water-flow"
  mat.needsUpdate = true

  return {
    tick(t: number) { uniforms.uWaterTime.value = t },
  }
}
