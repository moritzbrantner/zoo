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
import type {PlacementEvaluation, Snapshot, Tool} from "./App"
import initScene, {ParkCameraBridge} from "./scene-wasm/zoo_scene"

const RENDER_WIDTH = 1240
const RENDER_HEIGHT = 720
const RENDER_ASPECT = RENDER_WIDTH / RENDER_HEIGHT
const DEFAULT_SHARED_YAW = 45
const DEFAULT_SHARED_PITCH = 31.15
const PITCH_STEP = 6

type TileKind = Snapshot["tiles"][number]["kind"]
type FenceSide = "north" | "east" | "south" | "west"
type WorldPoint = [number, number, number]
type TilePoint = {x: number; y: number}

type CameraFrame = RendererCamera & {
  yawDegrees: number
  pitchDegrees: number
  zoom: number
}

const RENDER_VIEWPORT = {
  width: RENDER_WIDTH,
  height: RENDER_HEIGHT,
}

const TILE_COLORS: Record<TileKind, `#${string}`> = {
  grass: "#74ad50",
  path: "#d1bb8d",
  entrance: "#d7a45f",
  habitat: "#6f9d49",
  concession: "#74ad50",
}

function tileCenter(x: number, y: number, height = 0): WorldPoint {
  return [x + 1, height, y]
}

function renderTerrainNodes(
  snapshot: Snapshot,
  selectedHabitatId: number | null,
  placement: PlacementEvaluation | null,
  hoveredTile: TilePoint | null,
  tool: Tool,
): RendererSceneNode[] {
  const nodes: RendererSceneNode[] = [
    {
      id: "terrain:outer-foundation",
      transform: {
        translation: [(snapshot.width + 1) * 0.5, -0.18, (snapshot.height - 1) * 0.5],
      },
      geometry: {kind: "box", size: [snapshot.width + 8, 0.24, snapshot.height + 8]},
      color: "#496b47",
    },
  ]

  for (const tile of snapshot.tiles) {
    const raised = tile.kind === "path" || tile.kind === "entrance" ? 0.08 : 0.06
    nodes.push({
      id: `tile:${tile.x}:${tile.y}`,
      transform: {translation: tileCenter(tile.x, tile.y, raised - 0.06)},
      geometry: {kind: "box", size: [0.98, 0.12, 0.98]},
      color: TILE_COLORS[tile.kind],
    })

    if (tile.habitat_id === selectedHabitatId) {
      nodes.push({
        id: `selection:habitat:${tile.x}:${tile.y}`,
        transform: {translation: tileCenter(tile.x, tile.y, 0.075)},
        geometry: {kind: "box", size: [0.9, 0.035, 0.9]},
        color: "#f6d36f",
        opacity: 0.52,
      })
    }

    if (
      hoveredTile?.x === tile.x &&
      hoveredTile.y === tile.y &&
      ["select", "path", "habitat", "food", "drink", "bulldoze"].includes(tool)
    ) {
      nodes.push({
        id: `hover:${tile.x}:${tile.y}`,
        transform: {translation: tileCenter(tile.x, tile.y, 0.105)},
        geometry: {kind: "box", size: [0.86, 0.025, 0.86]},
        color: tool === "bulldoze" ? "#d97462" : "#f6d36f",
        opacity: 0.32,
      })
    }
  }

  if (placement) {
    for (const tile of placement.occupied_tiles) {
      nodes.push({
        id: `placement:${tile.x}:${tile.y}`,
        transform: {translation: tileCenter(tile.x, tile.y, 0.13)},
        geometry: {kind: "box", size: [0.9, 0.035, 0.9]},
        color: placement.ok ? "#9dd56f" : "#c35c50",
        opacity: 0.44,
      })
    }
  }

  const side = entranceBoundarySide(snapshot)
  const direction =
    side === "west"
      ? {x: -1, z: 0}
      : side === "east"
        ? {x: 1, z: 0}
        : side === "north"
          ? {x: 0, z: -1}
          : {x: 0, z: 1}
  const start = tileCenter(snapshot.entrance.x, snapshot.entrance.y)
  for (let index = 1; index <= 4; index += 1) {
    nodes.push({
      id: `entrance:approach:${index}`,
      transform: {
        translation: [start[0] + direction.x * index, 0.02, start[2] + direction.z * index],
      },
      geometry: {kind: "box", size: [0.98, 0.12, 0.98]},
      color: "#d1bb8d",
    })
  }

  return nodes
}

