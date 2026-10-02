/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build a self-contained server in .next/standalone, which is what the Dockerfile copies.
  output: 'standalone',
};

export default nextConfig;
