'use client'

import { useRef, useEffect, useMemo, Component, ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  isSpeaking: boolean
  isListening: boolean
  isThinking: boolean
  audioAmplitude: number
  onClick: () => void
}

// ─── Error boundary — if the face.glb fails to load, show an orb ─────────────

interface EBState { hasError: boolean }
export class AvatarErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  EBState
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ─── Ambient particles ────────────────────────────────────────────────────────

function Particles({ isSpeaking }: { isSpeaking: boolean }) {
  const ref = useRef<THREE.Points>(null!)
  const count = 300

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14
      arr[i * 3 + 1] = (Math.random() - 0.5) * 14
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6 - 3
    }
    return arr
  }, [])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ref.current) {
      ref.current.rotation.y = t * 0.018
      ref.current.rotation.x = Math.sin(t * 0.05) * 0.05
      // Particles drift outward a little when speaking
      ;(ref.current.material as THREE.PointsMaterial).opacity = isSpeaking ? 0.8 : 0.5
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#6644cc"
        transparent
        opacity={0.5}
        sizeAttenuation
      />
    </points>
  )
}

// ─── Glowing energy ring around the face ─────────────────────────────────────

function EnergyRing({
  isListening,
  isThinking,
  isSpeaking,
}: {
  isListening: boolean
  isThinking: boolean
  isSpeaking: boolean
}) {
  const ref = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)

  const color = isListening
    ? '#4466ff'
    : isThinking
    ? '#9933ff'
    : isSpeaking
    ? '#f5c842'
    : '#221144'

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ref.current) {
      ref.current.rotation.z = t * (isSpeaking ? 1.5 : 0.4)
      const pulse = isListening || isThinking || isSpeaking
        ? 0.5 + Math.sin(t * (isSpeaking ? 6 : 2)) * 0.15
        : 0.15
      if (matRef.current) matRef.current.opacity = pulse
    }
  })

  return (
    <mesh ref={ref} position={[0, 0, -0.3]}>
      <torusGeometry args={[1.35, 0.008, 8, 80]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={0.15}
      />
    </mesh>
  )
}

// ─── The face itself ──────────────────────────────────────────────────────────

function FaceModel({
  isSpeaking,
  isListening,
  audioAmplitude,
}: {
  isSpeaking: boolean
  isListening: boolean
  audioAmplitude: number
}) {
  const gltf = useGLTF('/face.glb')
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null!)
  const faceMeshRef = useRef<THREE.Mesh | null>(null)
  const blinkRef = useRef({ nextBlink: 2 + Math.random() * 4, blinking: false, progress: 0 })

  // Auto-scale and center the model on load
  useEffect(() => {
    const scene = gltf.scene
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    const cam = camera as THREE.PerspectiveCamera
    const fovRad = cam.fov * (Math.PI / 180)
    const dist = cam.position.z
    const visibleHeight = 2 * dist * Math.tan(fovRad / 2)

    // Scale so the face fills ~65% of the viewport height
    const targetH = visibleHeight * 0.65
    const scale = targetH / size.y

    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale)
      groupRef.current.position.set(
        -center.x * scale,
        -center.y * scale - 0.1,
        -center.z * scale
      )
    }

    // Find the skinned/morph mesh
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        faceMeshRef.current = mesh
      }
    })
  }, [gltf.scene, camera])

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    const mesh = faceMeshRef.current

    // ── Idle head sway ──
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.38) * 0.055
      groupRef.current.rotation.x = Math.sin(t * 0.22) * 0.025 - 0.04
    }

    if (!mesh?.morphTargetInfluences || !mesh?.morphTargetDictionary) return
    const dict = mesh.morphTargetDictionary
    const inf = mesh.morphTargetInfluences

    // ── Jaw open (lip sync) ──
    if (dict['jawOpen'] !== undefined) {
      const target = isSpeaking ? Math.min(audioAmplitude * 5, 0.75) : 0
      inf[dict['jawOpen']] = THREE.MathUtils.lerp(inf[dict['jawOpen']], target, 0.28)
    }

    // ── Mouth funnel (vowels) ──
    if (dict['mouthFunnel'] !== undefined) {
      const target = isSpeaking
        ? Math.max(0, Math.sin(t * 9) * 0.2 * audioAmplitude)
        : 0
      inf[dict['mouthFunnel']] = THREE.MathUtils.lerp(
        inf[dict['mouthFunnel']] ?? 0,
        target,
        0.22
      )
    }

    // ── Subtle resting smile ──
    if (dict['mouthSmileLeft'] !== undefined) {
      inf[dict['mouthSmileLeft']] = THREE.MathUtils.lerp(
        inf[dict['mouthSmileLeft']] ?? 0,
        0.12,
        0.05
      )
    }
    if (dict['mouthSmileRight'] !== undefined) {
      inf[dict['mouthSmileRight']] = THREE.MathUtils.lerp(
        inf[dict['mouthSmileRight']] ?? 0,
        0.12,
        0.05
      )
    }

    // ── Eyebrow raise when listening ──
    if (dict['browInnerUp'] !== undefined) {
      inf[dict['browInnerUp']] = THREE.MathUtils.lerp(
        inf[dict['browInnerUp']] ?? 0,
        isListening ? 0.45 : 0,
        0.08
      )
    }

    // ── Eye blinking ──
    const blink = blinkRef.current
    blink.nextBlink -= delta
    if (blink.nextBlink <= 0 && !blink.blinking) {
      blink.blinking = true
      blink.progress = 0
      blink.nextBlink = 3 + Math.random() * 5
    }
    if (blink.blinking) {
      blink.progress += delta * 9
      const val = Math.sin(blink.progress * Math.PI)
      if (dict['eyeBlinkLeft'] !== undefined) inf[dict['eyeBlinkLeft']] = val
      if (dict['eyeBlinkRight'] !== undefined) inf[dict['eyeBlinkRight']] = val
      if (blink.progress >= 1) {
        blink.blinking = false
        if (dict['eyeBlinkLeft'] !== undefined) inf[dict['eyeBlinkLeft']] = 0
        if (dict['eyeBlinkRight'] !== undefined) inf[dict['eyeBlinkRight']] = 0
      }
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
    </group>
  )
}

