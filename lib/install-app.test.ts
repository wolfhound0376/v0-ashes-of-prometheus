import { describe, expect, it } from "vitest"
import { installWay } from "@/lib/install-app"
import manifest from "@/app/manifest"

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1"
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"

describe("install as an app (Sam, 2026-11-23: PR6)", () => {
  it("raises the browser's own install prompt where there is one", () => {
    expect(installWay({ standalone: false, hasPrompt: true, userAgent: CHROME_WIN })).toBe("prompt")
  })
  it("shows Add to Home Screen steps on iPhone and iPad Safari only", () => {
    expect(installWay({ standalone: false, hasPrompt: false, userAgent: IPHONE_SAFARI })).toBe("ios")
    expect(installWay({ standalone: false, hasPrompt: false, userAgent: IPAD, maxTouchPoints: 5 })).toBe("ios")
    expect(installWay({ standalone: false, hasPrompt: false, userAgent: IPAD, maxTouchPoints: 0 })).toBe("none")   // a real Mac
    expect(installWay({ standalone: false, hasPrompt: false, userAgent: IPHONE_CHROME })).toBe("none")
  })
  it("offers nothing once installed, or where a site cannot be installed", () => {
    expect(installWay({ standalone: true, hasPrompt: true, userAgent: CHROME_WIN })).toBe("installed")
    expect(installWay({ standalone: false, hasPrompt: false, userAgent: FIREFOX })).toBe("none")
  })
})

describe("the manifest", () => {
  const m = manifest()
  it("is installable: a name, a start page, standalone, and 192 and 512 icons incl. a maskable one", () => {
    expect(m.name).toBe("Ashes of Prometheus")
    expect(m.start_url).toBe("/intro")
    expect(m.display).toBe("standalone")
    const sizes = (m.icons ?? []).map((i) => i.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true)
  })
})
