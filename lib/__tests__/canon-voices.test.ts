import { describe, expect, it } from "vitest"
import { resolveNamedNpcVoiceId } from "../tts"
import { deliveryFor } from "../tts-model"

describe("Topsy and Turvy resolve by their DB spelling", () => {
  it("each twin has the voice made for them", () => {
    expect(resolveNamedNpcVoiceId("Topsy")).toBe("w03vWgAq1QMOM3DaeWzB")
    expect(resolveNamedNpcVoiceId("Turvy")).toBe("EC7ildPUimiMSKpYBrXY")
  })
})

describe("Turvy's delivery profile", () => {
  it("speaks on v3 with the accent direction, at a stability v3 accepts", () => {
    const turvy = deliveryFor(resolveNamedNpcVoiceId("Turvy"))
    expect(turvy?.model).toBe("eleven_v3")
    expect(turvy?.direction).toMatch(/romanian accent/i)
    expect([0, 0.5, 1]).toContain(turvy?.stability)
    expect(deliveryFor(resolveNamedNpcVoiceId("Ront"))).toBeNull()
  })
})
