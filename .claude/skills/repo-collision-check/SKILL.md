---
name: repo-collision-check
description: "Check whether another of Sam's parallel agent sessions is already working on the files you are about to change in the Ashes of Prometheus repo (wolfhound0376/v0-ashes-of-prometheus). Run this BEFORE editing, creating a branch, or opening a PR — and use it to answer questions like 'is anyone else working on this', 'what's in flight', 'what branches are live', or 'did someone already do this'."
---

# Repo collision check

Sam runs several Claude sessions at once, each on a different task. **They cannot
see each other.** You are one of them. Assume at any moment that another agent is
mid-flight in this repo, and that neither of you will find out you overlapped
until merge — after you have both done the work.

This has already happened more than once. `app/page.tsx`,
`components/dashboard/npc-assets-panel.tsx` and
`components/dashboard/v4-dashboard.tsx` are the repeat offenders, because nearly
every feature ends up touching one of them.

Four seconds of checking prevents an evening of rework.

---

## Run it before you write anything

From a checkout of the repo:

```bash
node scripts/who-else.mjs <every file you intend to touch>
```

Concretely:

```bash
node scripts/who-else.mjs app/page.tsx components/dashboard/v4-dashboard.tsx
```

Options: `--days N` (how far back to look, default 3), `--json`.

Exit codes: **0** clear · **1** collision · **2** the check itself failed.

**Do this before the first edit, not after.** Once you have written code, sunk
cost starts arguing with you about whether the collision really matters.

### If you have no checkout

Some sessions are read-only or have no repo attached. Then clone one — it is
cheap, and the script downloads no file contents:

```bash
git clone --filter=blob:none https://github.com/wolfhound0376/v0-ashes-of-prometheus.git /tmp/collision-check
cd /tmp/collision-check && node scripts/who-else.mjs <files>
```

Never skip the check on the grounds that checking is inconvenient. If you truly
cannot run it — no network, no git — say so in your first message to Sam rather
than proceeding silently. He is the only one who can see all the sessions, so
an unchecked session is a risk only he can weigh.

---

## Reading the result

**`CLEAR`** — no unmerged branch touches your files. Proceed. Push early anyway
(see below).

**`COLLISION`** — another live branch has one of your files. Stop and work out
which of these it is:

1. **Their work makes yours unnecessary.** Read the branch. If it already does
   what you were asked to do, say so to Sam instead of building it twice.
2. **Both are needed and they overlap.** Branch **from their branch**, not from
   `main`, and say so in your PR description. Rebasing later is cheaper than
   reconciling two independent rewrites of the same file.
3. **Both are needed and the overlap is incidental** — same file, different
   region. Usually fine, but keep your diff tight and tell Sam the two PRs will
   need sequencing. Small surgical diffs merge; sprawling ones collide.
4. **You can work on something else first.** Often the cheapest answer.

Always tell Sam what you found. He is the only one holding the whole picture,
and "I found another agent in `dice-roller.tsx`, so I did X" is exactly the kind
of thing he needs to hear unprompted.

**Exit code 2 — the check failed.** Never treat this as clear. It means the
script could not compute an answer (usually no network). Report it and ask.

---

## Push early so other agents can see you

The check observes pushed branches. **Unpushed work is invisible to everyone
else.** That is its one blind spot, and you are on the wrong side of it while
you work.

So push your branch as soon as it exists — a WIP commit with one line changed
is enough. That single push is what makes you visible to the next agent who
runs this check. An agent who works for an hour and pushes at the end has been
a collision risk for that entire hour.

Name branches so a human can tell at a glance what they are:
`fix/…`, `feat/…`, `chore/…` and a few words of intent.

---

## Rules that come from Sam, not from this script

These hold regardless of what the check says:

- **Never push to `main`.** Branch and open a PR.
- **Never merge on Sam's behalf.** Opening the PR is where you stop.
- **Prefer surgical PRs.** One idea per PR. This is collision-avoidance in
  itself — small diffs on few files rarely conflict.
- **Verify claimed completions.** A previous session claiming something shipped
  is not evidence it shipped. Check the actual repo state — `fifi_pipeline.py`
  was "complete" for weeks and had never been pushed.

---

## What this does not cover

Deliberate limits, so you know when to think harder rather than trusting the
green light:

- **Unpushed work in another session.** See above.
- **Supabase schema.** Two agents can write incompatible migrations without
  touching the same file at all. If your change touches the database, say so to
  Sam explicitly — the script cannot see it.
- **Semantic collisions.** Two agents can break each other while editing
  entirely different files, e.g. one renames an export another imports. `CLEAR`
  means "no file overlap", not "no interference".
- **Branches older than the window.** Default is 3 days. Use `--days 14` when
  picking up long-running work.
