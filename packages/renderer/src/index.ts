import {
  type Affine,
  type BlendMode,
  multiply,
  type VisualDraw,
} from "@motion/core";

/** Anything WebGL can upload as a texture. */
export type FrameImage =
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | VideoFrame
  | HTMLImageElement;

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const VERT = `#version 300 es
in vec2 a_unit;
uniform mat3 u_matrix;
out vec2 v_uv;
void main() {
  v_uv = a_unit;
  vec3 p = u_matrix * vec3(a_unit, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;

// Colour work runs only when a layer has adjustments (u_adjust), so plain
// layers take exactly the same path as before. Maths is on unpremultiplied
// colour: exposure and white balance in linear light, the rest in display
// (gamma) space, where they look even to the eye.
const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform bool u_adjust;
uniform highp float u_exposure, u_brightness, u_contrast, u_saturation, u_vibrance;
uniform highp float u_temperature, u_tint, u_highlights, u_shadows, u_fade;
out vec4 outColor;

highp float luma(highp vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

highp vec3 adjust(highp vec3 rgb) {
  highp vec3 lin = pow(rgb, vec3(2.2)) * exp2(u_exposure);
  lin *= vec3(1.0 + 0.2 * u_temperature, 1.0 - 0.15 * u_tint, 1.0 - 0.2 * u_temperature);
  rgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  rgb += 0.25 * u_brightness;
  highp float l = luma(rgb);
  rgb += 0.25 * u_shadows * (1.0 - smoothstep(0.0, 0.5, l));
  rgb += 0.25 * u_highlights * smoothstep(0.5, 1.0, l);
  rgb = (rgb - 0.5) * (1.0 + u_contrast) + 0.5;
  l = luma(rgb);
  highp float spread = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
  rgb = mix(vec3(l), rgb, 1.0 + u_saturation + u_vibrance * (1.0 - spread));
  rgb = mix(rgb, 0.15 + 0.8 * rgb, u_fade);
  return clamp(rgb, 0.0, 1.0);
}

uniform bool u_key;
uniform highp vec3 u_keyColor;
uniform highp float u_keySim, u_keySmooth, u_keySpill;
uniform int u_maskShape;
uniform highp vec2 u_maskCenter, u_maskSize, u_rectSize;
uniform highp float u_maskRot, u_maskFeather;
uniform bool u_maskInvert;
uniform highp float u_glitch, u_seed, u_vignette, u_vignetteSize;

highp float hash(highp vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
highp vec2 cbcr(highp vec3 c) {
  return vec2(-0.1146 * c.r - 0.3854 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4542 * c.g - 0.0458 * c.b);
}

void main() {
  highp vec2 uv = v_uv;
  vec4 c;
  if (u_glitch > 0.0) {
    // Tear: shift some horizontal bands sideways. Then split the colours.
    highp float band = floor(uv.y * 18.0);
    if (hash(vec2(band, u_seed)) < 0.35 * u_glitch) {
      uv.x += (hash(vec2(band, u_seed + 7.0)) - 0.5) * 0.15 * u_glitch;
    }
    highp float off = 0.012 * u_glitch;
    vec4 mid = texture(u_tex, uv);
    vec4 r = texture(u_tex, uv + vec2(off, 0.0));
    vec4 b = texture(u_tex, uv - vec2(off, 0.0));
    c = vec4(r.r, mid.g, b.b, max(mid.a, max(r.a, b.a)));
  } else {
    c = texture(u_tex, uv);
  }
  if (u_adjust && c.a > 0.0) {
    c.rgb = adjust(c.rgb / c.a) * c.a;
  }
  if (u_key && c.a > 0.0) {
    highp vec3 rgb = c.rgb / c.a;
    highp float d = distance(cbcr(rgb), cbcr(u_keyColor));
    highp float t = u_keySim * 0.4;
    highp float keep = smoothstep(t, t + u_keySmooth * 0.3 + 0.0001, d);
    // Spill: colours near the key lose their tint (no green fringe).
    highp float near = 1.0 - smoothstep(t, t + 0.25, d);
    rgb = mix(rgb, vec3(luma(rgb)), u_keySpill * near);
    c = vec4(rgb * c.a, c.a) * keep;
  }
  if (u_maskShape > 0) {
    highp vec2 p = (v_uv - u_maskCenter) * u_rectSize;
    highp float cs = cos(u_maskRot), sn = sin(u_maskRot);
    p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
    highp float m;
    if (u_maskShape == 3) {
      // Line: keep the side above it; feather is a share of the short side.
      highp float f = u_maskFeather * 0.5 * min(u_rectSize.x, u_rectSize.y) + 0.5;
      m = 1.0 - smoothstep(-f, f, p.y);
    } else {
      highp vec2 half_ = max(u_maskSize * u_rectSize * 0.5, vec2(0.0001));
      highp float d = u_maskShape == 1
        ? max(abs(p.x) / half_.x, abs(p.y) / half_.y)
        : length(p / half_);
      highp float f = max(u_maskFeather, 0.0001);
      m = 1.0 - smoothstep(1.0 - f, 1.0 + f, d);
    }
    if (u_maskInvert) m = 1.0 - m;
    c *= m;
  }
  if (u_vignette > 0.0) {
    highp float d = length((v_uv - 0.5) * 2.0) / 1.41421356;
    c.rgb *= 1.0 - u_vignette * smoothstep(u_vignetteSize, 1.0, d);
  }
  outColor = c * u_opacity;
}`;

