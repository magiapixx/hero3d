import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three"
import { GLTFLoader, HDRLoader } from "three/examples/jsm/Addons.js"
import audioUrl from "../../../assets/audio/do.wav?url"
import envMapUrl from "../../../assets/envmap/kloppenheim_06_puresky_1k.hdr?url"
import modelUrl from "../../../assets/models/xylophone-09.glb?url"
import xylophoneFrag from "../../../shaders/xylophone/xylophoneFrag.glsl?raw"
import xylophoneVert from "../../../shaders/xylophone/xylophoneVert.glsl?raw"
import { AUDIO, GLASS_LAYER, XYLOPHONE } from "../../configs/XylophoneConfig"
import { Input } from "../../utils/input"
import { Properties } from "../../utils/properties"
import { XylophoneAudio } from "./XylophoneAudio"
import { buildInstancedGeometry, writeHelixTransforms, type BuiltGeometry } from "./helix"
import { createHitWorkspace, hitBarIndex, type InstanceAttributes } from "./picking"

/* -------------------------------------------------------------------------- */
/*                                    utils                                   */
/* -------------------------------------------------------------------------- */
/** 1px-tall spectrum ramp the bars sample for their hover tint. */
function buildGradientTexture(): Texture {
  const width = 256
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = 1

  const ctx = canvas.getContext("2d")!
  const grad = ctx.createLinearGradient(0, 0, width, 0)
  grad.addColorStop(0.0, "#ff0033")
  grad.addColorStop(0.3, "#ff00d4")
  grad.addColorStop(0.5, "#6a00ff")
  grad.addColorStop(0.8, "#0090ff")
  grad.addColorStop(1.0, "#00ffe1")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, 1)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping

  return tex
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
export class Xylophone {
  readonly group = new Group()

  readonly uniforms = {
    // global
    u_time: Properties.globalUniforms.u_time,

    // motion
    u_spinSpeed: { value: XYLOPHONE.spinSpeed },
    u_swingScale: { value: 1.0 }, // 0 under prefers-reduced-motion
    u_swingAxis: { value: new Vector3(0, 1, 0) },

    // hover tint
    u_tFluid: { value: null as Texture | null },
    u_tGradient: { value: null as Texture | null },
    u_fluidStrength: { value: 1.0 },
    u_tintStrength: { value: 1.0 },
    u_tintGlow: { value: 0.15 },
    u_tintWrap: { value: XYLOPHONE.tintWrap },

    // envmap
    u_tEnvMap: { value: null as Texture | null },
    u_hasEnvMap: { value: 1 },

    // frosted transmission
    u_tBackdrop: { value: null as Texture | null },
    u_transmission: { value: 0.84 },
    u_refractStrength: { value: 0.2 },
    u_fresnelPower: { value: 3.0 },

    // iridescence
    u_iridStrength: { value: 0.6 },
    u_iridCycles: { value: 3.0 },
    u_iridShift: { value: 0.0 },
    u_iridPower: { value: 2.5 },
    u_iridBody: { value: 0.12 },
  }

  // mesh
  private mesh?: Mesh
  private material?: ShaderMaterial
  private instances?: BuiltGeometry
  private hitInstances?: InstanceAttributes
  private geometryHeight = 1 // bar bbox height — the helix's vertical pitch

  // strike (audio + swing)
  private audio?: XylophoneAudio
  private lastHitIndex = -1
  private readonly raycast = new Raycaster()
  private readonly hitWorkspace = createHitWorkspace()

  // scroll — target accumulates raw wheel input, current eases toward it
  private phaseTarget = 0
  private phaseCurrent = 0
  private phaseWritten = 0 // last phase actually written to the buffers
  private readonly scrollEuler = new Euler(0, 0, 0, "YXZ")
  private readonly scrollQuat = new Quaternion()

  /* --------------------------------- public --------------------------------- */
  /** Shares the fluid's velocity uniform by reference — no per-frame copy. */
  setFluid(fluidVelocity: { value: Texture | null }) {
    this.uniforms.u_tFluid = fluidVelocity
  }

