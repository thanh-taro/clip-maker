// MOD-Compositor — the one WebGL2 paint for preview, thumbnails and exports (ADR-0006 and its outcome,
// ADR-0007 outcome). Promoted from SP-gpu-color's `Compositor` and SP-mem-hdr's context handling:
// RGBA16F grade intermediate where renderable, 8-bit otherwise (outcome rule 1); intermediates at the
// clip's placed size on this target (rule 2); every picture, SDR or HDR, uploaded with
// `texImage2D(VideoFrame | ImageBitmap)` (ADR-0007 outcome rule 1, no own HDR shader); context loss
// recovered by re-creating every resource, 5 tries 400 ms apart (rule 6).
// Never reads language, theme or view state (INV-05): everything comes from the plan and the call.
// Implements: F-002.R1/R6, F-006 (drawing), F-007.R1/R2/R5/R7, F-008.R3/R4/R6, F-009 (picture),
// F-010.R5 (drawing), F-012.R3 (background), F-015.R4; RULE-04, RULE-07, RULE-08, RULE-09, RULE-10;
// INV-02, INV-05, INV-07; NFR-08.
import type { Overlay, TextBitmap } from '../core';
import type { FramePlan } from '../plan';
import { drawList, type DrawList, type DrawOptions, type Quad, type Rotation, type SourceSize } from './draw';
import type { GradeUniforms } from './grade';
import { identityTable, LUT_N, type LookTable } from './lut';
import { FS_BLUR, FS_DOWN, FS_GRADE, FS_MIX, FS_PLACE, FS_SOLID, FS_TEX, VS } from './shaders';

/** A decoded picture handed to paint: a VideoFrame (closed by its owner) or an ImageBitmap. */
export interface PaintFrame {
  readonly image: TexImageSource;
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

/** ADR-0006 outcome rule 6: tries and spacing of the context re-creation. */
export const RECOVER_TRIES = 5;
export const RECOVER_INTERVAL_MS = 400;

export class ContextLostError extends Error {
  constructor() {
    super('WebGL context lost and not recovered');
    this.name = 'ContextLostError';
  }
}

export interface CompositorOptions {
  /** Phones use the 8-bit intermediate above 1080 on the shorter side (outcome rule 2). */
  readonly phone?: boolean;
  /** Keep the drawing buffer after a frame (effects check sync, tests). */
  readonly preserve?: boolean;
}

export interface Compositor {
  /** Implements ADR-0006 §1: draws `plan` with `frames[i]` for `plan.layers[i]` and the text bitmaps. */
  paint(
    plan: FramePlan,
    frames: readonly (PaintFrame | null)[],
    textBitmaps?: ReadonlyMap<string, TextBitmap>,
    options?: DrawOptions,
  ): DrawList;
  resize(width: number, height: number): void;
  setLooks(tables: ReadonlyMap<string, LookTable>): void;
  /** Screen-only extras after `paint` (preview only, ADR-0006 §5). */
  paintOverlay(overlay: Overlay): void;
  /** Called on `webglcontextlost`; returns an unsubscribe function. */
  onContextLost(handler: () => void): () => void;
  /** Re-creates every GPU resource; rejects with ContextLostError after the retries. */
  recover(): Promise<void>;
  readonly lost: boolean;
  readonly width: number;
  readonly height: number;
  /** Whether the grade intermediate is half-float (RGBA16F). */
  readonly halfFloat: boolean;
  /** Waits for the GPU (one 1-pixel read-back). */
  sync(): void;
  /** The drawn frame as RGBA rows from the top (tests and the effects check only; never for exports). */
  readPixels(): Uint8Array;
  /** Text textures held (tests: removed layers free theirs). */
  readonly textTextures: number;
  dispose(): void;
}

type Gl = WebGL2RenderingContext;

interface Program {
  readonly p: WebGLProgram;
  u(name: string): WebGLUniformLocation | null;
}

interface Fbo {
  readonly fb: WebGLFramebuffer;
  readonly tex: WebGLTexture;
  readonly w: number;
  readonly h: number;
  readonly half: boolean;
}

interface Resources {
  readonly vao: WebGLVertexArrayObject;
  readonly posBuf: WebGLBuffer;
  readonly texBuf: WebGLBuffer;
  readonly prog: Record<'tex' | 'grade' | 'place' | 'down' | 'blur' | 'mix' | 'solid', Program>;
  readonly src: [WebGLTexture, WebGLTexture];
  readonly identity: WebGLTexture;
  readonly luts: Map<string, WebGLTexture>;
  readonly inter: [Fbo | null, Fbo | null];
  layers: Fbo[];
  blurBufs: Fbo[];
  readonly text: Map<string, { readonly tex: WebGLTexture; readonly bitmap: ImageBitmap }>;
  readonly halfOk: boolean;
}

const FULL: Quad = { pos: [-1, 1, 1, 1, -1, -1, 1, -1], tex: [0, 1, 1, 1, 0, 0, 1, 0] };
const BLUR_WEIGHTS = (() => {
  const w = Array.from({ length: 9 }, (_, k) => Math.exp(-(((k - 4) * 0.8) ** 2) / 2));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
})();
/** Blur radius relative to s, in output pixels (SP-gpu-color). */
const BLUR_SIGMA = 0.02;
const BLUR_DOWN = 8;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function compile(gl: Gl, fs: string): Program {
  const p = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VS],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type);
    if (!s) throw new ContextLostError();
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`shader: ${gl.getShaderInfoLog(s) ?? ''}`);
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 1, 'aTex');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`program: ${gl.getProgramInfoLog(p) ?? ''}`);
  const loc = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u(name) {
      if (!loc.has(name)) loc.set(name, gl.getUniformLocation(p, name));
      return loc.get(name) ?? null;
    },
  };
}