// Separable Gaussian, one direction per pass.
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_sigma;
uniform int u_radius;
out vec4 outColor;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -32; i <= 32; i++) {
    if (i < -u_radius || i > u_radius) continue;
    float w = exp(-float(i * i) / (2.0 * u_sigma * u_sigma));
    sum += texture(u_tex, v_uv + u_step * float(i)) * w;
    total += w;
  }
  outColor = sum / total;
}`;

// Full-texture copy quad for the blur passes (no flip: we sample what we drew).
const BLUR_VERT = `#version 300 es
in vec2 a_unit;
out vec2 v_uv;
void main() {
  v_uv = a_unit;
  gl_Position = vec4(a_unit * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Blur works at a lower resolution for big blurs, keeping sigma near this. */
const BLUR_WORK_SIGMA = 8;

interface BlurTarget {
  w: number;
  h: number;
  a: { fb: WebGLFramebuffer; tex: WebGLTexture };
  b: { fb: WebGLFramebuffer; tex: WebGLTexture };
}

const FX_UNIFORMS = [
  "u_key",
  "u_keyColor",
  "u_keySim",
  "u_keySmooth",
  "u_keySpill",
  "u_maskShape",
  "u_maskCenter",
  "u_maskSize",
  "u_rectSize",
  "u_maskRot",
  "u_maskFeather",
  "u_maskInvert",
  "u_glitch",
  "u_seed",
  "u_vignette",
  "u_vignetteSize",
] as const;

const MASK_SHAPE_ID = { rect: 1, ellipse: 2, linear: 3 } as const;

const ADJUST_UNIFORMS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "vibrance",
  "temperature",
  "tint",
  "highlights",
  "shadows",
  "fade",
] as const;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("WebGL: could not create shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`WebGL shader: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return [0, 0, 0];
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * An image and where it sits in its layer's space. Video and photos fill
 * (0, 0, width, height); text is centred on the layer's origin.
 */
export interface PlacedImage {
  image: FrameImage;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * True when this exact image object never changes (photos, laid-out text).
   * Then it is only uploaded to the GPU once. Video frames come from reused
   * canvases whose pixels change, so they must leave this false.
   */
  fixed: boolean;
}

export interface RenderInput {
  draws: VisualDraw[];
  /** Image for each draw, by `draw.key`. Draws without an image are skipped. */
  images: Map<string, PlacedImage>;
  compWidth: number;
  compHeight: number;
  background: string;
}

/**
 * Draws one frame from core's evaluation. The preview and export both use
 * this class, so what you see is exactly what you export.
 */
export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private blurProgram: WebGLProgram;
  private blurU: Record<
    "step" | "sigma" | "radius",
    WebGLUniformLocation | null
  >;
  private blurTargets = new Map<string, BlurTarget>();
  private fx = new Map<string, WebGLUniformLocation | null>();
  private uMatrix: WebGLUniformLocation | null;
  private uOpacity: WebGLUniformLocation | null;
  private uAdjust: WebGLUniformLocation | null;
  private uAdjustValues = new Map<string, WebGLUniformLocation | null>();
  private textures = new Map<string, WebGLTexture>();
  /** The fixed image last uploaded per key, so it isn't uploaded again. */
  private uploaded = new Map<string, FrameImage>();
  private lost = false;

  constructor(
    readonly canvas: AnyCanvas,
    opts: { preserveDrawingBuffer?: boolean } = {},
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      throw new Error(
        "This browser can't run WebGL2, which Motion needs to draw video.",
      );
    }
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });

    const link = (vert: string, frag: string) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
      gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
      // Same attribute slot in every program, so one vertex array serves all.
      gl.bindAttribLocation(p, 0, "a_unit");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(`WebGL link: ${gl.getProgramInfoLog(p)}`);
      }
      return p;
    };
    const program = link(VERT, FRAG);
    this.blurProgram = link(BLUR_VERT, BLUR_FRAG);
    gl.useProgram(this.blurProgram);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, "u_tex"), 0);
    this.blurU = {
      step: gl.getUniformLocation(this.blurProgram, "u_step"),
      sigma: gl.getUniformLocation(this.blurProgram, "u_sigma"),
      radius: gl.getUniformLocation(this.blurProgram, "u_radius"),
    };
    this.program = program;
    gl.useProgram(program);
    this.uMatrix = gl.getUniformLocation(program, "u_matrix");
    this.uOpacity = gl.getUniformLocation(program, "u_opacity");
    this.uAdjust = gl.getUniformLocation(program, "u_adjust");
    for (const k of ADJUST_UNIFORMS) {
      this.uAdjustValues.set(k, gl.getUniformLocation(program, `u_${k}`));
    }
    for (const k of FX_UNIFORMS) {
      this.fx.set(k, gl.getUniformLocation(program, k));
    }
    gl.uniform1i(gl.getUniformLocation(program, "u_tex"), 0);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    // Textures are uploaded premultiplied, so this is standard "over".
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  /**
   * GPU blending for each mode, on premultiplied colour (the canvas below is
   * opaque, so these match the usual definitions).
   */
  private setBlend(mode: BlendMode) {
    const gl = this.gl;
    gl.blendEquation(mode === "lighten" ? gl.MAX : gl.FUNC_ADD);
    switch (mode) {
      case "multiply":
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        break;
      case "screen":
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      case "add":
        gl.blendFunc(gl.ONE, gl.ONE);
        break;
      default:
        // normal (and lighten, whose MAX equation ignores the factors)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  private setEffects(draw: VisualDraw, placed: PlacedImage) {
    const gl = this.gl;
    const u = (k: (typeof FX_UNIFORMS)[number]) => this.fx.get(k) ?? null;
    const { key, mask, glitch, vignette } = draw.style;
    gl.uniform1i(u("u_key"), key ? 1 : 0);
    if (key) {
      gl.uniform3f(u("u_keyColor"), key.color[0], key.color[1], key.color[2]);
      gl.uniform1f(u("u_keySim"), key.similarity);
      gl.uniform1f(u("u_keySmooth"), key.smoothness);
      gl.uniform1f(u("u_keySpill"), key.spill);
    }
    gl.uniform1i(u("u_maskShape"), mask ? MASK_SHAPE_ID[mask.shape] : 0);
    if (mask) {
      gl.uniform2f(u("u_maskCenter"), mask.center[0], mask.center[1]);
      gl.uniform2f(u("u_maskSize"), mask.size[0], mask.size[1]);
      gl.uniform2f(u("u_rectSize"), placed.width, placed.height);
      gl.uniform1f(u("u_maskRot"), (mask.rotation * Math.PI) / 180);
      gl.uniform1f(u("u_maskFeather"), mask.feather);
      gl.uniform1i(u("u_maskInvert"), mask.invert ? 1 : 0);
    }
    gl.uniform1f(u("u_glitch"), glitch ? glitch.amount : 0);
    if (glitch) gl.uniform1f(u("u_seed"), glitch.seed % 1000);
    gl.uniform1f(u("u_vignette"), vignette ? vignette.amount : 0);
    if (vignette) gl.uniform1f(u("u_vignetteSize"), vignette.size);
  }

  private makeTarget(w: number, h: number) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  private freeBlur(t: BlurTarget) {
    for (const x of [t.a, t.b]) {
      this.gl.deleteFramebuffer(x.fb);
      this.gl.deleteTexture(x.tex);
    }
  }

  /**
   * Blur the layer's image in two passes (across, then down) and return the
   * result. Big blurs run at a lower resolution, which looks the same after
   * blurring and keeps it fast.
   */
  private blur(
    draw: VisualDraw,
    placed: PlacedImage,
    src: WebGLTexture,
  ): WebGLTexture {
    const gl = this.gl;
    const img = placed.image as { width: number; height: number };
    // Canvas pixels per layer unit, and image pixels per layer unit.
    const toCanvas = Math.max(1e-6, Math.hypot(draw.matrix[0], draw.matrix[1]));
    const texPerUnit = img.width / placed.width;
    const sigmaSrc = (draw.style.blur / toCanvas) * texPerUnit;
    const down = Math.max(1, sigmaSrc / BLUR_WORK_SIGMA);
    const w = Math.max(1, Math.round(img.width / down));
    const h = Math.max(1, Math.round(img.height / down));
    const sigma = Math.max(0.01, sigmaSrc / down);
    const radius = Math.min(32, Math.ceil(sigma * 3));

    let t = this.blurTargets.get(draw.key);
    if (!t || t.w !== w || t.h !== h) {
      if (t) this.freeBlur(t);
      t = { w, h, a: this.makeTarget(w, h), b: this.makeTarget(w, h) };
      this.blurTargets.set(draw.key, t);
    }
    gl.useProgram(this.blurProgram);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, w, h);
    gl.uniform1f(this.blurU.sigma, sigma);
    gl.uniform1i(this.blurU.radius, radius);
    const pass = (
      from: WebGLTexture,
      to: WebGLFramebuffer,
      sx: number,
      sy: number,
    ) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to);
      gl.bindTexture(gl.TEXTURE_2D, from);
      gl.uniform2f(this.blurU.step, sx, sy);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    gl.activeTexture(gl.TEXTURE0);
    pass(src, t.a.fb, 1 / w, 0);
    pass(t.a.tex, t.b.fb, 0, 1 / h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.useProgram(this.program);
    return t.b.tex;
  }

  get isLost(): boolean {
    return this.lost || this.gl.isContextLost();
  }

  private texture(key: string): WebGLTexture {
    let tex = this.textures.get(key);
    if (tex) return tex;
    const gl = this.gl;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.set(key, tex);
    return tex;
  }

  render(input: RenderInput): void {
    if (this.isLost) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    const [r, g, b] = parseHex(input.background);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // Composition pixels (y down) to clip space (y up).
    const toClip: Affine = [
      2 / input.compWidth,
      0,
      0,
      -2 / input.compHeight,
      -1,
      1,
    ];
    const used = new Set<string>();
    for (const draw of input.draws) {
      const placed = input.images.get(draw.key);
      if (!placed || placed.width <= 0 || placed.height <= 0) continue;
      used.add(draw.key);
      const tex = this.texture(draw.key);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (!placed.fixed || this.uploaded.get(draw.key) !== placed.image) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          placed.image as TexImageSource,
        );
        if (placed.fixed) this.uploaded.set(draw.key, placed.image);
        else this.uploaded.delete(draw.key);
      }
      // Unit quad to the image's rectangle in layer space, then to comp
      // pixels, then to clip space.
      const rect: Affine = [
        placed.width,
        0,
        0,
        placed.height,
        placed.x,
        placed.y,
      ];
      const m = multiply(toClip, multiply(draw.matrix, rect));
      // Column-major mat3.
      gl.uniformMatrix3fv(
        this.uMatrix,
        false,
        new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]),
      );
      gl.uniform1f(this.uOpacity, draw.opacity);
      const adjust = draw.style.adjust;
      gl.uniform1i(this.uAdjust, adjust ? 1 : 0);
      if (adjust) {
        for (const k of ADJUST_UNIFORMS) {
          gl.uniform1f(this.uAdjustValues.get(k) ?? null, adjust[k]);
        }
      }
      this.setEffects(draw, placed);
      if (draw.style.blur > 0) {
        const blurred = this.blur(draw, placed, tex);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blurred);
      }
      this.setBlend(draw.style.blend);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    this.setBlend("normal");
    // Free textures for layers that are gone.
    for (const [key, tex] of this.textures) {
      if (!used.has(key)) {
        gl.deleteTexture(tex);
        this.textures.delete(key);
        this.uploaded.delete(key);
      }
    }
    for (const [key, t] of this.blurTargets) {
      if (!used.has(key)) {
        this.freeBlur(t);
        this.blurTargets.delete(key);
      }
    }
  }

  /**
   * Free GPU textures. Pass `loseContext` only for throwaway canvases (export):
   * a lost context can't be recovered if the same canvas is used again.
   */
  dispose(opts: { loseContext?: boolean } = {}): void {
    for (const tex of this.textures.values()) this.gl.deleteTexture(tex);
    this.textures.clear();
    for (const t of this.blurTargets.values()) this.freeBlur(t);
    this.blurTargets.clear();
    this.uploaded.clear();
    if (opts.loseContext) {
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
}
