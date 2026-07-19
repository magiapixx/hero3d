type RAFCallback = (delta: number) => void

/** Per-frame callbacks, driven by the app's single requestAnimationFrame loop. */
export class RAFCollection {
  private static callbacks = new Set<RAFCallback>()

  static add(callback: RAFCallback): void {
    this.callbacks.add(callback)
  }

  static remove(callback: RAFCallback): void {
    this.callbacks.delete(callback)
  }

  static forEach(fn: (callback: RAFCallback) => void): void {
    this.callbacks.forEach(fn)
  }
}
