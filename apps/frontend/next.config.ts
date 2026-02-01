import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    // Proxy /api_be requests to the backend server
    // The actual backend URL is configured at runtime via RUNTIME_API_URL
    // which defaults to http://localhost:8000 in the start.sh script
    return [
      {
        source: '/api_be/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
};

export default nextConfig;
