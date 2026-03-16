'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Head shape: returns (x, z) at a given height (y) and angle (theta) ────────
//
// Coordinate system:
//   y  = up/down    (−1.2 = chin, +1.1 = crown)
//   x  = left/right
//   z  = front/back (positive = front of face)

function headXZ(yn: number, theta: number): [number, number] {
  // yn: normalised height, −1..1
  if (yn < -1 || yn > 1) return [0, 0]

  // Ellipsoid base radius at this height
  let r = Math.sqrt(Math.max(0, 1 - yn * yn * 0.9))

  const cosT = Math.cos(theta) // +1 = front face, −1 = back of skull
  const sinT = Math.sin(theta) // ±1 = left / right temples

  // Head is narrower side-to-side than front-to-back
  const xScale = 0.70
  const zScale = 0.88

  // Jaw tapers below mid-face
  if (yn < -0.18) {
    const f = (-yn - 0.18) / 0.82   // 0 at jaw start → 1 at chin
    r *= 1 - f * 0.42
  }

  // Cranium narrows near crown
  if (yn > 0.62) {
    r *= 1 - (yn - 0.62) * 0.65
  }

  // Temple indentation (sides, mid-height)
  if (yn > -0.15 && yn < 0.35) {
    r *= 1 - Math.abs(sinT) * 0.04
  }

  // Slight forward brow/forehead protrusion
  let zBump = 0
  if (cosT > 0.25 && yn > -0.05 && yn < 0.52) {
    const frontness = (cosT - 0.25) / 0.75
    const heightFit = 1 - Math.abs(yn - 0.22) * 3.5
    zBump = Math.max(0, frontness * heightFit) * 0.055
  }

  // Occipital bump (back of skull, just above mid)
  if (cosT < -0.4 && yn > 0.05 && yn < 0.45) {
    zBump += (cosT + 0.4) * 0.03
  }

  return [r * xScale * sinT, r * zScale * cosT + zBump]
}

// ── Build all line geometry ────────────────────────────────────────────────────

