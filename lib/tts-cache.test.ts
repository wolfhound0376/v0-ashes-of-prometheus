import { describe, it, expect, vi } from "vitest"
import {
  ttsCacheKey,
  isCacheable,
  readCachedAudio,
  writeCachedAudio,
  MAX_CACHEABLE_CHARS,
  TTS_BUCKET,
  TTS_PREFIX,
} from "./tts-cache"

const VOICE = "NiQt0cwFeLsVf6cAmcCp"

describe("ttsCacheKey", () => {
  it("is stable for the same utterance", () => {
    const a = ttsCacheKey({ voiceId: VOICE, text: "Step back." })
    const b = ttsCacheKey({ voiceId: VOICE, text: "Step back." })
    expect(a).toBe(b)
  })

  it("lands under the cache prefix as an mp3", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Step back." })).toMatch(
      new RegExp(`^${TTS_PREFIX}/[0-9a-f]{32}\\.mp3$`),
    )
  })

  it("separates different text", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Step back." })).not.toBe(
      ttsCacheKey({ voiceId: VOICE, text: "Step back!" }),
    )
  })

  it("separates different voices — the same words in two throats are two files", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Step back." })).not.toBe(
      ttsCacheKey({ voiceId: "21m00Tcm4TlvDq8ikWAM", text: "Step back." }),
    )
  })

  it("separates different settings, so a tempo change re-records", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { speed: 1 } })).not.toBe(
      ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { speed: 1.15 } }),
    )
  })

  it("ignores settings key ORDER — the same settings are one entry", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { speed: 1, style: 0.3 } })).toBe(
      ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { style: 0.3, speed: 1 } }),
    )
  })

  it("treats no settings and empty settings alike", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Hold." })).toBe(
      ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: null }),
    )
  })

  it("separates a delivery variant, so a directed take is its own file", () => {
    expect(ttsCacheKey({ voiceId: VOICE, text: "Hold." })).not.toBe(
      ttsCacheKey({ voiceId: VOICE, text: "Hold.", variant: "[whispering]" }),
    )
  })

  it("does NOT key on the model — a fallback take serves later v4 requests", () => {
    // Guard against someone adding the model to the tuple: the two routes pick
    // the model themselves, so keying on it would re-bill every cached line the
    // day the account gains v4.
    const key = ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { speed: 1 } })
    expect(key).toBe(ttsCacheKey({ voiceId: VOICE, text: "Hold.", settings: { speed: 1 } }))
  })
})

describe("isCacheable", () => {
  it("accepts an ordinary bark", () => {
    expect(isCacheable({ voiceId: VOICE, text: "Step back, surface filth." })).toBe(true)
  })

  it("rejects empty or whitespace text", () => {
    expect(isCacheable({ voiceId: VOICE, text: "" })).toBe(false)
    expect(isCacheable({ voiceId: VOICE, text: "   " })).toBe(false)
  })

  it("rejects a missing voice", () => {
    expect(isCacheable({ voiceId: "", text: "Step back." })).toBe(false)
  })

  it("accepts text exactly at the cap and rejects one character past it", () => {
    expect(isCacheable({ voiceId: VOICE, text: "x".repeat(MAX_CACHEABLE_CHARS) })).toBe(true)
    expect(isCacheable({ voiceId: VOICE, text: "x".repeat(MAX_CACHEABLE_CHARS + 1) })).toBe(false)
  })
})

function fakeClient(opts: {
  download?: () => Promise<{ data: Blob | null; error: unknown }>
  upload?: () => Promise<{ error: { message: string } | null }>
}) {
  const from = vi.fn(() => ({
    download: opts.download ?? (async () => ({ data: null, error: null })),
    upload: opts.upload ?? (async () => ({ error: null })),
  }))
  return { client: { storage: { from } }, from }
}

describe("readCachedAudio", () => {
  it("returns the bytes on a hit", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const { client, from } = fakeClient({
      download: async () => ({ data: new Blob([bytes]), error: null }),
    })
    const got = await readCachedAudio(client as never, "tts-cache/abc.mp3")
    expect(got && new Uint8Array(got)).toEqual(bytes)
    expect(from).toHaveBeenCalledWith(TTS_BUCKET)
  })

  it("returns null on a miss", async () => {
    const { client } = fakeClient({ download: async () => ({ data: null, error: { message: "not found" } }) })
    expect(await readCachedAudio(client as never, "tts-cache/abc.mp3")).toBeNull()
  })

  it("returns null — not a throw — when storage itself blows up", async () => {
    const { client } = fakeClient({
      download: async () => {
        throw new Error("network down")
      },
    })
    expect(await readCachedAudio(client as never, "tts-cache/abc.mp3")).toBeNull()
  })
})

describe("writeCachedAudio", () => {
  it("upserts with the long cache header", async () => {
    const upload = vi.fn(async () => ({ error: null }))
    const client = { storage: { from: () => ({ download: async () => ({ data: null, error: null }), upload }) } }
    await writeCachedAudio(client as never, "tts-cache/abc.mp3", new ArrayBuffer(4))
    expect(upload).toHaveBeenCalledWith(
      "tts-cache/abc.mp3",
      expect.anything(),
      expect.objectContaining({ contentType: "audio/mpeg", upsert: true }),
    )
  })

  it("never throws when the upload fails — the line was already served", async () => {
    const client = {
      storage: {
        from: () => ({
          download: async () => ({ data: null, error: null }),
          upload: async () => {
            throw new Error("bucket gone")
          },
        }),
      },
    }
    await expect(writeCachedAudio(client as never, "tts-cache/abc.mp3", new ArrayBuffer(4))).resolves.toBeUndefined()
  })
})
