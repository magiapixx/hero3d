import { MathUtils, Vector2 } from "three"
import { Properties } from "./properties"
import { normalizeWheel } from "./normaliseWheel"

export class Input {
  static mouseXY = new Vector2()
  static mousePixelXY = new Vector2()
  static mouseScreenXY = new Vector2()

  static deltaXY = new Vector2()
  static deltaScreenXY = new Vector2()
  static deltaPixelXY = new Vector2()

  static _prevMouseXY = new Vector2()
  static prevMouseXY = new Vector2()
  static _prevMouseScreenXY = new Vector2()
  static prevMouseScreenXY = new Vector2()
  static _prevMousePixelXY = new Vector2()
  static prevMousePixelXY = new Vector2()

  // scroll
  static deltaScrollY = 0
  static lastScrollYDirection = 0

  // drag scroll
  static isDown = false
  static isTouch = false
  static isDragScrollingY = false
  static deltaDragScrollY = 0
  static canDesktopDragScroll = false

  private static downPixelXY = new Vector2()
  private static needsCheckDragScrollDirection = false

  // cache viewport dimensions for input calculations
  private static cachedViewportWidth = 0
  private static cachedViewportHeight = 0
  private static invViewportWidth = 0
  private static invViewportHeight = 0

  // store bound functions to fix memory leak
  private static boundOnMove: (e: MouseEvent) => void
  private static boundTouchMove: (e: TouchEvent) => void
  private static boundOnDown: (e: MouseEvent) => void
  private static boundTouchStart: (e: TouchEvent) => void
  private static boundOnUp: (e: MouseEvent) => void
  private static boundTouchEnd: (e: TouchEvent) => void
  private static _onWheelBound = (e: WheelEvent) => this._onWheel(e)

  /* --------------------------------- public --------------------------------- */
  static updateViewportCache() {
    if (
      this.cachedViewportWidth !== Properties.viewportWidth ||
      this.cachedViewportHeight !== Properties.viewportHeight
    ) {
      this.cachedViewportWidth = Properties.viewportWidth
      this.cachedViewportHeight = Properties.viewportHeight
      this.invViewportWidth = 1 / Properties.viewportWidth
      this.invViewportHeight = 1 / Properties.viewportHeight
    }
  }

  static preInit() {
    this.updateViewportCache()

    this.boundOnMove = this._onMove.bind(this) as (e: MouseEvent) => void
    this.boundOnDown = this._onDown.bind(this) as (e: MouseEvent) => void
    this.boundOnUp = this._onUp.bind(this) as (e: MouseEvent) => void
    this.boundTouchStart = this._getTouch(this, this._onDown)
    this.boundTouchEnd = this._getTouch(this, this._onUp)
    this.boundTouchMove = this._getTouch(this, this._onMove, () => this.isDragScrollingY)

    document.addEventListener("mousedown", this.boundOnDown, { passive: true })
    document.addEventListener("touchstart", this.boundTouchStart, { passive: true })
    document.addEventListener("mousemove", this.boundOnMove, { passive: true })
    document.addEventListener("touchmove", this.boundTouchMove, { passive: false })
    document.addEventListener("mouseup", this.boundOnUp, { passive: true })
    document.addEventListener("touchend", this.boundTouchEnd, { passive: true })
    document.addEventListener("wheel", this._onWheelBound, { passive: true })
  }

  static update() {}

  static postUpdate() {
    this.deltaScrollY = 0
    this.deltaDragScrollY = 0

    this.deltaXY.set(0, 0)
    this.deltaScreenXY.set(0, 0)
    this.deltaPixelXY.set(0, 0)
    this.prevMouseXY.copy(this.mouseXY)
    this.prevMouseScreenXY.copy(this.mouseScreenXY)
    this.prevMousePixelXY.copy(this.mousePixelXY)
  }

