/* -------------------------------------------------------------------------- */
/*                                    types                                   */
/* -------------------------------------------------------------------------- */
type XylophoneAudioOptions = {
  /** URL of the recorded note sample (under public/). */
  url: string
  /** Number of bars / notes to tune. */
  count: number
  /** Fundamental pitch (Hz) the sample was recorded at — drives the pitch-shift ratio. */
  baseFreq: number
  /** How many octaves to spread the pentatonic scale across. Defaults to 3. */
  octaveSpan?: number
  /** Max simultaneous voices (anti-clip safeguard on fast sweeps). Defaults to 14. */
  maxVoices?: number
  /** Per-voice gain. Defaults to 0.6. */
  voiceGain?: number
}

/* -------------------------------------------------------------------------- */
/*                                   config                                   */
/* -------------------------------------------------------------------------- */
/** Major-pentatonic scale degrees, in semitones above the root. */
const PENTATONIC = [0, 2, 4, 7, 9]

/* -------------------------------------------------------------------------- */
/*                                    utils                                   */
/* -------------------------------------------------------------------------- */
/**
 * Per-bar frequency table spread over `octaveSpan` octaves of the major pentatonic
 * scale. Bar 0 sits at `base`; pitch rises up the helix. Spreading across octaves
 * keeps each voice's playbackRate near 1, so the pitch-shifted sample stays clean.
 */
export function buildPentatonicTable(count: number, base: number, octaveSpan: number): Float32Array {
  const notesPerOctave = PENTATONIC.length
  const totalNotes = notesPerOctave * octaveSpan
  const out = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0
    const n = Math.round(t * (totalNotes - 1))
    const oct = Math.floor(n / notesPerOctave)
    const semitones = PENTATONIC[n % notesPerOctave] + 12 * oct
    out[i] = base * 2 ** (semitones / 12)
  }

  return out
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
/**
 * Tiny polyphonic sampler: one recorded sample pitch-shifted to a pentatonic scale,
 * one throwaway AudioBufferSourceNode per note so overlapping hovers mix naturally.
 * The context starts suspended (autoplay policy) and wakes on the first user gesture;
 * a missing sample degrades to a silent no-op rather than throwing.
 */
export class XylophoneAudio {
  private ctx?: AudioContext
  private master?: GainNode
  private buffer?: AudioBuffer

  private readonly url: string
  private readonly baseFreq: number
  private readonly freq: Float32Array
  private readonly maxVoices: number
  private readonly voiceGain: number

  private disabled = false
  private activeVoices = 0

  // autoplay policy: the context boots suspended; the first real gesture resumes it
  private readonly onGesture = () => {
    this.resume()
    this.removeGestureListeners()
  }

  /* --------------------------------- utils ---------------------------------- */
  private resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume()
  }

  private disable(reason: string, err?: unknown) {
    this.disabled = true
    console.warn(`[XylophoneAudio] disabled — ${reason}`, err ?? "")
  }

  private addGestureListeners() {
    window.addEventListener("pointerdown", this.onGesture)
    window.addEventListener("keydown", this.onGesture)
    window.addEventListener("touchstart", this.onGesture)
  }

  private removeGestureListeners() {
    window.removeEventListener("pointerdown", this.onGesture)
    window.removeEventListener("keydown", this.onGesture)
    window.removeEventListener("touchstart", this.onGesture)
  }

  /* ---------------------------------- main ---------------------------------- */
  constructor(opts: XylophoneAudioOptions) {
    this.url = opts.url
    this.baseFreq = opts.baseFreq
    this.maxVoices = opts.maxVoices ?? 14
    this.voiceGain = opts.voiceGain ?? 0.6
    this.freq = buildPentatonicTable(opts.count, opts.baseFreq, opts.octaveSpan ?? 3)
  }

  async load() {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        this.disable("Web Audio not supported")
        return
      }

      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)

      const res = await fetch(this.url)
      if (!res.ok) throw new Error(`status ${res.status}`)
      this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer())

      this.addGestureListeners()
    } catch (err) {
      this.disable(`failed to load sample "${this.url}"`, err)
    }
  }

  playNote(index: number) {
    if (this.disabled || !this.ctx || !this.buffer || !this.master) return
    if (this.activeVoices >= this.maxVoices) return
    this.resume()

    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.playbackRate.value = this.freq[index] / this.baseFreq

    const gain = this.ctx.createGain()
    gain.gain.value = this.voiceGain

    src.connect(gain).connect(this.master)
    src.onended = () => {
      src.disconnect()
      gain.disconnect()
      this.activeVoices--
    }

    src.start()
    this.activeVoices++
  }

  dispose() {
    this.removeGestureListeners()
    this.master?.disconnect()
    void this.ctx?.close()
    this.ctx = undefined
    this.buffer = undefined
    this.master = undefined
  }
}