  /* --------------------------------- update --------------------------------- */
  /** Scroll drives the conveyor: rewrite the helix only when the eased phase actually moved. */
  private updateScroll(delta: number) {
    if (!this.instances) return

    this.phaseTarget += Input.deltaScrollY * XYLOPHONE.scroll.sensitivity
    this.phaseCurrent = MathUtils.damp(this.phaseCurrent, this.phaseTarget, XYLOPHONE.scroll.lerp, delta)

    if (Math.abs(this.phaseCurrent - this.phaseWritten) <= 1e-5) return

    const { positions, rotations } = this.instances.transforms
    writeHelixTransforms(
      this.phaseCurrent,
      this.geometryHeight,
      XYLOPHONE,
      positions,
      rotations,
      this.scrollEuler,
      this.scrollQuat
    )

    this.instances.geometry.attributes.aPos.needsUpdate = true
    this.instances.geometry.attributes.aRot.needsUpdate = true
    this.phaseWritten = this.phaseCurrent
  }

  /** Hovering a new bar strikes it: stamp the strike time (drives the swing) and play its note. */
  private updateStrike(camera: PerspectiveCamera) {
    if (!this.instances || !this.hitInstances || !Input.hasPointer) return

    this.raycast.setFromCamera(Input.mouseXY, camera)
    const index = hitBarIndex(
      this.raycast.ray,
      this.hitInstances,
      this.instances.localBox,
      this.group.matrixWorld,
      Properties.time,
      this.uniforms.u_spinSpeed.value,
      this.hitWorkspace
    )

    if (index !== -1 && index !== this.lastHitIndex) {
      this.instances.aStrikeTime.setX(index, Properties.time)
      this.instances.aStrikeTime.needsUpdate = true
      this.audio?.playNote(index)
    }

    this.lastHitIndex = index
  }

  /* ---------------------------------- load ---------------------------------- */
  private async loadEnvMap() {
    try {
      const envMap = await new HDRLoader().loadAsync(envMapUrl)
      envMap.mapping = EquirectangularReflectionMapping
      this.uniforms.u_tEnvMap.value = envMap
    } catch (err) {
      // the fragment shader falls back to a procedural sky when this stays unset
      console.warn("[Xylophone] env map failed to load — using procedural sky", err)
      this.uniforms.u_hasEnvMap.value = 0
    }
  }

  private async loadBars() {
    let modelGeometry: BufferGeometry
    try {
      const gltf = await new GLTFLoader().loadAsync(modelUrl)
      modelGeometry = (gltf.scene.children[0] as Mesh).geometry
    } catch (err) {
      console.error("[Xylophone] bar model failed to load — nothing to render", err)
      return
    }

    this.build(modelGeometry)
  }

  /* ---------------------------------- main ---------------------------------- */
  private build(modelGeometry: BufferGeometry) {
    this.instances = buildInstancedGeometry(modelGeometry, XYLOPHONE)
    this.geometryHeight = this.instances.localBox.max.y - this.instances.localBox.min.y
    this.hitInstances = {
      aPos: this.instances.transforms.positions,
      aRot: this.instances.transforms.rotations,
    }

    this.uniforms.u_tGradient.value = buildGradientTexture()

    // prefers-reduced-motion suppresses the strike swing, not the interaction
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    this.uniforms.u_swingScale.value = reduceMotion ? 0 : 1

    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: xylophoneVert,
      fragmentShader: xylophoneFrag,
      side: DoubleSide,
    })

    this.mesh = new Mesh(this.instances.geometry, this.material)
    this.mesh.layers.enable(GLASS_LAYER) // also rendered in isolation into the view-normal buffer (SSAO)
    this.group.add(this.mesh)

    this.audio = new XylophoneAudio({
      url: audioUrl,
      count: XYLOPHONE.count,
      baseFreq: AUDIO.baseFreq,
      octaveSpan: AUDIO.octaveSpan,
    })
    void this.audio.load()
  }

  async load() {
    this.group.scale.setScalar(XYLOPHONE.group.scale)
    this.group.rotation.set(MathUtils.degToRad(XYLOPHONE.group.rotXDeg), 0, MathUtils.degToRad(XYLOPHONE.group.rotZDeg))
    this.group.updateMatrixWorld()

    // the bars are required; the envmap is a nice-to-have, so let it fail on its own
    void this.loadEnvMap()
    await this.loadBars()
  }

  update(delta: number, camera: PerspectiveCamera): void {
    if (!this.instances || !this.hitInstances) return

    this.updateScroll(delta)
    this.updateStrike(camera)
  }

  dispose() {
    this.audio?.dispose()
    this.instances?.geometry.dispose()
    this.material?.dispose()
    this.uniforms.u_tGradient.value?.dispose()
    this.uniforms.u_tEnvMap.value?.dispose()

    if (this.mesh) this.group.remove(this.mesh)
  }
}
