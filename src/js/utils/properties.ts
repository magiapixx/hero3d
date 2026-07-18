import { Vector2 } from "three"
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js"

export type QualityLevel = "low" | "medium" | "high"

export interface SnakeConfig {
  length: number
  spineSegments: number
  radialSegments: number
  texturePoints: number
  dpr: number
  enableDebug: boolean
  shaderQuality: QualityLevel
  scaleMin: number
  scaleMax: number
}

export class Properties {
  static viewportWidth = 0
  static viewportHeight = 0
  static dpr = Math.min(2, window.devicePixelRatio) ?? 1

  // uniforms
  static globalUniforms = {
    u_time: { value: 0 },
    u_deltaTime: { value: 0 },

    u_resolution: { value: new Vector2() },
  }

  // Mobile detection
  static isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  static isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0

  // Quality level system
  static qualityLevel: QualityLevel = Properties.detectQualityLevel()
  static gui: GUI | null = import.meta.env.DEV ? new GUI() : null

  private static detectQualityLevel(): QualityLevel {
    // Mobile devices → low quality for performance
    if (this.isMobile) {
      console.log("[Properties] Detected quality: low (mobile device)")
      return "low"
    }

    // Desktop → always high quality, let DPR be what device supports
    console.log(`[Properties] Detected quality: high (desktop, DPR: ${this.dpr})`)
    return "high"
  }
}
