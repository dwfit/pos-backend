/** @type {import('next').NextConfig} */
const API = process.env.API_URL || 'http://127.0.0.1:4000';

const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  env: { API_URL: API },

  async rewrites() {
    return [
      { source: '/api/callcenter/:path*', destination: `${API}/api/callcenter/:path*` },
      { source: '/api/menu/:path*', destination: `${API}/menu/:path*` },
      { source: '/api/settings/:path*',   destination: `${API}/settings/:path*` },
    ];
  },
};

export default nextConfig;
