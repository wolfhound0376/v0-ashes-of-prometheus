// Builds public/js/aop-languages.js — lib/languages.ts for the static pages
// (the painted walk map, the camp) that cannot import TypeScript. Exposes
// window.AopLanguages. lib/languages-bundle-sync.test.ts fails if this file
// is stale, so after editing lib/languages.ts run:
//   node scripts/build-languages-js.mjs
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)

export async function buildLanguagesJs() {
  let esbuild
  try { esbuild = require("esbuild") } catch {
    const { readdirSync } = await import("node:fs")
    const dir = readdirSync(join(root, "node_modules/.pnpm")).find((d) => d.startsWith("esbuild@"))
    esbuild = require(join(root, "node_modules/.pnpm", dir, "node_modules/esbuild"))
  }
  const out = await esbuild.build({
    entryPoints: [join(root, "lib/languages.ts")],
    bundle: true, format: "iife", globalName: "AopLanguages", target: "es2018",
    write: false, minify: false, legalComments: "none",
  })
  return "/* GENERATED from lib/languages.ts by scripts/build-languages-js.mjs — do not edit. */\n" + out.outputFiles[0].text
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(root, "public/js/aop-languages.js"), await buildLanguagesJs())
  console.log("wrote public/js/aop-languages.js")
}
