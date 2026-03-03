import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow serving large 3D model from /public
  experimental: {
    serverComponentsExternalPackages: ['three'],
  },
}

export default nextConfig
