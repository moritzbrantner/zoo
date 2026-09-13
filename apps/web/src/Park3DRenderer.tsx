import {
  createThreeSceneRenderer,
  projectWorldPoint,
  type RendererCamera,
  type RendererFrame,
  type RendererSceneNode,
  type ThreeSceneRenderer,
} from "@moritzbrantner/three-d-renderer"
import {useCallback, useEffect, useRef, useState} from "react"
import {createPortal} from "react-dom"
import initScene, {ParkCameraBridge} from "./scene-wasm/zoo_scene"

const RENDER_WIDTH = 1240
const RENDER_HEIGHT = 720
const RENDER_ASPECT = RENDER_WIDTH / RENDER_HEIGHT
const CANVAS_LEFT = 116
const CANVAS_TOP = -37
const ISO_ORIGIN_X = 620
const ISO_ORIGIN_Y = 68
const ISO_X_STEP = 29
const ISO_Y_STEP = 15
const DEFAULT_SHARED_YAW = 225
const DEFAULT_SHARED_PITCH = 31.15
const PITCH_STEP = 6

type TileKind = "grass" | "path" | "entrance" | "habitat" | "concession"

type TileDescriptor = {
  element: HTMLButtonElement
  x: number
  y: number
  kind: TileKind
}

type CameraFrame = RendererCamera & {
  yawDegrees: number
  pitchDegrees: number
  zoom: number
}

type Targets = {
  park: HTMLElement
  viewport: HTMLElement
}

const TILE_COLORS: Record<TileKind, `#${string}`> = {
  grass: "#74ad50",
  path: "#d1bb8d",
  entrance: "#d7a45f",
  habitat: "#6f9d49",
  concession: "#b69464",
}

function parseTile(element: Element): TileDescriptor | null {
  if (!(element instanceof HTMLButtonElement) || !element.classList.contains("tile")) return null
  const label = element.getAttribute("aria-label")
  const match = label?.match(/^(grass|path|entrance|habitat|concession) tile (\d+), (\d+)$/)
  if (!match) return null
  return {
    element,
    kind: match[1] as TileKind,
    x: Number(match[2]),
    y: Number(match[3]),
  }
}

function collectTiles(park: HTMLElement) {
  return [...park.querySelectorAll("button.tile")]
    .map(parseTile)
    .filter((tile): tile is TileDescriptor => tile !== null)
}

function readParkExtent(tiles: TileDescriptor[]) {
  return {
    width: Math.max(...tiles.map((tile) => tile.x)) + 1,
    height: Math.max(...tiles.map((tile) => tile.y)) + 1,
  }
}

function renderNodes(tiles: TileDescriptor[]): RendererSceneNode[] {
  return tiles.map((tile) => ({
    id: `tile:${tile.x}:${tile.y}`,
    transform: {
      // The +1 X offset is Zoo's presentation mapping from its legacy diamond anchor to the
      // center of the real 3D tile. Camera/projection math remains owned by 3d-lab.
      translation: [tile.x + 1, -0.06, tile.y],
    },
    geometry: {kind: "box", size: [1, 0.12, 1]},
    color: TILE_COLORS[tile.kind],
  }))
}

function relativeYaw(yawDegrees: number) {
  return ((yawDegrees - DEFAULT_SHARED_YAW) % 360 + 360) % 360
}

function relativePitch(pitchDegrees: number) {
  return Number((pitchDegrees - DEFAULT_SHARED_PITCH).toFixed(2))
}

function pseudoWorldPoint(left: number, top: number): [number, number, number] {
  const horizontal = (left - ISO_ORIGIN_X) / ISO_X_STEP
  const vertical = (top - ISO_ORIGIN_Y) / ISO_Y_STEP
  return [(horizontal + vertical) * 0.5, 0, (vertical - horizontal) * 0.5]
}

function inlineNumber(element: HTMLElement, property: "left" | "top") {
  const value = Number.parseFloat(element.style[property])
  return Number.isFinite(value) ? value : null
}

function captureCanonicalPosition(element: HTMLElement) {
  const left = inlineNumber(element, "left")
  const top = inlineNumber(element, "top")
  if (left === null || top === null) return null

  const appliedLeft = element.dataset.sharedRendererAppliedLeft
  const appliedTop = element.dataset.sharedRendererAppliedTop
  const currentLeft = element.style.left
  const currentTop = element.style.top
  if (
    element.dataset.sharedRendererBaseLeft === undefined ||
    currentLeft !== appliedLeft ||
    currentTop !== appliedTop
  ) {
    element.dataset.sharedRendererBaseLeft = String(left)
    element.dataset.sharedRendererBaseTop = String(top)
  }

  const baseLeft = Number(element.dataset.sharedRendererBaseLeft)
  const baseTop = Number(element.dataset.sharedRendererBaseTop)
  return Number.isFinite(baseLeft) && Number.isFinite(baseTop) ? {left: baseLeft, top: baseTop} : null
}

