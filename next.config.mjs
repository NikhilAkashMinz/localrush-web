/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build a self-contained server in .next/standalone, which is what the Dockerfile copies.
  output: 'standalone',
  poweredByHeader: false,
  // Safer defaults for every page and API reply. The site may use the location (for "use my
  // location") but never the camera or microphone, and other sites may not frame it.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
          // Browsers ignore this over plain http (localhost); on the live https site it keeps
          // every later visit on https.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
