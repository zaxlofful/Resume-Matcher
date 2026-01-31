import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    // Proxy /api requests to the backend Unix socket
    // Backend runs on Unix socket at /run/backend.sock per FHS 3.0
    return [
      {
        source: '/api/:path*',
        destination: 'unix:/run/backend.sock:/api/:path*',
      },
    ];
  },
};

export default nextConfig;