function makeTex(gl: Gl): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function makeFbo(gl: Gl, w: number, h: number, half: boolean): Fbo | null {
  const tex = makeTex(gl);
  if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null); // never left bound to a unit a later pass renders into
  if (!ok) {
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return null;
  }
  return { fb, tex, w, h, half };
}

function makeLut(gl: Gl, rgba: Uint8Array): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, LUT_N, LUT_N, LUT_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE],
  ] as const)
    gl.texParameteri(gl.TEXTURE_3D, k, v);
  return t;
}

class GlCompositor implements Compositor {
  private gl: Gl;
  private r: Resources | null = null;
  private looks = new Map<string, LookTable>();
  private handlers = new Set<() => void>();
  private size: [number, number];
  private isLost = false;
  private readonly onLost = (e: Event): void => {
    e.preventDefault(); // lets the browser restore the context (ADR-0006 outcome rule 6)
    this.isLost = true;
    this.r = null;
    for (const h of this.handlers) h();
  };

  constructor(
    private readonly canvas: OffscreenCanvas,
    looks: ReadonlyMap<string, LookTable>,
    private readonly options: CompositorOptions,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.preserve ?? false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.size = [canvas.width, canvas.height];
    for (const [k, v] of looks) this.looks.set(k, v);
    canvas.addEventListener('webglcontextlost', this.onLost);
    this.r = this.init();
  }

  get lost(): boolean {
    return this.isLost || this.gl.isContextLost();
  }
  get width(): number {
    return this.size[0];
  }
  get height(): number {
    return this.size[1];
  }
  get textTextures(): number {
    return this.r?.text.size ?? 0;
  }
  get halfFloat(): boolean {
    return this.res().halfOk;
  }

  private res(): Resources {
    if (!this.r || this.gl.isContextLost()) throw new ContextLostError();
    return this.r;
  }

  /** Creates every GPU resource this instance owns (also after a context loss). */
  private init(): Resources {
    const gl = this.gl;
    const halfOk =
      (!!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float')) &&
      (() => {
        const probe = makeFbo(gl, 4, 4, true);
        if (probe) {
          gl.deleteFramebuffer(probe.fb);
          gl.deleteTexture(probe.tex);
        }
        return probe !== null;
      })();
    const prog = {
      tex: compile(gl, FS_TEX),
      grade: compile(gl, FS_GRADE),
      place: compile(gl, FS_PLACE),
      down: compile(gl, FS_DOWN),
      blur: compile(gl, FS_BLUR),
      mix: compile(gl, FS_MIX),
      solid: compile(gl, FS_SOLID),
    };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer();
    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    const luts = new Map<string, WebGLTexture>();
    for (const [id, t] of this.looks) luts.set(id, makeLut(gl, t));
    const r: Resources = {
      vao,
      posBuf,
      texBuf,
      prog,
      src: [makeTex(gl), makeTex(gl)],
      identity: makeLut(gl, identityTable()),
      luts,
      inter: [null, null],
      layers: [],
      blurBufs: [],
      text: new Map(),
      halfOk,
    };
    this.r = r;
    this.allocTargets(r);
    return r;
  }

  /** Layer buffers at the target size and the Blur buffers at 1/8 (ADR-0006 §3.4). */
  private allocTargets(r: Resources): void {
    const gl = this.gl;
    for (const f of [...r.layers, ...r.blurBufs]) {
      gl.deleteFramebuffer(f.fb);
      gl.deleteTexture(f.tex);
    }
    const [W, H] = this.size;
    const half = this.intermediateHalf(r);
    const fbo = (w: number, h: number): Fbo => {
      const f = makeFbo(gl, w, h, half) ?? makeFbo(gl, w, h, false);
      if (!f) throw new ContextLostError();
      return f;
    };
    r.layers = [fbo(W, H), fbo(W, H)];
    const bw = Math.max(1, Math.ceil(W / BLUR_DOWN));
    const bh = Math.max(1, Math.ceil(H / BLUR_DOWN));
    r.blurBufs = [fbo(bw, bh), fbo(bw, bh)];
  }

  private intermediateHalf(r: Resources): boolean {
    return r.halfOk && !(this.options.phone && Math.min(...this.size) > 1080);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.size[0] && h === this.size[1]) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.size = [w, h];
    if (this.r && !this.gl.isContextLost()) this.allocTargets(this.r);
  }

