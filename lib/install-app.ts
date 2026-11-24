// INSTALL AS AN APP — what the title's install link offers on this device (components/install-app.tsx).
//
// Sam, 2026-11-23 ("PR6"; research of record: project doc claude/Tables_Invites_Saves_Research_2026-11-23.md,
// section F): "maybe an application we push out". Not a download: the website installs itself (a PWA, app/manifest.ts)
// and gets its own icon on the Windows taskbar, the desktop and the phone home screen, opens without browser bars, and
// is always the live version, so there is nothing to push out.
//
// How each browser does it:
//   Chrome and Edge (Windows, Mac, Android) hand the page an install prompt it can raise from a button  -> "prompt"
//   iPhone and iPad Safari have no prompt: the player uses Share, then Add to Home Screen               -> "ios"
//   Already opened from the installed icon                                                              -> "installed"
//   Anything else (Firefox desktop, an in-app browser) cannot install a site                             -> "none"
//
// Pure: no window.

export type InstallWay = "prompt" | "ios" | "installed" | "none"

export function installWay(o: { standalone: boolean; hasPrompt: boolean; userAgent: string; maxTouchPoints?: number }): InstallWay {
  if (o.standalone) return "installed"
  if (o.hasPrompt) return "prompt"
  const ua = o.userAgent || ""
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (o.maxTouchPoints ?? 0) > 1)
  // Only Safari can add to the home screen on older iOS; Chrome/Firefox on iOS ("CriOS", "FxiOS") and in-app
  // browsers (Instagram, Facebook) cannot, so they are told nothing they cannot do.
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV|Line\//i.test(ua)
  return ios && safari ? "ios" : "none"
}

export const INSTALL_TEXT = {
  link: "Install the game",
  iosTitle: "Put Ashes of Prometheus on your home screen",
  iosSteps: ["Tap the Share button at the bottom of Safari (the square with an arrow).", "Choose “Add to Home Screen”.", "Tap Add. The game now opens from its own icon, full screen."],
} as const
