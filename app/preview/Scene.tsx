'use client'

import { Canvas } from '@react-three/fiber'
import { WireframeHead } from '@/components/WireframeHead'

interface SceneProps {
  isSpeaking: boolean
  isListening: boolean
  isThinking: boolean
  audioAmplitude: number
}

export default function Scene({ isSpeaking, isListening, isThinking, audioAmplitude }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 4.4], fov: 38 }}
      style={{ background: '#000' }}
      gl={{ antialias: true, alpha: false }}
    >
      <WireframeHead
        isSpeaking={isSpeaking}
        isListening={isListening}
        isThinking={isThinking}
        audioAmplitude={audioAmplitude}
      />
    </Canvas>
  )
}
