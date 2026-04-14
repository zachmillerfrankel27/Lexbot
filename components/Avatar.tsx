'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  isSpeaking: boolean
  isListening: boolean
  isThinking: boolean
  audioAmplitude: number
  onClick: () => void
}

// ─── GLSL 3-D Simplex Noise (Stefan Gustavson) ───────────────────────────────
// Included verbatim in both shaders — each compiles independently.

const NOISE_GLSL = /* glsl */`
vec3  _mod289v3(vec3  x) { return x - floor(x*(1./289.))*289.; }
vec4  _mod289v4(vec4  x) { return x - floor(x*(1./289.))*289.; }
vec4  _permute(vec4   x) { return _mod289v4(((x*34.)+1.)*x); }
vec4  _tiSqrt(vec4    r) { return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1./6., 1./3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = _mod289v3(i);
  vec4 p = _permute(_permute(_permute(
    i.z+vec4(0.,i1.z,i2.z,1.)) +
    i.y+vec4(0.,i1.y,i2.y,1.)) +
    i.x+vec4(0.,i1.x,i2.x,1.));
  float n_ = .142857142857;
  vec3  ns = n_*D.wyz - D.xzx;
  vec4 j   = p - 49.*floor(p*ns.z*ns.z);
  vec4 x_  = floor(j*ns.z);
  vec4 y_  = floor(j - 7.*x_);
  vec4 x   = x_*ns.x + ns.yyyy;
  vec4 y   = y_*ns.x + ns.yyyy;
  vec4 h   = 1.0 - abs(x) - abs(y);
  vec4 b0  = vec4(x.xy, y.xy);
  vec4 b1  = vec4(x.zw, y.zw);
  vec4 s0  = floor(b0)*2.+1.;
  vec4 s1  = floor(b1)*2.+1.;
  vec4 sh  = -step(h, vec4(0.));
  vec4 a0  = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1  = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0  = vec3(a0.xy, h.x);
  vec3 p1  = vec3(a0.zw, h.y);
  vec3 p2  = vec3(a1.xy, h.z);
  vec3 p3  = vec3(a1.zw, h.w);
  vec4 norm= _tiSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m = max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m = m*m;
  return 42.*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// ─── Vertex shader — noise-driven surface displacement ────────────────────────

const VERTEX_SHADER = /* glsl */`
${NOISE_GLSL}

uniform float uTime;
uniform float uAmplitude;
uniform float uTurbulence;

varying vec3  vNormal;
varying vec3  vViewDir;
varying vec3  vWorldNormal;
varying float vDisplacement;

void main() {
  // Three octaves of noise, each evolving at a different speed/scale
  float n1 = snoise(position * 1.3  + vec3(uTime * 0.18));
  float n2 = snoise(position * 3.0  + vec3(uTime * 0.31, 0., uTime * 0.22));
  float n3 = snoise(position * 6.2  + vec3(uTime * 0.60, uTime * 0.46, 0.));

  float disp = n1*0.28 + n2*0.14 + n3*0.06;
  disp *= (1.0 + uAmplitude * 2.5 + uTurbulence);

  vDisplacement = disp;
  vNormal       = normalize(normalMatrix * normal);
  vWorldNormal  = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  vec3 displaced = position + normal * disp;
  vec4 mvPos     = modelViewMatrix * vec4(displaced, 1.0);
  vViewDir       = normalize(-mvPos.xyz);

  gl_Position = projectionMatrix * mvPos;
}
`

// ─── Fragment shader — layered plasma colour + fresnel rim ────────────────────

const FRAGMENT_SHADER = /* glsl */`
${NOISE_GLSL}

uniform float uTime;
uniform float uAmplitude;
uniform vec3  uColorA;      // deep background
uniform vec3  uColorB;      // plasma tendrils / mid
uniform vec3  uColorCore;   // bright centre glow
uniform vec3  uRimColor;    // fresnel edge
uniform float uBrightness;

varying vec3  vNormal;
varying vec3  vViewDir;
varying vec3  vWorldNormal;
varying float vDisplacement;

