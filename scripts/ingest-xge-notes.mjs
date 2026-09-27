#!/usr/bin/env node
// Ingest the Xanathar's Guide NOTES (our paraphrase, never the book's prose)
// into Supabase as the book `xge-notes`, so Malachar's retrieval (ask-world)
// and the DM's keyword search (search_srd) can reach them.
// docs/reference/xanathars-guide-index.md explains where each part lives.
//
//   node scripts/ingest-xge-notes.mjs            # POST to ingest-book (needs
//                                                  NEXT_PUBLIC_SUPABASE_URL and
//                                                  NEXT_PUBLIC_SUPABASE_ANON_KEY)
//   node scripts/ingest-xge-notes.mjs --json     # print the chunks, send nothing
//   node scripts/ingest-xge-notes.mjs --sql      # print SQL that calls ingest-book
//                                                  through the database's `http`
//                                                  extension (for a sandbox that
//                                                  cannot reach *.supabase.co)
//
// Batches of 3: ingest-book embeds in the worker, and larger batches hit
// WORKER_RESOURCE_LIMIT (AGENTS.md §4). Re-running is safe — chunks upsert
// on (book_id, chunk_index). If an edit makes FEWER chunks than before,
// delete the tail: delete from campaign_chunks where book_id = … and chunk_index >= N.

import { readFileSync } from "node:fs"

const FILES = [
  { path: "docs/reference/xanathars-ch2-dm-tools-notes.md", chapter: "Xanathar's ch. 2, Dungeon Master's Tools" },
  { path: "docs/reference/xanathars-ch1-classes-and-names-notes.md", chapter: "Xanathar's ch. 1, Character Options & App. B" },
]
const BOOK = {
  slug: "xge-notes",
  title: "Xanathar's Guide to Everything — Ashes of Prometheus notes (paraphrased)",
  author: "Paraphrased from Sam's copy of XGE (Wizards of the Coast, 2017)",
  source_file: "docs/reference/xanathars-*.md",
}
const CAMPAIGN = "out-of-the-abyss" // the same pool ask-world searches for the OotA campaign
const MAX_WORDS = 280
const BATCH = 3

const words = (s) => s.split(/\s+/).filter(Boolean).length
const firstPage = (s) => {
  const m = /pp?\.\s*(\d+)/.exec(s)
  return m ? Number(m[1]) : null
}

function chunksOf(file) {
  const text = readFileSync(file.path, "utf8")
  const out = []
  // Split on level-2 headings; the preamble (title/status lines) is skipped.
  const parts = text.split(/^## /m).slice(1)
  for (const part of parts) {
    const [headLine, ...rest] = part.split("\n")
    const section = headLine.trim()
    const body = rest.join("\n").trim()
    if (!body) continue
    const page = firstPage(section)
    // Keep paragraphs together; start a new chunk past MAX_WORDS. A table too
    // long for one chunk is cut into row groups, each with its header rows,
    // because gte-small only reads ~512 tokens of a passage.
    const paras = body.split(/\n{2,}/).flatMap((p) => {
      const lines = p.split("\n")
      if (words(p) <= MAX_WORDS) return [p]
      if (!lines[0]?.trimStart().startsWith("|")) {
        // A long list: cut between top-level items, keeping any lead-in line
        // with the first item and each item's nested lines with it.
        const items = []
        for (const line of lines) {
          if (/^[-*] |^\d+\. /.test(line) || !items.length) items.push([line])
          else items[items.length - 1].push(line)
        }
        const groups = []
        let g = []
        for (const it of items.map((x) => x.join("\n"))) {
          if (g.length && words([...g, it].join("\n")) > MAX_WORDS) {
            groups.push(g.join("\n"))
            g = []
          }
          g.push(it)
        }
        if (g.length) groups.push(g.join("\n"))
        return groups
      }
      if (lines.length < 4) return [p]
      const head = lines.slice(0, 2)
      const groups = []
      let g = []
      for (const row of lines.slice(2)) {
        if (g.length && words([...head, ...g, row].join("\n")) > MAX_WORDS) {
          groups.push([...head, ...g].join("\n"))
          g = []
        }
        g.push(row)
      }
      if (g.length) groups.push([...head, ...g].join("\n"))
      return groups
    })
    let buf = []
    let n = 0
    const flush = (cont) => {
      if (!buf.length) return
      out.push({ chapter: file.chapter, section: cont ? `${section} (cont.)` : section, page, body: buf.join("\n\n") })
      buf = []
      n = 0
    }
    let first = true
    for (const p of paras) {
      const w = words(p)
      if (n > 0 && n + w > MAX_WORDS) {
        flush(!first)
        first = false
      }
      buf.push(p)
      n += w
    }
    flush(!first)
  }
  return out
}

const all = FILES.flatMap(chunksOf).map((c, i) => {
  const content = `Xanathar's Guide to Everything (paraphrased notes) — ${c.chapter}: ${c.section}\n\n${c.body}`
  return { chunk_index: i, chapter: c.chapter, section: c.section, page: c.page, content, word_count: words(content) }
})

const batches = []
for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH))

const mode = process.argv[2] ?? ""
if (mode === "--json") {
  console.log(JSON.stringify({ book: BOOK, campaign_slug: CAMPAIGN, chunks: all }, null, 2))
} else if (mode === "--sql") {
  const url = "https://ppadxmvvvxmnnejeaoer.supabase.co/functions/v1/ingest-book"
  const key = process.env.SUPABASE_ANON_KEY ?? "<ANON KEY>"
  console.log("set http.timeout_msec = 120000;")
  for (const b of batches) {
    const body = JSON.stringify({ book: BOOK, campaign_slug: CAMPAIGN, chunks: b })
    if (body.includes("$ingest$")) throw new Error("dollar-quote collision")
    console.log(
      `select status, left(content, 200) as reply from http(('POST', '${url}', ` +
        `array[http_header('Authorization', 'Bearer ${key}')], 'application/json', $ingest$${body}$ingest$)::http_request);`,
    )
  }
  console.error(`${all.length} chunks in ${batches.length} batches`)
} else {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.local), or use --sql.")
    process.exit(1)
  }
  for (const [i, b] of batches.entries()) {
    const res = await fetch(`${base}/functions/v1/ingest-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ book: BOOK, campaign_slug: CAMPAIGN, chunks: b }),
    })
    console.log(`batch ${i + 1}/${batches.length}: ${res.status} ${await res.text()}`)
    if (!res.ok) process.exit(1)
  }
}
