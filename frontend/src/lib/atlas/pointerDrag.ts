/**
 * Distinguishes an orbit-drag release from an intentional click/tap. R3F
 * fires `onClick` and `onPointerMissed` on pointerup based on whatever is
 * under the cursor at that moment, with no drag-distance threshold of its
 * own — so ending an orbit drag over a region (or over empty space) reads
 * as a click there. Record where the pointer went down, then check how far
 * it travelled before treating the release as a selection.
 */
const DRAG_THRESHOLD_PX = 6;

let downX = 0;
let downY = 0;
let hasDown = false;

export function recordPointerDown(x: number, y: number): void {
  downX = x;
  downY = y;
  hasDown = true;
}

export function wasDragged(x: number, y: number): boolean {
  if (!hasDown) return false;
  hasDown = false;
  return Math.hypot(x - downX, y - downY) > DRAG_THRESHOLD_PX;
}
