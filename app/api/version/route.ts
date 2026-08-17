// What build is production actually serving right now?
//
// THE PROBLEM THIS SOLVES: a browser tab holds whatever JavaScript it loaded on
// the day it loaded it, forever. Nothing in a single-page app tells a stale tab
// it is stale. On 17 Aug a player's phone was running a bundle old enough that
// the voice toggles did not exist in it — she was told to look for buttons that
// her copy of the app had never been built with, and there was no way to see
// that from either side. This route is the other half of the answer.
//
// The value is deliberately the SAME expression the client bakes in at build
// time via next.config.mjs. Server and client compute it identically, so
// "different string" means "different build" and nothing else.
//
// Runs on every request, never cached — a cached version check is worthless.

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return Response.json(
    {
      buildId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
      // Handy for eyeballing in the browser; the client ignores it.
      deployedAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  )
}
