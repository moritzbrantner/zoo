import {useEffect, useState} from "react"
import {createPortal} from "react-dom"

const DEFAULT_YAW = 0
const DEFAULT_PITCH = 18
const YAW_STEP = 45
const PITCH_STEP = 6

type CameraTargets = {
  park: HTMLElement
  viewport: HTMLElement
}

function clampPitch(value: number) {
  return Math.min(32, Math.max(6, value))
}

function normalizeYaw(value: number) {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export default function Park3DCamera() {
  const [targets, setTargets] = useState<CameraTargets | null>(null)
  const [yaw, setYaw] = useState(DEFAULT_YAW)
  const [pitch, setPitch] = useState(DEFAULT_PITCH)

  useEffect(() => {
    const root = document.getElementById("root")
    if (!root) return

    const sync = () => {
      const park = root.querySelector<HTMLElement>(".park")
      const viewport = root.querySelector<HTMLElement>(".viewport")
      if (!park || !viewport) return
      setTargets((current) =>
        current?.park === park && current.viewport === viewport ? current : {park, viewport},
      )
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, {childList: true, subtree: true})
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!targets) return

    const {park} = targets
    let lastInlineTransform = ""
    const syncBaseTransform = () => {
      const next = park.style.transform || "translate(0px, 0px) scale(1)"
      if (next === lastInlineTransform) return
      lastInlineTransform = next
      park.style.setProperty("--zoo-base-transform", next)
    }

    syncBaseTransform()
    const observer = new MutationObserver(syncBaseTransform)
    observer.observe(park, {attributes: true, attributeFilter: ["style"]})
    return () => observer.disconnect()
  }, [targets])

  useEffect(() => {
    if (!targets) return
    const {park} = targets
    park.style.setProperty("--zoo-camera-yaw", `${yaw}deg`)
    park.style.setProperty("--zoo-camera-pitch", `${pitch}deg`)
    park.style.setProperty("--zoo-camera-pitch-inverse", `${-pitch}deg`)
    park.dataset.cameraYaw = String(yaw)
    park.dataset.cameraPitch = String(pitch)
  }, [pitch, targets, yaw])

  useEffect(() => {
    if (!targets) return
    const resetButton = document.querySelector<HTMLButtonElement>(".camera-reset")
    if (!resetButton) return
    const reset3dCamera = () => {
      setYaw(DEFAULT_YAW)
      setPitch(DEFAULT_PITCH)
    }
    resetButton.addEventListener("click", reset3dCamera)
    return () => resetButton.removeEventListener("click", reset3dCamera)
  }, [targets])

  if (!targets) return null

  return createPortal(
    <div className="camera-orbit-controls bevel" aria-label="3D camera orientation">
      <span className="camera-orbit-label">View</span>
      <button
        type="button"
        className="camera-orbit-left"
        onClick={() => setYaw((current) => normalizeYaw(current - YAW_STEP))}
        title="Rotate camera left"
        aria-label="Rotate camera left"
      >
        ↶
      </button>
      <button
        type="button"
        className="camera-orbit-right"
        onClick={() => setYaw((current) => normalizeYaw(current + YAW_STEP))}
        title="Rotate camera right"
        aria-label="Rotate camera right"
      >
        ↷
      </button>
      <button
        type="button"
        className="camera-tilt-up"
        onClick={() => setPitch((current) => clampPitch(current + PITCH_STEP))}
        title="Lower camera"
        aria-label="Lower camera"
      >
        ▾
      </button>
      <button
        type="button"
        className="camera-tilt-down"
        onClick={() => setPitch((current) => clampPitch(current - PITCH_STEP))}
        title="Raise camera"
        aria-label="Raise camera"
      >
        ▴
      </button>
      <button
        type="button"
        className="camera-orbit-reset"
        onClick={() => {
          setYaw(DEFAULT_YAW)
          setPitch(DEFAULT_PITCH)
        }}
        title="Reset 3D view"
        aria-label="Reset 3D view"
      >
        ⌂
      </button>
      <small aria-live="polite">
        {yaw}° · {pitch}°
      </small>
    </div>,
    targets.viewport,
  )
}
