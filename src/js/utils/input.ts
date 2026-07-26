import { MathUtils, Vector2 } from "three"
import { normalizeWheelY } from "./normalizeWheel"
import { Properties } from "./properties"

const MAX_SCROLL_PER_EVENT = 200 // one violent wheel notch shouldn't jump the whole helix
const DRAG_AXIS_LOCK_PX = 8 // travel before a touch drag commits to an axis
const DRAG_SCALE = 3

/**
 * Global pointer + wheel state, sampled once per frame by the components that need it.
 *
 * Deltas accumulate across every event in a frame and are cleared in `postUpdate()`, so a
 * consumer reading `deltaScrollY` sees the whole frame's scroll regardless of how many events
 * fired. Wheel and touch drag both normalise into `deltaScrollY`, so consumers never branch
 * on which device produced it.
 */
export class Input {
  /** NDC, -1..1 — raycasting */
  static mouseXY = new Vector2()
  /** 0..1 from the bottom-left — fluid splats */
  static mouseScreenXY = new Vector2()
  /** scroll pixels this frame, from the wheel or a vertical touch drag */
  static deltaScrollY = 0
  /** false until the first pointer event — (0,0) is a valid position, so it can't be the sentinel */
  static hasPointer = false

  // cached viewport reciprocals, refreshed on resize
  private static invViewportWidth = 0
  private static invViewportHeight = 0

  // touch drag — `wheel` never fires for touch, so a vertical drag drives the same scroll
  private static dragStartXY = new Vector2()
  private static dragPrevY = 0
  private static dragAxis: "none" | "x" | "y" = "none"

  /* -------------------------------- handlers -------------------------------- */
  private static readonly onMouseMove = (e: MouseEvent) => this.onMove(e)
  private static readonly onWheel = (e: WheelEvent) => {
    this.deltaScrollY += MathUtils.clamp(normalizeWheelY(e), -MAX_SCROLL_PER_EVENT, MAX_SCROLL_PER_EVENT)
  }

  private static readonly onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return

    this.dragStartXY.set(touch.clientX, touch.clientY)
    this.dragPrevY = touch.clientY
    this.dragAxis = "none"
    this.onMove(touch)
  }

  private static readonly onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0] ?? e.changedTouches[0]
    if (!touch) return

    this.onMove(touch)
    this.updateDrag(touch)
  }

  private static readonly onTouchEnd = () => {
    this.dragAxis = "none"
  }

  /* --------------------------------- public --------------------------------- */
  static init() {
    this.resize()

    document.addEventListener("mousemove", this.onMouseMove, { passive: true })
    document.addEventListener("wheel", this.onWheel, { passive: true })

    // passive is safe: `touch-action: none` on <body> suppresses native scrolling for us
    document.addEventListener("touchstart", this.onTouchStart, { passive: true })
    document.addEventListener("touchmove", this.onTouchMove, { passive: true })
    document.addEventListener("touchend", this.onTouchEnd, { passive: true })
    document.addEventListener("touchcancel", this.onTouchEnd, { passive: true })
  }

  static resize() {
    this.invViewportWidth = 1 / Properties.viewportWidth
    this.invViewportHeight = 1 / Properties.viewportHeight
  }

  /** Clears per-frame deltas. Call after every consumer has read them. */
  static postUpdate() {
    this.deltaScrollY = 0
  }

  static destroy() {
    document.removeEventListener("mousemove", this.onMouseMove)
    document.removeEventListener("wheel", this.onWheel)
    document.removeEventListener("touchstart", this.onTouchStart)
    document.removeEventListener("touchmove", this.onTouchMove)
    document.removeEventListener("touchend", this.onTouchEnd)
    document.removeEventListener("touchcancel", this.onTouchEnd)
  }

  /* -------------------------------- internal -------------------------------- */
  private static onMove(e: MouseEvent | Touch) {
    this.mouseXY.set(e.clientX * this.invViewportWidth * 2 - 1, 1 - e.clientY * this.invViewportHeight * 2)
    this.mouseScreenXY.set(e.clientX * this.invViewportWidth, 1 - e.clientY * this.invViewportHeight)
    this.hasPointer = true
  }

  /**
   * Axis-locked vertical drag. The first `DRAG_AXIS_LOCK_PX` of travel decide whether the
   * gesture is a scroll or a horizontal sweep across the bars; once locked it stays locked
   * for the rest of the touch, so a diagonal sweep doesn't also spin the helix.
   */
  private static updateDrag(touch: Touch) {
    if (this.dragAxis === "none") {
      const dx = touch.clientX - this.dragStartXY.x
      const dy = touch.clientY - this.dragStartXY.y
      if (Math.hypot(dx, dy) < DRAG_AXIS_LOCK_PX) return

      this.dragAxis = Math.abs(dy) > Math.abs(dx) ? "y" : "x"
      this.dragPrevY = touch.clientY // drop the pre-lock travel so the helix doesn't jump
    }

    if (this.dragAxis !== "y") return

    // dragging up scrolls forward, matching the wheel's sign
    const delta = (this.dragPrevY - touch.clientY) * DRAG_SCALE
    this.deltaScrollY += MathUtils.clamp(delta, -MAX_SCROLL_PER_EVENT, MAX_SCROLL_PER_EVENT)
    this.dragPrevY = touch.clientY
  }
}
