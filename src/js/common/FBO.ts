import { FloatType, RenderTargetOptions, RGBAFormat, Texture, WebGLRenderTarget } from "three"
import { FboHelper } from "./FBOHelper"

export class FBO {
  _fbo1: WebGLRenderTarget

  _fbo2: WebGLRenderTarget

  // variables
  fbo: WebGLRenderTarget

  uniforms: { value: Texture }

  constructor(width: number, height: number, options?: RenderTargetOptions) {
    this._fbo1 = FboHelper.createRenderTarget(width, height, {
      format: RGBAFormat,
      type: FloatType,
      generateMipmaps: false,
      depthBuffer: false,
      ...options,
    })

    this._fbo2 = FboHelper.createRenderTarget(width, height, {
      format: RGBAFormat,
      type: FloatType,
      generateMipmaps: false,
      depthBuffer: false,
      ...options,
    })

    this.fbo = this._fbo1
    this.uniforms = { value: this._fbo1.texture }
  }

  swap() {
    const temp = this._fbo1
    this._fbo1 = this._fbo2
    this._fbo2 = temp

    this.uniforms.value = this._fbo1.texture
  }

  get read() {
    return this._fbo1
  }

  get write() {
    return this._fbo2
  }

  destroy() {
    this.uniforms.value.dispose()
    this._fbo1.dispose()
    this._fbo2.dispose()
  }
}
