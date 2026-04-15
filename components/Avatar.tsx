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

// ─── GLSL Simplex Noise (Stefan Gustavson) ────────────────────────────────────

const NOISE_GLSL = /* glsl */`
vec3  _m3(vec3  x){return x-floor(x*(1./289.))*289.;}
vec4  _m4(vec4  x){return x-floor(x*(1./289.))*289.;}
vec4  _p4(vec4  x){return _m4(((x*34.)+1.)*x);}
vec4  _ti(vec4  r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i =floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g =step(x0.yzx,x0.xyz);
  vec3 l =1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=_m3(i);
  vec4 p=_p4(_p4(_p4(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_ti(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// ─── Vertex shader ────────────────────────────────────────────────────────────
// Displacement is deliberately small (max ~0.045) so the sphere stays round.
// uSpeed scales the time axis so the orb is nearly still when idle.

const VERTEX_SHADER = /* glsl */`
${NOISE_GLSL}
uniform float uTime;
uniform float uSpeed;
uniform float uSmoothAmp;
uniform float uTurbulence;

varying vec3  vNormal;
varying vec3  vViewDir;
varying vec3  vWorldNormal;
varying float vDisp;

void main(){
  float st=uTime*uSpeed;
  // Tiny multi-octave displacement — keeps sphere silhouette round
  float n1=snoise(position*1.2+vec3(st*0.35));
  float n2=snoise(position*2.9+vec3(st*0.55,0.,st*0.42));
  float n3=snoise(position*5.8+vec3(st*0.82,st*0.67,0.));
  float disp=(n1*0.022+n2*0.011+n3*0.004)*(0.6+uSmoothAmp*1.8+uTurbulence*0.7);
  vDisp=disp;
  vNormal=normalize(normalMatrix*normal);
  vWorldNormal=normalize((modelMatrix*vec4(normal,0.)).xyz);
  vec4 mvPos=modelViewMatrix*vec4(position+normal*disp,1.);
  vViewDir=normalize(-mvPos.xyz);
  gl_Position=projectionMatrix*mvPos;
}
`

// ─── Fragment shader ──────────────────────────────────────────────────────────
// Plasma colour comes from layered noise — smooth quadratic boost (no sharp
// pow-n exponent) to prevent flickering.  Bright peaks trigger Bloom.

const FRAGMENT_SHADER = /* glsl */`
${NOISE_GLSL}
uniform float uTime;
uniform float uSpeed;
uniform float uSmoothAmp;
uniform float uBrightness;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorCore;
uniform vec3  uRimColor;

varying vec3  vNormal;
varying vec3  vViewDir;
varying vec3  vWorldNormal;
varying float vDisp;

