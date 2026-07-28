import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'

export type HeroTrustBadge = {
  text: string
  icons?: string[]
}

export type HeroHeadline = {
  line1: string
  line2: string
}

export type HeroButton = {
  text: string
  onClick?: () => void
  href?: string
}

export type AnimatedShaderHeroProps = {
  trustBadge?: HeroTrustBadge
  headline?: HeroHeadline
  subtitle?: string
  buttons?: {
    primary?: HeroButton
    secondary?: HeroButton
  }
  className?: string
  /** Min height of the hero section */
  minHeight?: CSSProperties['minHeight']
  children?: ReactNode
}

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// Flowing mesh / aurora shader (WebGL1)
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  uv.x *= u_res.x / u_res.y;
  float t = u_time * 0.15;

  vec2 p = uv * 2.2;
  float n1 = fbm(p + vec2(t, t * 0.7));
  float n2 = fbm(p * 1.4 + vec2(-t * 0.8, t * 1.1) + n1);
  float n3 = fbm(p * 0.9 - vec2(t * 0.5, -t) + n2 * 1.5);

  // Deep space base → teal / violet / cyan bloom (brand-adjacent)
  vec3 c1 = vec3(0.02, 0.06, 0.14);
  vec3 c2 = vec3(0.04, 0.35, 0.42);
  vec3 c3 = vec3(0.18, 0.12, 0.48);
  vec3 c4 = vec3(0.05, 0.72, 0.68);
  vec3 c5 = vec3(0.55, 0.25, 0.85);

  vec3 col = mix(c1, c2, smoothstep(0.15, 0.75, n1));
  col = mix(col, c3, smoothstep(0.25, 0.85, n2) * 0.85);
  col = mix(col, c4, smoothstep(0.45, 0.95, n3) * 0.55);
  col += c5 * pow(n2 * n3, 2.2) * 0.45;

  // soft vignette
  vec2 vc = gl_FragCoord.xy / u_res.xy - 0.5;
  float vig = 1.0 - dot(vc * 1.35, vc * 1.35);
  col *= smoothstep(0.0, 0.85, vig);

  // grain
  col += (hash(gl_FragCoord.xy + t) - 0.5) * 0.035;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(info || 'shader compile failed')
  }
  return sh
}

export function ShaderCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    let raf = 0
    let disposed = false

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const pw = Math.max(1, Math.floor(w * dpr))
      const ph = Math.max(1, Math.floor(h * dpr))
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
        gl.viewport(0, 0, pw, ph)
      }
      gl.uniform2f(uRes, pw, ph)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const t0 = performance.now()
    const frame = (now: number) => {
      if (disposed) return
      const t = reduce ? 2.5 : (now - t0) * 0.001
      gl.uniform1f(uTime, t)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      style={{
        position: className?.includes('fixed') ? 'fixed' : 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  )
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Animated Shader Hero — ravikatiyar162 / 21st.dev style
 * WebGL aurora background + customizable trust badge, headline, CTAs.
 */
export function AnimatedShaderHero({
  trustBadge,
  headline = { line1: 'Launch Your', line2: 'Workflow Into Orbit' },
  subtitle = 'Supercharge productivity with AI-powered automation and integrations built for the next generation of teams — fast, seamless, and limitless.',
  buttons,
  className,
  minHeight = 'min(100dvh, 920px)',
  children,
}: AnimatedShaderHeroProps) {
  const primary = buttons?.primary
  const secondary = buttons?.secondary

  return (
    <section
      className={cn(
        'relative w-full overflow-hidden bg-[hsl(222_47%_6%)] text-white',
        className,
      )}
      style={{ minHeight }}
    >
      <ShaderCanvas />

      {/* soft light bloom overlays */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.18),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/55"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-5 pb-12 pt-16 text-center sm:px-8 sm:pt-24">
        {trustBadge ? (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 shadow-lg shadow-black/20 backdrop-blur-md">
            {trustBadge.icons?.length ? (
              <span className="flex items-center gap-1" aria-hidden>
                {trustBadge.icons.map((icon, i) => (
                  <span key={i}>{icon}</span>
                ))}
              </span>
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-teal-300" aria-hidden />
            )}
            <span>{trustBadge.text}</span>
          </div>
        ) : null}

        <h1 className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <span className="block text-white drop-shadow-sm">{headline.line1}</span>
          <span className="mt-1 block bg-gradient-to-r from-teal-200 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
            {headline.line2}
          </span>
        </h1>

        {subtitle ? (
          <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-white/75 sm:text-base">
            {subtitle}
          </p>
        ) : null}

        {(primary || secondary) && (
          <div className="mt-8 flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
            {primary ? (
              primary.href ? (
                <a
                  href={primary.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-lg shadow-black/30 transition hover:bg-teal-50 active:scale-[0.98]"
                >
                  {primary.text}
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={primary.onClick}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-lg shadow-black/30 transition hover:bg-teal-50 active:scale-[0.98]"
                >
                  {primary.text}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )
            ) : null}
            {secondary ? (
              secondary.href ? (
                <a
                  href={secondary.href}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/15 active:scale-[0.98]"
                >
                  {secondary.text}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/15 active:scale-[0.98]"
                >
                  {secondary.text}
                </button>
              )
            ) : null}
          </div>
        )}

        {children ? <div className="mt-10 w-full max-w-md text-left">{children}</div> : null}
      </div>
    </section>
  )
}

export default AnimatedShaderHero
