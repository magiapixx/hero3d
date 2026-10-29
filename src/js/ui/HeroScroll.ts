/** Per second: how quickly the eased progress closes on the scroll position. */
const EASE = 8

/**
 * Scroll timeline for the pinned hero.
 *
 * The stage is taller than the screen and the hero inside it is sticky, so scrolling through the
 * stage's extra height plays the hero's exit while the hero stays on screen. Progress through that
 * extra height (0..1) is eased toward the scroll position and published as `--p` on the hero, which
 * base.css maps onto each piece of copy's own exit window.
 */
export class HeroScroll {
  /** eased progress through the stage, 0..1 */
  progress = 0

  private target = 0
  private rafId = 0
  private lastTime = 0
  // reduced motion: follow the scroll exactly instead of gliding after it
  private readonly smooth = !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)

  private readonly onScroll = () => this.measure()
  private readonly onResize = () => {
    this.measureCue()
    this.measure()
  }

  constructor(
    private readonly stage: HTMLElement,
    private readonly hero: HTMLElement
  ) {}

  start() {
    window.addEventListener("scroll", this.onScroll, { passive: true })
    window.addEventListener("resize", this.onResize)
    this.measureCue()
    this.measure()
  }

  destroy() {
    window.removeEventListener("scroll", this.onScroll)
    window.removeEventListener("resize", this.onResize)
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  /**
   * How far the scroll cue drops to sit in the hero's bottom-right corner, published as --cue-dy.
   * Read from offsetTop, which ignores the cue's current translate, and inset by the header's top
   * padding so the corner margin matches the top edge.
   */
  private measureCue() {
    const cue = this.hero.querySelector<HTMLElement>(".hero__scroll")
    const header = this.hero.querySelector<HTMLElement>(".hero__header")
    if (!cue) return

    const style = getComputedStyle(cue)
    const textBottom = cue.offsetTop + cue.offsetHeight - parseFloat(style.paddingBottom)
    const inset = header ? parseFloat(getComputedStyle(header).paddingTop) : 0
    const dy = Math.max(this.hero.clientHeight - inset - textBottom, 0)

    this.hero.style.setProperty("--cue-dy", `${dy}px`)
  }

  private measure() {
    const range = this.stage.offsetHeight - this.hero.offsetHeight
    const top = this.stage.getBoundingClientRect().top
    this.target = range > 0 ? Math.min(Math.max(-top / range, 0), 1) : 0

    // the loop only runs while the eased value is catching up
    if (!this.rafId) {
      this.lastTime = performance.now()
      this.rafId = requestAnimationFrame(this.tick)
    }
  }

  private readonly tick = (now: number) => {
    const dt = Math.min(Math.max(now - this.lastTime, 0) / 1e3, 0.1)
    this.lastTime = now

    const k = this.smooth ? 1 - Math.exp(-EASE * dt) : 1
    this.progress += (this.target - this.progress) * k
    if (Math.abs(this.target - this.progress) < 1e-4) this.progress = this.target

    this.hero.style.setProperty("--p", this.progress.toFixed(4))
    // the exit styles (filter, 3D translate) only apply once it starts, so the resting hero renders untouched
    this.hero.classList.toggle("is-exiting", this.progress > 0)

    this.rafId = this.progress === this.target ? 0 : requestAnimationFrame(this.tick)
  }
}
