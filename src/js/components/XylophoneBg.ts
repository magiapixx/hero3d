import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from "three"
import xylophoneBgFrag from "../../shaders/xylophoneBg/xylophoneBgFrag.glsl?raw"
import xylophoneBgVert from "../../shaders/xylophoneBg/xylophoneBgVert.glsl?raw"
import { BG_LAYER } from "../configs/XylophoneConfig"
import { Properties } from "../utils/properties"

export class XylophoneBg {
  // mesh
  private mesh?: Mesh

  uniforms = {
    u_color: { value: new Color(0xa391d3) },
    u_colorDark: { value: new Color(0x0e0e0e) },
    u_themeMix: { value: 1 },

    u_resolution: Properties.globalUniforms.u_resolution,
    u_debugPattern: { value: 0 },
  }

  /* ---------------------------------- main ---------------------------------- */
  load() {}

  buildScene() {
    const geometry = new PlaneGeometry(2, 2)

    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: xylophoneBgVert,
        fragmentShader: xylophoneBgFrag,
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
      })
    )
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false // clip-space quad has no meaningful bounds
    this.mesh.layers.enable(BG_LAYER) // also rendered in isolation into the bg-only buffer

    return this.mesh
  }

  resize() {}
  update() {}
  dispose() {}
}
