import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    // Proxy /api requests to the backend Unix socket
    // Backend runs on Unix socket at /tmp/backend.sock
    return [
      {
        source: '/api/:path*',
        destination: 'unix:/tmp/backend.sock:/api/:path*',
      },
    ];
  },
};

export default nextConfig;
