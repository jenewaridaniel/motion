import { type Affine, multiply, type VisualDraw } from "@motion/core";

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

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv) * u_opacity;
}`;

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
  private uMatrix: WebGLUniformLocation | null;
  private uOpacity: WebGLUniformLocation | null;
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

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`WebGL link: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);
    this.uMatrix = gl.getUniformLocation(program, "u_matrix");
    this.uOpacity = gl.getUniformLocation(program, "u_opacity");
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
    const loc = gl.getAttribLocation(program, "a_unit");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    // Textures are uploaded premultiplied, so this is standard "over".
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
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
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // Free textures for layers that are gone.
    for (const [key, tex] of this.textures) {
      if (!used.has(key)) {
        gl.deleteTexture(tex);
        this.textures.delete(key);
        this.uploaded.delete(key);
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
    this.uploaded.clear();
    if (opts.loseContext) {
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
}
