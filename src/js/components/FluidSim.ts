// Fluid solver adapted from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT License).
// https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
import {
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RawShaderMaterial,
  type RenderTargetOptions,
  RGBAFormat,
  type ShaderMaterialParameters,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from "three"
import fluidAdvectionFrag from "../../shaders/fluid/fluidAdvectionFrag.glsl?raw"
import fluidVert from "../../shaders/fluid/fluidBaseVert.glsl?raw"
import fluidClearFrag from "../../shaders/fluid/fluidClearFrag.glsl?raw"
import fluidCurlFrag from "../../shaders/fluid/fluidCurlFrag.glsl?raw"
import fluidDivergenceFrag from "../../shaders/fluid/fluidDivergenceFrag.glsl?raw"
import fluidGradientSubtractFrag from "../../shaders/fluid/fluidGradientSubtractFrag.glsl?raw"
import fluidPressureFrag from "../../shaders/fluid/fluidPressureFrag.glsl?raw"
import fluidSplatFrag from "../../shaders/fluid/fluidSplatFrag.glsl?raw"
import fluidVorticityFrag from "../../shaders/fluid/fluidVorticityFrag.glsl?raw"
import { FBO } from "../common/FBO"
import { FBOHelper } from "../common/FBOHelper"
import { Input } from "../utils/input"
import { Properties } from "../utils/properties"
import { RAFCollection } from "../utils/RAFCollection"

/* -------------------------------------------------------------------------- */
/*                                    types                                   */
/* -------------------------------------------------------------------------- */
type TouchPoint = {
  position: Vector2
  prevPosition: Vector2
  lastUpdate: number
  lastSplat: number
  velocity: number
}

type FluidSimOptions = {
  simRes: number
  pressureIterations: number
  pressureDissipation: number
  velocityDissipation: number
  curlStrength: number
  splatRadius: number
  splatForce: number
}

/** Seconds of pointer stillness before the solve is skipped entirely. */
const IDLE_SLEEP_AFTER = 2.5

/** Reused for the per-frame pointer delta, so `updatePoint` allocates nothing. */
const pointerDelta = new Vector2()

/* -------------------------------------------------------------------------- */
/*                                    utils                                   */
/* -------------------------------------------------------------------------- */
function shouldSolveFluid(time: number, lastUserInput: number, sleepAfter: number): boolean {
  return time - lastUserInput <= sleepAfter
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
export class FluidSim {
  point: TouchPoint
  private isRunning = false
  private lastUserInput = 0

  // Private configuration
  private config: {
    simTexelSize: number
    aspect: number
  } & FluidSimOptions

  private materials: {
    curl: RawShaderMaterial
    vorticity: RawShaderMaterial
    divergence: RawShaderMaterial
    clear: RawShaderMaterial
    pressure: RawShaderMaterial
    gradientSubtract: RawShaderMaterial
    advection: RawShaderMaterial
    splat: RawShaderMaterial
  }
  private fbos: {
    velocity: FBO
    divergence: WebGLRenderTarget
    curl: WebGLRenderTarget
    pressure: FBO
  }

  // output (shared by reference into consumer materials): the hover-wake velocity field
  uniforms: { velocity: { value: Texture | null } }

  /* -------------------------------- materials ------------------------------- */
  /**
   * Every pass is the same shape: the shared fullscreen-quad vertex shader, no depth, and a
   * precision prefix. Only the fragment shader, its uniforms and that precision differ, so this
   * takes the differences and fills in the rest.
   */
  private createPassMaterial(
    fragmentShader: string,
    precision: string,
    uniforms: ShaderMaterialParameters["uniforms"],
    defines?: Record<string, boolean>
  ) {
    return FBOHelper.createRawShaderMaterial({
      uniforms,
      vertexShader: fluidVert,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      fragmentShaderPrefix: `precision ${precision} float;\nprecision ${precision} sampler2D;\n`,
      // spread rather than pass directly: three warns about an explicitly-undefined `defines`
      ...(defines ? { defines } : {}),
    })
  }

  /**
   * One material per step of the solve. The passes that integrate velocity need `highp` —
   * at mediump the field drifts and the wake visibly quantises. The ones that only take
   * finite differences of neighbours are fine at mediump, which is cheaper on mobile.
   */
  private createMaterials() {
    const capabilities = Properties.gl!.capabilities // FluidSim only exists when gl does
    const high = capabilities.getMaxPrecision("highp")
    const medium = capabilities.getMaxPrecision("mediump")

    // `u_texelSize` is per-material because each RawShaderMaterial owns its own uniform objects
    const texelSize = () => ({ u_texelSize: { value: new Vector2() } })

    return {
      splat: this.createPassMaterial(fluidSplatFrag, high, {
        ...texelSize(),
        u_tTarget: { value: null },
        u_aspectRatio: { value: 1 },
        u_splatColor: { value: new Vector3() },
        u_splatPosition: { value: new Vector2() },
        u_prevPoint: { value: new Vector2() },
        u_splatRadius: { value: 1 },
      }),

      curl: this.createPassMaterial(fluidCurlFrag, medium, {
        ...texelSize(),
        u_tVelocity: { value: null },
      }),

      vorticity: this.createPassMaterial(fluidVorticityFrag, high, {
        ...texelSize(),
        u_tVelocity: { value: null },
        u_tCurl: { value: null },
        u_curl: { value: this.config.curlStrength },
        u_dt: { value: 1 / 60 },
      }),

      divergence: this.createPassMaterial(fluidDivergenceFrag, medium, {
        ...texelSize(),
        u_tVelocity: { value: null },
      }),

      clear: this.createPassMaterial(fluidClearFrag, medium, {
        ...texelSize(),
        u_tTexture: { value: null },
        u_value: { value: this.config.pressureDissipation },
        u_dt: { value: 1 / 60 },
      }),

      pressure: this.createPassMaterial(fluidPressureFrag, medium, {
        ...texelSize(),
        u_tPressure: { value: null },
        u_tDivergence: { value: null },
      }),

      gradientSubtract: this.createPassMaterial(fluidGradientSubtractFrag, medium, {
        ...texelSize(),
        u_tPressure: { value: null },
        u_tVelocity: { value: null },
      }),

      advection: this.createPassMaterial(
        fluidAdvectionFrag,
        high,
        {
          ...texelSize(),
          u_tVelocity: { value: null },
          u_tSource: { value: null },
          u_dt: { value: 1 / 60 },
          u_dissipation: { value: 1 },
        },
        // Bilinear-filter the backtraced sample in the shader. WebGL cannot linearly filter float
        // textures everywhere, and there is no reliable capability flag for it in three, so the
        // manual path is always on rather than probed.
        { MANUAL_FILTERING: true }
      ),
    }
  }

  private createFBOs() {
    // Velocity drives the sim (advection) and is the field the bars sample for their tint.
    // HalfFloat + Linear is forced rather than chosen from a capability flag: smooth advection
    // needs linear sampling, and falling back to NearestFilter here visibly pixelates the wake.
    const velocity = new FBO(this.config.simRes, this.config.simRes, {
      format: RGBAFormat,
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    })
    const pressure = new FBO(this.config.simRes, this.config.simRes, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    })

    const renderTargetConfig: RenderTargetOptions = {
      type: FloatType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: false,
    }
    const divergence = new WebGLRenderTarget(this.config.simRes, this.config.simRes, renderTargetConfig)
    const curl = new WebGLRenderTarget(this.config.simRes, this.config.simRes, renderTargetConfig)

    return {
      velocity,
      pressure,
      divergence,
      curl,
    }
  }

  updatePoint() {
    const time = Properties.time
    this.point.position.copy(Input.mouseScreenXY)
    const point = this.point

    // Skip if updated too recently (60fps throttle)
    if (time - point.lastUpdate < 0.016) return

    pointerDelta.subVectors(point.position, point.prevPosition)
    const distance = pointerDelta.length()

    point.velocity += distance * 2

    if (distance > 0) {
      // genuine cursor movement: note it so the idle gate keeps solving
      if (distance > 0.001) {
        this.lastUserInput = time
      }

      const shouldStartNewLine = time - point.lastSplat > 0.15

      // Render velocity splat
      this.materials.splat.uniforms.u_tTarget.value = this.fbos.velocity.read.texture
      this.materials.splat.uniforms.u_aspectRatio.value = this.config.aspect
      this.materials.splat.uniforms.u_splatPosition.value.copy(point.position)
      this.materials.splat.uniforms.u_prevPoint.value.copy(shouldStartNewLine ? point.position : point.prevPosition)
      this.materials.splat.uniforms.u_splatColor.value
        .set(pointerDelta.x * this.config.aspect, pointerDelta.y, 0)
        .multiplyScalar(this.config.splatForce)
        .multiplyScalar(shouldStartNewLine ? 0 : 1)
      this.materials.splat.uniforms.u_splatRadius.value = this.config.splatRadius * point.velocity

      FBOHelper.render(this.materials.splat, this.fbos.velocity.write)
      this.fbos.velocity.swap()

      point.lastSplat = time
    }

    point.lastUpdate = time
    point.prevPosition.copy(point.position)
    point.velocity *= 0.9
    point.velocity = Math.min(1, point.velocity)
  }

  private solve(): void {
    this.config.aspect = Properties.globalUniforms.u_resolution.value.x / Properties.globalUniforms.u_resolution.value.y

    const savedAutoClear = Properties.gl!.autoClear
    const savedRenderTarget = Properties.gl!.getRenderTarget()
    Properties.gl!.autoClear = false

    this.updatePoint()

    // Idle gate: once input is stale and the field has dissipated, skip the solve to save GPU/battery.
    if (!shouldSolveFluid(Properties.time, this.lastUserInput, IDLE_SLEEP_AFTER)) {
      Properties.gl!.autoClear = savedAutoClear
      Properties.gl!.setRenderTarget(savedRenderTarget)
      return
    }

    // Compute curl of velocity field
    this.materials.curl.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.curl.uniforms.u_tVelocity.value = this.fbos.velocity.read.texture
    FBOHelper.render(this.materials.curl, this.fbos.curl)

    // Apply vorticity confinement
    this.materials.vorticity.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.vorticity.uniforms.u_tVelocity.value = this.fbos.velocity.read.texture
    this.materials.vorticity.uniforms.u_tCurl.value = this.fbos.curl.texture
    this.materials.vorticity.uniforms.u_curl.value = this.config.curlStrength
    this.materials.vorticity.uniforms.u_dt.value = Properties.deltaTime
    FBOHelper.render(this.materials.vorticity, this.fbos.velocity.write)
    this.fbos.velocity.swap()

    // Compute divergence of velocity field
    this.materials.divergence.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.divergence.uniforms.u_tVelocity.value = this.fbos.velocity.read.texture
    FBOHelper.render(this.materials.divergence, this.fbos.divergence)

    // Clear pressure field with dissipation
    this.materials.clear.uniforms.u_tTexture.value = this.fbos.pressure.read.texture
    this.materials.clear.uniforms.u_value.value = this.config.pressureDissipation
    this.materials.clear.uniforms.u_dt.value = Properties.deltaTime
    FBOHelper.render(this.materials.clear, this.fbos.pressure.write)
    this.fbos.pressure.swap()

    // Solve for pressure using Jacobi iteration
    this.materials.pressure.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.pressure.uniforms.u_tDivergence.value = this.fbos.divergence.texture

    for (let iteration = 0; iteration < this.config.pressureIterations; iteration++) {
      this.materials.pressure.uniforms.u_tPressure.value = this.fbos.pressure.read.texture
      FBOHelper.render(this.materials.pressure, this.fbos.pressure.write)
      this.fbos.pressure.swap()
    }

    // Subtract pressure gradient from velocity to make it divergence-free
    this.materials.gradientSubtract.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.gradientSubtract.uniforms.u_tPressure.value = this.fbos.pressure.read.texture
    this.materials.gradientSubtract.uniforms.u_tVelocity.value = this.fbos.velocity.read.texture
    FBOHelper.render(this.materials.gradientSubtract, this.fbos.velocity.write)
    this.fbos.velocity.swap()

    // Advect velocity through itself
    this.materials.advection.uniforms.u_texelSize.value.setScalar(this.config.simTexelSize)
    this.materials.advection.uniforms.u_tVelocity.value = this.fbos.velocity.read.texture
    this.materials.advection.uniforms.u_tSource.value = this.fbos.velocity.read.texture
    this.materials.advection.uniforms.u_dt.value = Properties.deltaTime
    this.materials.advection.uniforms.u_dissipation.value = this.config.velocityDissipation
    FBOHelper.render(this.materials.advection, this.fbos.velocity.write)
    this.fbos.velocity.swap()

    // Restore render state
    Properties.gl!.autoClear = savedAutoClear
    Properties.gl!.setRenderTarget(savedRenderTarget)

    // Update output uniform (shared by reference into the consumer material)
    this.uniforms.velocity.value = this.fbos.velocity.read.texture
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor(options: FluidSimOptions) {
    this.config = {
      ...options,
      simTexelSize: 1 / options.simRes,
      aspect: 1,
    }

    this.point = {
      position: new Vector2(0.5, 0.5),
      prevPosition: new Vector2(0.5, 0.5),
      lastUpdate: 0,
      lastSplat: 0,
      velocity: 0,
    }

    // create rts
    this.fbos = this.createFBOs()
    this.materials = this.createMaterials()

    // setup uniform
    this.uniforms = { velocity: { value: null } }

    this.solve = this.solve.bind(this)
    this.enable()
  }

  enable(): void {
    if (!this.isRunning) {
      this.isRunning = true

      RAFCollection.add(this.solve)
    }
  }

  disable(): void {
    if (this.isRunning) {
      this.isRunning = false
      RAFCollection.remove(this.solve)
    }
  }

  dispose(): void {
    this.disable()

    // Dispose all materials
    this.materials.clear.dispose()
    this.materials.splat.dispose()
    this.materials.curl.dispose()
    this.materials.vorticity.dispose()
    this.materials.divergence.dispose()
    this.materials.pressure.dispose()
    this.materials.gradientSubtract.dispose()
    this.materials.advection.dispose()

    // Dispose render targets
    this.fbos.velocity.dispose()
    this.fbos.pressure.dispose()
    this.fbos.divergence.dispose()
    this.fbos.curl.dispose()
  }
}
