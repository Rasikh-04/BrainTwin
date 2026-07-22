/**
 * First-run orientation state.
 *
 * The "About this demo" dialog auto-opens once per reviewer so the two-step
 * method and the honesty posture are framed before they touch anything. We
 * remember that it has been seen in localStorage, mirroring the theme handling
 * (lib/theme.ts): a preference that should survive a reload but is non-fatal if
 * storage is unavailable.
 */

export const INTRO_SEEN_KEY = "braintwin.intro.seen";

/** True once the reviewer has dismissed the orientation dialog at least once. */
export function hasSeenIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    // Storage disabled: treat as seen so we never trap a reviewer behind a
    // modal that cannot remember being dismissed.
    return true;
  }
}

/** Record that the orientation dialog has been dismissed. */
export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Non-fatal: the reviewer simply sees the intro again next session.
  }
}