type HexColor = `#${string}`

type FenceModelSegment = {
  id: string
  start: WorldPoint
  end: WorldPoint
  boundary: boolean
  preview: boolean
}

type RendererInputs = {
  snapshot: Snapshot
  placement: PlacementEvaluation | null
}

type Props = RendererInputs

function sceneBox(
  id: string,
  translation: WorldPoint,
  size: WorldPoint,
  color: HexColor,
  rotationQuaternion?: [number, number, number, number],
  opacity?: number,
): RendererSceneNode {
  return {
    id,
    transform:
      rotationQuaternion === undefined
        ? {translation}
        : {translation, rotationQuaternion},
    geometry: {kind: "box", size},
    color,
    ...(opacity === undefined ? {} : {opacity}),
  }
}

function sceneCylinder(
  id: string,
  translation: WorldPoint,
  radius: number,
  height: number,
  color: HexColor,
  opacity?: number,
): RendererSceneNode {
  return {
    id,
    transform: {translation},
    geometry: {kind: "cylinder", radius, height},
    color,
    ...(opacity === undefined ? {} : {opacity}),
  }
}

function sceneSphere(
  id: string,
  translation: WorldPoint,
  radius: number,
  color: HexColor,
): RendererSceneNode {
  return {
    id,
    transform: {translation},
    geometry: {kind: "sphere", radius},
    color,
  }
}

function worldPointKey([x, , z]: WorldPoint) {
  return `${x.toFixed(3)}:${z.toFixed(3)}`
}

function fenceEdgeKey(start: WorldPoint, end: WorldPoint) {
  const keys = [worldPointKey(start), worldPointKey(end)].sort()
  return `${keys[0]}--${keys[1]}`
}

function entranceBoundarySide(snapshot: Snapshot): FenceSide {
  if (snapshot.entrance.y <= 0) return "north"
  if (snapshot.entrance.y >= snapshot.height - 1) return "south"
  if (snapshot.entrance.x <= 0) return "west"
  return "east"
}

function boundaryFenceSegments(snapshot: Snapshot) {
  const segments: FenceModelSegment[] = []
  const entranceSide = entranceBoundarySide(snapshot)

  for (let x = 0; x < snapshot.width; x += 1) {
    if (!(entranceSide === "north" && x === snapshot.entrance.x)) {
      const [start, end] = fenceEndpoints(x, 0, "north")
      segments.push({id: `boundary:north:${x}`, start, end, boundary: true, preview: false})
    }
    if (!(entranceSide === "south" && x === snapshot.entrance.x)) {
      const [start, end] = fenceEndpoints(x, snapshot.height - 1, "south")
      segments.push({id: `boundary:south:${x}`, start, end, boundary: true, preview: false})
    }
  }

  for (let z = 0; z < snapshot.height; z += 1) {
    if (!(entranceSide === "west" && z === snapshot.entrance.y)) {
      const [start, end] = fenceEndpoints(0, z, "west")
      segments.push({id: `boundary:west:${z}`, start, end, boundary: true, preview: false})
    }
    if (!(entranceSide === "east" && z === snapshot.entrance.y)) {
      const [start, end] = fenceEndpoints(snapshot.width - 1, z, "east")
      segments.push({id: `boundary:east:${z}`, start, end, boundary: true, preview: false})
    }
  }

  return segments
}

