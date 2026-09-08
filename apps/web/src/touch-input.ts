let installed = false

export function installTouchTileDragSupport() {
  if (installed) return
  installed = true

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch" || !(event.target instanceof Element)) return

      const tile = event.target.closest(".tile")
      if (!(tile instanceof HTMLElement)) return

      const releaseImplicitCapture = () => {
        if (tile.hasPointerCapture(event.pointerId)) {
          tile.releasePointerCapture(event.pointerId)
        }
      }

      // Direct-manipulation touch pointers implicitly capture the pressed tile,
      // which suppresses pointerenter while the finger moves across neighboring
      // tiles. The path and habitat tools intentionally use those transitions.
      releaseImplicitCapture()
      window.setTimeout(releaseImplicitCapture, 0)
    },
    {capture: true},
  )
}