// Preload the model so there's no pop-in
useGLTF.preload('/face.glb')

// ─── Fallback orb — shown if face.glb didn't load ────────────────────────────

function OrbFallback({
  isSpeaking,
  isListening,
}: {
  isSpeaking: boolean
  isListening: boolean
}) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ref.current) {
      ref.current.rotation.y = t * 0.3
      const s = 1 + (isListening || isSpeaking ? Math.sin(t * 6) * 0.04 : 0)
      ref.current.scale.setScalar(s)
    }
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.8, 64, 64]} />
      <meshStandardMaterial
        color="#3322aa"
        emissive="#220066"
        roughness={0.1}
        metalness={0.8}
      />
    </mesh>
  )
}

// ─── Lighting setup ───────────────────────────────────────────────────────────

function Lighting({ isSpeaking }: { isSpeaking: boolean }) {
  const leftRef = useRef<THREE.PointLight>(null!)
  const rightRef = useRef<THREE.PointLight>(null!)

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    // Rim lights pulse gently when speaking
    if (leftRef.current) {
      leftRef.current.intensity = isSpeaking ? 3.5 + Math.sin(t * 8) * 0.5 : 2.5
    }
    if (rightRef.current) {
      rightRef.current.intensity = isSpeaking ? 3.5 + Math.sin(t * 8 + 1) * 0.5 : 2.5
    }
  })

  return (
    <>
      {/* Subtle fill */}
      <ambientLight intensity={0.06} color="#08031a" />
      {/* Key light — warm overhead */}
      <directionalLight position={[0, 4, 3]} intensity={0.7} color="#f0dfc0" />
      {/* Left rim — blue */}
      <pointLight ref={leftRef} position={[-3, 0.5, -1]} intensity={2.5} color="#3355ff" />
      {/* Right rim — purple */}
      <pointLight ref={rightRef} position={[3, 0.5, -1]} intensity={2.5} color="#aa33ff" />
      {/* Under-chin — deep blue for dramatic shadow */}
      <pointLight position={[0, -2, 1]} intensity={0.4} color="#112266" />
      {/* Top spot */}
      <spotLight
        position={[0, 5, 2]}
        intensity={1.2}
        color="#ffffff"
        angle={0.25}
        penumbra={0.6}
      />
    </>
  )
}

// ─── Main exported Avatar component ──────────────────────────────────────────

export function Avatar({ isSpeaking, isListening, isThinking, audioAmplitude, onClick }: AvatarProps) {
  return (
    <group onClick={onClick}>
      <Lighting isSpeaking={isSpeaking} />
      <Particles isSpeaking={isSpeaking} />
      <EnergyRing isSpeaking={isSpeaking} isListening={isListening} isThinking={isThinking} />

      <AvatarErrorBoundary
        fallback={<OrbFallback isSpeaking={isSpeaking} isListening={isListening} />}
      >
        <FaceModel
          isSpeaking={isSpeaking}
          isListening={isListening}
          audioAmplitude={audioAmplitude}
        />
      </AvatarErrorBoundary>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.25}
          luminanceSmoothing={0.85}
          height={300}
          intensity={isSpeaking ? 1.8 : 1.2}
        />
        <Vignette eskil={false} offset={0.05} darkness={0.92} />
      </EffectComposer>
    </group>
  )
}