function projectDomOverlay(park: HTMLElement, camera: RendererCamera) {
  const viewport = {
    x: CANVAS_LEFT,
    y: CANVAS_TOP,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
  }

  for (const element of park.querySelectorAll<HTMLElement>("[style]")) {
    if (element.classList.contains("park-three-renderer-canvas")) continue
    const canonical = captureCanonicalPosition(element)
    if (!canonical) continue

    const tile = parseTile(element)
    const projected = tile
      ? projectWorldPoint(camera, [tile.x + 1, 0, tile.y], viewport)
      : projectWorldPoint(camera, pseudoWorldPoint(canonical.left, canonical.top), viewport)
    const nextLeft = tile ? projected.x - 29 : projected.x
    const nextTop = tile ? projected.y - 15 : projected.y
    const left = `${Number(nextLeft.toFixed(3))}px`
    const top = `${Number(nextTop.toFixed(3))}px`

    element.dataset.sharedRendererAppliedLeft = left
    element.dataset.sharedRendererAppliedTop = top
    if (element.style.left !== left) element.style.left = left
    if (element.style.top !== top) element.style.top = top
  }
}

function restoreDomOverlay(park: HTMLElement) {
  for (const element of park.querySelectorAll<HTMLElement>("[data-shared-renderer-base-left]")) {
    const left = Number(element.dataset.sharedRendererBaseLeft)
    const top = Number(element.dataset.sharedRendererBaseTop)
    if (Number.isFinite(left)) element.style.left = `${left}px`
    if (Number.isFinite(top)) element.style.top = `${top}px`
    delete element.dataset.sharedRendererBaseLeft
    delete element.dataset.sharedRendererBaseTop
    delete element.dataset.sharedRendererAppliedLeft
    delete element.dataset.sharedRendererAppliedTop
  }
}

function parseCameraFrame(bridge: ParkCameraBridge): CameraFrame {
  return JSON.parse(bridge.frame_json(RENDER_ASPECT)) as CameraFrame
}

