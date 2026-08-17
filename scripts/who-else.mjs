#!/usr/bin/env node
/**
 * who-else — is another agent already working on the files I am about to touch?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Sam runs several Claude sessions at once, each pointed at a different task.
 * They cannot see each other. Twice now two of them have rewritten the same
 * file in parallel and the collision only surfaced at merge, after both had
 * done the work — app/page.tsx, npc-assets-panel.tsx and v4-dashboard.tsx are
 * the repeat offenders because almost every feature touches one of them.
 *
 * This script answers the one question that prevents that, before any work
 * starts: "is anyone else live on these files right now?"
 *
 * It observes reality rather than asking for cooperation. Any agent that has
 * pushed a branch shows up here automatically, with no discipline required
 * from that agent, no registry to keep current, and nothing to forget.
 *
 * Its blind spot, stated plainly: an agent that has been editing for twenty
 * minutes and has not pushed yet is invisible. Pushing early — even a WIP
 * commit — is what makes an agent visible to everyone else.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *
 *   node scripts/who-else.mjs                         # who is live on anything
 *   node scripts/who-else.mjs app/page.tsx            # ...and do they have MY files
 *   node scripts/who-else.mjs --days 7 lib/tts.ts
 *
 *   --days N   how far back to look for active branches (default 3)
 *   --json     machine-readable output
 *
 * Exit codes:  0 = clear   1 = collision   2 = script failed
 * The non-zero exit on collision is deliberate, so this can gate a script.
 *
 * Needs network (it fetches refs) but no token for a public repo, and no
 * dependencies. Downloads no file contents — --filter=blob:none keeps it to
 * about four seconds against this repo.
 */

import { execFileSync } from "node:child_process"

const BASE = "origin/main"

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const opts = { days: 3, json: false, targets: [] }
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--days") opts.days = Number(argv[++i]) || 3
  else if (argv[i] === "--json") opts.json = true
  else if (argv[i] === "--help" || argv[i] === "-h") {
    console.log("usage: node scripts/who-else.mjs [--days N] [--json] [file ...]")
    process.exit(0)
  } else opts.targets.push(argv[i])
}

/**
 * Run git. `soft:true` means an error is a legitimate answer; otherwise a
 * failure is fatal.
 *
 * This tool is only worth having if silence means safety, so it must never
 * reach "CLEAR" by way of a command that did not run. The first version of
 * this script swallowed errors and printed CLEAR while every diff underneath
 * it was failing with "no merge base" — confidently telling an agent to go
 * ahead precisely when it knew nothing. A crash is recoverable. A false all-
 * clear is what this script exists to prevent.
 */
const git = (args, { soft = false } = {}) => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch (err) {
    if (soft) return ""
    console.error(`\ngit ${args.join(" ")}\n  ${String(err?.stderr || err?.message).trim()}`)
    console.error("\nAborting rather than reporting a result it cannot stand behind.\n")
    process.exit(2)
  }
}

/**
 * Pull down every remote branch head. Refs and trees only, no file contents.
 *
 * The unshallow step is not optional. A shallow checkout — which is what most
 * agent sandboxes start from, and what `--depth 1` gives you — has no common
 * ancestor to compare against, so every three-dot diff dies with "no merge
 * base" and the script's honest answer becomes "I cannot tell". Deepening
 * costs a couple of seconds against this repo's ~470 commits and is what makes
 * the comparison meaningful at all.
 */
function refresh() {
  const shallow = git(["rev-parse", "--is-shallow-repository"], { soft: true }).trim() === "true"
  const spec = ["fetch", "--quiet", "--filter=blob:none"]
  if (shallow) spec.push("--unshallow")
  try {
    execFileSync("git", [...spec, "origin", "+refs/heads/*:refs/remotes/origin/*"],
                 { stdio: "pipe", timeout: 180_000 })
    return true
  } catch (err) {
    // --unshallow fails if the repo turned out not to be shallow after all;
    // that is harmless, so retry once without it before giving up.
    if (shallow) {
      try {
        execFileSync("git", ["fetch", "--quiet", "--filter=blob:none", "origin",
                             "+refs/heads/*:refs/remotes/origin/*"],
                     { stdio: "pipe", timeout: 180_000 })
        return true
      } catch { /* fall through */ }
    }
    console.error("could not reach the remote — results below may be stale\n" +
                  String(err?.stderr || err?.message || err).trim() + "\n")
    return false
  }
}

