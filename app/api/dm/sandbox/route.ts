import { type NextRequest, NextResponse } from "next/server"
import { dmAuthorized } from "@/lib/alchemy-sandbox-server"

// /api/dm/sandbox — put a branch's version of the game into the DM's rehearsal copy.
//
// Sam, 2026-10-27: "Can you just push the new version to sandbox and give me a button to do that in the future in DM
// mode." The live site (ashes.playacartagena.com) runs `main`, and ?sandbox=1 there only stops a rehearsal from
// writing the real game; it still runs main's code, so a fix waiting in a pull request could not be rehearsed. The
// git branch `sandbox` is the rehearsal copy: Vercel builds it at its own fixed branch address (SANDBOX_URL below).
//
//   GET   → the open pull requests (number, title, branch, when) and what the sandbox holds now
//   POST  {branch} → the sandbox becomes that branch: a marker commit on top of the branch's head (same files, so
//         nothing new is written; a new commit, so Vercel always rebuilds — it skips a branch moved to a commit it
//         has already built) and the `sandbox` ref force-moved to it. Never touches `main` or the branch itself.
//
// DM only (x-dm-key, the house gate). Needs SANDBOX_GITHUB_TOKEN on the server: a GitHub fine-grained token for
// wolfhound0376/v0-ashes-of-prometheus with Contents read & write and Pull requests read. Without it the route says
// so instead of failing silently.

export const dynamic = "force-dynamic"

const REPO = "wolfhound0376/v0-ashes-of-prometheus"
const SANDBOX = "sandbox"
const SANDBOX_URL = "https://v0-ashes-of-prometheu-git-236402-ashesofprometheus-s-projects20.vercel.app"
const BRANCH_RE = /^[A-Za-z0-9._\/-]{1,200}$/

async function gh(path: string, init: RequestInit = {}) {
  const token = process.env.SANDBOX_GITHUB_TOKEN
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
    cache: "no-store",
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { message?: string }).message || `GitHub ${r.status}`)
  return j
}

function gate(req: NextRequest): NextResponse | null {
  if (!dmAuthorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  if (!process.env.SANDBOX_GITHUB_TOKEN)
    return NextResponse.json({ error: "The sandbox button needs a GitHub token on the server (SANDBOX_GITHUB_TOKEN). Until it is set, ask Claude to load a branch into the sandbox.", url: SANDBOX_URL, needsToken: true }, { status: 503 })
  return null
}

export async function GET(req: NextRequest) {
  const no = gate(req); if (no) return no
  try {
    const [pulls, ref] = await Promise.all([
      gh("/pulls?state=open&sort=updated&direction=desc&per_page=20") as Promise<{ number: number; title: string; updated_at: string; head: { ref: string } }[]>,
      gh(`/commits/${SANDBOX}`).catch(() => null) as Promise<{ commit?: { message?: string; committer?: { date?: string } } } | null>,
    ])
    const loaded = ref?.commit?.message?.match(/^sandbox: load (.+?) for rehearsal/)?.[1] ?? null
    return NextResponse.json({
      url: SANDBOX_URL, loaded, loadedAt: ref?.commit?.committer?.date ?? null,
      pulls: pulls.map((p) => ({ number: p.number, title: p.title, branch: p.head.ref, updated: p.updated_at })),
    })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e), url: SANDBOX_URL }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const no = gate(req); if (no) return no
  const body = await req.json().catch(() => null)
  const branch = String(body?.branch ?? "")
  const label = String(body?.label ?? branch).slice(0, 120)
  if (!BRANCH_RE.test(branch) || branch === SANDBOX) return NextResponse.json({ error: "Which branch?" }, { status: 400 })
  try {
    const head = (await gh(`/commits/${encodeURIComponent(branch)}`)) as { sha: string; commit: { tree: { sha: string } } }
    const marker = (await gh("/git/commits", { method: "POST", body: JSON.stringify({
      message: `sandbox: load ${label} for rehearsal\n\nSame files as ${branch} @ ${head.sha.slice(0, 7)}; a new commit so Vercel rebuilds.`,
      tree: head.commit.tree.sha, parents: [head.sha],
    }) })) as { sha: string }
    try {
      await gh(`/git/refs/heads/${SANDBOX}`, { method: "PATCH", body: JSON.stringify({ sha: marker.sha, force: true }) })
    } catch {
      await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${SANDBOX}`, sha: marker.sha }) })
    }
    return NextResponse.json({ ok: true, loaded: label, sha: marker.sha, url: SANDBOX_URL, note: "Vercel is building it now: about 2 to 4 minutes." })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 502 })
  }
}
