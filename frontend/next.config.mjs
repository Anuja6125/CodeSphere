/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
