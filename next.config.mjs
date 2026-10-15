/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app doesn't use next/image; switching the optimizer off removes the
  // /_next/image endpoint and its attack surface entirely.
  images: { unoptimized: true },
};

export default nextConfig;