function buildGeometries() {
  const geos: THREE.BufferGeometry[] = []
  const SCALE = 1.18
  const Y_BOT = -1.2
  const Y_TOP = 1.1
  const N_RINGS = 62      // horizontal contour lines
  const PTS = 128         // resolution per ring
  const N_MERIDIANS = 18  // vertical accent lines
  const M_STEPS = 90      // resolution per meridian

  // Horizontal contour rings
  for (let i = 0; i < N_RINGS; i++) {
    const t = i / (N_RINGS - 1)
    // Non-uniform spacing: slightly denser in the face region
    const yCurved = t < 0.5
      ? t * t * 2 * (Y_TOP - Y_BOT) + Y_BOT
      : (-(1 - t) * (1 - t) * 2 + 1) * (Y_TOP - Y_BOT) + Y_BOT
    const y = ((Y_BOT + (Y_TOP - Y_BOT) * t)) * SCALE

    const yn = y / (SCALE * 1.15)
    // Skip rings where the cross-section collapses
    const testR = Math.sqrt(Math.max(0, 1 - yn * yn * 0.9))
    if (testR < 0.04) continue

    const verts: number[] = []
    for (let j = 0; j < PTS; j++) {
      const th0 = (j / PTS) * Math.PI * 2
      const th1 = ((j + 1) / PTS) * Math.PI * 2
      const [x0, z0] = headXZ(yn, th0)
      const [x1, z1] = headXZ(yn, th1)
      verts.push(x0 * SCALE, y, z0 * SCALE, x1 * SCALE, y, z1 * SCALE)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geos.push(geo)
  }

  // Vertical meridian lines
  for (let i = 0; i < N_MERIDIANS; i++) {
    const theta = (i / N_MERIDIANS) * Math.PI * 2
    const verts: number[] = []

    for (let j = 0; j < M_STEPS; j++) {
      const t0 = j / M_STEPS
      const t1 = (j + 1) / M_STEPS
      const y0 = (Y_BOT + (Y_TOP - Y_BOT) * t0) * SCALE
      const y1 = (Y_BOT + (Y_TOP - Y_BOT) * t1) * SCALE
      const yn0 = y0 / (SCALE * 1.15)
      const yn1 = y1 / (SCALE * 1.15)
      if (yn0 < -1 || yn0 > 1 || yn1 < -1 || yn1 > 1) continue

      const [x0, z0] = headXZ(yn0, theta)
      const [x1, z1] = headXZ(yn1, theta)
      verts.push(x0 * SCALE, y0, z0 * SCALE, x1 * SCALE, y1, z1 * SCALE)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geos.push(geo)
  }

  return geos
}

// ── Shader material (shared across all line objects) ──────────────────────────

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uSpeaking;
  uniform float uListening;
  uniform float uThinking;

  void main() {
    vec3 pos = position;
    vec3 dir = normalize(pos);

    // Idle organic breathing
    float idle = sin(pos.y * 2.8 + uTime * 0.9) * cos(pos.x * 2.2 + uTime * 0.65) * 0.009;

    // Speaking distortion — amplitude-driven
    float speak = sin(pos.y * 5.0 + uTime * 3.2) * cos(pos.x * 3.5 + uTime * 2.8) * sin(pos.z * 4.0 + uTime * 2.2);
    float speakStr = uSpeaking * (0.022 + uAmplitude * 0.14);

    // Listening ripple outward from centre
    float listen = sin(length(pos.xz) * 5.5 - uTime * 2.8) * 0.01 * uListening;

    // Thinking shimmer — fast fine lines
    float think = sin(pos.y * 12.0 + uTime * 5.0) * 0.006 * uThinking;

    pos += dir * (idle + speak * speakStr + listen + think);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const FRAG = /* glsl */`
  uniform float uOpacity;
  uniform float uSpeaking;
  uniform float uListening;

  void main() {
    float bright = 1.0 + uSpeaking * 0.35 + uListening * 0.15;
    gl_FragColor = vec4(vec3(bright), uOpacity);
  }
`

// ── Main component ─────────────────────────────────────────────────────────────

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

  const geometries = useMemo(() => buildGeometries(), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uAmplitude: { value: 0 },
      uSpeaking:  { value: 0 },
      uListening: { value: 0 },
      uThinking:  { value: 0 },
      uOpacity:   { value: 0.48 },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent: true,
  }), [])

  // Cleanup on unmount
  useEffect(() => () => {
    geometries.forEach(g => g.dispose())
    material.dispose()
  }, [geometries, material])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const u = material.uniforms

    u.uTime.value      = t
    u.uAmplitude.value = audioAmplitude
    u.uSpeaking.value  = THREE.MathUtils.lerp(u.uSpeaking.value,  isSpeaking  ? 1 : 0, 0.12)
    u.uListening.value = THREE.MathUtils.lerp(u.uListening.value, isListening ? 1 : 0, 0.1)
    u.uThinking.value  = THREE.MathUtils.lerp(u.uThinking.value,  isThinking  ? 1 : 0, 0.08)

    // Opacity: breathes gently, brighter when active
    const base = isSpeaking ? 0.68 : isListening ? 0.55 : isThinking ? 0.50 : 0.42
    u.uOpacity.value = base + Math.sin(t * 1.4) * 0.04

    if (groupRef.current) {
      // Gentle idle sway
      groupRef.current.rotation.y = Math.sin(t * 0.27) * 0.16
      groupRef.current.rotation.x = Math.sin(t * 0.17) * 0.032 - 0.05
      // Subtle scale pulse when speaking
      const s = isSpeaking ? 1 + audioAmplitude * 0.06 : 1
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(groupRef.current.scale.x, s, 0.1))
    }
  })

  return (
    <>
      <group ref={groupRef} onClick={onClick}>
        {geometries.map((geo, i) => (
          <lineSegments key={i} geometry={geo} material={material} />
        ))}
      </group>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.0}
          luminanceSmoothing={0.9}
          height={400}
          intensity={isSpeaking ? 2.2 : isListening ? 1.6 : 1.1}
        />
      </EffectComposer>
    </>
  )
}
