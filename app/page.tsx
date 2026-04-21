import dynamic from 'next/dynamic'

// Orville uses WebGL + Web Speech API — must be client-side only
const Orville = dynamic(() => import('@/components/Orville').then(m => m.Orville), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <p className="text-gray-600 tracking-widest text-sm uppercase font-light">
        Initializing...
      </p>
    </div>
  ),
})

export default function Home() {
  return <Orville />
}
