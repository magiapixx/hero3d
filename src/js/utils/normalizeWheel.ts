/**
 * Wheel deltas do not arrive in a single unit. `deltaMode` says which one the browser used:
 * pixels (every modern Chromium/WebKit build), lines (Firefox on some platforms), or pages.
 * Scrolling by a raw `deltaY` therefore moves a wildly different amount per browser.
 *
 * Converting to pixels here keeps the scroll consumer from having to know any of that.
 *
 * Reduced from Facebook's `normalizeWheel` to the one axis and one unit this demo uses. The
 * original also handled `wheelDelta`, `event.detail` and Gecko's `axis` property — all dead in
 * every browser that can run WebGL2, so none of it survives here.
 */

// WheelEvent.DOM_DELTA_* as plain constants — the named forms are instance properties, awkward
// to reach from a switch.
const DELTA_MODE_PIXEL = 0
const DELTA_MODE_LINE = 1
const DELTA_MODE_PAGE = 2

const PIXELS_PER_LINE = 40
const PIXELS_PER_PAGE = 800

/** Vertical wheel movement in pixels, whichever unit the browser reported it in. */
export function normalizeWheelY(event: WheelEvent): number {
  switch (event.deltaMode) {
    case DELTA_MODE_LINE:
      return event.deltaY * PIXELS_PER_LINE

    case DELTA_MODE_PAGE:
      return event.deltaY * PIXELS_PER_PAGE

    case DELTA_MODE_PIXEL:
    default:
      return event.deltaY
  }
}
