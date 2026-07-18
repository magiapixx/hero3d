import {
  DoubleSide,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three"
import { Xylophone } from "./components/xylophone"
import { Input } from "./utils/input"
import { Properties } from "./utils/properties"
import { RAFCollection } from "./utils/RAFCollection"
import { FluidSim } from "./components/FluidSim"
import { FboHelper } from "./common/FBOHelper"
import { XylophoneBg } from "./components/XylophoneBg"
import { EffectPass, RenderPass, SSAOEffect, SMAAEffect, SMAAPreset } from "postprocessing"
import { FrostBackdropPass } from "./passes/FrostBackdropPass"
import { GlassBufferPass } from "./passes/GlassBufferPass"
import xylophoneVert from "../shaders/xylophone/xylophoneVert.glsl?raw"
import glassNormalFrag from "../shaders/xylophone/glassNormalFrag.glsl?raw"
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js"

import "../../css/base.css"

const PASS_INDEX = { frostBackdrop: 0, render: 1, normal: 2, ssao: 3, aa: 4 } as const

class App {
  gl: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera

  // components
  xylophone: Xylophone
  xylophoneBg: XylophoneBg

  // fluid
  fluid?: FluidSim

  // passes
  renderPass!: RenderPass
  frostBackdropPass?: FrostBackdropPass
  aaPass?: EffectPass
  normalMaterial?: ShaderMaterial
  normalPass?: GlassBufferPass
  ssaoEffect?: SSAOEffect
  ssaoPass?: EffectPass
  passConfig = {
    frost: 0.9,
  }

  // debug
  guiFolder?: GUI

  // variables
  dateTime = performance.now()
  size = { width: 0, height: 0 }
  isContextLost = false

  // Pre-bound methods to avoid creating new functions
  private boundUpdate = this.update.bind(this)
  private boundResize = this.resize.bind(this)

  /* ---------------------------------- fluid --------------------------------- */
  setupFluid() {
    this.fluid = new FluidSim({
      simRes: 128, // velocity field the reveal samples
      curlStrength: 0.2,
      splatRadius: 0.6,
      splatForce: 20,
      pressureIterations: 1,
      velocityDissipation: 0.93,
      pressureDissipation: 0.97,
    })
    this.fluid.enable()

    this.xylophone.setFluid(this.fluid?.uniforms.velocity)
  }

  /* --------------------------------- passes --------------------------------- */
  setupAA() {
    // antialiasing — must run last, on the composited image
    const smaaEffect = new SMAAEffect({ preset: SMAAPreset.ULTRA })
    this.aaPass = new EffectPass(this.camera, smaaEffect)
  }

  setupFrost() {
    // one bg render -> Gaussian-blurred backdrop the frosted bars transmit through
    this.frostBackdropPass = new FrostBackdropPass(this.scene, this.camera)
    this.frostBackdropPass.blurRadius = this.passConfig.frost * 48
    this.xylophone.uniforms.u_tBackdrop.value = this.frostBackdropPass.blurredTexture
  }

  // Contact shadows: SSAO darkens the crevices where the spiralling bars occlude each other
  // (the floating comp has no floor, so self-occlusion IS the shadow). SSAO needs a normal
  // buffer — three's NormalPass can't apply our instanced spin, so we render normals ourselves
  // with xylophoneVert + glassNormalFrag (view-space, matching the animated pose). Depth comes
  // from the main render pass automatically (SSAOEffect declares the DEPTH attribute).
  setupSSAO() {
    const u = this.xylophone.uniforms

    // view-normal material — shares the animation uniforms so the buffer tracks the live pose
    this.normalMaterial = new ShaderMaterial({
      vertexShader: xylophoneVert,
      fragmentShader: glassNormalFrag,
      side: DoubleSide, // match the display material so both plate faces write normals
      uniforms: {
        u_time: u.u_time,
        u_spinSpeed: u.u_spinSpeed,
        u_swingScale: u.u_swingScale,
        u_swingAxis: u.u_swingAxis,
      },
    })

    // side render of the bars (GLASS_LAYER) -> full-res view-normal buffer
    this.normalPass = new GlassBufferPass(this.scene, this.camera, this.normalMaterial, 1)

    this.ssaoEffect = new SSAOEffect(this.camera, this.normalPass.glassTexture, {
      samples: 16,
      rings: 7,
      radius: 0.1, // occlusion sampling radius (fraction of resolution)
      intensity: 2.2, // strength of the contact darkening
      bias: 0.03, // rejects self-occlusion on flat faces
      fade: 0.02,
      luminanceInfluence: 0.6, // let the bright frosted body keep some AO
      worldDistanceThreshold: 20,
      worldDistanceFalloff: 5,
      worldProximityThreshold: 3,
      worldProximityFalloff: 1,
      resolutionScale: 1, // AO is low-frequency; half-res is invisible and cheaper
    })
    this.ssaoPass = new EffectPass(this.camera, this.ssaoEffect)
  }

  private attachPasses() {
    if (this.frostBackdropPass) Properties.composer.addPass(this.frostBackdropPass, PASS_INDEX.frostBackdrop)
    Properties.composer.addPass(this.renderPass, PASS_INDEX.render)
    if (this.normalPass) Properties.composer.addPass(this.normalPass, PASS_INDEX.normal)
    if (this.ssaoPass) Properties.composer.addPass(this.ssaoPass, PASS_INDEX.ssao)
    if (this.aaPass) Properties.composer.addPass(this.aaPass, PASS_INDEX.aa)
  }

  private detachPasses() {
    if (this.frostBackdropPass) Properties.composer.removePass(this.frostBackdropPass)
    Properties.composer.removePass(this.renderPass)
    if (this.normalPass) Properties.composer.removePass(this.normalPass)
    if (this.ssaoPass) Properties.composer.removePass(this.ssaoPass)
    if (this.aaPass) Properties.composer.removePass(this.aaPass)
  }

  /* ---------------------------------- debug --------------------------------- */
  // lil-gui panel for live-tuning the frosted look. Binds directly to the live uniform
  // objects (edits apply instantly). Dev-only: Properties.gui is null in production.
  setupDebug() {
    if (!Properties.gui) return

    // rebuild-safe: drop the previous folder (e.g. after a context-restore rebuild)
    this.guiFolder?.destroy()

    const u = this.xylophone.uniforms
    const folder = Properties.gui.addFolder("Frosted")
    this.guiFolder = folder

    folder
      .add(this.passConfig, "frost", 0, 1, 0.01)
      .name("frost")
      .onChange((v: number) => {
        if (this.frostBackdropPass) this.frostBackdropPass.blurRadius = v * 48
      })
    folder.add(u.u_transmission, "value", 0, 1, 0.01).name("transmission")
    folder.add(u.u_refractStrength, "value", 0, 0.2, 0.001).name("refract strength")
    folder.add(u.u_fresnelPower, "value", 0, 10, 0.1).name("fresnel power")
    folder.add(u.u_fluidStrength, "value", 0, 3, 0.01).name("fluid strength")
    folder.add(u.u_tintStrength, "value", 0, 1, 0.01).name("tint strength")
    folder.add(u.u_tintGlow, "value", 0, 1, 0.01).name("tint glow")
    folder.add(u.u_hasEnvMap, "value", 0, 1, 1).name("use env map")

    const irid = folder.addFolder("Iridescence")
    irid.add(u.u_iridStrength, "value", 0, 2, 0.01).name("strength")
    irid.add(u.u_iridCycles, "value", 0, 8, 0.1).name("cycles")
    irid.add(u.u_iridShift, "value", 0, 1, 0.01).name("hue shift")
    irid.add(u.u_iridPower, "value", 0.5, 6, 0.1).name("rim power")
    irid.add(u.u_iridBody, "value", 0, 1, 0.01).name("body")

    // contact shadows (SSAO) — darkens the creases where the bars occlude each other
    if (this.ssaoPass && this.ssaoEffect) {
      const ao = folder.addFolder("Contact shadow")
      ao.add(this.ssaoPass, "enabled").name("enabled")
      ao.add(this.ssaoEffect.ssaoMaterial, "intensity", 0, 6, 0.05).name("intensity")
      ao.add(this.ssaoEffect.ssaoMaterial, "radius", 0.001, 0.5, 0.001).name("radius")
      ao.add(this.ssaoEffect.ssaoMaterial, "bias", 0, 0.2, 0.001).name("bias")
      ao.add(this.ssaoEffect.ssaoMaterial, "fade", 0, 0.2, 0.001).name("fade")
      ao.add(this.ssaoEffect, "samples", 1, 32, 1).name("samples")
    }

    // high-contrast bg so the transmission actually has something to reveal
    folder.add(this.xylophoneBg.uniforms.u_debugPattern, "value", 0, 1, 1).name("bg test pattern")
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor() {
    // init viewport
    Properties.viewportWidth = window.innerWidth
    Properties.viewportHeight = window.innerHeight

    // setup gl
    this.gl = new WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    })
    this.gl.outputColorSpace = SRGBColorSpace
    this.gl.toneMapping = NoToneMapping
    this.gl.setSize(window.innerWidth, window.innerHeight)

    this.gl.domElement.id = "canvas"
    this.gl.domElement.setAttribute("aria-hidden", "true")
    this.gl.domElement.style.position = "fixed"
    this.gl.domElement.style.left = "0px"
    this.gl.domElement.style.top = "0px"
    this.gl.domElement.style.pointerEvents = "none"
    this.gl.setPixelRatio(Properties.dpr)
    document.body.prepend(this.gl.domElement)
    Properties.gl = this.gl

    // Handle WebGL context loss (common on mobile when backgrounding app)
    this.gl.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault()
      console.warn("WebGL context lost")
      this.isContextLost = true
    })

    this.gl.domElement.addEventListener("webglcontextrestored", () => {
      console.log("WebGL context restored")
      this.isContextLost = false
      // Rebuild scene after context restoration
      this.buildScene()
    })

    // setup scene
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(45, Properties.viewportWidth / Properties.viewportHeight, 0.1, 200)
    this.camera.position.set(0, 0, 5)

    // setup composer + main render pass (passes render through this instead of gl.render)
    Properties.composer.setRenderer(this.gl)
    this.renderPass = new RenderPass(this.scene, this.camera)

    // pre init
    Input.preInit()
    FboHelper.init()

    // init components
    this.xylophone = new Xylophone()
    this.xylophoneBg = new XylophoneBg()
    this.buildScene()

    // Add resize listener
    this.resize()
    window.addEventListener("resize", this.boundResize)
    this.update()
    this.load()
  }

  load() {
    this.xylophone.load()
    this.xylophoneBg.load()
  }

  resize() {
    const sizerEl = document.getElementById("sizer")

    // fallback to window dimensions
    const newWidth = sizerEl ? sizerEl.getBoundingClientRect().width : window.innerWidth
    const newHeight = sizerEl ? sizerEl.getBoundingClientRect().height : window.innerHeight

    // update
    if (this.size.width !== newWidth || this.size.height !== newHeight) {
      Properties.viewportWidth = newWidth
      Properties.viewportHeight = newHeight
      Properties.globalUniforms.u_resolution.value.set(newWidth * Properties.dpr, newHeight * Properties.dpr)

      this.size.width = newWidth
      this.size.height = newHeight

      this.gl.setSize(newWidth, newHeight)
      Properties.composer.setSize(newWidth, newHeight)

      this.xylophone.resize()
      this.xylophoneBg.resize()

      this.camera.aspect = newWidth / newHeight
      this.camera.updateProjectionMatrix()
    }
  }

  buildScene() {
    this.scene.add(this.xylophone.buildScene())
    this.scene.add(this.xylophoneBg.buildScene())

    // post update
    this.setupFluid()

    // setup passes
    this.setupAA()
    this.setupFrost()
    this.setupSSAO()

    this.attachPasses()

    this.setupDebug()
  }

  update() {
    window.requestAnimationFrame(this.boundUpdate)

    // Skip rendering if WebGL context is lost
    if (this.isContextLost) {
      return
    }

    // get time
    const currDateTime = performance.now()
    let delta = (currDateTime - this.dateTime) / 1e3
    this.dateTime = currDateTime
    delta = Math.min(delta, 1 / 20)

    // update uniforms
    Properties.deltaTime = delta
    Properties.time += delta
    Properties.globalUniforms.u_deltaTime.value = Properties.deltaTime
    Properties.globalUniforms.u_time.value = Properties.time

    // update
    RAFCollection.forEach((callback) => callback(delta))

    // update components
    this.xylophone.update(delta)
    this.xylophoneBg.update()

    // render (composer runs frostBackdrop -> render -> normal -> ssao -> aa)
    Properties.composer.render(delta)

    // post update
    Input.postUpdate()
  }

  // Clean up resources on page unload
  destroy() {
    // Remove resize listener
    window.removeEventListener("resize", this.boundResize)

    Input.destroy()

    this.gl.dispose()
    this.detachPasses()
    this.guiFolder?.destroy()
  }
}

// Store app instance for cleanup
let app: App | null = null

window.addEventListener("load", () => {
  app = new App()
})

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  if (app) {
    app.destroy()
  }
})