  static destroy() {
    document.removeEventListener("mousedown", this.boundOnDown)
    document.removeEventListener("touchstart", this.boundTouchStart)
    document.removeEventListener("mousemove", this.boundOnMove)
    document.removeEventListener("touchmove", this.boundTouchMove)
    document.removeEventListener("mouseup", this.boundOnUp)
    document.removeEventListener("touchend", this.boundTouchEnd)
    document.removeEventListener("wheel", this._onWheelBound)
  }

  /* ---------------------------------- utils --------------------------------- */
  static _getInputXY(ev: MouseEvent | Touch, outputVector: Vector2) {
    outputVector.set(ev.clientX * this.invViewportWidth * 2 - 1, 1 - ev.clientY * this.invViewportHeight * 2)

    return outputVector
  }

  static _getInputPixelXY(ev: MouseEvent | Touch, outputVector: Vector2) {
    outputVector.set(ev.clientX, ev.clientY)
  }

  static _getInputScreenXY(ev: MouseEvent | Touch, outputVector: Vector2) {
    outputVector.set(ev.clientX * this.invViewportWidth, 1 - ev.clientY * this.invViewportHeight)
  }

  /* -------------------------------- listeners ------------------------------- */
  static _onDown(e: MouseEvent | Touch) {
    this.isTouch = !(e instanceof MouseEvent)

    this._getInputPixelXY(e, this.downPixelXY)

    this.isDragScrollingY = false
    this.needsCheckDragScrollDirection = true

    this._onMove(e)

    this.isDown = true
  }

  static _onUp() {
    this.isDown = false
    this.isDragScrollingY = false
    this.needsCheckDragScrollDirection = false
  }

  static _onMove(e: MouseEvent | Touch) {
    this.updateViewportCache()

    // update input coordinates
    this._getInputXY(e, this.mouseXY)
    this._getInputScreenXY(e, this.mouseScreenXY)
    this._getInputPixelXY(e, this.mousePixelXY)

    // calculate deltas
    this.deltaXY.copy(this.mouseXY).sub(this._prevMouseXY)
    this.deltaScreenXY.copy(this.mouseScreenXY).sub(this._prevMouseScreenXY)
    this.deltaPixelXY.copy(this.mousePixelXY).sub(this._prevMousePixelXY)

    // store previous positions
    this._prevMouseXY.copy(this.mouseXY)
    this._prevMouseScreenXY.copy(this.mouseScreenXY)
    this._prevMousePixelXY.copy(this.mousePixelXY)

    if (!this.isDown) return
    if (!this.isTouch && !this.canDesktopDragScroll) return

    // lock the drag axis once per gesture: a mostly-vertical first move scrolls the
    // conveyor, a mostly-horizontal one is left alone (so it can't fight the page)
    if (this.needsCheckDragScrollDirection) {
      this.isDragScrollingY = Math.abs(this.deltaPixelXY.y) >= Math.abs(this.deltaPixelXY.x)
      this.needsCheckDragScrollDirection = false
    }

    // drag up = scroll down, matching wheel sign so both feed deltaScrollY in pixels
    if (this.isDragScrollingY) {
      this.deltaDragScrollY += -this.deltaPixelXY.y
      this.deltaScrollY += -this.deltaPixelXY.y
      if (this.deltaPixelXY.y !== 0) this.lastScrollYDirection = this.deltaPixelXY.y < 0 ? 1 : -1
    }
  }

  static _getTouch(context: Input, handler: (e: MouseEvent | Touch) => void, preventDefault?: () => boolean) {
    return (touchEvent: TouchEvent) => {
      if (preventDefault?.() && touchEvent.cancelable) {
        touchEvent.preventDefault()
      }

      // Safely get touch point with null checking
      const touch = touchEvent.changedTouches?.[0] || touchEvent.touches?.[0]
      if (touch) {
        handler.call(context, touch)
      }
    }
  }

  static _onWheel(e: WheelEvent) {
    const wheel = normalizeWheel(e)
    const sy = MathUtils.clamp(wheel.pixelY, -200, 200)

    this.deltaScrollY += sy
    if (sy !== 0) this.lastScrollYDirection = sy > 0 ? 1 : -1
  }
}
