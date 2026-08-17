/** @type {import('next').NextConfig} */

// The build stamp. Baked into the CLIENT bundle at build time so a running tab
// can compare what it is against what production currently serves — see
// components/build-watch.tsx and app/api/version/route.ts.
//
// Vercel sets VERCEL_GIT_COMMIT_SHA during the build. Locally it is unset, so
// this falls back to "dev" and the watcher stays quiet (the version route
// reports "dev" too, so they match and nothing ever nags during development).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
}

export default nextConfig
