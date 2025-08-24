/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Optional: if you ever hit TypeScript build errors and want to ship anyway,
  // flip this to true. (Safer to keep default false; leave commented unless needed.)
  // typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
