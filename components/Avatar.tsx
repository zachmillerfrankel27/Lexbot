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

// ─── Fragment shader — v7: ridge wisps, fixed palette, glitter-ready ─────────
// Built on v6 architecture (anti-correlated veils, Bloom threshold=0).
// New in v7:
//   • Ridge noise (1 - |snoise|) draws thin wispy filaments — the gossamer
//     veils visible in the reference images — because ridges fire only at the
//     zero-crossings of noise, creating narrow bright lines not blobs
//   • Fixed veil palette: (0.10,0.25,0.90) blue → (0.45,0.08,0.85) violet
//     (v6 warm end was too magenta due to high red channel)
//   • Raised dark base to (0.05,0.03,0.22) so gaps have visible deep color
//   • Subtle inner luminosity: soft blue-purple glow toward centre of face
//   • Stronger hotspot: threshold lowered, multiplier raised, always visible

const FRAGMENT_SHADER = /* glsl */`
${NOISE_GLSL}
uniform float uTime;
uniform float uSpeed;   // 0.25 idle → 0.50 speaking
uniform float uEnergy;  // 0=idle, 1=speaking
uniform float uBrightness;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldNormal;

void main(){
  float NdotV  = max(dot(vNormal,vViewDir),0.);
  float fresnel= pow(1.-NdotV,2.0);
  float st     = uTime * uSpeed;
  vec3  n      = vWorldNormal;

  // ── Large veil layers (anti-correlated, v6 approach) ──────────────────
  float p1 = snoise(n*2.0 + vec3( st*0.55, 0.,      st*0.40)) * .5+.5;
  float p2 = snoise(n*2.8 + vec3(-st*0.40, st*0.45, 0.     )) * .5+.5;

  // ── Ridge noise — wispy filaments ─────────────────────────────────────
  // 1-|raw| peaks sharply at noise zero-crossings → thin bright lines
  float r1 = 1.0 - abs(snoise(n*3.5 + vec3(-st*0.35, 0.,       st*0.50)));
  float r2 = 1.0 - abs(snoise(n*5.2 + vec3( st*0.28, -st*0.38, 0.     )));

  // ── Deep blue-purple base — visible in dark gaps ───────────────────────
  vec3 col = vec3(0.05, 0.03, 0.22);

  // Subtle inner luminosity: orb is softly lit from within
  col += vec3(0.04, 0.08, 0.35) * NdotV * 0.30;

  // ── Main veil — corrected palette, blue→violet (not magenta) ──────────
  float veilMask = smoothstep(0.32, 0.78, p1);
  vec3  veilCol  = mix(
    vec3(0.10, 0.25, 0.90),           // proper electric blue-purple
    vec3(0.45, 0.08, 0.85),           // proper violet (not magenta)
    smoothstep(0.30, 0.70, p2)
  );
  col += veilCol * veilMask * 0.60;

  // ── Wispy filaments — thin gossamer lines from ridge noise ─────────────
  float wisp1 = smoothstep(0.62, 0.88, r1);
  float wisp2 = smoothstep(0.68, 0.92, r2);
  col += vec3(0.50, 0.25, 1.00) * wisp1 * 0.75;   // purple wisps
  col += vec3(0.20, 0.55, 1.00) * wisp2 * 0.55;   // blue wisps

  // ── White-cyan hotspot — more prominent, always present at idle ────────
  float hot = smoothstep(0.38, 0.72, p1 * p2);
  col += vec3(0.75, 0.88, 1.00) * hot * 2.2 * (0.45 + uEnergy * 0.55);

  // ── Structural rim — broad electric ring + crisp silhouette highlight ──
  col += vec3(0.10, 0.45, 1.00) * pow(fresnel, 1.5) * 2.5;
  col += vec3(0.50, 0.85, 1.00) * pow(fresnel, 6.0) * 4.0;

  col *= uBrightness;

  float alpha = mix(0.97, 0.55, fresnel);
  gl_FragColor = vec4(col, alpha);
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

    // Speed: moderate — veils should drift visibly but calmly
    const baseSpeed = isSpeaking ? 0.50 : isListening ? 0.38 : isThinking ? 0.30 : 0.25
    const speedTarget = baseSpeed + (isSpeaking ? smoothAmpRef.current * 0.10 : 0)
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

// ─── Glitter particles — two layers ──────────────────────────────────────────
// Layer 1 (glitterRef): 1200 fine particles hugging the surface, vertex-coloured
//   blue-white to cyan-white for the sparkling "glitter" quality in the references.
// Layer 2 (outerRef): 400 slightly larger particles scattered further out,
//   counter-rotating for depth and the hazy outer scatter in reference image 1.

function OrbParticles({ isSpeaking, isListening }: { isSpeaking: boolean; isListening: boolean }) {
  const glitterRef = useRef<THREE.Points>(null!)
  const outerRef   = useRef<THREE.Points>(null!)
  const smoothOpRef = useRef(0.22)

  const glitterCount = 1200
  const outerCount   = 400

  const { glitterPos, glitterCol } = useMemo(() => {
    const pos = new Float32Array(glitterCount * 3)
    const col = new Float32Array(glitterCount * 3)
    for (let i = 0; i < glitterCount; i++) {
      const r     = 0.67 + Math.random() * 0.38   // tight around sphere surface
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i*3+2] = r * Math.cos(phi)
      // Colour: range from pale blue to white-cyan — gives colour variance
      const t = Math.random()
      col[i*3]   = 0.30 + t * 0.50   // R 0.30→0.80
      col[i*3+1] = 0.45 + t * 0.45   // G 0.45→0.90
      col[i*3+2] = 1.00               // B always 1
    }
    return { glitterPos: pos, glitterCol: col }
  }, [])

  const outerPos = useMemo(() => {
    const arr = new Float32Array(outerCount * 3)
    for (let i = 0; i < outerCount; i++) {
      const r     = 0.85 + Math.random() * 0.90   // scattered further out
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      arr[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      arr[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i*3+2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Inner glitter rotates with the orb
    if (glitterRef.current) {
      glitterRef.current.rotation.y = t * 0.040
      glitterRef.current.rotation.x = Math.sin(t * 0.030) * 0.055
    }
    // Outer scatter counter-rotates slowly — adds depth
    if (outerRef.current) {
      outerRef.current.rotation.y = -t * 0.022
      outerRef.current.rotation.x = Math.cos(t * 0.018) * 0.040
    }

    const opTarget = isSpeaking ? 0.55 : isListening ? 0.38 : 0.22
    smoothOpRef.current = smoothOpRef.current * 0.99 + opTarget * 0.01
    const op = smoothOpRef.current
    if (glitterRef.current)
      (glitterRef.current.material as THREE.PointsMaterial).opacity = op
    if (outerRef.current)
      (outerRef.current.material as THREE.PointsMaterial).opacity = op * 0.45
  })

  return (
    <>
      <points ref={glitterRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[glitterPos, 3]} />
          <bufferAttribute attach="attributes-color"    args={[glitterCol, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.005}
          vertexColors
          transparent
          opacity={0.22}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[outerPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.009}
          color="#7aadff"
          transparent
          opacity={0.12}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </>
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
        {/* luminanceThreshold=0: every pixel gets a proportional soft glow.
            No threshold boundary = no pixels flickering in/out of bloom = no strobe. */}
        <Bloom
          luminanceThreshold={0}
          luminanceSmoothing={0.9}
          height={300}
          intensity={0.5}
        />
      </EffectComposer>
    </group>
  )
}
