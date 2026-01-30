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
    // Only apply proxy rewrite if API_URL doesn't start with /
    // (i.e., it's an absolute URL like http://localhost:8000)
    if (API_URL.startsWith('/')) {
      // Runtime config will handle relative URLs
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
