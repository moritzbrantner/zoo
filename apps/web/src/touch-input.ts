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
        // The tile handlers deliberately prevent the default pointer action only
        // for direct-manipulation drag tools. Preserve implicit capture for the
        // click-based tools so small finger drift does not cancel their click.
        if (!event.defaultPrevented) return
        if (tile.hasPointerCapture(event.pointerId)) {
          tile.releasePointerCapture(event.pointerId)
        }
      }

      // Touch pointer capture is established as part of pointerdown dispatch.
      // Defer until React's tile handler has classified the gesture and marked
      // Path/Habitat drags with preventDefault().
      window.setTimeout(releaseImplicitCapture, 0)
    },
    {capture: true},
  )
}
