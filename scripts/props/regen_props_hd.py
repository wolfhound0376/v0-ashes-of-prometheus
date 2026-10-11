#!/usr/bin/env python3
"""Re-cut the whole map-prop library at 128px, high-fantasy Underdark.

Sam's decision 2026-10-08: the 191 existing props plus the new water set all
move to 128px rather than leaving the water nodes as a nicer-looking island.
~223 props at 6 generations each is ~1,340 generations.

WHY A SCRIPT AND NOT A CHAT SESSION. Pro Flash returns one object per call, so
223 props is 223 API round trips plus polling. That is not a conversation, it
is a batch job — and a batch job that must be resumable, because it will be
interrupted.

WHY IT NEVER UPLOADS ON ITS OWN. Sam's standing art rule (AGENTS.md §7): build-
time generation is fine, but every image goes to him for approval before it is
uploaded or attached to a row. So generation and upload are separate commands,
`upload` refuses to run without --approved, and anything listed in rejects.txt
is skipped. Nothing reaches Supabase on the strength of this script alone.

  python regen_props_hd.py plan                 # read the catalog, build prompts. No spend.
  python regen_props_hd.py generate             # generate missing props. Resumable.
  python regen_props_hd.py verify               # numeric QA. Flags baked-in backgrounds.
  python regen_props_hd.py sheets               # contact sheets for review
  python regen_props_hd.py upload --approved    # upload all but rejects.txt, print the SQL

ENVIRONMENT
  PIXELLAB_API_KEY             PixelLab bearer token
  SUPABASE_URL                 https://ppadxmvvvxmnnejeaoer.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    service role (sent as both Bearer and apikey)

UPLOAD PATH IS v2, NOT AN OVERWRITE. New art goes to `props/v2/<slug>.png` and
the row's `sprite_url` is flipped by the SQL this prints. Overwriting
`props/<slug>.png` in place would be one command shorter and would destroy the
only copy of the old art with no way back; a bad batch would then be
unrecoverable. The old files stay where they are.

THE ONE QA CHECK THAT MATTERS. `verify` measures corner alpha. The pilot's
cresting wave came back gorgeous and unusable — 58% opaque with cave walls
painted behind it — and it took a numeric check to say so plainly, because at
thumbnail size it just looked good. Props flagged `background` are re-prompted,
not shipped. Measure, do not look; that lesson has been learned twice on this
project already.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prop_prompts import prompt_for, view_for, is_animation_candidate  # noqa: E402

PIXELLAB = "https://api.pixellab.ai/v2"
OUT = Path(__file__).resolve().parent / "out"
MANIFEST = OUT / "manifest.json"
REJECTS = OUT / "rejects.txt"
SIZE = 128
# PixelLab runs jobs concurrently but the account has a ceiling; four in flight
# has been the practical sweet spot on this project and leaves room for a
# parallel session doing its own generation.
MAX_INFLIGHT = 4


def _load_env_local() -> None:
    """Read .env.local from the repo root, without overriding the real environment.

    PIXELLAB_API_KEY is already a user environment variable on Sam's machine —
    that is what .mcp.json interpolates into its Authorization header — and the
    Supabase pair already lives in .env.local, which is the repo's documented
    convention. Reading both means this script normally needs no setup at all
    on the machine it is meant to run on.

    Deliberately does NOT override anything already exported, so a one-off
    `SUPABASE_URL=... python regen_props_hd.py` still wins.
    """
    root = Path(__file__).resolve().parents[2]
    f = root / ".env.local"
    if not f.exists():
        return
    for line in f.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_env_local()

# The Supabase URL is spelled NEXT_PUBLIC_SUPABASE_URL everywhere else in this
# repo. Accept either rather than making the caller re-export it under a second
# name for one script.
ALIASES = {"SUPABASE_URL": ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")}


def env(name: str) -> str:
    for candidate in ALIASES.get(name, (name,)):
        v = os.environ.get(candidate)
        if v:
            return v
    tried = " or ".join(ALIASES.get(name, (name,)))
    sys.exit(
        f"missing {tried}.\n"
        f"Looked in the environment and in .env.local at the repo root.\n"
        f"PIXELLAB_API_KEY is already a user env var on Witchdoctor; the Supabase pair\n"
        f"is in Vercel -> Settings -> Environment Variables, or `vercel env pull .env.local`."
    )


def api(method: str, path: str, body: dict | None = None, base: str = PIXELLAB) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {env('PIXELLAB_API_KEY')}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read()[:400].decode(errors='replace')}")


def supabase(path: str) -> list[dict]:
    url = env("SUPABASE_URL").rstrip("/") + path
    req = urllib.request.Request(url)
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def save_manifest(m: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=1, sort_keys=True))


# ---------------------------------------------------------------- plan

def cmd_plan(args: argparse.Namespace) -> None:
    rows = supabase(
        "/rest/v1/map_props?select=slug,label,category,render_class,footprint_w,"
        "footprint_h,emits_light_ft,status&order=category,slug"
    )
    m = load_manifest()
    for r in rows:
        slug = r["slug"]
        prev = m.get(slug, {})
        m[slug] = {
            **prev,
            "slug": slug,
            "label": r.get("label"),
            "category": r.get("category"),
            "render_class": r.get("render_class"),
            "view": view_for(r.get("render_class") or "billboard"),
            "prompt": prompt_for(r),
            "animate_later": is_animation_candidate(r),
        }
    save_manifest(m)

    by_cat: dict[str, int] = {}
    for v in m.values():
        by_cat[v.get("category") or "?"] = by_cat.get(v.get("category") or "?", 0) + 1
    done = sum(1 for s in m if (OUT / f"{s}.png").exists())
    anim = sum(1 for v in m.values() if v.get("animate_later"))

    print(f"{len(m)} props planned, {done} already generated, {len(m)-done} to go")
    print(f"estimated spend: {(len(m)-done)*6} generations")
    print(f"marked for the later animation pass: {anim}")
    for c, n in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        print(f"  {c:12s} {n}")
    print(f"\nmanifest: {MANIFEST}")
    print("Spot-check a prompt before spending:  python regen_props_hd.py plan --show <slug>")
    if args.show:
        print("\n" + json.dumps(m.get(args.show, {}), indent=1))


# ------------------------------------------------------------ generate

def submit(entry: dict) -> dict:
    r = api("POST", "/create-object-pro-flash", {
        "description": entry["prompt"],
        "name": f"AoP HD {entry['slug']}",
        "view": entry["view"],
        "n_directions": 1,
        "image_size": {"width": SIZE, "height": SIZE},
    })
    return {"object_id": r["object_id"], "job_id": r["background_job_id"]}


def finished(object_id: str) -> str | None:
    """Return a downloadable URL once the object is done, else None."""
    o = api("GET", f"/objects/{object_id}")
    if (o.get("status") or "").lower() not in ("completed", "complete", "ready", "review"):
        return None
    for key in ("rotation_urls", "storage_urls", "frame_urls"):
        v = o.get(key)
        if isinstance(v, dict) and v:
            return next(iter(v.values()))
        if isinstance(v, list) and v:
            return v[0]
    return None


def download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as r:
        dest.write_bytes(r.read())


def cmd_generate(args: argparse.Namespace) -> None:
    m = load_manifest()
    if not m:
        sys.exit("no manifest — run `plan` first")
    OUT.mkdir(parents=True, exist_ok=True)

    todo = [s for s in sorted(m) if not (OUT / f"{s}.png").exists()]
    if args.only:
        todo = [s for s in todo if s in set(args.only)]
    if args.limit:
        todo = todo[: args.limit]
    if not todo:
        print("nothing to generate — every planned prop already has a file")
        return

    print(f"generating {len(todo)} props (~{len(todo)*6} generations)")
    inflight: dict[str, str] = {}
    queue = list(todo)
    completed = 0

    while queue or inflight:
        while queue and len(inflight) < MAX_INFLIGHT:
            slug = queue.pop(0)
            try:
                r = submit(m[slug])
            except SystemExit as e:
                print(f"  ! {slug}: {e}")
                continue
            inflight[slug] = r["object_id"]
            m[slug]["object_id"] = r["object_id"]
            save_manifest(m)
            print(f"  > {slug}")

        time.sleep(6)

        for slug, oid in list(inflight.items()):
            try:
                url = finished(oid)
            except SystemExit as e:
                print(f"  ! {slug}: {e}")
                inflight.pop(slug)
                continue
            if not url:
                continue
            download(url, OUT / f"{slug}.png")
            m[slug]["source_url"] = url
            save_manifest(m)
            inflight.pop(slug)
            completed += 1
            print(f"  = {slug}  ({completed}/{len(todo)})")

    print(f"done: {completed} generated into {OUT}")
    print("Next:  python regen_props_hd.py verify")


# -------------------------------------------------------------- verify

def cmd_verify(args: argparse.Namespace) -> None:
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        sys.exit("verify needs Pillow and numpy:  pip install pillow numpy")

    m = load_manifest()
    flagged, clean, missing = [], 0, []
    for slug in sorted(m):
        p = OUT / f"{slug}.png"
        if not p.exists():
            missing.append(slug)
            continue
        a = np.array(Image.open(p).convert("RGBA"))[:, :, 3]
        h, w = a.shape
        c = max(4, min(h, w) // 10)
        corner = float(np.mean([
            a[:c, :c].mean(), a[:c, -c:].mean(), a[-c:, :c].mean(), a[-c:, -c:].mean()
        ]))
        opaque = 100.0 * float((a > 128).mean())
        size_ok = (h, w) == (SIZE, SIZE)
        # A cutout has empty corners. A painted scene fills them. The pilot's
        # bad wave sat at corner 25.7 and 58% opaque; the three good ones were
        # corner 0.0 and 20-34% opaque. 8 is comfortably clear of both.
        bad_bg = corner > 8.0
        if bad_bg or not size_ok:
            flagged.append((slug, corner, opaque, f"{w}x{h}"))
        else:
            clean += 1

    print(f"{clean} clean, {len(flagged)} flagged, {len(missing)} not yet generated")
    if flagged:
        print("\nFLAGGED — re-prompt these, do not ship them:")
        for slug, corner, opaque, dims in flagged:
            why = "background baked in" if corner > 8.0 else f"wrong size {dims}"
            print(f"  {slug:28s} corner_alpha={corner:6.1f}  opaque={opaque:5.1f}%  {why}")
        (OUT / "flagged.txt").write_text("\n".join(s for s, *_ in flagged) + "\n")
        print(f"\nwritten to {OUT/'flagged.txt'}")
        print("Regenerate just those:  python regen_props_hd.py generate --only $(cat out/flagged.txt)")
        print("(delete their PNGs first, or generate will skip them)")


# -------------------------------------------------------------- sheets

def cmd_sheets(args: argparse.Namespace) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        sys.exit("sheets needs Pillow:  pip install pillow")

    m = load_manifest()
    cats: dict[str, list[str]] = {}
    for slug, v in sorted(m.items()):
        if (OUT / f"{slug}.png").exists():
            cats.setdefault(v.get("category") or "?", []).append(slug)

    review = OUT / "review"
    review.mkdir(parents=True, exist_ok=True)
    scale, pad, lbl, cols = 2, 12, 20, 8
    cell = SIZE * scale
    try:
        f = ImageFont.truetype("DejaVuSans.ttf", 12)
        fb = ImageFont.truetype("DejaVuSans-Bold.ttf", 18)
    except OSError:
        f = fb = ImageFont.load_default()

    for cat, slugs in cats.items():
        rows = (len(slugs) + cols - 1) // cols
        w = pad + cols * (cell + pad)
        h = 44 + rows * (cell + lbl + pad) + pad
        img = Image.new("RGBA", (w, h), (16, 16, 19, 255))
        dr = ImageDraw.Draw(img)
        dr.text((pad, 14), f"{cat} — {len(slugs)} props at {SIZE}px", font=fb, fill=(255, 255, 255))
        for i, slug in enumerate(slugs):
            x = pad + (i % cols) * (cell + pad)
            y = 44 + (i // cols) * (cell + lbl + pad)
            tile = Image.open(OUT / f"{slug}.png").convert("RGBA")
            tile = tile.resize((tile.width * scale, tile.height * scale), Image.NEAREST)
            dr.rectangle([x - 1, y - 1, x + cell, y + cell], fill=(26, 26, 30), outline=(70, 70, 80))
            img.alpha_composite(tile, (x, y))
            dr.text((x, y + cell + 3), slug[:26], font=f, fill=(170, 170, 180))
        img.convert("RGB").save(review / f"{cat}.png")
        print(f"  {review/f'{cat}.png'}  ({len(slugs)})")

    print(f"\n{len(cats)} sheets in {review}")
    print(f"Reject anything you don't want by writing its slug, one per line, into {REJECTS}")


# -------------------------------------------------------------- upload

def cmd_upload(args: argparse.Namespace) -> None:
    if not args.approved:
        sys.exit(
            "upload refuses to run without --approved.\n"
            "Look at the sheets in out/review first, list any rejects in out/rejects.txt,\n"
            "then re-run with --approved."
        )
    m = load_manifest()
    rejects = set()
    if REJECTS.exists():
        rejects = {l.strip() for l in REJECTS.read_text().splitlines() if l.strip()}

    base = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    sent, skipped = [], []

    for slug in sorted(m):
        p = OUT / f"{slug}.png"
        if not p.exists() or slug in rejects:
            skipped.append(slug)
            continue
        path = f"props/v2/{slug}.png"
        req = urllib.request.Request(
            f"{base}/storage/v1/object/vtt-assets/{path}",
            data=p.read_bytes(), method="POST",
        )
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("apikey", key)
        req.add_header("Content-Type", "image/png")
        req.add_header("x-upsert", "true")
        try:
            with urllib.request.urlopen(req, timeout=120):
                sent.append(slug)
        except urllib.error.HTTPError as e:
            print(f"  ! {slug}: {e.code} {e.read()[:200].decode(errors='replace')}")

    print(f"uploaded {len(sent)}, skipped {len(skipped)} ({len(rejects)} rejected)")
    if not sent:
        return

    sql = OUT / "flip_sprite_urls.sql"
    lines = [
        "-- Point the catalog at the 128px art. Run in the Supabase SQL editor.",
        "-- The 64px files stay at props/<slug>.png, so this is reversible by",
        "-- re-running it with 'props/v2/' swapped back to 'props/'.",
        "begin;",
        "create table if not exists map_props_backup_pre_hd as select * from map_props;",
    ]
    for slug in sent:
        lines.append(
            f"update map_props set sprite_url = 'vtt-assets/props/v2/{slug}.png', "
            f"canvas_px = {SIZE} where slug = '{slug}';"
        )
    lines += [f"-- {len(sent)} rows", "commit;"]
    sql.write_text("\n".join(lines) + "\n")
    print(f"\nSQL written to {sql} — read it, then run it in the Supabase SQL editor.")
    print("It backs the table up first and does not touch the old 64px files.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan"); p.add_argument("--show", help="print one slug's planned prompt"); p.set_defaults(fn=cmd_plan)
    g = sub.add_parser("generate")
    g.add_argument("--limit", type=int, help="stop after N props — use this for a small first run")
    g.add_argument("--only", nargs="*", help="regenerate only these slugs")
    g.set_defaults(fn=cmd_generate)
    sub.add_parser("verify").set_defaults(fn=cmd_verify)
    sub.add_parser("sheets").set_defaults(fn=cmd_sheets)
    u = sub.add_parser("upload"); u.add_argument("--approved", action="store_true"); u.set_defaults(fn=cmd_upload)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
