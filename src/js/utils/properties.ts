import { EffectComposer } from "postprocessing"
import { Vector2, WebGLRenderer } from "three"
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js"
import { QUALITY } from "../configs/XylophoneConfig"

/**
 * Shared render state and the uniform objects every material reads by reference.
 *
 * Deliberately a static singleton rather than something threaded through constructors. There is
 * exactly one renderer, one clock and one composer in this demo, and the alternative is passing
 * the same four things into every component and pass. The tradeoff to be aware of: `gl` and
 * `composer` are only valid after `App`'s constructor has run, which is why consumers that touch
 * `Properties.gl` assert it non-null — they are all built after that point.
 */
export class Properties {
  static viewportWidth = 0
  static viewportHeight = 0
  static dpr = Math.min(QUALITY.maxDpr, window.devicePixelRatio || 1)
  static reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

  static gl?: WebGLRenderer
  static composer = new EffectComposer()

  // clock
  static time = 0
  static deltaTime = 0

  // shared by reference into materials — assigning `.value` updates every consumer
  static globalUniforms = {
    u_time: { value: 0 },
    u_deltaTime: { value: 0 },
    u_resolution: { value: new Vector2() },
  }

  /** Dev-only tuning panel. null in production, and lil-gui is never bundled there. */
  static gui: GUI | null = null
}
