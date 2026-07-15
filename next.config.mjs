/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for Docker / VPS deployment.
  // (Ignored by Vercel, which uses its own build output.)
  output: "standalone",
  eslint: {
    // Prototype: don't fail production builds on lint; run `npm run lint` explicitly.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