void main() {
  float NdotV  = max(dot(vNormal, vViewDir), 0.0);
  float fresnel= pow(1.0 - NdotV, 2.8);

  // Three plasma layers — evolve independently for tendril look
  float p1 = snoise(vWorldNormal * 2.2 + vec3(uTime * 0.17)) * 0.5 + 0.5;
  float p2 = snoise(vWorldNormal * 4.8 + vec3(uTime * 0.30, 0., uTime * 0.24)) * 0.5 + 0.5;
  float p3 = snoise(vWorldNormal * 9.5 + vec3(uTime * 0.58)) * 0.5 + 0.5;
  float plasma = p1*0.55 + p2*0.30 + p3*0.15;

  // Sharpen so high-noise regions become bright filaments, low-noise stays dark
  float tendrils = pow(plasma, 3.0) * 2.2 * (1.0 + uAmplitude * 1.5);

  // Core: front face of sphere glows brightest, amplitude boosts it when speaking
  float core = pow(NdotV, 1.4) * (0.55 + uAmplitude * 2.2);

  // Build final colour
  vec3 col  = uColorA;                          // dark base
  col      += uColorB    * tendrils;            // plasma filaments
  col      += uColorCore * core;                // bright centre
  col      += uRimColor  * fresnel * 2.0;       // glow rim

  // Displaced vertices (ridges) pick up extra plasma colour
  col += max(vDisplacement, 0.0) * uColorB * 1.2;

  col *= uBrightness;

  // Alpha — opaque centre, soft edge
  float alpha = mix(0.94, 0.70, fresnel);
  gl_FragColor = vec4(col, alpha);
}
`

// ─── Status → colour targets ──────────────────────────────────────────────────
// Each colour is linear RGB [0..1].  Values > 0.5 will bloom strongly.

type ColourTarget = {
  A: [number, number, number]
  B: [number, number, number]
  core: [number, number, number]
  rim: [number, number, number]
  brightness: number
  turbulence: number
}

const STATUS_COLORS: Record<string, ColourTarget> = {
  idle:      { A: [0.02, 0.00, 0.07], B: [0.14, 0.02, 0.40], core: [0.42, 0.16, 0.85], rim: [0.16, 0.05, 0.60], brightness: 0.88, turbulence: 0.00 },
  listening: { A: [0.00, 0.02, 0.17], B: [0.05, 0.19, 0.82], core: [0.28, 0.50, 1.00], rim: [0.10, 0.24, 1.00], brightness: 1.10, turbulence: 0.15 },
  thinking:  { A: [0.07, 0.00, 0.13], B: [0.30, 0.05, 0.66], core: [0.56, 0.24, 0.96], rim: [0.42, 0.10, 0.86], brightness: 0.98, turbulence: 0.08 },
  speaking:  { A: [0.03, 0.00, 0.10], B: [0.16, 0.11, 0.86], core: [0.68, 0.48, 1.00], rim: [0.36, 0.24, 1.00], brightness: 1.20, turbulence: 0.30 },
}

// ─── Plasma Sphere ────────────────────────────────────────────────────────────

function PlasmaSphere({
  isSpeaking, isListening, isThinking, audioAmplitude,
}: Omit<AvatarProps, 'onClick'>) {
  const meshRef = useRef<THREE.Mesh>(null!)

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uAmplitude:  { value: 0 },
    uTurbulence: { value: 0 },
    uColorA:     { value: new THREE.Color(0.02, 0.00, 0.07) },
    uColorB:     { value: new THREE.Color(0.14, 0.02, 0.40) },
    uColorCore:  { value: new THREE.Color(0.42, 0.16, 0.85) },
    uRimColor:   { value: new THREE.Color(0.16, 0.05, 0.60) },
    uBrightness: { value: 0.88 },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite:  false,
  }), [uniforms])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    uniforms.uTime.value = t

    // Smooth amplitude — fast attack, medium decay
    uniforms.uAmplitude.value = THREE.MathUtils.lerp(
      uniforms.uAmplitude.value, audioAmplitude, 0.14,
    )

    const tgt = isSpeaking ? STATUS_COLORS.speaking
      : isListening  ? STATUS_COLORS.listening
      : isThinking   ? STATUS_COLORS.thinking
      : STATUS_COLORS.idle

    // Turbulence & brightness
    uniforms.uTurbulence.value = THREE.MathUtils.lerp(uniforms.uTurbulence.value, tgt.turbulence, 0.04)
    const targetBright = tgt.brightness + (isSpeaking ? audioAmplitude * 1.8 : 0)
    uniforms.uBrightness.value  = THREE.MathUtils.lerp(uniforms.uBrightness.value,  targetBright, 0.06)

    // Colour lerp — no allocations in the hot path
    const lc = (u: THREE.Color, c: [number, number, number]) => {
      u.r = THREE.MathUtils.lerp(u.r, c[0], 0.04)
      u.g = THREE.MathUtils.lerp(u.g, c[1], 0.04)
      u.b = THREE.MathUtils.lerp(u.b, c[2], 0.04)
    }
    lc(uniforms.uColorA.value,    tgt.A)
    lc(uniforms.uColorB.value,    tgt.B)
    lc(uniforms.uColorCore.value, tgt.core)
    lc(uniforms.uRimColor.value,  tgt.rim)

    // Gentle idle rotation
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.07
      meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.04
    }
  })

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1, 96, 96]} />
    </mesh>
  )
}

// ─── Ambient particles — thin halo of drifting points ─────────────────────────

function OrbParticles({
  isSpeaking, isListening,
}: { isSpeaking: boolean; isListening: boolean }) {
  const ref = useRef<THREE.Points>(null!)
  const count = 550

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Random points in a spherical shell [1.15 … 2.1]
      const r     = 1.15 + Math.random() * 0.95
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.rotation.y  = t * 0.055
    ref.current.rotation.x  = Math.sin(t * 0.04) * 0.09
    const mat = ref.current.material as THREE.PointsMaterial
    const targetOpacity = isSpeaking ? 0.72 : isListening ? 0.50 : 0.28
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.05)
    // Particle size pulses with speech
    mat.size = isSpeaking
      ? 0.014 + Math.sin(t * 7) * 0.003
      : 0.009
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.009}
        color="#7744ee"
        transparent
        opacity={0.28}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ─── Exported Avatar component ────────────────────────────────────────────────

export function Avatar({
  isSpeaking, isListening, isThinking, audioAmplitude, onClick,
}: AvatarProps) {
  return (
    <group onClick={onClick}>
      <PlasmaSphere
        isSpeaking={isSpeaking}
        isListening={isListening}
        isThinking={isThinking}
        audioAmplitude={audioAmplitude}
      />
      <OrbParticles isSpeaking={isSpeaking} isListening={isListening} />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          height={400}
          intensity={
            isSpeaking  ? 2.8 + audioAmplitude * 2.0
            : isListening  ? 1.8
            : isThinking   ? 1.5
            : 1.1
          }
        />
      </EffectComposer>
    </group>
  )
}
