import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@tari-project/wxtm-bridge-backend-api'],
  serverExternalPackages: ['lokijs', 'encoding', 'wagmi'],
  images: {
    loaderFile: './utils/imageLoader.ts',
    path: process.env.NEXT_PUBLIC_PATH,
  },
  output: 'export',
  devIndicators: {
    position: 'bottom-right',
  },
}

export default nextConfig
