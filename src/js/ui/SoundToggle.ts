const STORAGE_KEY = "xylophone:sound"

// localStorage throws in some privacy modes — a lost preference is not worth breaking the page over
function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "off"
  } catch {
    return false
  }
}

function writeStoredMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "off" : "on")
  } catch {
    // preference just won't persist
  }
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */
export class SoundToggle {
  muted = readStoredMuted()

  private readonly el = document.getElementById("sound-toggle") as HTMLButtonElement | null
  private readonly label = this.el?.querySelector(".sound-toggle__text") ?? null
  private readonly onClick = () => this.set(!this.muted)

  constructor(private readonly onToggle: (muted: boolean) => void) {}

  mount() {
    this.el?.addEventListener("click", this.onClick)
    this.render()
    this.onToggle(this.muted) // apply the restored preference
  }

  destroy() {
    this.el?.removeEventListener("click", this.onClick)
  }

  private set(muted: boolean) {
    this.muted = muted
    writeStoredMuted(muted)
    this.render()
    this.onToggle(muted)
  }

  private render() {
    if (!this.el) return

    this.el.setAttribute("aria-pressed", String(!this.muted))
    this.el.classList.toggle("is-muted", this.muted)
    if (this.label) this.label.textContent = this.muted ? "Sound off" : "Sound on"
  }
}
