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
const DEFAULT_SHARED_YAW = 45
const DEFAULT_SHARED_PITCH = 31.15
const PITCH_STEP = 6
const PROJECTED_DEPTH_SCALE = 1_000_000
const PROJECTED_DEPTH_BASE = 1_000

type TileKind = "grass" | "path" | "entrance" | "habitat" | "concession"
type FenceSide = "north" | "east" | "south" | "west"
type WorldPoint = [number, number, number]

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

type OverlayRule = {
  offsetX: number
  offsetY: number
  snap: number
}

const PROJECTION_VIEWPORT = {
  x: CANVAS_LEFT,
  y: CANVAS_TOP,
  width: RENDER_WIDTH,
  height: RENDER_HEIGHT,
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

function pseudoWorldPoint(left: number, top: number): WorldPoint {
  const horizontal = (left - ISO_ORIGIN_X) / ISO_X_STEP
  const vertical = (top - ISO_ORIGIN_Y) / ISO_Y_STEP
  return [(horizontal + vertical) * 0.5, 0, (vertical - horizontal) * 0.5]
}

function legacyScreenPoint([x, , z]: WorldPoint) {
  return {
    left: ISO_ORIGIN_X + (x - z) * ISO_X_STEP,
    top: ISO_ORIGIN_Y + (x + z) * ISO_Y_STEP,
  }
}

function snap(value: number, step: number) {
  return Math.round(value / step) * step
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

function captureCanonicalZIndex(element: HTMLElement) {
  const current = element.style.zIndex
  const applied = element.dataset.sharedRendererAppliedZIndex
  if (element.dataset.sharedRendererBaseZIndex === undefined || current !== applied) {
    element.dataset.sharedRendererBaseZIndex = current
  }
}

function overlayRule(element: HTMLElement): OverlayRule | null {
  if (element.classList.contains("placement-price")) return {offsetX: 24, offsetY: -52, snap: 1}
  if (element.classList.contains("entrance-gate")) return {offsetX: -24, offsetY: -48, snap: 1}
  if (element.classList.contains("care-depot")) return {offsetX: 4, offsetY: -54, snap: 1}
  if (element.classList.contains("concession")) return {offsetX: 8, offsetY: -42, snap: 1}
  if (element.classList.contains("litter")) return {offsetX: 20, offsetY: 8, snap: 1}
  if (element.classList.contains("janitor")) return {offsetX: 22, offsetY: -8, snap: 1}
  if (element.classList.contains("maintenance-alert")) return {offsetX: 38, offsetY: -50, snap: 1}
  if (element.classList.contains("mechanic")) return {offsetX: 18, offsetY: -9, snap: 1}
  if (element.classList.contains("animal")) return {offsetX: 14, offsetY: -16, snap: 1}
  if (element.classList.contains("empty-habitat-marker")) return {offsetX: 15, offsetY: -10, snap: 0.5}
  if (element.classList.contains("guest")) return {offsetX: 24, offsetY: -4, snap: 1}
  if (element.classList.contains("park-entrance-building")) {
    return {offsetX: 0, offsetY: -64, snap: 1}
  }
  return null
}

function applyStyle(element: HTMLElement, property: keyof CSSStyleDeclaration, value: string) {
  if (element.style[property] !== value) {
    ;(element.style[property] as string) = value
  }
}

function applyCustomProperty(element: HTMLElement, property: string, value: string) {
  if (element.style.getPropertyValue(property) !== value) {
    element.style.setProperty(property, value)
  }
}

function applyProjectedDepth(element: HTMLElement, depth: number) {
  captureCanonicalZIndex(element)
  const clampedDepth = Number.isFinite(depth) ? Math.min(Math.max(depth, 0), 1) : 1
  const zIndex = String(
    PROJECTED_DEPTH_BASE + Math.round((1 - clampedDepth) * PROJECTED_DEPTH_SCALE),
  )
  element.dataset.sharedRendererDepth = clampedDepth.toFixed(6)
  element.dataset.sharedRendererAppliedZIndex = zIndex
  applyStyle(element, "zIndex", zIndex)
}

function tileTopCorners(x: number, z: number): WorldPoint[] {
  return [
    [x + 0.5, 0, z - 0.5],
    [x + 1.5, 0, z - 0.5],
    [x + 1.5, 0, z + 0.5],
    [x + 0.5, 0, z + 0.5],
  ]
}

function projectPolygonFootprint(
  element: HTMLElement,
  corners: WorldPoint[],
  camera: RendererCamera,
) {
  const projected = corners.map((corner) => projectWorldPoint(camera, corner, PROJECTION_VIEWPORT))
  const minX = Math.min(...projected.map((point) => point.x))
  const maxX = Math.max(...projected.map((point) => point.x))
  const minY = Math.min(...projected.map((point) => point.y))
  const maxY = Math.max(...projected.map((point) => point.y))
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const left = `${Number(minX.toFixed(3))}px`
  const top = `${Number(minY.toFixed(3))}px`
  const polygon = projected
    .map((point) => {
      const x = ((point.x - minX) / width) * 100
      const y = ((point.y - minY) / height) * 100
      return `${Number(x.toFixed(3))}% ${Number(y.toFixed(3))}%`
    })
    .join(", ")

  element.dataset.sharedRendererAppliedLeft = left
  element.dataset.sharedRendererAppliedTop = top
  applyStyle(element, "left", left)
  applyStyle(element, "top", top)
  applyStyle(element, "width", `${Number(width.toFixed(3))}px`)
  applyStyle(element, "height", `${Number(height.toFixed(3))}px`)
  applyStyle(element, "clipPath", `polygon(${polygon})`)
  return projected.reduce((total, point) => total + point.depth, 0) / projected.length
}

function projectTileFootprint(element: HTMLElement, tile: TileDescriptor, camera: RendererCamera) {
  projectPolygonFootprint(element, tileTopCorners(tile.x, tile.y), camera)
}

function canonicalWorldTile(canonical: {left: number; top: number}) {
  const [rawX, , rawZ] = pseudoWorldPoint(canonical.left, canonical.top)
  return {x: snap(rawX, 1), z: snap(rawZ, 1)}
}

function projectCanonicalTileFootprint(
  element: HTMLElement,
  canonical: {left: number; top: number},
  camera: RendererCamera,
) {
  const tile = canonicalWorldTile(canonical)
  return projectPolygonFootprint(element, tileTopCorners(tile.x, tile.z), camera)
}

function readFenceSide(element: HTMLElement): FenceSide | null {
  for (const side of ["north", "east", "south", "west"] as const) {
    if (
      element.classList.contains(`fence-${side}`) ||
      element.classList.contains(`park-boundary-fence-${side}`)
    ) {
      return side
    }
  }
  return null
}

function fenceEndpoints(x: number, z: number, side: FenceSide): [WorldPoint, WorldPoint] {
  const [northWest, northEast, southEast, southWest] = tileTopCorners(x, z)
  switch (side) {
    case "north":
      return [northWest, northEast]
    case "east":
      return [northEast, southEast]
    case "south":
      return [southWest, southEast]
    case "west":
      return [northWest, southWest]
  }
}

function projectFenceSegment(
  element: HTMLElement,
  canonical: {left: number; top: number},
  camera: RendererCamera,
) {
  const side = readFenceSide(element)
  if (!side) return false
  const tile = canonicalWorldTile(canonical)
  const [startWorld, endWorld] = fenceEndpoints(tile.x, tile.z, side)
  const start = projectWorldPoint(camera, startWorld, PROJECTION_VIEWPORT)
  const end = projectWorldPoint(camera, endWorld, PROJECTION_VIEWPORT)
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const width = Math.max(Math.hypot(deltaX, deltaY), 1)
  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI
  const elementHeight = Number.parseFloat(getComputedStyle(element).height)
  const halfHeight = Number.isFinite(elementHeight) ? elementHeight / 2 : 2.5
  const left = `${Number(start.x.toFixed(3))}px`
  const top = `${Number((start.y - halfHeight).toFixed(3))}px`
  const postAngle = `${Number((-angle).toFixed(3))}deg`

  element.dataset.sharedRendererAppliedLeft = left
  element.dataset.sharedRendererAppliedTop = top
  applyStyle(element, "left", left)
  applyStyle(element, "top", top)
  applyStyle(element, "width", `${Number(width.toFixed(3))}px`)
  applyStyle(element, "transformOrigin", "0 50%")
  applyStyle(element, "transform", `rotate(${Number(angle.toFixed(3))}deg)`)
  applyCustomProperty(element, "--fence-post-angle", postAngle)
  applyCustomProperty(element, "--park-fence-post-angle", postAngle)
  applyProjectedDepth(element, (start.depth + end.depth) / 2)
  return true
}

function inferWorldAnchor(canonical: {left: number; top: number}, rule: OverlayRule) {
  const [rawX, , rawZ] = pseudoWorldPoint(
    canonical.left - rule.offsetX,
    canonical.top - rule.offsetY,
  )
  return [snap(rawX, rule.snap), 0, snap(rawZ, rule.snap)] as WorldPoint
}

function projectOverlay(element: HTMLElement, canonical: {left: number; top: number}, camera: RendererCamera) {
  const rule = overlayRule(element)
  if (!rule) return
  const anchor = inferWorldAnchor(canonical, rule)
  const legacyAnchor = legacyScreenPoint(anchor)
  const residualX = canonical.left - rule.offsetX - legacyAnchor.left
  const residualY = canonical.top - rule.offsetY - legacyAnchor.top
  const projected = projectWorldPoint(camera, anchor, PROJECTION_VIEWPORT)
  const left = `${Number((projected.x + rule.offsetX + residualX).toFixed(3))}px`
  const top = `${Number((projected.y + rule.offsetY + residualY).toFixed(3))}px`

  element.dataset.sharedRendererAppliedLeft = left
  element.dataset.sharedRendererAppliedTop = top
  applyStyle(element, "left", left)
  applyStyle(element, "top", top)
  applyProjectedDepth(element, projected.depth)
}

function projectDomOverlay(park: HTMLElement, camera: RendererCamera) {
  for (const element of park.querySelectorAll<HTMLElement>("[style]")) {
    if (element.classList.contains("park-three-renderer-canvas")) continue
    const canonical = captureCanonicalPosition(element)
    if (!canonical) continue

    const tile = parseTile(element)
    if (tile) {
      projectTileFootprint(element, tile, camera)
      continue
    }
    if (
      element.classList.contains("placement-ghost") ||
      element.classList.contains("park-border-tile")
    ) {
      const depth = projectCanonicalTileFootprint(element, canonical, camera)
      applyProjectedDepth(element, depth)
      continue
    }
    if (
      (element.classList.contains("fence-segment") ||
        element.classList.contains("park-boundary-fence")) &&
      projectFenceSegment(element, canonical, camera)
    ) {
      continue
    }
    projectOverlay(element, canonical, camera)
  }
}

function restoreDomOverlay(park: HTMLElement) {
  for (const element of park.querySelectorAll<HTMLElement>("[data-shared-renderer-base-left]")) {
    const left = Number(element.dataset.sharedRendererBaseLeft)
    const top = Number(element.dataset.sharedRendererBaseTop)
    if (Number.isFinite(left)) element.style.left = `${left}px`
    if (Number.isFinite(top)) element.style.top = `${top}px`
    if (
      element.classList.contains("tile") ||
      element.classList.contains("placement-ghost") ||
      element.classList.contains("park-border-tile")
    ) {
      element.style.removeProperty("width")
      element.style.removeProperty("height")
      element.style.removeProperty("clip-path")
    }
    if (
      element.classList.contains("fence-segment") ||
      element.classList.contains("park-boundary-fence")
    ) {
      element.style.removeProperty("width")
      element.style.removeProperty("transform")
      element.style.removeProperty("transform-origin")
      element.style.removeProperty("--fence-post-angle")
      element.style.removeProperty("--park-fence-post-angle")
    }
    if (element.dataset.sharedRendererBaseZIndex !== undefined) {
      const baseZIndex = element.dataset.sharedRendererBaseZIndex
      if (baseZIndex === "") element.style.removeProperty("z-index")
      else element.style.zIndex = baseZIndex
    }
    delete element.dataset.sharedRendererBaseLeft
    delete element.dataset.sharedRendererBaseTop
    delete element.dataset.sharedRendererBaseZIndex
    delete element.dataset.sharedRendererAppliedLeft
    delete element.dataset.sharedRendererAppliedTop
    delete element.dataset.sharedRendererAppliedZIndex
    delete element.dataset.sharedRendererDepth
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

    const resetFromTopBar = () => {
      window.requestAnimationFrame(resetCamera)
    }
    const resetButton = document.querySelector<HTMLButtonElement>(".camera-reset")
    resetButton?.addEventListener("click", resetFromTopBar)

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
      resetButton?.removeEventListener("click", resetFromTopBar)
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
