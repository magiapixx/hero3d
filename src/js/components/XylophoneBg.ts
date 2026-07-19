import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from "three"
import xylophoneBgFrag from "../../shaders/xylophoneBg/xylophoneBgFrag.glsl?raw"
import xylophoneBgVert from "../../shaders/xylophoneBg/xylophoneBgVert.glsl?raw"
import { BG_LAYER } from "../configs/XylophoneConfig"

/** Fullscreen gradient behind the bars — also what the frosted transmission samples. */
export class XylophoneBg {
  readonly uniforms = {
    u_color: { value: new Color(0xa391d3) },
    u_debugPattern: { value: 0 }, // dev only: high-contrast checkerboard to read the transmission
  }

  private mesh?: Mesh
  private material?: ShaderMaterial
  private geometry?: PlaneGeometry

  build() {
    this.geometry = new PlaneGeometry(2, 2)
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: xylophoneBgVert,
      fragmentShader: xylophoneBgFrag,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    })

    this.mesh = new Mesh(this.geometry, this.material)
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false // clip-space quad has no meaningful bounds
    this.mesh.layers.enable(BG_LAYER) // also rendered in isolation into the backdrop buffer

    return this.mesh
  }

  dispose() {
    this.geometry?.dispose()
    this.material?.dispose()
  }
}
