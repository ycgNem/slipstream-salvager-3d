// The WebGL side of the screen (THREEJS-NOTES rules 3, 6, 8): the world renders at 640x360 into a
// render target, the claw view model on top of it after a depth clear, the rear camera into its own
// strip; then one composite pass at 640x360 (edge smear at Slipstream, the rear strip with its
// frame, flashes, the palette snap with ordered dither, the 2D UI canvas on top), then a blit to
// the window at the largest whole-number scale, letterboxed. setPixelRatio(1): the canvas is sized
// in device pixels by hand, so the window's DPR never changes the 640x360 grid.
import * as THREE from 'three';
import { PALETTE } from '../data/palette';
import { paletteLut } from './textures';

export const VIEW_W = 640;
export const VIEW_H = 360;
/**
 * The rear strip: where it sits on the 640x360 frame (top-left origin) and its render size. Not the
 * 640x72 of THREEJS-NOTES rule 6: a 9:1 strip is only ~22° tall, too little to show both your own
 * back (the booster, the cable) and the Ring behind you, so it's a 400x90 mirror (DECISIONS #6).
 */
export const REAR = { x: 120, y: 3, w: 400, h: 90 };

export interface PostFx {
  /** 0..1: the Slipstream edge darken-and-smear */
  edge: number;
  /** a palette color flashed over the frame edges (danger red on a hurt, teal on a tier-up) */
  flashColor: number;
  flash: number;
  /** a full-frame flash (the hit flash that covers a pass-through) */
  whiteout: number;
  /** show the rear strip */
  rear: boolean;
}

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMPOSITE_FS = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler2D tMain;
uniform sampler2D tRear;
uniform sampler2D tUI;
uniform sampler3D tLut;
uniform vec2 uRes;
uniform vec4 uRear;      // x, y (top-left), w, h in pixels
uniform float uRearOn;
uniform float uEdge;
uniform vec3 uFlashCol;
uniform float uFlash;
uniform float uWhite;
uniform float uSnap;
uniform float uDither;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uFrame;
varying vec2 vUv;

vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = y * 4 + x;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

void main() {
  vec2 px = floor(gl_FragCoord.xy);             // bottom-left origin
  vec2 uv = (px + 0.5) / uRes;
  vec3 col = toSrgb(texture2D(tMain, uv).rgb);

  // Slipstream: darken and smear the outer edge of the frame toward the centre
  if (uEdge > 0.001) {
    vec2 d = uv - 0.5;
    float r = length(d * vec2(1.0, 0.75)) * 2.0;
    float e = smoothstep(0.62, 1.0, r) * uEdge;
    if (e > 0.001) {
      vec3 acc = col;
      for (int i = 1; i <= 5; i++) {
        vec2 suv = 0.5 + d * (1.0 - float(i) * 0.035 * e);
        acc += toSrgb(texture2D(tMain, suv).rgb);
      }
      acc /= 6.0;
      // darken toward the palette's ink, not toward black: a plain multiply drifts the arena's
      // purples into the palette's olives once snapped
      col = mix(mix(col, acc, min(1.0, e * 1.6)), uInk, 0.55 * e);
    }
  }

  vec2 tl = vec2(px.x, uRes.y - 1.0 - px.y);    // top-left origin

  // the edge flash (hurt, tier-up, tear): the exact palette color, dithered in by an ordered
  // threshold, never blended (a blend snaps to some other color: teal became sage, gold olive), and
  // kept out of the snap below, whose dither could still nudge it to a neighbour
  bool exact = false;
  if (uFlash > 0.001) {
    vec2 d = abs(uv - 0.5) * 2.0;
    float edge = smoothstep(0.55, 1.0, max(d.x, d.y));
    if (bayer4(tl) < edge * uFlash) { col = uFlashCol; exact = true; }
  }
  if (uWhite > 0.001 && bayer4(tl + 1.0) < uWhite) { col = vec3(1.0); exact = true; }

  // the rear strip, mirrored like a real mirror, with a one-pixel frame
  if (uRearOn > 0.5) {
    vec2 q = tl - uRear.xy;
    if (q.x >= -1.0 && q.y >= -1.0 && q.x <= uRear.z && q.y <= uRear.w) {
      if (q.x < 0.0 || q.y < 0.0 || q.x >= uRear.z || q.y >= uRear.w) { col = uFrame; exact = true; }
      else {
        vec2 ruv = vec2(1.0 - (q.x + 0.5) / uRear.z, 1.0 - (q.y + 0.5) / uRear.w);
        col = toSrgb(texture2D(tRear, ruv).rgb);
        exact = false;
      }
    } else if (q.y > uRear.w && q.y <= uRear.w + 1.0 && q.x >= -1.0 && q.x <= uRear.z) {
      col = uInk; // the shadow line under the strip
      exact = true;
    }
  }

  // snap to the palette, with a 4x4 ordered dither
  if (uSnap > 0.5 && !exact) {
    vec3 c = clamp(col + (bayer4(tl) - 0.5) * uDither, 0.0, 1.0);
    col = texture(tLut, c * (31.0 / 32.0) + 0.5 / 32.0).rgb;
  }

  // the 2D UI canvas on top (already palette colors)
  vec4 ui = texture2D(tUI, uv);
  col = mix(col, ui.rgb, ui.a);
  gl_FragColor = vec4(col, 1.0);
}`;

const BLIT_FS = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`;

