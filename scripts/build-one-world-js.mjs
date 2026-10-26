// Builds public/js/aop-one-world.js — lib/walk-world.ts for the static pages
// (the painted walk map) that cannot import TypeScript. Exposes
// window.AopOneWorld. lib/one-world-bundle-sync.test.ts fails if this file
// is stale, so after editing lib/walk-world.ts run:
//   node scripts/build-one-world-js.mjs
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)

export async function buildOneWorldJs() {
  let esbuild
  try { esbuild = require("esbuild") } catch {
    const { readdirSync } = await import("node:fs")
    const dir = readdirSync(join(root, "node_modules/.pnpm")).find((d) => d.startsWith("esbuild@"))
    esbuild = require(join(root, "node_modules/.pnpm", dir, "node_modules/esbuild"))
  }
  const out = await esbuild.build({
    entryPoints: [join(root, "lib/walk-world.ts")],
    bundle: true, format: "iife", globalName: "AopOneWorld", target: "es2018",
    write: false, minify: false, legalComments: "none",
  })
  return "/* GENERATED from lib/walk-world.ts by scripts/build-one-world-js.mjs — do not edit. */\n" + out.outputFiles[0].text
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(root, "public/js/aop-one-world.js"), await buildOneWorldJs())
  console.log("wrote public/js/aop-one-world.js")
}
