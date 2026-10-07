/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Keep the hot-reload bundle separate from production builds. Running
     `next build` while `next dev` is open otherwise lets both processes write
     `.next`, leaving the dev server referencing chunks the build has removed. */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};
export default nextConfig;
