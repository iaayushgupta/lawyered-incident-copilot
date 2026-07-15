/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Prototype: don't fail production builds on lint; run `npm run lint` explicitly.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