function habitatFenceSegments(snapshot: Snapshot) {
  const segments = new Map<string, FenceModelSegment>()
  for (const habitat of snapshot.habitats) {
    for (const segment of habitat.fence_segments) {
      const [start, end] = fenceEndpoints(segment.x, segment.y, segment.side)
      const edge = fenceEdgeKey(start, end)
      if (!segments.has(edge)) {
        segments.set(edge, {
          id: `habitat:${habitat.id}:${edge}`,
          start,
          end,
          boundary: false,
          preview: false,
        })
      }
    }
  }
  return [...segments.values()]
}

function previewFenceSegments(placement: PlacementEvaluation | null) {
  if (!placement) return []
  return placement.fence_segments.map((segment, index) => {
    const [start, end] = fenceEndpoints(segment.x, segment.y, segment.side)
    return {
      id: `preview:${index}:${segment.x}:${segment.y}:${segment.side}`,
      start,
      end,
      boundary: false,
      preview: true,
    } satisfies FenceModelSegment
  })
}

function renderFenceNodes(snapshot: Snapshot, placement: PlacementEvaluation | null) {
  const boundary = boundaryFenceSegments(snapshot)
  const habitat = habitatFenceSegments(snapshot)
  const preview = previewFenceSegments(placement)
  const committed = new Map<string, FenceModelSegment>()

  for (const segment of [...habitat, ...boundary]) {
    const edge = fenceEdgeKey(segment.start, segment.end)
    const existing = committed.get(edge)
    if (!existing || segment.boundary) committed.set(edge, segment)
  }

  const committedSegments = [...committed.values()]
  const segments = [...committedSegments, ...preview]
  const nodes: RendererSceneNode[] = []
  const posts = new Map<string, {point: WorldPoint; boundary: boolean; preview: boolean}>()

  for (const segment of segments) {
    const deltaX = segment.end[0] - segment.start[0]
    const deltaZ = segment.end[2] - segment.start[2]
    const length = Math.hypot(deltaX, deltaZ)
    const alongX = Math.abs(deltaX) >= Math.abs(deltaZ)
    const centerX = (segment.start[0] + segment.end[0]) * 0.5
    const centerZ = (segment.start[2] + segment.end[2]) * 0.5
    const color: HexColor = segment.preview
      ? placement?.ok
        ? "#e8d276"
        : "#b6584c"
      : segment.boundary
        ? "#29463d"
        : "#38513c"
    const railSize: WorldPoint = alongX ? [length, 0.07, 0.075] : [0.075, 0.07, length]

    nodes.push(
      sceneBox(`fence:${segment.id}:rail:lower`, [centerX, 0.27, centerZ], railSize, color),
      sceneBox(`fence:${segment.id}:rail:upper`, [centerX, 0.51, centerZ], railSize, color),
    )

    for (const point of [segment.start, segment.end]) {
      const key = worldPointKey(point)
      const existing = posts.get(key)
      if (!existing || segment.boundary || (!existing.boundary && !segment.preview && existing.preview)) {
        posts.set(key, {
          point,
          boundary: segment.boundary || existing?.boundary === true,
          preview: segment.preview && existing?.boundary !== true,
        })
      }
    }
  }

  for (const [key, post] of [...posts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const color: HexColor = post.preview
      ? placement?.ok
        ? "#e8d276"
        : "#b6584c"
      : post.boundary
        ? "#243f38"
        : "#314937"
    nodes.push(
      sceneBox(
        `fence:post:${key}`,
        [post.point[0], 0.36, post.point[2]],
        [0.11, 0.72, 0.11],
        color,
      ),
      sceneCylinder(
        `fence:post-cap:${key}`,
        [post.point[0], 0.745, post.point[2]],
        0.075,
        0.05,
        "#8a876f",
      ),
    )
  }

  return {
    nodes,
    counts: {
      boundary: committedSegments.filter((segment) => segment.boundary).length,
      habitat: committedSegments.filter((segment) => !segment.boundary).length,
      preview: preview.length,
    },
  }
}

function yawForSide(side: FenceSide) {
  switch (side) {
    case "south":
      return 0
    case "east":
      return Math.PI / 2
    case "north":
      return Math.PI
    case "west":
      return -Math.PI / 2
  }
}

function yawQuaternion(yaw: number): [number, number, number, number] {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
}

function rotateLocalOffset(x: number, z: number, yaw: number) {
  const cosine = Math.cos(yaw)
  const sine = Math.sin(yaw)
  return {
    x: x * cosine + z * sine,
    z: -x * sine + z * cosine,
  }
}

function buildingBox(
  id: string,
  origin: {x: number; z: number},
  local: WorldPoint,
  size: WorldPoint,
  color: HexColor,
  yaw = 0,
) {
  const offset = rotateLocalOffset(local[0], local[2], yaw)
  return sceneBox(
    id,
    [origin.x + offset.x, local[1], origin.z + offset.z],
    size,
    color,
    yawQuaternion(yaw),
  )
}

function buildingCylinder(
  id: string,
  origin: {x: number; z: number},
  local: WorldPoint,
  radius: number,
  height: number,
  color: HexColor,
) {
  const offset = rotateLocalOffset(local[0], local[2], 0)
  return sceneCylinder(id, [origin.x + offset.x, local[1], origin.z + offset.z], radius, height, color)
}

function renderEntranceBuildingNodes(snapshot: Snapshot): RendererSceneNode[] {
  const origin = {x: snapshot.entrance.x + 1, z: snapshot.entrance.y}
  const yaw = yawForSide(entranceBoundarySide(snapshot))
  const wall: HexColor = "#d8c79d"
  const trim: HexColor = "#eadfbf"
  const roof: HexColor = "#9d4937"
  const door: HexColor = "#244d45"

  return [
    buildingBox("building:entrance:plinth", origin, [0, 0.06, 0], [1.72, 0.12, 0.94], "#b7aa88", yaw),
    buildingBox("building:entrance:left-wing", origin, [-0.56, 0.49, 0.01], [0.5, 0.86, 0.68], wall, yaw),
    buildingBox("building:entrance:right-wing", origin, [0.56, 0.49, 0.01], [0.5, 0.86, 0.68], wall, yaw),
    buildingBox("building:entrance:center", origin, [0, 0.62, -0.02], [0.58, 1.12, 0.74], wall, yaw),
    buildingBox("building:entrance:left-roof", origin, [-0.56, 0.96, 0], [0.62, 0.12, 0.82], roof, yaw),
    buildingBox("building:entrance:right-roof", origin, [0.56, 0.96, 0], [0.62, 0.12, 0.82], roof, yaw),
    buildingBox("building:entrance:left-window", origin, [-0.56, 0.57, 0.352], [0.22, 0.3, 0.035], "#87c7d8", yaw),
    buildingBox("building:entrance:right-window", origin, [0.56, 0.57, 0.352], [0.22, 0.3, 0.035], "#87c7d8", yaw),
    buildingCylinder("building:entrance:tower-roof", origin, [0, 1.22, -0.03], 0.42, 0.18, roof),
    buildingBox("building:entrance:door", origin, [0, 0.39, 0.39], [0.28, 0.54, 0.06], door, yaw),
    buildingBox("building:entrance:sign", origin, [0, 0.88, 0.405], [0.64, 0.18, 0.05], "#e0bf65", yaw),
    buildingBox("building:entrance:left-column", origin, [-0.23, 0.46, 0.405], [0.09, 0.68, 0.07], trim, yaw),
    buildingBox("building:entrance:right-column", origin, [0.23, 0.46, 0.405], [0.09, 0.68, 0.07], trim, yaw),
  ]
}

function depotOrigin(snapshot: Snapshot) {
  const depot = snapshot.animal_care_depot
  return {x: depot.x + 1, z: depot.y}
}

function concessionOrigin(stand: Snapshot["concessions"][number]) {
  return {x: stand.x + 1, z: stand.y}
}

function renderDepotBuildingNodes(snapshot: Snapshot): RendererSceneNode[] {
  const origin = depotOrigin(snapshot)
  const nodes: RendererSceneNode[] = [
    buildingBox("building:depot:plinth", origin, [0, 0.06, 0], [1.3, 0.12, 1.02], "#a9a68f"),
    buildingBox("building:depot:shell", origin, [0, 0.49, 0], [1.18, 0.86, 0.9], "#c9c4ae"),
    buildingBox("building:depot:roof", origin, [0, 0.98, 0], [1.32, 0.12, 1.04], "#5c716f"),
    buildingBox("building:depot:garage-door", origin, [0, 0.39, 0.475], [0.72, 0.56, 0.05], "#42695f"),
    buildingBox("building:depot:sign", origin, [0, 0.84, 0.495], [0.62, 0.17, 0.05], "#d7c891"),
    buildingCylinder("building:depot:roof-vent", origin, [-0.28, 1.16, -0.08], 0.075, 0.22, "#6f7e7b"),
    buildingBox("building:depot:side-window", origin, [0.39, 0.64, 0.458], [0.24, 0.2, 0.025], "#87c7d8"),
  ]

  for (const [index, y] of [0.18, 0.31, 0.44, 0.57].entries()) {
    nodes.push(
      buildingBox(
        `building:depot:garage-slat:${index}`,
        origin,
        [0, y, 0.508],
        [0.66, 0.025, 0.018],
        "#eadfbf",
      ),
    )
  }

  return nodes
}

function renderConcessionNodes(snapshot: Snapshot): RendererSceneNode[] {
  const nodes: RendererSceneNode[] = []

  for (const stand of snapshot.concessions) {
    const origin = concessionOrigin(stand)
    const accent: HexColor = stand.kind === "food" ? "#d89b47" : "#75b7cc"
    const serviceAccent: HexColor =
      stand.service_state === "failed"
        ? "#8c443e"
        : stand.service_state === "degraded"
          ? "#c18a43"
          : accent

    nodes.push(
      buildingBox(`concession:${stand.id}:counter`, origin, [0, 0.38, 0], [0.82, 0.7, 0.62], accent),
      buildingBox(
        `concession:${stand.id}:service-window`,
        origin,
        [0, 0.47, 0.322],
        [0.54, 0.28, 0.025],
        "#493722",
      ),
      buildingBox(
        `concession:${stand.id}:serving-counter`,
        origin,
        [0, 0.31, 0.38],
        [0.68, 0.14, 0.16],
        "#eadfbf",
      ),
      buildingCylinder(
        `concession:${stand.id}:awning-post:left`,
        origin,
        [-0.42, 0.66, 0.28],
        0.025,
        0.54,
        "#eadfbf",
      ),
      buildingCylinder(
        `concession:${stand.id}:awning-post:right`,
        origin,
        [0.42, 0.66, 0.28],
        0.025,
        0.54,
        "#eadfbf",
      ),
      buildingBox(
        `concession:${stand.id}:menu-sign`,
        origin,
        [0, 1.02, 0.03],
        [0.5, 0.23, 0.08],
        serviceAccent,
      ),
    )

    for (const [index, x] of [-0.4, -0.2, 0, 0.2, 0.4].entries()) {
      nodes.push(
        buildingBox(
          `concession:${stand.id}:awning-stripe:${index}`,
          origin,
          [x, 0.84, 0.08],
          [0.205, 0.13, 0.78],
          index % 2 === 0 ? serviceAccent : "#f4efe2",
        ),
      )
    }

    if (stand.kind === "food") {
      nodes.push(
        buildingCylinder(
          `concession:${stand.id}:burger-bun-bottom`,
          origin,
          [0, 1.08, 0.085],
          0.11,
          0.045,
          "#d89b47",
        ),
        buildingCylinder(
          `concession:${stand.id}:burger-patty`,
          origin,
          [0, 1.13, 0.085],
          0.1,
          0.035,
          "#6b513b",
        ),
        buildingCylinder(
          `concession:${stand.id}:burger-bun-top`,
          origin,
          [0, 1.18, 0.085],
          0.11,
          0.05,
          "#d89b47",
        ),
      )
    } else {
      nodes.push(
        buildingCylinder(
          `concession:${stand.id}:drink-cup`,
          origin,
          [0, 1.12, 0.085],
          0.075,
          0.17,
          "#f4efe2",
        ),
        buildingCylinder(
          `concession:${stand.id}:drink-straw`,
          origin,
          [0.035, 1.25, 0.085],
          0.012,
          0.14,
          "#9d4937",
        ),
      )
    }
  }

  return nodes
}

function renderBuildingNodes(snapshot: Snapshot): RendererSceneNode[] {
  return [...renderEntranceBuildingNodes(snapshot), ...renderDepotBuildingNodes(snapshot)]
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

function projectWorldHitTarget(
  element: HTMLElement,
  anchor: WorldPoint,
  camera: RendererCamera,
  width: number,
  height: number,
) {
  const projected = projectWorldPoint(camera, anchor, PROJECTION_VIEWPORT)
  const left = `${Number((projected.x - width * 0.5).toFixed(3))}px`
  const top = `${Number((projected.y - height * 0.5).toFixed(3))}px`

  element.dataset.sharedRendererAppliedLeft = left
  element.dataset.sharedRendererAppliedTop = top
  element.dataset.sharedRendererWorldX = String(anchor[0])
  element.dataset.sharedRendererWorldY = String(anchor[1])
  element.dataset.sharedRendererWorldZ = String(anchor[2])
  applyStyle(element, "left", left)
  applyStyle(element, "top", top)
  applyStyle(element, "width", `${width}px`)
  applyStyle(element, "height", `${height}px`)
  applyStyle(element, "clipPath", "none")
  applyProjectedDepth(element, projected.depth)
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

function projectDomOverlay(park: HTMLElement, camera: RendererCamera, snapshot: Snapshot) {
  for (const element of park.querySelectorAll<HTMLElement>("[style]")) {
    if (element.classList.contains("park-three-renderer-canvas")) continue
    const canonical = captureCanonicalPosition(element)
    if (!canonical) continue

    if (element.classList.contains("concession")) {
      const concessionId = Number(element.dataset.concessionId)
      const stand = snapshot.concessions.find((candidate) => candidate.id === concessionId)
      if (stand) {
        const origin = concessionOrigin(stand)
        projectWorldHitTarget(element, [origin.x, 0.48, origin.z], camera, 54, 54)
        continue
      }
    }

    if (element.classList.contains("care-depot")) {
      const origin = depotOrigin(snapshot)
      projectWorldHitTarget(element, [origin.x, 0.5, origin.z], camera, 62, 62)
      continue
    }

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
      element.classList.contains("park-border-tile") ||
      element.classList.contains("concession") ||
      element.classList.contains("care-depot")
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
    delete element.dataset.sharedRendererWorldX
    delete element.dataset.sharedRendererWorldY
    delete element.dataset.sharedRendererWorldZ
    delete element.dataset.sharedRendererDepth
  }
}

function parseCameraFrame(bridge: ParkCameraBridge): CameraFrame {
  return JSON.parse(bridge.frame_json(RENDER_ASPECT)) as CameraFrame
}

export default function Park3DRenderer({snapshot, placement}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<ThreeSceneRenderer | null>(null)
  const bridgeRef = useRef<ParkCameraBridge | null>(null)
  const renderRequestRef = useRef<number | null>(null)
  const renderInputsRef = useRef<RendererInputs>({snapshot, placement})
  renderInputsRef.current = {snapshot, placement}
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
      const {snapshot: currentSnapshot, placement: currentPlacement} = renderInputsRef.current
      const tileNodes = renderNodes(tiles)
      const fenceFrame = renderFenceNodes(currentSnapshot, currentPlacement)
      const buildingNodes = renderBuildingNodes(currentSnapshot)
      const concessionNodes = renderConcessionNodes(currentSnapshot)
      const frame: RendererFrame = {
        camera,
        nodes: [...tileNodes, ...fenceFrame.nodes, ...buildingNodes, ...concessionNodes],
      }
      rendererRef.current.render(frame)
      if (canvasRef.current) {
        canvasRef.current.dataset.sharedRendererFenceNodes = String(fenceFrame.nodes.length)
        canvasRef.current.dataset.sharedRendererBoundaryFenceSegments = String(fenceFrame.counts.boundary)
        canvasRef.current.dataset.sharedRendererHabitatFenceSegments = String(fenceFrame.counts.habitat)
        canvasRef.current.dataset.sharedRendererPreviewFenceSegments = String(fenceFrame.counts.preview)
        canvasRef.current.dataset.sharedRendererBuildingNodes = String(buildingNodes.length)
        canvasRef.current.dataset.sharedRendererConcessionNodes = String(concessionNodes.length)
      }
      projectDomOverlay(targets.park, camera, currentSnapshot)

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
      console.error("Shared 3d-lab renderer frame rejected; failing closed", error)
      rendererRef.current?.dispose()
      rendererRef.current = null
      bridgeRef.current?.free()
      bridgeRef.current = null
      if (canvasRef.current) {
        canvasRef.current.style.visibility = "hidden"
        canvasRef.current.dataset.sharedRenderer = "failed"
      }
      targets.park.classList.add("shared-three-renderer")
      targets.park.dataset.sharedRendererFailure = "true"
      targets.park.inert = true
      targets.park.style.visibility = "hidden"
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
    const {snapshot: currentSnapshot} = renderInputsRef.current
    bridgeRef.current?.free()
    bridgeRef.current = new ParkCameraBridge(currentSnapshot.width, currentSnapshot.height)
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
        const {snapshot: currentSnapshot} = renderInputsRef.current
        bridgeRef.current = new ParkCameraBridge(currentSnapshot.width, currentSnapshot.height)
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
        console.error("Shared 3d-lab renderer failed; failing closed", error)
        rendererRef.current?.dispose()
        rendererRef.current = null
        bridgeRef.current?.free()
        bridgeRef.current = null
        canvas.style.visibility = "hidden"
        canvas.dataset.sharedRenderer = "failed"
        targets.park.classList.add("shared-three-renderer")
        targets.park.dataset.sharedRendererFailure = "true"
        targets.park.inert = true
        targets.park.style.visibility = "hidden"
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
      targets.park.inert = false
      targets.park.style.removeProperty("visibility")
      delete targets.park.dataset.sharedRendererFailure
      canvas.style.removeProperty("visibility")
      delete canvas.dataset.sharedRendererFenceNodes
      delete canvas.dataset.sharedRendererBoundaryFenceSegments
      delete canvas.dataset.sharedRendererHabitatFenceSegments
      delete canvas.dataset.sharedRendererPreviewFenceSegments
      delete canvas.dataset.sharedRendererBuildingNodes
      delete canvas.dataset.sharedRendererConcessionNodes
      restoreDomOverlay(targets.park)
      targets.park.classList.remove("shared-three-renderer")
      setReady(false)
    }
  }, [renderCurrent, resetCamera, scheduleRender, targets])

  useEffect(() => {
    if (ready) scheduleRender()
  }, [placement, ready, scheduleRender, snapshot])

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
