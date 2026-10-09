import { describe, expect, it } from "vitest"
import { resolveNamedNpcVoiceId } from "../tts"
import { deliveryFor } from "../tts-model"

describe("Topsy and Turvy resolve by their DB spelling", () => {
  it("each twin has the voice made for them", () => {
    expect(resolveNamedNpcVoiceId("Topsy")).toBe("w03vWgAq1QMOM3DaeWzB")
    expect(resolveNamedNpcVoiceId("Turvy")).toBe("YewO1hdC7MZ2oDF0K8hX")
  })
})

describe("delivery profiles", () => {
  it("no voice has one now; an unknown voice gets none", () => {
    expect(deliveryFor(resolveNamedNpcVoiceId("Turvy"))).toBeNull()
    expect(deliveryFor(resolveNamedNpcVoiceId("Ront"))).toBeNull()
  })
})