export default function Park3DRenderer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<ThreeSceneRenderer | null>(null)
  const bridgeRef = useRef<ParkCameraBridge | null>(null)
  const renderRequestRef = useRef<number | null>(null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [cameraLabel, setCameraLabel] = useState({yaw: 0, pitch: 0})
  const [ready, setReady] = useState(false)

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

  const renderCurrent = useCallback(() => {
    if (!targets || !rendererRef.current || !bridgeRef.current) return false
    try {
      const tiles = collectTiles(targets.park)
      if (tiles.length === 0) return false

      const camera = parseCameraFrame(bridgeRef.current)
      const frame: RendererFrame = {
        camera,
        nodes: renderNodes(tiles),
      }
      rendererRef.current.render(frame)
      projectDomOverlay(targets.park, camera)

      const yaw = relativeYaw(camera.yawDegrees)
      const pitch = relativePitch(camera.pitchDegrees)
      targets.park.dataset.cameraYaw = String(yaw)
      targets.park.dataset.cameraPitch = String(pitch)
      const inverseYaw = `${-yaw}deg`
      const inversePitch = `${-pitch}deg`
      if (targets.park.style.getPropertyValue("--zoo-camera-yaw-inverse").trim() !== inverseYaw) {
        targets.park.style.setProperty("--zoo-camera-yaw-inverse", inverseYaw)
      }
      if (targets.park.style.getPropertyValue("--zoo-camera-pitch-inverse").trim() !== inversePitch) {
        targets.park.style.setProperty("--zoo-camera-pitch-inverse", inversePitch)
      }
      setCameraLabel((current) =>
        current.yaw === yaw && current.pitch === pitch ? current : {yaw, pitch},
      )
      if (!targets.park.classList.contains("shared-three-renderer")) {
        targets.park.classList.add("shared-three-renderer")
      }
      setReady(true)
      return true
    } catch (error) {
      console.error("Shared 3d-lab renderer frame rejected; restoring DOM presentation", error)
      restoreDomOverlay(targets.park)
      targets.park.classList.remove("shared-three-renderer")
      setReady(false)
      return false
    }
  }, [targets])

  const scheduleRender = useCallback(() => {
    if (renderRequestRef.current !== null) return
    renderRequestRef.current = window.requestAnimationFrame(() => {
      renderRequestRef.current = null
      renderCurrent()
    })
  }, [renderCurrent])

  const resetCamera = useCallback(() => {
    if (!targets) return
    const tiles = collectTiles(targets.park)
    if (tiles.length === 0) return
    const extent = readParkExtent(tiles)
    bridgeRef.current?.free()
    bridgeRef.current = new ParkCameraBridge(extent.width, extent.height)
    renderCurrent()
  }, [renderCurrent, targets])

  useEffect(() => {
    if (!targets) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let mutationObserver: MutationObserver | null = null
    let transformObserver: MutationObserver | null = null
    let lastInlineTransform = ""

    const syncBaseTransform = () => {
      const next = targets.park.style.transform || "translate(0px, 0px) scale(1)"
      if (next === lastInlineTransform) return
      lastInlineTransform = next
      if (targets.park.style.getPropertyValue("--zoo-base-transform").trim() !== next) {
        targets.park.style.setProperty("--zoo-base-transform", next)
      }
    }

    void initScene()
      .then(() => {
        if (cancelled) return
        const tiles = collectTiles(targets.park)
        if (tiles.length === 0) throw new Error("Zoo renderer requires tile scene data")
        const extent = readParkExtent(tiles)
        bridgeRef.current = new ParkCameraBridge(extent.width, extent.height)
        rendererRef.current = createThreeSceneRenderer(canvas, {alpha: true})
        rendererRef.current.setSize(RENDER_WIDTH, RENDER_HEIGHT, window.devicePixelRatio || 1)
        syncBaseTransform()
        renderCurrent()

        mutationObserver = new MutationObserver(scheduleRender)
        mutationObserver.observe(targets.park, {
          attributes: true,
          attributeFilter: ["aria-label", "class", "style"],
          childList: true,
          subtree: true,
        })
        transformObserver = new MutationObserver(syncBaseTransform)
        transformObserver.observe(targets.park, {attributes: true, attributeFilter: ["style"]})
      })
      .catch((error) => {
        console.error("Shared 3d-lab renderer failed; restoring DOM presentation", error)
        restoreDomOverlay(targets.park)
        targets.park.classList.remove("shared-three-renderer")
        setReady(false)
      })

    const resetForNewPark = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const button = event.target.closest<HTMLButtonElement>("button.secondary")
      if (button?.textContent?.trim() === "Start new park") {
        window.requestAnimationFrame(resetCamera)
      }
    }
    document.addEventListener("click", resetForNewPark)

    return () => {
      cancelled = true
      mutationObserver?.disconnect()
      transformObserver?.disconnect()
      document.removeEventListener("click", resetForNewPark)
      if (renderRequestRef.current !== null) {
        window.cancelAnimationFrame(renderRequestRef.current)
        renderRequestRef.current = null
      }
      rendererRef.current?.dispose()
      rendererRef.current = null
      bridgeRef.current?.free()
      bridgeRef.current = null
      restoreDomOverlay(targets.park)
      targets.park.classList.remove("shared-three-renderer")
      setReady(false)
    }
  }, [renderCurrent, resetCamera, scheduleRender, targets])

  const rotate = (steps: number) => {
    bridgeRef.current?.rotate_steps(steps)
    renderCurrent()
  }

  const tilt = (degrees: number) => {
    bridgeRef.current?.tilt_by_degrees(degrees)
    renderCurrent()
  }

  if (!targets) return null

  return (
    <>
      {createPortal(
        <canvas
          ref={canvasRef}
          className="park-three-renderer-canvas"
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          aria-hidden="true"
          data-shared-renderer={ready ? "ready" : "loading"}
        />,
        targets.park,
      )}
      {createPortal(
        <div className="camera-orbit-controls bevel" aria-label="3D camera orientation">
          <span className="camera-orbit-label">View</span>
          <button
            type="button"
            className="camera-orbit-left"
            onClick={() => rotate(-1)}
            title="Rotate camera left"
            aria-label="Rotate camera left"
          >
            ↶
          </button>
          <button
            type="button"
            className="camera-orbit-right"
            onClick={() => rotate(1)}
            title="Rotate camera right"
            aria-label="Rotate camera right"
          >
            ↷
          </button>
          <button
            type="button"
            className="camera-tilt-up"
            onClick={() => tilt(PITCH_STEP)}
            title="Lower camera"
            aria-label="Lower camera"
          >
            ▾
          </button>
          <button
            type="button"
            className="camera-tilt-down"
            onClick={() => tilt(-PITCH_STEP)}
            title="Raise camera"
            aria-label="Raise camera"
          >
            ▴
          </button>
          <button
            type="button"
            className="camera-orbit-reset"
            onClick={resetCamera}
            title="Reset 3D view"
            aria-label="Reset 3D view"
          >
            ⌂
          </button>
          <small aria-live="polite">
            {cameraLabel.yaw}° · {cameraLabel.pitch}°
          </small>
        </div>,
        targets.viewport,
      )}
    </>
  )
}
