// Two small changes to the lit (Lambert) materials of the things you hit and the things you take
// (DECISIONS #35):
//
// - Salvage stays gold. A part's texture lights a little of itself, so a face turned from the sun
//   doesn't fall to olive under the plum ground light once the palette snap has its say, and a lit
//   face is capped a little above its own texture, so it doesn't run hot into lime. The self-light
//   follows the material's color and the instance tint: a glinting part still flashes brighter.
// - A flash goes white. `whiten` blends the lit color toward white: the hit flash, and the flicker of
//   a cracked part (the 2D game draws a white crack). Multiplying the color up instead saturates
//   the hue (gold went lime, the Snapper's plum went pink). Per instance on a batch (the `whiten`
//   attribute), per material on a single mesh (the returned uniform).
import * as THREE from 'three';

/** how much of its own texture a salvage part shows unlit */
export const PART_SELF_LIGHT = 0.4;
/** a lit part face is at most this much brighter than its texture */
export const PART_HIGHLIGHT = 1.15;

export interface Whiten {
  value: number;
}

const patched = new WeakMap<THREE.Material, Whiten>();

/** Patch a lit material: `part` adds the salvage self-light and highlight cap. Returns its whiten. */
export function shade(m: THREE.MeshLambertMaterial, part: boolean): Whiten {
  const had = patched.get(m);
  if (had) return had;
  const u: Whiten = { value: 0 };
  patched.set(m, u);
  const self = part && !!m.map;
  if (self) {
    m.emissive = new THREE.Color(PART_SELF_LIGHT, PART_SELF_LIGHT, PART_SELF_LIGHT);
    m.emissiveMap = m.map;
  }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWhiten = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWhiten;\n#ifdef USE_INSTANCING\nattribute float whiten;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n\tvWhiten = whiten;\n#else\n\tvWhiten = 0.0;\n#endif');
    let frag = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWhiten;\nvarying float vWhiten;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(1.0), clamp(max(vWhiten, uWhiten), 0.0, 1.0));\n\t#include <opaque_fragment>');
    if (self)
      frag = frag
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= diffuse;\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif')
        .replace('outgoingLight = mix(', `outgoingLight = min(outgoingLight, diffuseColor.rgb * ${PART_HIGHLIGHT.toFixed(2)});\n\toutgoingLight = mix(`);
    sh.fragmentShader = frag;
  };
  // the closure's source is the same either way: tell the program cache apart
  m.customProgramCacheKey = () => (self ? 'shade:part' : 'shade');
  m.needsUpdate = true;
  return u;
}

/** A cracked part's flicker: a brief white flash every 0.7 s (it shatters on the next hit). */
export function crackFlicker(time: number, seed = 0): number {
  const f = (time / 0.7 + seed * 0.37) % 1;
  return f < 0.12 ? 0.75 : 0;
}