void main(){
  float NdotV=max(dot(vNormal,vViewDir),0.);
  float fresnel=pow(1.-NdotV,2.5);

  float st=uTime*uSpeed;
  // Three plasma layers at different scales/speeds
  float p1=snoise(vWorldNormal*2.0+vec3(st*0.28))*0.5+0.5;
  float p2=snoise(vWorldNormal*4.5+vec3(st*0.44,0.,st*0.33))*0.5+0.5;
  float p3=snoise(vWorldNormal*9.2+vec3(st*0.72))*0.5+0.5;
  float plasma=p1*0.55+p2*0.30+p3*0.15;

  // Smooth quadratic boost — no sharp exponent that causes flicker
  float glow=plasma*plasma*2.4;

  // Core: front-facing surface glows, amplitude-driven via smoothed value
  float core=pow(NdotV,1.8)*(0.5+uSmoothAmp*1.6);

  vec3 col=uColorA;
  col+=uColorB*glow;
  col+=uColorCore*core;
  col+=uRimColor*fresnel*1.8;
  // Raised ridges pick up tendril colour
  col+=max(vDisp*10.,0.)*uColorB*0.4;
  col*=uBrightness;

  float alpha=mix(0.96,0.70,fresnel);
  gl_FragColor=vec4(col,alpha);
}
`

// ─── Status colour + animation targets ───────────────────────────────────────
// uColorB luminance must exceed the Bloom threshold (0.15).
// Confirmed: all B values have luminance 0.21-0.30 before the glow multiplier.

type Target = {
  A: [number,number,number]; B: [number,number,number]
  core: [number,number,number]; rim: [number,number,number]
  brightness: number; turbulence: number; speed: number
}

const TARGETS: Record<string, Target> = {
  idle:      { A:[0.01,0.00,0.05], B:[0.26,0.08,0.82], core:[0.55,0.22,0.90], rim:[0.18,0.07,0.68], brightness:0.85, turbulence:0.00, speed:0.28 },
  listening: { A:[0.00,0.01,0.12], B:[0.14,0.24,0.90], core:[0.32,0.54,1.00], rim:[0.14,0.28,1.00], brightness:1.05, turbulence:0.12, speed:0.58 },
  thinking:  { A:[0.03,0.00,0.09], B:[0.38,0.08,0.86], core:[0.62,0.28,1.00], rim:[0.48,0.12,0.90], brightness:0.96, turbulence:0.08, speed:0.42 },
  speaking:  { A:[0.02,0.00,0.08], B:[0.28,0.14,0.90], core:[0.78,0.52,1.00], rim:[0.38,0.26,1.00], brightness:1.15, turbulence:0.26, speed:1.00 },
}

// ─── Plasma Sphere ────────────────────────────────────────────────────────────

function PlasmaSphere({ isSpeaking, isListening, isThinking, audioAmplitude }: Omit<AvatarProps,'onClick'>) {
  const meshRef = useRef<THREE.Mesh>(null!)

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uSpeed:      { value: 0.28 },    // start at idle speed
    uSmoothAmp:  { value: 0 },
    uTurbulence: { value: 0 },
    uColorA:     { value: new THREE.Color(0.01, 0.00, 0.05) },
    uColorB:     { value: new THREE.Color(0.26, 0.08, 0.82) },
    uColorCore:  { value: new THREE.Color(0.55, 0.22, 0.90) },
    uRimColor:   { value: new THREE.Color(0.18, 0.07, 0.68) },
    uBrightness: { value: 0.85 },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite:  false,
  }), [uniforms])

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime()

    // Heavily smoothed amplitude — prevents brightness strobing
    uniforms.uSmoothAmp.value = THREE.MathUtils.lerp(uniforms.uSmoothAmp.value, audioAmplitude, 0.04)

    const tgt = isSpeaking ? TARGETS.speaking
      : isListening  ? TARGETS.listening
      : isThinking   ? TARGETS.thinking
      : TARGETS.idle

    uniforms.uSpeed.value      = THREE.MathUtils.lerp(uniforms.uSpeed.value,      tgt.speed,      0.03)
    uniforms.uTurbulence.value = THREE.MathUtils.lerp(uniforms.uTurbulence.value, tgt.turbulence, 0.04)

    // Brightness driven by smoothed amp only — no raw amplitude on brightness
    const targetBright = tgt.brightness + (isSpeaking ? uniforms.uSmoothAmp.value * 0.35 : 0)
    uniforms.uBrightness.value = THREE.MathUtils.lerp(uniforms.uBrightness.value, targetBright, 0.05)

    const lc = (u: THREE.Color, c: [number,number,number]) => {
      u.r = THREE.MathUtils.lerp(u.r, c[0], 0.04)
      u.g = THREE.MathUtils.lerp(u.g, c[1], 0.04)
      u.b = THREE.MathUtils.lerp(u.b, c[2], 0.04)
    }
    lc(uniforms.uColorA.value,    tgt.A)
    lc(uniforms.uColorB.value,    tgt.B)
    lc(uniforms.uColorCore.value, tgt.core)
    lc(uniforms.uRimColor.value,  tgt.rim)

    // Very slow ambient rotation — does NOT speed up with speech
    // (movement comes from noise evolution via uSpeed, not mesh rotation)
    if (meshRef.current) {
      const t = uniforms.uTime.value
      meshRef.current.rotation.y = t * 0.025
      meshRef.current.rotation.x = Math.sin(t * 0.04) * 0.015
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

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r     = 0.72 + Math.random() * 0.90   // shell just outside the orb
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
    // Slow, constant drift — no rapid oscillation
    ref.current.rotation.y = t * 0.04
    ref.current.rotation.x = Math.sin(t * 0.03) * 0.06
    const mat = ref.current.material as THREE.PointsMaterial
    const targetOpacity = isSpeaking ? 0.65 : isListening ? 0.45 : 0.25
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.04)
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.008}
        color="#7744ee"
        transparent
        opacity={0.25}
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
        <Bloom
          luminanceThreshold={0.15}
          luminanceSmoothing={0.92}
          height={400}
          // Fixed per-status intensity — NOT tied to raw audioAmplitude
          // (raw amp in Bloom causes strobing)
          intensity={isSpeaking ? 2.2 : isListening ? 1.7 : isThinking ? 1.5 : 1.0}
        />
      </EffectComposer>
    </group>
  )
}
