import { useEffect, useRef } from "react";

/* A slow-moving domain-warped noise field, quantised to 4 tones with 8x8 Bayer ordered dithering.
   Rendered at 1/PX resolution and scaled up with image-rendering: pixelated, so every dither cell is a chunky pixel.
   Pauses when off-screen or the tab is hidden; draws a single still frame under prefers-reduced-motion. */

const PX = 3;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y) * 2.4;
  float t = uTime * 0.035;
  vec2 q = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 2.2 * q + vec2(0.6 * t, -0.4 * t));
  vec2 c = (uv - vec2(0.74, 0.52)) * vec2(asp, 1.0);
  float lens = smoothstep(1.15, 0.05, length(c));
  float ring = smoothstep(0.06, 0.0, abs(length(c) - 0.36)) * 0.35;
  float spot = smoothstep(0.38, 0.0, length((uv - uMouse) * vec2(asp, 1.0))) * 0.35;
  float lum = f * f * 1.35 * (0.12 + 0.95 * lens) + ring * lens * 0.8 + spot;
  lum *= smoothstep(0.0, 0.35, uv.y);
  lum = clamp(lum, 0.0, 0.999);
  float d = bayer8(gl_FragCoord.xy);
  float lv = lum * 3.0;
  float idx = floor(lv) + step(d, fract(lv));
  vec3 col = vec3(0.953, 0.941, 0.910);
  if (idx >= 1.0) col = vec3(0.855, 0.835, 0.792);
  if (idx >= 2.0) col = vec3(0.55, 0.53, 0.49);
  if (idx >= 3.0) col = (q.x > 0.64) ? vec3(1.0, 0.29, 0.078) : vec3(0.051, 0.051, 0.047);
  gl_FragColor = vec4(col, 1.0);
}`;

export function DitherField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return; // CSS fallback background stays visible
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("DitherField: shader failed", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: -2, y: -2, tx: -2, ty: -2 };
    let raf = 0, visible = true, last = 0;
    const t0 = performance.now();

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth / PX));
      const h = Math.max(1, Math.floor(canvas.clientHeight / PX));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const draw = (now: number) => {
      resize();
      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduce ? 12 : (now - t0) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 33) return; // ~30fps is plenty for a dithered field
      last = now;
      draw(now);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const ro = new ResizeObserver(() => reduce && draw(performance.now()));
    ro.observe(canvas);

    if (reduce) draw(t0);
    else {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onMove, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      // no loseContext(): StrictMode remounts reuse the same canvas, and a lost context can't be revived
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ imageRendering: "pixelated", background: "#f3f0e8" }}
    />
  );
}
