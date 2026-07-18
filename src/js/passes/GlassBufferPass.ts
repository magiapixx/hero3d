import { Pass } from "postprocessing"
import {
  LinearFilter,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three"
import { GLASS_LAYER } from "../configs/XylophoneConfig"

/**
 * Renders the xylophone bars into a view-normal buffer using a supplied override
 * material (the glass G-buffer). Runs as a side render: it writes only to its own
 * target and leaves the composer's input/output buffers untouched
 * (`needsSwap = false`). SSAOEffect samples `glassTexture` as its normal buffer.
 *
 * Isolation is by layer, not by scene: the camera's layer mask is narrowed to
 * `GLASS_LAYER` for the duration of the render, so only meshes on that layer are
 * written. Non-glass meshes (e.g. the background) stay off `GLASS_LAYER`.
 */
export class GlassBufferPass extends Pass {
  private renderTarget: WebGLRenderTarget
  private glassScene: Scene
  private glassCamera: PerspectiveCamera

  // material
  private normalMaterial: ShaderMaterial

  // render target resolution as a fraction of the screen size
  private resolutionScale: number

  /* ----------------------------------- get ---------------------------------- */
  get glassTexture(): Texture {
    return this.renderTarget.texture
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor(scene: Scene, camera: PerspectiveCamera, normalMaterial: ShaderMaterial, resolutionScale = 0.5) {
    super("GlassBufferPass")

    // side render only — do not consume/produce the composer's main buffers
    this.needsSwap = false

    this.glassScene = scene
    this.glassCamera = camera
    this.normalMaterial = normalMaterial
    this.resolutionScale = resolutionScale

    this.renderTarget = new WebGLRenderTarget(1, 1, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true, // front-most bar's normal wins
      stencilBuffer: false,
      colorSpace: LinearSRGBColorSpace, // storing data, not color
    })
    this.renderTarget.texture.name = "GlassBuffer"
  }

  render(
    renderer: WebGLRenderer,
    _inputBuffer: WebGLRenderTarget | null,
    _outputBuffer: WebGLRenderTarget | null,
    _deltaTime?: number,
    _stencilTest?: boolean
  ): void {
    const prevTarget = renderer.getRenderTarget()
    const prevClearAlpha = renderer.getClearAlpha()
    const prevOverride = this.glassScene.overrideMaterial
    const prevLayerMask = this.glassCamera.layers.mask

    // isolate the glass layer so only the bars are written into the mask
    this.glassCamera.layers.set(GLASS_LAYER)

    renderer.setRenderTarget(this.renderTarget)
    renderer.setClearAlpha(0) // mask = 0 outside the bars
    renderer.clear()

    this.glassScene.overrideMaterial = this.normalMaterial
    renderer.render(this.glassScene, this.glassCamera)

    this.glassCamera.layers.mask = prevLayerMask
    this.glassScene.overrideMaterial = prevOverride
    renderer.setClearAlpha(prevClearAlpha)
    renderer.setRenderTarget(prevTarget)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width * this.resolutionScale))
    const h = Math.max(1, Math.round(height * this.resolutionScale))
    this.renderTarget.setSize(w, h)
  }

  dispose(): void {
    this.renderTarget.dispose()
    super.dispose()
  }
}
