import dynamic from 'next/dynamic'

// LexBot uses WebGL + Web Speech API — must be client-side only
const LexBot = dynamic(() => import('@/components/LexBot').then(m => m.LexBot), {
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
  return <LexBot />
}
