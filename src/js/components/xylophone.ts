import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Ray,
  Raycaster,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three"
import { GLTFLoader, HDRLoader } from "three/examples/jsm/Addons.js"
import xylophoneFrag from "../../shaders/xylophone/xylophoneFrag.glsl?raw"
import xylophoneVert from "../../shaders/xylophone/xylophoneVert.glsl?raw"
import { GLASS_LAYER } from "../configs/XylophoneConfig"
import { Input } from "../utils/input"
import { Properties } from "../utils/properties"
import { XylophoneAudio } from "./XylophoneAudio"

/* -------------------------------------------------------------------------- */
/*                                    types                                   */
/* -------------------------------------------------------------------------- */
export type InstanceAttributes = { aPos: Float32Array; aRot: Float32Array }

export type InstanceConfig = {
  count: number
  radius: number
  tiltFalloff: number
  thetaStep: number
  thetaOffset: number
}

export type InstanceTransforms = {
  positions: Float32Array // count * 3
  rotations: Float32Array // count * 4
  tintOffsets: Float32Array // count
}

export type BuiltGeometry = {
  geometry: InstancedBufferGeometry
  localBox: Box3
  aStrikeTime: InstancedBufferAttribute
  transforms: InstanceTransforms
}

/* -------------------------------------------------------------------------- */
/*                                    math                                    */
/* -------------------------------------------------------------------------- */
function wrap(a: number, n: number): number {
  return ((a % n) + n) % n
}

/* -------------------------------------------------------------------------- */
/*                                    utils                                   */
/* -------------------------------------------------------------------------- */
export function writeHelixTransforms(
  phase: number,
  geometryHeight: number,
  cfg: InstanceConfig,
  positions: Float32Array,
  rotations: Float32Array,
  e: Euler,
  q: Quaternion
): void {
  const tiltX = Math.atan2(geometryHeight, cfg.radius * cfg.tiltFalloff)
  const halfHeight = ((cfg.count - 1) * geometryHeight) / 2

  for (let i = 0; i < cfg.count; i++) {
    const s = wrap(i + phase, cfg.count)
    const theta = s * cfg.thetaStep + cfg.thetaOffset

    positions[i * 3] = cfg.radius * Math.cos(theta)
    positions[i * 3 + 1] = s * geometryHeight - halfHeight
    positions[i * 3 + 2] = cfg.radius * Math.sin(theta)

    e.set(tiltX, -theta, 0)
    q.setFromEuler(e)
    rotations[i * 4] = q.x
    rotations[i * 4 + 1] = q.y
    rotations[i * 4 + 2] = q.z
    rotations[i * 4 + 3] = q.w
  }
}

export function buildInstanceTransforms(geometryHeight: number, cfg: InstanceConfig): InstanceTransforms {
  const positions = new Float32Array(cfg.count * 3)
  const rotations = new Float32Array(cfg.count * 4)
  const tintOffsets = new Float32Array(cfg.count)

  // rest layout is just the conveyor at phase 0
  writeHelixTransforms(0, geometryHeight, cfg, positions, rotations, new Euler(0, 0, 0, "YXZ"), new Quaternion())

  for (let i = 0; i < cfg.count; i++) {
    tintOffsets[i] = i / cfg.count
  }

  return { positions, rotations, tintOffsets }
}

export function buildInstancedGeometry(model: BufferGeometry, cfg: InstanceConfig): BuiltGeometry {
  model.computeBoundingBox()
  const bbox = model.boundingBox!
  const height = bbox.max.y - bbox.min.y
  const transforms = buildInstanceTransforms(height, cfg)

  const geometry = new InstancedBufferGeometry()
  geometry.index = model.index
  geometry.setAttribute("position", model.getAttribute("position"))
  geometry.setAttribute("normal", model.getAttribute("normal"))
  geometry.setAttribute("uv", model.getAttribute("uv"))
  geometry.setAttribute("aPos", new InstancedBufferAttribute(transforms.positions, 3))
  geometry.setAttribute("aRot", new InstancedBufferAttribute(transforms.rotations, 4))
  geometry.setAttribute("aTintOffset", new InstancedBufferAttribute(transforms.tintOffsets, 1))

  const aStrikeTime = new InstancedBufferAttribute(new Float32Array(cfg.count).fill(-1e9), 1)
  geometry.setAttribute("aStrikeTime", aStrikeTime)

  return { geometry, localBox: bbox.clone(), aStrikeTime, transforms }
}

