'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Geometry: dense horizontal rings on a unit sphere ────────────────────────
// The vertex shader displaces each point outward using layered noise,
// creating the topographic-map / amorphous-blob look.

function buildGeometry(): THREE.BufferGeometry {
  const N_RINGS = 340   // density → more rings = richer topographic look
  const PTS     = 256   // points per ring
  const R       = 1.40  // base sphere radius

  const verts: number[] = []

  for (let i = 0; i < N_RINGS; i++) {
    const yn = -1 + (i / (N_RINGS - 1)) * 2   // −1 … +1
    const r  = Math.sqrt(Math.max(0, 1 - yn * yn)) * R
    if (r < 0.045 * R) continue                 // skip tiny rings near poles

    const y = yn * R

    for (let j = 0; j < PTS; j++) {
      const th0 = (j       / PTS) * Math.PI * 2
      const th1 = ((j + 1) / PTS) * Math.PI * 2
      verts.push(
        r * Math.sin(th0), y, r * Math.cos(th0),
        r * Math.sin(th1), y, r * Math.cos(th1),
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  return geo
}

// ── Vertex shader ─────────────────────────────────────────────────────────────
// Displaces each vertex radially outward using summed sine-wave interference.
// Multiple frequencies produce big lobes + fine surface texture.
// Where rings bunch together (convex ridges) they glow via additive blending.

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uSpeaking;
  uniform float uListening;
  uniform float uThinking;

  void main() {
    vec3 pos = position;
    vec3 dir = normalize(pos);

    // Active-state energy multipliers
    float spk = uSpeaking  * (1.0 + uAmplitude * 2.8);
    float lst = uListening * 0.65;
    float thk = uThinking  * 0.50;

    // ── Noise layer 1: large slow lobes ──────────────────────────────────────
    float n1 =
      sin(pos.x * 1.50 + pos.y * 1.80 + uTime * 0.50) *
      cos(pos.y * 1.35 + pos.z * 2.00 + uTime * 0.38);

    // ── Noise layer 2: mid-frequency undulations ─────────────────────────────
    float n2 =
      sin(pos.y * 3.40 + pos.z * 2.60 + uTime * 1.05) *
      cos(pos.x * 3.00 + pos.y * 2.30 + uTime * 0.75);

    // ── Noise layer 3: high-frequency surface texture ────────────────────────
    float n3 =
      sin(pos.x * 6.50 + pos.y * 6.00 + uTime * 2.10) *
      cos(pos.z * 6.20 + pos.x * 6.80 + uTime * 2.70);

    // ── Noise layer 4: ultra-fine thinking shimmer ───────────────────────────
    float n4 =
      sin(pos.y * 13.5 + uTime * 5.20) *
      cos(pos.x * 13.0 + uTime * 4.60);

    // ── Listening pulse: outward ripple from centre ───────────────────────────
    float pulse = sin(length(pos) * 5.5 - uTime * 3.2) * lst * 0.10;

    float d =
      n1 * (0.32 + spk * 0.22 + lst * 0.06) +
      n2 * (0.15 + spk * 0.12 + lst * 0.05) +
      n3 * (0.058 + thk * 0.038) +
      n4 *  0.024 * uThinking +
      pulse;

    pos += dir * d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// ── Fragment shader ───────────────────────────────────────────────────────────
// Low base opacity + additive blending = lines glow bright where they overlap.

const FRAG = /* glsl */`
  uniform float uOpacity;
  uniform float uSpeaking;
  uniform float uListening;

  void main() {
    float bright = 1.0 + uSpeaking * 0.55 + uListening * 0.25;
    gl_FragColor = vec4(vec3(bright), uOpacity);
  }
`

// ── Component ─────────────────────────────────────────────────────────────────

export interface WireframeHeadProps {
  isSpeaking: boolean
  isListening: boolean
  isThinking: boolean
  audioAmplitude: number
  onClick?: () => void
}

export function WireframeHead({
  isSpeaking,
  isListening,
  isThinking,
  audioAmplitude,
  onClick,
}: WireframeHeadProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const geometry = useMemo(() => buildGeometry(), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uAmplitude: { value: 0 },
      uSpeaking:  { value: 0 },
      uListening: { value: 0 },
      uThinking:  { value: 0 },
      uOpacity:   { value: 0.11 },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const u = material.uniforms

    u.uTime.value      = t
    u.uAmplitude.value = audioAmplitude
    u.uSpeaking.value  = THREE.MathUtils.lerp(u.uSpeaking.value,  isSpeaking  ? 1 : 0, 0.10)
    u.uListening.value = THREE.MathUtils.lerp(u.uListening.value, isListening ? 1 : 0, 0.08)
    u.uThinking.value  = THREE.MathUtils.lerp(u.uThinking.value,  isThinking  ? 1 : 0, 0.07)

    // Opacity: low base so additive stacking creates the glow
    const base = isSpeaking ? 0.14 : isListening ? 0.12 : isThinking ? 0.11 : 0.10
    u.uOpacity.value = base + Math.sin(t * 1.1) * 0.012

    if (groupRef.current) {
      // Slow continuous multi-axis rotation — reveals 3D form from all angles
      groupRef.current.rotation.y = t * 0.14  + Math.sin(t * 0.22) * 0.35
      groupRef.current.rotation.x = Math.sin(t * 0.17) * 0.22
      groupRef.current.rotation.z = Math.sin(t * 0.13) * 0.14

      // Blob swells with audio amplitude when speaking
      const s = isSpeaking ? 1 + audioAmplitude * 0.10 : 1.0
      groupRef.current.scale.setScalar(
        THREE.MathUtils.lerp(groupRef.current.scale.x, s, 0.1)
      )
    }
  })

  return (
    <>
      <group ref={groupRef} onClick={onClick}>
        <lineSegments geometry={geometry} material={material} />
      </group>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.0}
          luminanceSmoothing={0.85}
          height={350}
          intensity={isSpeaking ? 2.8 : isListening ? 2.0 : 1.3}
        />
      </EffectComposer>
    </>
  )
}
