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

// ─── GLSL Simplex Noise ───────────────────────────────────────────────────────

const NOISE_GLSL = /* glsl */`
vec3  _m3(vec3  x){return x-floor(x*(1./289.))*289.;}
vec4  _m4(vec4  x){return x-floor(x*(1./289.))*289.;}
vec4  _p4(vec4  x){return _m4(((x*34.)+1.)*x);}
vec4  _ti(vec4  r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=_m3(i);
  vec4 p=_p4(_p4(_p4(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_ti(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// ─── Vertex shader — no displacement, perfect sphere ─────────────────────────

const VERTEX_SHADER = /* glsl */`
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldNormal;

void main(){
  vNormal      = normalize(normalMatrix * normal);
  vWorldNormal = normalize((modelMatrix * vec4(normal,0.)).xyz);
  vec4 mvPos   = modelViewMatrix * vec4(position,1.);
  vViewDir     = normalize(-mvPos.xyz);
  gl_Position  = projectionMatrix * mvPos;
}
`

// ─── Fragment shader — multi-colour plasma on dark field ─────────────────────
// Contrast is everything: base is near-black; tendrils are bright and
// multi-coloured so they trigger Bloom and look like the reference images.
// uSpeed controls how fast the noise evolves — driven by speaking/idle state.
// uEnergy shifts the palette from calmer (idle) to electric (speaking).
//
// Anti-strobe principles (v4):
//   • p^3 falloff = sharp isolated tendrils, not diffuse smear
//   • Noise time multipliers halved vs v3 = much slower evolution
//   • Hard luminance clamp (min col, 2.0) prevents brightness spikes
//   • All IIR alphas slowed down on JS side (see useFrame)

const FRAGMENT_SHADER = /* glsl */`
${NOISE_GLSL}
uniform float uTime;
uniform float uSpeed;    // animation speed (0.18 idle → 0.55 speaking)
uniform float uEnergy;   // 0=idle, 1=speaking  — brightens cyan + rim
uniform float uBrightness;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldNormal;

