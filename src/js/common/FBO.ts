import { FloatType, RenderTargetOptions, RGBAFormat, WebGLRenderTarget } from "three"
import { FBOHelper } from "./FBOHelper"

/**
 * Ping-pong render target pair. GPGPU passes can't read and write the same texture, so
 * each step reads `read` and renders into `write`, then `swap()`s them.
 */
export class FBO {
  private fbo1: WebGLRenderTarget
  private fbo2: WebGLRenderTarget

  constructor(width: number, height: number, options?: RenderTargetOptions) {
    const config: RenderTargetOptions = {
      format: RGBAFormat,
      type: FloatType,
      generateMipmaps: false,
      depthBuffer: false,
      ...options,
    }

    this.fbo1 = FBOHelper.createRenderTarget(width, height, config)
    this.fbo2 = FBOHelper.createRenderTarget(width, height, config)
  }

  get read() {
    return this.fbo1
  }

  get write() {
    return this.fbo2
  }

  swap() {
    const temp = this.fbo1
    this.fbo1 = this.fbo2
    this.fbo2 = temp
  }

  /** Disposing a render target releases its texture too — don't dispose the texture separately. */
  dispose() {
    this.fbo1.dispose()
    this.fbo2.dispose()
  }
}
