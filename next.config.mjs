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

  // sharp is a NATIVE module: a thin JS wrapper over libvips, a C++ shared
  // object. Bundling it would strip the .so away from the JS that dlopen()s it,
  // so it must stay external and be loaded from node_modules at runtime.
  serverExternalPackages: ["sharp"],

  // ...which only works if the .so is actually THERE. It was not: /api/upload
  // returned 500 in production on every request with
  //   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
  // Tracing follows `import`/`require`, and the .so is not required by JS at
  // all — it is loaded by the .node binary through its rpath — so the tracer
  // cannot see it and left it out of the Lambda. Name it explicitly.
  //
  // The path goes through .pnpm deliberately. pnpm makes node_modules/@img/* a
  // SYMLINK into the store, and a function package containing symlinked
  // directories is rejected at deploy time with "The framework produced an
  // invalid deployment package for a Serverless Function". Globbing the real
  // store directory sidesteps that. Only the .so is taken; the package also
  // ships glib headers that the runtime never reads.
  outputFileTracingIncludes: {
    "/api/upload*": [
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/*.so*",
    ],
  },
}

export default nextConfig
