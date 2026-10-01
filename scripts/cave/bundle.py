#!/usr/bin/env python3
"""
bundle.py — public/cave-pov/  ->  one self-contained HTML file (for a claude.ai Artifact preview).

Inlines manifest.js (every assets/* URL becomes a data: URI) and pov.js into index.html.
Usage:  python3 scripts/cave/bundle.py [public/cave-pov] darklake-cave.html
"""
import base64, json, mimetypes, os, re, sys

root = sys.argv[1] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "public", "cave-pov")
dst = sys.argv[-1]
mimetypes.add_type("audio/webm", ".webm")
man = open(os.path.join(root, "manifest.js"), encoding="utf-8").read()
A = json.loads(man[man.index("const A=") + 8 : man.rindex(";")])

def walk(node, key=""):
    if isinstance(node, dict):
        return {k: walk(v, k) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v, key) for v in node]
    if isinstance(node, str) and node.startswith("assets/"):
        p = os.path.join(root, node)
        mime = mimetypes.guess_type(p)[0] or "application/octet-stream"
        if p.endswith(".webm"):
            mime = "video/webm" if "film" in node else "audio/webm"
        return f"data:{mime};base64," + base64.b64encode(open(p, "rb").read()).decode()
    return node

html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
top = html[: html.index('<script src="manifest.js">')].rstrip()
js = open(os.path.join(root, "pov.js"), encoding="utf-8").read()
open(dst, "w", encoding="utf-8").write(top + "\n<script>\nconst A=" + json.dumps(walk(A), separators=(",", ":")) + ";\n" + js + "\n</script>\n")
print(f"{os.path.getsize(dst)//1024} KB -> {dst}")