function target(w: number, h: number, depth: boolean): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: depth,
    type: THREE.UnsignedByteType,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A palette color as raw sRGB (the composite works in sRGB and writes it straight out). */
function srgb(i: number): THREE.Vector3 {
  const h = PALETTE[i];
  return new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
}

export class View {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  rtMain = target(VIEW_W, VIEW_H, true);
  rtRear = target(REAR.w, REAR.h, true);
  rtOut = target(VIEW_W, VIEW_H, false);
  /** the 2D layer: HUD, menus, text, markers; drawn with the UI kit at 640x360 */
  ui: HTMLCanvasElement;
  uictx: CanvasRenderingContext2D;
  private uiTex: THREE.CanvasTexture;
  private comp: THREE.ShaderMaterial;
  private blit: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** device pixels: whole-number scale and letterbox offsets (bottom-left origin for GL) */
  zoom = 1;
  ox = 0;
  oy = 0;
  dpr = 1;
  snap = true;
  /** totals over every pass of the last frame (e2e/perf.mjs) */
  stats = { calls: 0, triangles: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.ui = document.createElement('canvas');
    this.ui.width = VIEW_W;
    this.ui.height = VIEW_H;
    this.uictx = this.ui.getContext('2d')!;
    this.uictx.imageSmoothingEnabled = false;
    this.uiTex = new THREE.CanvasTexture(this.ui);
    this.uiTex.magFilter = this.uiTex.minFilter = THREE.NearestFilter;
    this.uiTex.generateMipmaps = false;
    this.uiTex.colorSpace = THREE.NoColorSpace;
    this.uiTex.premultiplyAlpha = false;
    this.comp = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: COMPOSITE_FS,
      uniforms: {
        tMain: { value: this.rtMain.texture },
        tRear: { value: this.rtRear.texture },
        tUI: { value: this.uiTex },
        tLut: { value: paletteLut() },
        uRes: { value: new THREE.Vector2(VIEW_W, VIEW_H) },
        uRear: { value: new THREE.Vector4(REAR.x, REAR.y, REAR.w, REAR.h) },
        uRearOn: { value: 0 },
        uEdge: { value: 0 },
        uFlashCol: { value: new THREE.Vector3() },
        uFlash: { value: 0 },
        uWhite: { value: 0 },
        uSnap: { value: 1 },
        uDither: { value: 0.06 },
        uTime: { value: 0 },
        uInk: { value: srgb(0) },
        uFrame: { value: srgb(2) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.blit = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: BLIT_FS,
      uniforms: { tSrc: { value: this.rtOut.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.resize();
  }

  /** Fit the 640x360 frame at the largest whole-number scale, centred, in device pixels. */
  resize() {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.floor(window.innerWidth * this.dpr)), ch = Math.max(1, Math.floor(window.innerHeight * this.dpr));
    this.renderer.setSize(cw, ch, false);
    this.zoom = Math.max(1, Math.floor(Math.min(cw / VIEW_W, ch / VIEW_H)));
    this.ox = Math.floor((cw - VIEW_W * this.zoom) / 2);
    this.oy = Math.floor((ch - VIEW_H * this.zoom) / 2);
  }

  /** Start a frame: clear the UI layer and the draw-call counters. */
  begin() {
    this.renderer.info.reset();
    this.uictx.clearRect(0, 0, VIEW_W, VIEW_H);
  }

  /** The world (and the view model on top of it) into the main target. */
  renderMain(scene: THREE.Scene, camera: THREE.Camera, viewModel?: THREE.Scene) {
    const r = this.renderer;
    r.setRenderTarget(this.rtMain);
    r.autoClear = true;
    r.render(scene, camera);
    if (viewModel) {
      r.autoClear = false;
      r.clearDepth();
      r.render(viewModel, camera);
      r.autoClear = true;
    }
  }

  /** The rear camera into the strip target. */
  renderRear(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rtRear);
    r.render(scene, camera);
  }

  /** Composite at 640x360, then the whole-number blit to the window. */
  present(fx: PostFx, time: number) {
    const r = this.renderer, u = this.comp.uniforms;
    u.uEdge.value = fx.edge;
    u.uFlash.value = fx.flash;
    u.uFlashCol.value.copy(srgb(fx.flashColor));
    u.uWhite.value = fx.whiteout;
    u.uRearOn.value = fx.rear ? 1 : 0;
    u.uSnap.value = this.snap ? 1 : 0;
    u.uTime.value = time;
    this.uiTex.needsUpdate = true;

    this.quad.material = this.comp;
    r.setRenderTarget(this.rtOut);
    r.render(this.quadScene, this.quadCam);

    this.quad.material = this.blit;
    r.setRenderTarget(null);
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    r.setViewport(0, 0, size.x, size.y);
    r.setScissorTest(false);
    r.setClearColor(new THREE.Color(PALETTE[0]), 1);
    r.clear(true, true, true);
    r.setViewport(this.ox, this.oy, VIEW_W * this.zoom, VIEW_H * this.zoom);
    r.render(this.quadScene, this.quadCam);
    r.setViewport(0, 0, size.x, size.y);
    this.stats.calls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
  }

  /** Mouse position (CSS px) to logical 640x360 pixels. */
  toLogical(x: number, y: number): { x: number; y: number } {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const top = size.y - this.oy - VIEW_H * this.zoom; // the letterbox is symmetric, but be exact
    return { x: Math.floor((x * this.dpr - this.ox) / this.zoom), y: Math.floor((y * this.dpr - top) / this.zoom) };
  }
}
