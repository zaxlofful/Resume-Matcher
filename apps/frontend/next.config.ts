import type { NextConfig } from 'next';

// API URL for Next.js rewrites
// Uses environment variable if set, otherwise defaults to backend on port 8000
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async rewrites() {
    // Only apply proxy rewrite if API_URL is an absolute URL (http://...)
    // Root-relative paths (starting with /) are handled by runtime config
    if (API_URL.startsWith('/')) {
      // Runtime config will handle relative paths
      return [];
    }
    return [
      {
        source: '/api_be/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
