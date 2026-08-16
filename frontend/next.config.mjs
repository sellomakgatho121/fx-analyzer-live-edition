/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // Static export: the Express backend (same container, same origin) serves
  // the generated `out/` directory plus the REST + Socket.IO APIs. No Next
  // server runtime is needed on Render, which keeps the free tier within its
  // 512MB memory budget.
  output: 'export',
  images: { unoptimized: true },
  // Required for Three.js to work with Vercel
  transpilePackages: ['three'],
};

export default nextConfig;
