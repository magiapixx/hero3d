import { MathUtils, Vector2 } from "three"
import { Properties } from "./properties"
import { normalizeWheel } from "./normalizeWheel"

/**
 * Global pointer + wheel state, sampled once per frame by the components that need it.
 *
 * Deltas accumulate across every event in a frame and are cleared in `postUpdate()`, so a
 * consumer reading `deltaScrollY` sees the whole frame's scroll regardless of how many
 * wheel events fired.
 */
export class Input {
  /** NDC, -1..1 — raycasting */
  static mouseXY = new Vector2()
  /** 0..1 from the bottom-left — fluid splats */
  static mouseScreenXY = new Vector2()
  /** wheel pixels this frame */
  static deltaScrollY = 0
  /** false until the first pointer event — (0,0) is a valid position, so it can't be the sentinel */
  static hasPointer = false

  // cached viewport reciprocals, refreshed on resize
  private static invViewportWidth = 0
  private static invViewportHeight = 0

  private static readonly onMouseMove = (e: MouseEvent) => this.onMove(e)
  private static readonly onTouchMove = (e: TouchEvent) => {
    const touch = e.changedTouches?.[0] ?? e.touches?.[0]
    if (touch) this.onMove(touch)
  }
  private static readonly onWheel = (e: WheelEvent) => {
    this.deltaScrollY += MathUtils.clamp(normalizeWheel(e).pixelY, -200, 200)
  }

  /* --------------------------------- public --------------------------------- */
  static init() {
    this.resize()

    document.addEventListener("mousemove", this.onMouseMove, { passive: true })
    document.addEventListener("touchmove", this.onTouchMove, { passive: true })
    document.addEventListener("wheel", this.onWheel, { passive: true })
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
    document.removeEventListener("touchmove", this.onTouchMove)
    document.removeEventListener("wheel", this.onWheel)
  }

  /* -------------------------------- internal -------------------------------- */
  private static onMove(e: MouseEvent | Touch) {
    this.mouseXY.set(e.clientX * this.invViewportWidth * 2 - 1, 1 - e.clientY * this.invViewportHeight * 2)
    this.mouseScreenXY.set(e.clientX * this.invViewportWidth, 1 - e.clientY * this.invViewportHeight)
    this.hasPointer = true
  }
}