  setLooks(tables: ReadonlyMap<string, LookTable>): void {
    for (const [k, v] of tables) this.looks.set(k, v);
    const r = this.r;
    if (!r || this.gl.isContextLost()) return;
    for (const [id, t] of tables) {
      const old = r.luts.get(id);
      if (old) this.gl.deleteTexture(old);
      r.luts.set(id, makeLut(this.gl, t));
    }
  }

  onContextLost(handler: () => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async recover(): Promise<void> {
    for (let attempt = 0; attempt < RECOVER_TRIES; attempt++) {
      if (attempt > 0) await sleep(RECOVER_INTERVAL_MS);
      if (this.gl.isContextLost()) continue;
      try {
        this.r = this.init();
        this.isLost = false;
        return;
      } catch {
        this.r = null;
      }
    }
    throw new ContextLostError();
  }

  private quad(q: Quad): void {
    const gl = this.gl;
    const r = this.res();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q.pos), gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q.tex), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private target(f: Fbo | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f ? f.fb : null);
    gl.viewport(0, 0, f ? f.w : this.size[0], f ? f.h : this.size[1]);
  }

  private setGrade(p: Program, u: GradeUniforms): void {
    const gl = this.gl;
    const r = this.res();
    gl.uniform1i(p.u('uWBOn'), u.wbOn ? 1 : 0);
    gl.uniform3f(p.u('uWB'), u.wb[0], u.wb[1], u.wb[2]);
    gl.uniform1f(p.u('uBright'), u.bright);
    gl.uniform1f(p.u('uContrast'), u.contrast);
    gl.uniform1f(p.u('uHi'), u.hi);
    gl.uniform1f(p.u('uSh'), u.sh);
    gl.uniform1f(p.u('uSat'), u.sat);
    gl.uniform1f(p.u('uVib'), u.vib);
    const lut = u.look ? r.luts.get(u.look) : undefined;
    gl.uniform1f(p.u('uLookMix'), lut ? u.lookMix : 0); // an unknown look draws as None
    gl.uniform1f(p.u('uFade'), u.fade);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, lut ?? r.identity);
    gl.uniform1i(p.u('uLut'), 2);
    gl.activeTexture(gl.TEXTURE0);
  }

  private intermediate(slot: 0 | 1, w: number, h: number): Fbo {
    const r = this.res();
    const half = this.intermediateHalf(r);
    const cur = r.inter[slot];
    if (cur && cur.w === w && cur.h === h && cur.half === half) return cur;
    if (cur) {
      this.gl.deleteFramebuffer(cur.fb);
      this.gl.deleteTexture(cur.tex);
    }
    const f = makeFbo(this.gl, w, h, half) ?? makeFbo(this.gl, w, h, false);
    if (!f) throw new ContextLostError();
    r.inter[slot] = f;
    return f;
  }

  private textTexture(id: string, bitmap: ImageBitmap): WebGLTexture {
    const gl = this.gl;
    const r = this.res();
    const cur = r.text.get(id);
    if (cur && cur.bitmap === bitmap) return cur.tex;
    const tex = cur?.tex ?? makeTex(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // WebGL ignores UNPACK_PREMULTIPLY_ALPHA for ImageBitmap sources: the bitmap must already be
    // premultiplied (MOD-Preview's rasteriser creates it with premultiplyAlpha: 'premultiply').
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    r.text.set(id, { tex, bitmap });
    return tex;
  }

  paint(
    plan: FramePlan,
    frames: readonly (PaintFrame | null)[],
    textBitmaps: ReadonlyMap<string, TextBitmap> = new Map(),
    options: DrawOptions = {},
  ): DrawList {
    const gl = this.gl;
    const r = this.res();
    const [W, H] = this.size;
    const sizes: (SourceSize | null)[] = plan.layers.map((_, i) => frames[i] ?? null);
    const textSizes = new Map(
      [...textBitmaps].map(([id, t]) => [id, { width: t.bitmap.width, height: t.bitmap.height, s: t.s }] as const),
    );
    const list = drawList(plan, W, H, sizes, textSizes, options);
    gl.bindVertexArray(r.vao);
    gl.disable(gl.BLEND);
    const [bgR, bgG, bgB] = list.background;
    const drawn: { fbo: Fbo | null; weight: number; opacity: number }[] = [];
    let slot: 0 | 1 = 0;
    for (const L of list.layers) {
      if (drawn.length === 2) break;
      const i = plan.layers.findIndex((l) => l.clip.id === L.clipId);
      const frame = frames[i];
      if (L.blank || !frame) {
        drawn.push({ fbo: null, weight: L.weight, opacity: L.opacity });
        continue;
      }
      const it = this.intermediate(slot, L.intermediate.width, L.intermediate.height);
      // 1. Source upload (SDR and HDR alike: the engine's conversion, ADR-0007 outcome rule 1).
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, r.src[slot]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.image);
      // 2. Grade into the intermediate.
      this.target(it);
      const pg = r.prog.grade;
      gl.useProgram(pg.p);
      this.setGrade(pg, L.grade);
      gl.uniform1i(pg.u('uSrc'), 0);
      gl.uniform1i(pg.u('uTaps'), L.intermediate.taps === 4 ? 1 : 0);
      gl.uniform2f(pg.u('uHalf'), 0.25 / it.w, 0.25 / it.h);
      this.quad(FULL);
      // 3. The layer: background colour, or Blur (RULE-04), then the placed clip.
      const lay = r.layers[slot]!;
      this.target(lay);
      gl.clearColor(bgR, bgG, bgB, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (L.blur) this.drawBlur(r, it, L.blur, list.s, lay);
      this.target(lay);
      const pp = r.prog.place;
      gl.useProgram(pp.p);
      gl.uniform1i(pp.u('uSrc'), 0);
      gl.bindTexture(gl.TEXTURE_2D, it.tex);
      gl.uniform1f(pp.u('uSharpen'), L.grade.sharpen);
      gl.uniform2f(pp.u('uSharpStep'), L.sharpenStep[0], L.sharpenStep[1]);
      gl.uniform1f(pp.u('uVignette'), L.grade.vignette);
      gl.uniform1f(pp.u('uGrain'), L.grade.grain);
      gl.uniform1f(pp.u('uGrainCell'), list.grainCell);
      gl.uniform1ui(pp.u('uFrame'), L.frame >>> 0);
      gl.uniform1ui(pp.u('uClip'), L.clip >>> 0);
      this.quad(L.quad);
      drawn.push({ fbo: lay, weight: L.weight, opacity: L.opacity });
      slot = 1;
    }
    // 4. Fades and cross-fades into the output (RULE-10).
    this.target(null);
    const pm = r.prog.mix;
    gl.useProgram(pm.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, drawn[0]?.fbo?.tex ?? r.layers[0]!.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, drawn[1]?.fbo?.tex ?? r.layers[1]!.tex);
    gl.uniform1i(pm.u('uB0'), drawn[0] && !drawn[0].fbo ? 1 : 0);
    gl.uniform1i(pm.u('uB1'), drawn[1] && !drawn[1].fbo ? 1 : 0);
    gl.uniform1i(pm.u('uL0'), 0);
    gl.uniform1i(pm.u('uL1'), 1);
    gl.uniform3f(pm.u('uBg'), bgR, bgG, bgB);
    gl.uniform3f(pm.u('uFadeTo'), list.fadeTo[0], list.fadeTo[1], list.fadeTo[2]);
    gl.uniform1i(pm.u('uN'), drawn.length);
    gl.uniform1f(pm.u('uW0'), drawn[0]?.weight ?? 0);
    gl.uniform1f(pm.u('uA0'), drawn[0]?.opacity ?? 0);
    gl.uniform1f(pm.u('uW1'), drawn[1]?.weight ?? 0);
    gl.uniform1f(pm.u('uA1'), drawn[1]?.opacity ?? 0);
    this.quad(FULL);
    gl.bindTexture(gl.TEXTURE_2D, null); // unit 1: the layers are render targets again next frame
    gl.activeTexture(gl.TEXTURE0);
    // Textures of text layers no longer given are deleted.
    for (const [id, t] of r.text)
      if (!textBitmaps.has(id)) {
        gl.deleteTexture(t.tex);
        r.text.delete(id);
      }
    // 5. Text bitmaps in stacking order, premultiplied (ADR-0012).
    if (list.texts.length) {
      const pt = r.prog.tex;
      gl.useProgram(pt.p);
      gl.uniform1i(pt.u('uTex'), 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const t of list.texts) {
        const bmp = textBitmaps.get(t.id);
        if (!bmp) continue;
        gl.bindTexture(gl.TEXTURE_2D, this.textTexture(t.id, bmp.bitmap));
        gl.uniform1f(pt.u('uOpacity'), t.opacity);
        this.quad(t.quad);
      }
      gl.disable(gl.BLEND);
    }
    return list;
  }

  /** RULE-04 Blur: the graded clip covering the frame, sampled down 8×, two separable blur passes. */
  private drawBlur(r: Resources, it: Fbo, cover: Quad, s: number, layer: Fbo): void {
    const gl = this.gl;
    const [A, B] = r.blurBufs as [Fbo, Fbo];
    this.target(A);
    const pd = r.prog.down;
    gl.useProgram(pd.p);
    gl.uniform1i(pd.u('uSrc'), 0);
    gl.bindTexture(gl.TEXTURE_2D, it.tex);
    gl.uniform2f(pd.u('uStep'), (0.25 * BLUR_DOWN) / Math.max(it.w, 1), (0.25 * BLUR_DOWN) / Math.max(it.h, 1));
    this.quad(cover);
    const sigma = (BLUR_SIGMA * s) / BLUR_DOWN;
    const pb = r.prog.blur;
    gl.useProgram(pb.p);
    gl.uniform1fv(pb.u('uW'), BLUR_WEIGHTS);
    gl.uniform1i(pb.u('uTex'), 0);
    this.target(B);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform2f(pb.u('uDir'), (sigma * 0.8) / A.w, 0);
    this.quad(FULL);
    this.target(A);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.uniform2f(pb.u('uDir'), 0, (sigma * 0.8) / A.h);
    this.quad(FULL);
    this.target(layer);
    const pt = r.prog.tex;
    gl.useProgram(pt.p);
    gl.uniform1i(pt.u('uTex'), 0);
    gl.uniform1f(pt.u('uOpacity'), 1);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    this.quad(FULL);
  }

  paintOverlay(overlay: Overlay): void {
    const gl = this.gl;
    const r = this.res();
    const [W, H] = this.size;
    gl.bindVertexArray(r.vao);
    this.target(null);
    const ps = r.prog.solid;
    gl.useProgram(ps.p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const l of overlay.lines) {
      const [x0, y0, x1, y1] = [l.x0 * W, l.y0 * H, l.x1 * W, l.y1 * H];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = (-(y1 - y0) / len) * (l.width / 2);
      const ny = ((x1 - x0) / len) * (l.width / 2);
      const X = (x: number): number => (x / W) * 2 - 1;
      const Y = (y: number): number => 1 - (y / H) * 2;
      gl.uniform4f(ps.u('uColour'), l.colour[0], l.colour[1], l.colour[2], l.colour[3]);
      this.quad({
        pos: [X(x0 + nx), Y(y0 + ny), X(x1 + nx), Y(y1 + ny), X(x0 - nx), Y(y0 - ny), X(x1 - nx), Y(y1 - ny)],
        tex: [0, 0, 1, 0, 0, 1, 1, 1],
      });
    }
    gl.disable(gl.BLEND);
  }

  sync(): void {
    const px = new Uint8Array(4);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px);
  }

  readPixels(): Uint8Array {
    const gl = this.gl;
    const [W, H] = this.size;
    const buf = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8Array(buf.length);
    const row = W * 4;
    for (let y = 0; y < H; y++) out.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    return out;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.handlers.clear();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.r = null;
  }
}

/** Implements: ADR-0006 §2 — a compositor on an OffscreenCanvas (preview: transferred; export: unattached). */
export function createCompositor(
  canvas: OffscreenCanvas,
  looks: ReadonlyMap<string, LookTable> = new Map(),
  options: CompositorOptions = {},
): Compositor {
  return new GlCompositor(canvas, looks, options);
}