/* -------------------------------------------------------------------------- */
/*                                  hit test                                  */
/* -------------------------------------------------------------------------- */
const SPIN_HALF_ANGLE = 3.14 * 0.25

// reusable temp math so hitBarIndex runs allocation-free every frame
type HitWorkspace = {
  spin: Quaternion
  aRotQ: Quaternion
  rotQ: Quaternion
  pos: Vector3
  scale: Vector3
  mat: Matrix4
  inv: Matrix4
  ray: Ray
  hit: Vector3
}

function createHitWorkspace(): HitWorkspace {
  return {
    spin: new Quaternion(),
    aRotQ: new Quaternion(),
    rotQ: new Quaternion(),
    pos: new Vector3(),
    scale: new Vector3(1, 1, 1),
    mat: new Matrix4(),
    inv: new Matrix4(),
    ray: new Ray(),
    hit: new Vector3(),
  }
}

export function hitBarIndex(
  worldRay: Ray,
  instances: InstanceAttributes,
  localBox: Box3,
  groupMatrixWorld: Matrix4,
  work: HitWorkspace
): number {
  const { aPos, aRot } = instances
  const count = aPos.length / 3

  work.spin.set(0, Math.sin(SPIN_HALF_ANGLE), 0, Math.cos(SPIN_HALF_ANGLE))

  let hitIndex = -1
  let hitDist = Infinity

  for (let i = 0; i < count; i++) {
    work.aRotQ.set(aRot[i * 4], aRot[i * 4 + 1], aRot[i * 4 + 2], aRot[i * 4 + 3])
    work.rotQ.multiplyQuaternions(work.spin, work.aRotQ)
    work.pos.set(aPos[i * 3], aPos[i * 3 + 1], aPos[i * 3 + 2])

    work.mat.compose(work.pos, work.rotQ, work.scale)
    work.mat.premultiply(groupMatrixWorld)
    work.inv.copy(work.mat).invert()

    work.ray.copy(worldRay).applyMatrix4(work.inv)
    const pt = work.ray.intersectBox(localBox, work.hit)
    if (pt) {
      const dist = work.ray.origin.distanceTo(pt)
      if (dist < hitDist) {
        hitDist = dist
        hitIndex = i
      }
    }
  }

  return hitIndex
}

/* -------------------------------------------------------------------------- */
/*                                  constants                                 */
/* -------------------------------------------------------------------------- */
const CONFIG = {
  count: 64,
  radius: 1,
  tiltFalloff: 2,
  thetaStep: 0.175,
  thetaOffset: Math.PI,
  group: { scale: 0.5, rotXDeg: 25, rotZDeg: 30 },
  tintWrap: 10,
  scroll: { sensitivity: 0.005, lerp: 5 },
} as const

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
export class Xylophone {
  // load
  gltfLoader = new GLTFLoader()
  hdrLoader = new HDRLoader()
  loaded = false

  // mesh
  modelGeometry?: BufferGeometry
  mesh?: Mesh
  group = new Group()

  readonly uniforms = {
    // global
    u_time: Properties.globalUniforms.u_time,

    // swing interaction
    u_spinSpeed: { value: 0.3 },
    u_swingScale: { value: 1.0 },
    u_swingAxis: { value: new Vector3(0, 1, 0) },

    // color interaction
    u_tFluid: { value: null as Texture | null },
    u_tGradient: { value: null as Texture | null },
    u_fluidStrength: { value: 1.0 },
    u_tintStrength: { value: 1.0 },
    u_tintGlow: { value: 0.15 },
    u_tintWrap: { value: CONFIG.tintWrap },

    // envmap
    u_tEnvMap: { value: null as Texture | null },
    u_hasEnvMap: { value: 1 },

    // background
    u_tBackdrop: { value: null as Texture | null },
    u_transmission: { value: 0.84 },
    u_refractStrength: { value: 0.2 },
    u_fresnelPower: { value: 3.0 },

    // iridescent
    u_iridStrength: { value: 0.6 },
    u_iridCycles: { value: 3.0 },
    u_iridShift: { value: 0.0 },
    u_iridPower: { value: 2.5 },
    u_iridBody: { value: 0.12 },

    // theme
    u_themeMix: { value: 1 },
  }

  // instancing
  private instances?: ReturnType<typeof buildInstancedGeometry>
  private hitInstances?: InstanceAttributes

  // strike (audio + swing)
  private audio?: XylophoneAudio
  private lastHitIndex = -1
  private readonly hitWorkspace = createHitWorkspace()

