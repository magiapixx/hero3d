import { EffectComposer } from "postprocessing"
import { Vector2, WebGLRenderer } from "three"
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js"

/** Shared render state and the uniform objects every material reads by reference. */
export class Properties {
  static viewportWidth = 0
  static viewportHeight = 0
  static dpr = Math.min(2, window.devicePixelRatio || 1)
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
