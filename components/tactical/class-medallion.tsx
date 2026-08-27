"use client"

// ============================================================================
// CLASS MEDALLION — one place that knows how a portrait is assembled.
//
// Three surfaces show a party portrait: the character card, the initiative
// rail, and the full sheet. Before this they each reached for
// portrait_image_url directly, so the class frame baked into that image was
// whatever the artist happened to paint. Fixing one surface and not the others
// would have left Kenta a Sorcerer on his card and a Bard on the rail.
//
// So all three come through here. Face underneath, class frame over it, both
// held in one box that keeps the authored 396x420 aspect — so they stay
// registered at any size from the rail's 44px to the sheet's 620px.
//
// The fallback path matters as much as the composite. A character whose art
// has not been separated yet, or a class with no frame commissioned, renders
// exactly the way it did before this existed. Nothing regresses while the art
// catches up.
// ============================================================================

import { MEDALLION, frameForClass } from "@/lib/class-frames"

export function ClassMedallion({
  faceUrl,
  portraitUrl,
  characterClass,
  /** Shown when there is no art at all. */
  fallback,
  className = "",
}: {
  faceUrl?: string | null
  portraitUrl?: string | null
  characterClass?: string | null
  fallback?: React.ReactNode
  className?: string
}) {
  const cls = frameForClass(characterClass)
  // Both halves or neither. A face with no ring is a portrait in a hole, which
  // looks more broken than the old baked medallion did.
  // Narrowing that actually survives: two named strings, not one union.
  const face = faceUrl && cls.frameUrl ? faceUrl : null
  const layered = face !== null

  if (!layered) {
    if (!portraitUrl) {
      return (
        <div className={"grid h-full w-full place-items-center " + className}>
          {fallback ?? <span style={{ color: cls.accent }}>{cls.sigil}</span>}
        </div>
      )
    }
    return <img src={portraitUrl} alt="" className={"h-full w-full object-cover object-top " + className} />
  }

  return (
    <div className={"relative h-full w-full overflow-hidden " + className}>
      {/* The frame and the face are ONE assembly that scales together. The
          inner box keeps the authored 396x420 aspect and is sized to cover
          whatever container it lands in; the parent's overflow does the
          cropping. Give the two layers independent object-cover transforms
          instead and they drift apart the moment the container is not 396x420
          — which is every container in this app. */}
      <div
        className="absolute left-1/2 top-0 h-full -translate-x-1/2"
        style={{ aspectRatio: String(MEDALLION.aspect) }}
      >
        <img
          src={face}
          alt=""
          className="absolute object-cover"
          style={{
            left: `${MEDALLION.faceLeft}%`,
            top: `${MEDALLION.faceTop}%`,
            width: `${MEDALLION.faceWidth}%`,
            height: `${MEDALLION.faceHeight}%`,
          }}
        />
        <img src={cls.frameUrl as string} alt="" className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  )
}