/**
 * Branches whose last commit is within the window.
 *
 * Age is a proxy for "someone might still be working on this". A branch nobody
 * has touched in a fortnight is archaeology, not a collision risk, and this
 * repo carries 100 branches — almost all of them merged v0/* leftovers — so
 * without a window the signal drowns.
 */
function recentBranches(days) {
  const cutoff = Date.now() - days * 86_400_000
  const out = []
  for (const line of git(["for-each-ref", "--sort=-committerdate",
                          "--format=%(committerdate:iso8601-strict)|%(refname:short)",
                          "refs/remotes/origin"]).split("\n")) {
    if (!line.trim()) continue
    const [date, ref] = line.split("|")
    if (!ref || ref === BASE || ref === "origin/HEAD") continue
    if (Date.parse(date) < cutoff) continue
    out.push({ ref, when: date.slice(0, 16).replace("T", " ") })
  }
  return out
}

/**
 * The files a branch has changed that are NOT yet in main.
 *
 * Two questions, and it has to be both:
 *
 *   three-dot (main...ref)  what this branch changed since it diverged
 *   two-arg   (main ref)    what still differs between the two trees today
 *
 * Neither alone is right. Three-dot alone keeps flagging squash-merged
 * branches forever, because a squash rewrites history and leaves the original
 * commits looking unmerged — that would have this shouting about work that
 * shipped hours ago, and an alarm that cries wolf gets ignored. The tree diff
 * alone is worse: a branch that is simply behind main "differs" on every file
 * main has moved since, which is drift, not a collision.
 *
 * The intersection is the honest answer: this branch touched it, and its
 * version has not landed yet.
 */
function liveFiles(ref) {
  const touched = new Set(git(["diff", "--name-only", `${BASE}...${ref}`]).split("\n").filter(Boolean))
  if (!touched.size) return []
  const differs = new Set(git(["diff", "--name-only", BASE, ref]).split("\n").filter(Boolean))
  return [...touched].filter((f) => differs.has(f)).sort()
}

// ---------------------------------------------------------------------------

const fresh = refresh()
const branches = []
const owners = new Map()          // file -> [branch, ...]

for (const b of recentBranches(opts.days)) {
  const files = liveFiles(b.ref)
  if (!files.length) continue     // already in main; not a risk
  branches.push({ ...b, files })
  for (const f of files) {
    if (!owners.has(f)) owners.set(f, [])
    owners.get(f).push(b.ref)
  }
}

const collisions = opts.targets
  .filter((t) => owners.has(t))
  .map((t) => ({ file: t, branches: owners.get(t) }))

if (opts.json) {
  console.log(JSON.stringify({ fresh, days: opts.days, branches, collisions }, null, 2))
  process.exit(collisions.length ? 1 : 0)
}

console.log(`\nLIVE WORK — unmerged branches touched in the last ${opts.days} day(s)\n`)
if (!branches.length) {
  console.log("  none. every recent branch is already in main.\n")
} else {
  for (const b of branches) {
    console.log(`  ${b.ref}   (${b.when})`)
    for (const f of b.files.slice(0, 10)) console.log(`      ${f}`)
    if (b.files.length > 10) console.log(`      ... +${b.files.length - 10} more`)
    console.log()
  }
}

if (!opts.targets.length) {
  console.log("Pass the files you intend to edit to check them specifically:")
  console.log("  node scripts/who-else.mjs app/page.tsx components/dashboard/v4-dashboard.tsx\n")
  process.exit(0)
}

console.log("YOUR FILES\n")
for (const t of opts.targets) {
  if (owners.has(t)) console.log(`  !!  ${t}\n      live on: ${owners.get(t).join(", ")}`)
  else console.log(`  ok  ${t}`)
}

if (collisions.length) {
  console.log(`\nCOLLISION on ${collisions.length} file(s). Before writing anything:`)
  console.log("  - check whether that branch's work makes yours unnecessary")
  console.log("  - if both are needed, branch FROM it rather than from main")
  console.log("  - or pick a different slice of the work and come back to this one")
  console.log("  Tell Sam either way — he is the only one who can see all the sessions.\n")
  process.exit(1)
}

console.log("\nCLEAR — no unmerged branch touches these files.\n")
process.exit(0)
