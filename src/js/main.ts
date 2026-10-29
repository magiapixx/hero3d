import { HeroScroll } from "./ui/HeroScroll"

import "../../css/base.css"

let heroScroll: HeroScroll | null = null

window.addEventListener("load", () => {
  // nothing to build anymore: drop the loader as soon as the page (and its fonts) are in
  document.body.classList.remove("loading")

  const stage = document.getElementById("hero-stage")
  const hero = document.getElementById("hero")
  if (stage && hero) {
    heroScroll = new HeroScroll(stage, hero)
    heroScroll.start()
  }
})

// pagehide, not beforeunload — beforeunload doesn't fire reliably on mobile Safari.
// `persisted` means the page is going into the back/forward cache and may come back without a new
// `load`, so keep the listeners alive in that case.
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return

  heroScroll?.destroy()
  heroScroll = null
})
