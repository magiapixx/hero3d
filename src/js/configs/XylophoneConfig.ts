/* -------------------------------------------------------------------------- */
/*                                   quality                                  */
/* -------------------------------------------------------------------------- */
// Coarse pointer + small viewport ≈ phone. A 2x pixel ratio, a full-res view-normal buffer and
// ULTRA SMAA together are more than a phone GPU holds at 60fps, so the tier scales them back
// instead of letting the frame rate collapse. Everything else (fluid, frost) is already cheap.
const isMobile =
  (window.matchMedia?.("(pointer: coarse)").matches ?? false) && Math.min(window.innerWidth, window.innerHeight) < 900

export const QUALITY = {
  isMobile,
  maxDpr: isMobile ? 1.5 : 2,
  /** view-normal buffer size, as a fraction of the screen */
  glassBufferScale: isMobile ? 0.5 : 1,
} as const

/* -------------------------------------------------------------------------- */
/*                                   layers                                   */
/* -------------------------------------------------------------------------- */
// Passes isolate content by narrowing the camera's layer mask, not by swapping scenes.
export const GLASS_LAYER = 1 // the bars — rendered again into the view-normal buffer (SSAO)
export const BG_LAYER = 2 // the backdrop — rendered again, blurred, for the frosted transmission

/* -------------------------------------------------------------------------- */
/*                                  xylophone                                 */
/* -------------------------------------------------------------------------- */
export const XYLOPHONE = {
  // helix layout
  count: 64,
  radius: 1,
  tiltFalloff: 2,
  thetaStep: 0.175,
  thetaOffset: Math.PI,

  // idle rotation — shared by the vertex shader and the CPU picker
  spinSpeed: 0.3,

  // tint gradient repeats every `tintWrap` bars
  tintWrap: 10,

  group: { scale: 0.5, rotXDeg: 25, rotZDeg: 30 },
  scroll: { sensitivity: 0.005, lerp: 5 },
} as const

export const AUDIO = {
  baseFreq: 523.25, // C5 — the pitch the sample was recorded at
  octaveSpan: 3,
} as const

/* -------------------------------------------------------------------------- */
/*                                    fluid                                   */
/* -------------------------------------------------------------------------- */
// Hover wake. Low-res on purpose: the bars only sample its velocity magnitude.
export const FLUID = {
  simRes: 128,
  curlStrength: 0.2,
  splatRadius: 0.6,
  splatForce: 20,
  pressureIterations: 1,
  velocityDissipation: 0.93,
  pressureDissipation: 0.97,
} as const

/* -------------------------------------------------------------------------- */
/*                                    post                                    */
/* -------------------------------------------------------------------------- */
export const FROST = {
  strength: 0.9, // 0..1, scaled to the gaussian kernel by FrostBackdropPass
  maxBlurPx: 48,
} as const

// Contact shadows. The floating comp has no floor, so bar-on-bar self-occlusion IS the shadow.
export const SSAO = {
  samples: 16,
  rings: 7,
  radius: 0.1, // sampling radius, as a fraction of resolution
  intensity: 2.2,
  bias: 0.03, // rejects self-occlusion on flat faces
  fade: 0.02,
  luminanceInfluence: 0.6, // let the bright frosted body keep some AO
  worldDistanceThreshold: 20,
  worldDistanceFalloff: 5,
  worldProximityThreshold: 3,
  worldProximityFalloff: 1,
  resolutionScale: QUALITY.isMobile ? 0.5 : 1,
} as const