void main(){
  float NdotV  = max(dot(vNormal,vViewDir),0.);
  float fresnel= pow(1.-NdotV,2.4);
  float st     = uTime * uSpeed;

  // Three independent plasma layers — slower time multipliers than v3
  float p1 = snoise(vWorldNormal*2.2 + vec3(st*.18))              * .5+.5;
  float p2 = snoise(vWorldNormal*4.2 + vec3(st*.28,0.,st*.22))    * .5+.5;
  float p3 = snoise(vWorldNormal*6.0 + vec3(st*.45))              * .5+.5;

  // Near-black base
  vec3 col = vec3(0.,0.,0.015);

  // p^3 falloff = sharp hot-spot tendrils, very dark between them
  float p1c = p1*p1*p1;
  float p2c = p2*p2*p2;

  // Blue tendrils (slow, dominant)
  col += vec3(0.05,0.28,1.00) * p1c * 3.2;

  // Purple tendrils (mid speed)
  col += vec3(0.55,0.05,1.00) * p2c * 2.5;

  // Cyan only at sharp noise peaks — higher threshold = fewer but crisper flares
  float cyanAmt = 0.25 + uEnergy * 0.75;
  col += vec3(0.00,0.90,1.00) * max(p3-0.68,0.) * 6.0 * cyanAmt;

  // Magenta accent only where BOTH tendrils are bright (product of cubes = rare overlap)
  col += vec3(0.90,0.05,0.55) * p1c * p2c * 2.0;

  // Tight white/lavender core on front face
  col += vec3(0.72,0.52,1.00) * pow(NdotV,3.0) * 0.7;

  // Electric blue rim
  col += vec3(0.12,0.38,1.00) * fresnel * (2.0 + uEnergy*1.0);

  col *= uBrightness;

  // Hard clamp — prevents any frame-to-frame spike above this level
  col = min(col, vec3(2.0));

  float alpha = mix(0.97,0.55,fresnel);
  gl_FragColor = vec4(col,alpha);
}
`

// ─── Plasma Sphere ────────────────────────────────────────────────────────────

function PlasmaSphere({ isSpeaking, isListening, isThinking, audioAmplitude }: Omit<AvatarProps,'onClick'>) {
  const meshRef = useRef<THREE.Mesh>(null!)

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uSpeed:      { value: 0.30 },
    uEnergy:     { value: 0 },
    uBrightness: { value: 1.0 },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite:  false,
  }), [uniforms])

  // Smoothed amplitude — very slow IIR, drives scale only
  const smoothAmpRef = useRef(0)

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime()

    // IIR low-pass — α=0.02, ~0.15 Hz: amplitude never flickers
    smoothAmpRef.current = smoothAmpRef.current * 0.98 + audioAmplitude * 0.02

    const active = isSpeaking || isListening || isThinking

    // Speed: narrower range + much slower transition (α=0.02) vs v3 (α=0.04)
    const baseSpeed = isSpeaking ? 0.55 : isListening ? 0.38 : isThinking ? 0.28 : 0.18
    const speedTarget = baseSpeed + (isSpeaking ? smoothAmpRef.current * 0.15 : 0)
    uniforms.uSpeed.value = uniforms.uSpeed.value * 0.98 + speedTarget * 0.02

    // Energy: 0 idle → 1 speaking — very slow palette shift (α=0.015)
    const energyTarget = isSpeaking ? 1.0 : isListening ? 0.55 : isThinking ? 0.35 : 0.0
    uniforms.uEnergy.value = uniforms.uEnergy.value * 0.985 + energyTarget * 0.015

    // Brightness: extremely narrow range — 0.95 to 1.02 (α=0.01, nearly static)
    const brightTarget = active ? 1.02 : 0.95
    uniforms.uBrightness.value = uniforms.uBrightness.value * 0.99 + brightTarget * 0.01

    if (meshRef.current) {
      // Scale breathing: very subtle ±4% pulse (was ±10%), slow lerp
      const scaleTarget = 1.0 + (isSpeaking ? smoothAmpRef.current * 0.04 : 0)
      const s = meshRef.current.scale.x * 0.97 + scaleTarget * 0.03
      meshRef.current.scale.setScalar(s)

      // Very slow ambient rotation
      const t = uniforms.uTime.value
      meshRef.current.rotation.y = t * 0.018
      meshRef.current.rotation.x = Math.sin(t * 0.033) * 0.010
    }
  })

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[0.65, 96, 96]} />
    </mesh>
  )
}

// ─── Ambient particles ────────────────────────────────────────────────────────

function OrbParticles({ isSpeaking, isListening }: { isSpeaking: boolean; isListening: boolean }) {
  const ref = useRef<THREE.Points>(null!)
  const count = 500
  const smoothOpRef = useRef(0.25)

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r     = 0.72 + Math.random() * 0.90
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      arr[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      arr[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i*3+2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.rotation.y = t * 0.038
    ref.current.rotation.x = Math.sin(t * 0.028) * 0.055
    // Smooth opacity — very slow transition (α=0.01)
    const opTarget = isSpeaking ? 0.50 : isListening ? 0.35 : 0.20
    smoothOpRef.current = smoothOpRef.current * 0.99 + opTarget * 0.01
    ;(ref.current.material as THREE.PointsMaterial).opacity = smoothOpRef.current
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.008}
        color="#5599ff"
        transparent
        opacity={0.22}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ─── Exported Avatar ──────────────────────────────────────────────────────────

export function Avatar({ isSpeaking, isListening, isThinking, audioAmplitude, onClick }: AvatarProps) {
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
        {/* Fixed intensity — Bloom must NOT toggle with speaking state or it strobes.
            The shader's per-pixel luminance variation drives the visual difference. */}
        <Bloom
          luminanceThreshold={0.15}
          luminanceSmoothing={0.92}
          height={250}
          intensity={1.4}
        />
      </EffectComposer>
    </group>
  )
}