  // raycasting
  raycast = new Raycaster()

  // scroll
  private phaseTarget = 0 // raw accumulated scroll phase
  private phaseCurrent = 0 // eased follow (what actually drives the geometry)
  private phaseWritten = 0 // last phase written to the buffers (0 = the rest layout from buildScene)

  private readonly scrollEuler = new Euler(0, 0, 0, "YXZ")
  private readonly scrollQuat = new Quaternion()

  // vars
  private geometryHeight = 1 // bar bbox height (helix vertical pitch)

  /* ---------------------------------- utils --------------------------------- */
  private buildGradientTexture(): Texture {
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
    tex.needsUpdate = true

    return tex
  }

  /* --------------------------------- public --------------------------------- */
  setFluid(fluidVelocity: { value: Texture | null }) {
    this.uniforms.u_tFluid = fluidVelocity
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor() {}

  load() {
    this.gltfLoader.load(
      "/assets/models/xylophone-09.glb",
      (model) => {
        this.modelGeometry = (model.scene.children[0] as Mesh).geometry

        this.loaded = true
        this.buildScene()
      },
      undefined
    )

    this.hdrLoader.loadAsync("/assets/envmap/kloppenheim_06_puresky_1k.hdr").then((envMap) => {
      envMap.mapping = EquirectangularReflectionMapping
      this.uniforms.u_tEnvMap.value = envMap
    })
  }

  buildScene() {
    if (!this.loaded) return this.group

    // setup instances
    if (this.modelGeometry) {
      this.instances = buildInstancedGeometry(this.modelGeometry, CONFIG)
      this.geometryHeight = this.instances.localBox.max.y - this.instances.localBox.min.y
      this.hitInstances = { aPos: this.instances.transforms.positions, aRot: this.instances.transforms.rotations }

      // get material
      const displayMaterial = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: xylophoneVert,
        fragmentShader: xylophoneFrag,
        side: DoubleSide,
      })

      // create mesh
      this.mesh = new Mesh(this.instances.geometry, displayMaterial)
      this.mesh.layers.enable(GLASS_LAYER) // also rendered in isolation into the view-normal buffer (SSAO)
      this.group.add(this.mesh)

      // update uniforms
      this.uniforms.u_tGradient.value = this.buildGradientTexture()

      // setup audio
      this.audio = new XylophoneAudio({
        url: "/assets/audio/do.wav",
        count: CONFIG.count,
        baseFreq: 523.25,
        octaveSpan: 3,
      })
      void this.audio.load()
    }

    this.group.scale.setScalar(CONFIG.group.scale)
    this.group.rotation.set(MathUtils.degToRad(25), 0, MathUtils.degToRad(30))
    this.group.updateMatrixWorld()

    // reduced motion
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    this.uniforms.u_swingScale.value = reduceMotion ? 0 : 1

    // return
    return this.group
  }

  resize() {}

  update(delta: number, camera: PerspectiveCamera): void {
    if (!this.instances) return

    // scroll
    this.phaseTarget += Input.deltaScrollY * 0.005
    this.phaseCurrent = MathUtils.damp(this.phaseCurrent, this.phaseTarget, 5, delta)

    // update helix
    if (Math.abs(this.phaseCurrent - this.phaseWritten) > 1e-5) {
      const { positions, rotations } = this.instances.transforms

      writeHelixTransforms(
        this.phaseCurrent,
        this.geometryHeight,
        CONFIG,
        positions,
        rotations,
        this.scrollEuler,
        this.scrollQuat
      )

      this.instances.geometry.attributes.aPos.needsUpdate = true
      this.instances.geometry.attributes.aRot.needsUpdate = true

      this.phaseWritten = this.phaseCurrent
    }

    // hit testing
    if (!this.hitInstances) return
    const pointerReady = !(Input.mousePixelXY.x === 0 && Input.mousePixelXY.y === 0)
    if (!pointerReady) return

    this.raycast.setFromCamera(Input.mouseXY, camera)
    const index = hitBarIndex(
      this.raycast.ray,
      this.hitInstances,
      this.instances.localBox,
      this.group.matrixWorld,
      this.hitWorkspace
    )

    if (index !== -1 && index !== this.lastHitIndex) {
      this.instances.aStrikeTime.setX(index, Properties.time)
      this.instances.aStrikeTime.needsUpdate = true
      this.audio?.playNote(index)
    }
    this.lastHitIndex = index
  }
}
