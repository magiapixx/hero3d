import { GaussianBlurPass, Pass } from "postprocessing"
import {
  LinearFilter,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three"
import { BG_LAYER } from "../configs/XylophoneConfig"

/**
 * Renders the bg-only content (BG_LAYER) once, then Gaussian-blurs it into a
 * separate target the frosted bars transmit through (sampled via u_tBackdrop).
 *
 * The blur uses postprocessing's GaussianBlurPass (blurs one target into another,
 * managing its own scratch buffers). Its low-res working buffers give a wide,
 * smooth frost cheaply — the frosted fragment takes a single tap of the result.
 *
 * Side render: writes only to its own targets, leaves the composer buffers
 * untouched (`needsSwap = false`). Isolation is by layer (camera mask narrowed to
 * BG_LAYER). Must run before the main render pass so the buffer is ready.
 */
export class FrostBackdropPass extends Pass {
  private renderTarget: WebGLRenderTarget // sharp bg render
  private blurredTarget: WebGLRenderTarget // Gaussian-blurred copy
  private bgScene: Scene
  private bgCamera: PerspectiveCamera

  private blurPass: GaussianBlurPass
  private blurMaterial: { scale: number }
  private blurInitialized = false

  /* ----------------------------------- get ---------------------------------- */
  // blurred bg (for the frosted transmission)
  get blurredTexture(): Texture {
    return this.blurredTarget.texture
  }

  /* ----------------------------------- set ---------------------------------- */
  // frost strength: main.ts sets `frost * 48`; map that to the gaussian kernel scale (~0..1)
  set blurRadius(px: number) {
    this.blurMaterial.scale = px / 48
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor(scene: Scene, camera: PerspectiveCamera) {
    super("FrostBackdropPass")

    // side render only — do not consume/produce the composer's main buffers
    this.needsSwap = false

    this.bgScene = scene
    this.bgCamera = camera

    const options = {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false, // single fullscreen layer, nothing to depth-sort
      stencilBuffer: false,
      colorSpace: SRGBColorSpace, // match the frosted body it is mixed against
    }
    this.renderTarget = new WebGLRenderTarget(1, 1, options)
    this.renderTarget.texture.name = "FrostBackdropSharp"
    this.blurredTarget = new WebGLRenderTarget(1, 1, options)
    this.blurredTarget.texture.name = "FrostBackdropBlurred"

    // half-res working buffers keep the wide frost cheap; scale tunes the spread at runtime
    this.blurPass = new GaussianBlurPass({ kernelSize: 35, iterations: 3, resolutionScale: 0.25 })
    this.blurMaterial = (this.blurPass as unknown as { blurMaterial: { scale: number } }).blurMaterial
  }

  render(
    renderer: WebGLRenderer,
    _inputBuffer: WebGLRenderTarget | null,
    _outputBuffer: WebGLRenderTarget | null,
    _deltaTime?: number,
    _stencilTest?: boolean
  ): void {
    const prevTarget = renderer.getRenderTarget()
    const prevLayerMask = this.bgCamera.layers.mask

    // isolate the bg layer so only the "behind glass" content is captured
    this.bgCamera.layers.set(BG_LAYER)

    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.bgScene, this.bgCamera)

    this.bgCamera.layers.mask = prevLayerMask
    renderer.setRenderTarget(prevTarget)

    // tag the blur's internal buffers to match the sRGB backdrop (one-time)
    if (!this.blurInitialized) {
      this.blurPass.initialize(renderer, true, UnsignedByteType)
      this.blurInitialized = true
    }

    // sharp bg -> blurred backdrop
    this.blurPass.render(renderer, this.renderTarget, this.blurredTarget)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    this.renderTarget.setSize(w, h)
    this.blurredTarget.setSize(w, h)
    this.blurPass.setSize(w, h)
  }

  dispose(): void {
    this.renderTarget.dispose()
    this.blurredTarget.dispose()
    this.blurPass.dispose()
    super.dispose()
  }
}
