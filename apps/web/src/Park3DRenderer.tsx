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
import type {PlacementEvaluation, Point, Snapshot} from "./App"
import initScene, {ParkCameraBridge} from "./scene-wasm/zoo_scene"

const RENDER_WIDTH = 1240
const RENDER_HEIGHT = 720
const RENDER_ASPECT = RENDER_WIDTH / RENDER_HEIGHT
const DEFAULT_SHARED_YAW = 42
const DEFAULT_SHARED_PITCH = 38
const PITCH_STEP = 6
const PROJECTED_DEPTH_SCALE = 1_000_000
const PROJECTED_DEPTH_BASE = 1_000

type WorldPoint = [number, number, number]
type HexColor = `#${string}`
type FenceSide = "north" | "east" | "south" | "west"

type CameraFrame = RendererCamera & {
  yawDegrees: number
  pitchDegrees: number
  zoom: number
}

type Props = {
  snapshot: Snapshot
  placement: PlacementEvaluation | null
  hoveredTile: Point | null
  selectedTileIds: ReadonlySet<number>
}

const TILE_COLORS: Record<Snapshot["tiles"][number]["kind"], HexColor> = {
  grass: "#6da94c",
  path: "#c8b184",
  entrance: "#c9995f",
  habitat: "#77a951",
  concession: "#a98b63",
}

function sceneBox(
  id: string,
  translation: WorldPoint,
  size: WorldPoint,
  color: HexColor,
  opacity?: number,
  rotationQuaternion?: [number, number, number, number],
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

function sceneSphere(
  id: string,
  translation: WorldPoint,
  radius: number,
  color: HexColor,
  opacity?: number,
): RendererSceneNode {
  return {
    id,
    transform: {translation},
    geometry: {kind: "sphere", radius},
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

function yawQuaternion(yaw: number): [number, number, number, number] {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
}

function tileCenter(x: number, z: number, y = 0): WorldPoint {
  return [x + 0.5, y, z + 0.5]
}

function tileCorners(x: number, z: number, y = 0.14): WorldPoint[] {
  return [
    [x, y, z],
    [x + 1, y, z],
    [x + 1, y, z + 1],
    [x, y, z + 1],
  ]
}

function relativeYaw(yawDegrees: number) {
  return ((yawDegrees - DEFAULT_SHARED_YAW) % 360 + 360) % 360
}

function relativePitch(pitchDegrees: number) {
  return Number((pitchDegrees - DEFAULT_SHARED_PITCH).toFixed(2))
}

function terrainNodes(snapshot: Snapshot, selectedTileIds: ReadonlySet<number>) {
  const nodes: RendererSceneNode[] = [
    sceneBox(
      "terrain:foundation",
      [snapshot.width * 0.5, -0.16, snapshot.height * 0.5],
      [snapshot.width + 1.2, 0.24, snapshot.height + 1.2],
      "#355f3d",
    ),
  ]

  for (const tile of snapshot.tiles) {
    const tileId = tile.y * snapshot.width + tile.x
    const selected = selectedTileIds.has(tileId)
    const height = tile.kind === "path" || tile.kind === "entrance" ? 0.16 : 0.13
    nodes.push(
      sceneBox(
        `tile:${tile.x}:${tile.y}`,
        tileCenter(tile.x, tile.y, height * 0.5),
        [0.98, height, 0.98],
        TILE_COLORS[tile.kind],
      ),
    )
    if (selected) {
      nodes.push(
        sceneBox(
          `tile-selection:${tile.x}:${tile.y}`,
          tileCenter(tile.x, tile.y, height + 0.025),
          [0.94, 0.05, 0.94],
          "#f4d46d",
          0.78,
        ),
      )
    }
  }

  return nodes
}

function fenceEndpoints(x: number, z: number, side: FenceSide): [WorldPoint, WorldPoint] {
  switch (side) {
    case "north":
      return [
        [x, 0, z],
        [x + 1, 0, z],
      ]
    case "east":
      return [
        [x + 1, 0, z],
        [x + 1, 0, z + 1],
      ]
    case "south":
      return [
        [x, 0, z + 1],
        [x + 1, 0, z + 1],
      ]
    case "west":
      return [
        [x, 0, z],
        [x, 0, z + 1],
      ]
  }
}

function worldPointKey([x, , z]: WorldPoint) {
  return `${x.toFixed(3)}:${z.toFixed(3)}`
}

function fenceEdgeKey(start: WorldPoint, end: WorldPoint) {
  return [worldPointKey(start), worldPointKey(end)].sort().join("--")
}

type FenceSegment = {
  id: string
  start: WorldPoint
  end: WorldPoint
  boundary: boolean
  preview: boolean
}

function entranceBoundarySide(snapshot: Snapshot): FenceSide {
  if (snapshot.entrance.y <= 0) return "north"
  if (snapshot.entrance.y >= snapshot.height - 1) return "south"
  if (snapshot.entrance.x <= 0) return "west"
  return "east"
}

function boundarySegments(snapshot: Snapshot) {
  const segments: FenceSegment[] = []
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

function habitatSegments(snapshot: Snapshot) {
  const segments = new Map<string, FenceSegment>()

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

function previewSegments(placement: PlacementEvaluation | null) {
  if (!placement) return []
  return placement.fence_segments.map((segment, index) => {
    const [start, end] = fenceEndpoints(segment.x, segment.y, segment.side)
    return {
      id: `preview:${index}:${segment.x}:${segment.y}:${segment.side}`,
      start,
      end,
      boundary: false,
      preview: true,
    } satisfies FenceSegment
  })
}

function fenceNodes(snapshot: Snapshot, placement: PlacementEvaluation | null) {
  const segments = [
    ...boundarySegments(snapshot),
    ...habitatSegments(snapshot),
    ...previewSegments(placement),
  ]
  const nodes: RendererSceneNode[] = []
  const posts = new Map<string, {point: WorldPoint; boundary: boolean; preview: boolean}>()

  for (const segment of segments) {
    const dx = segment.end[0] - segment.start[0]
    const dz = segment.end[2] - segment.start[2]
    const length = Math.hypot(dx, dz)
    const alongX = Math.abs(dx) >= Math.abs(dz)
    const centerX = (segment.start[0] + segment.end[0]) * 0.5
    const centerZ = (segment.start[2] + segment.end[2]) * 0.5
    const color: HexColor = segment.preview
      ? placement?.ok
        ? "#e8d276"
        : "#b6584c"
      : segment.boundary
        ? "#283e35"
        : "#3b5138"
    const opacity = segment.preview ? 0.78 : undefined
    const railSize: WorldPoint = alongX ? [length, 0.075, 0.08] : [0.08, 0.075, length]

    nodes.push(
      sceneBox(`fence:${segment.id}:rail:low`, [centerX, 0.31, centerZ], railSize, color, opacity),
      sceneBox(`fence:${segment.id}:rail:high`, [centerX, 0.61, centerZ], railSize, color, opacity),
    )

    for (const point of [segment.start, segment.end]) {
      const key = worldPointKey(point)
      const existing = posts.get(key)
      if (!existing || segment.boundary || (!existing.preview && segment.preview)) {
        posts.set(key, {
          point,
          boundary: segment.boundary || existing?.boundary === true,
          preview: segment.preview && existing?.boundary !== true,
        })
      }
    }
  }

  for (const [key, post] of posts) {
    const color: HexColor = post.preview
      ? placement?.ok
        ? "#e8d276"
        : "#b6584c"
      : post.boundary
        ? "#23372f"
        : "#334831"
    nodes.push(
      sceneBox(
        `fence:post:${key}`,
        [post.point[0], 0.41, post.point[2]],
        [0.12, 0.82, 0.12],
        color,
        post.preview ? 0.8 : undefined,
      ),
    )
  }

  return nodes
}

function rotatedOffset(localX: number, localZ: number, yaw: number) {
  const cosine = Math.cos(yaw)
  const sine = Math.sin(yaw)
  return {
    x: localX * cosine + localZ * sine,
    z: -localX * sine + localZ * cosine,
  }
}

function orientedBox(
  id: string,
  origin: {x: number; z: number},
  local: WorldPoint,
  size: WorldPoint,
  color: HexColor,
  yaw: number,
) {
  const offset = rotatedOffset(local[0], local[2], yaw)
  return sceneBox(
    id,
    [origin.x + offset.x, local[1], origin.z + offset.z],
    size,
    color,
    undefined,
    yawQuaternion(yaw),
  )
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

function entranceNodes(snapshot: Snapshot) {
  const side = entranceBoundarySide(snapshot)
  const yaw = yawForSide(side)
  const origin = {
    x: snapshot.entrance.x + 0.5,
    z: snapshot.entrance.y + 0.5,
  }
  const wall: HexColor = "#d8c79d"
  const roof: HexColor = "#8f4737"
  const dark: HexColor = "#24483f"

  return [
    orientedBox("building:entrance:base", origin, [0, 0.08, 0], [1.6, 0.16, 0.9], "#aa9a79", yaw),
    orientedBox("building:entrance:left", origin, [-0.52, 0.55, 0], [0.42, 0.94, 0.62], wall, yaw),
    orientedBox("building:entrance:right", origin, [0.52, 0.55, 0], [0.42, 0.94, 0.62], wall, yaw),
    orientedBox("building:entrance:bridge", origin, [0, 1.02, -0.03], [1.45, 0.2, 0.72], roof, yaw),
    orientedBox("building:entrance:sign", origin, [0, 1.2, 0.33], [0.7, 0.22, 0.08], "#d8b95e", yaw),
    orientedBox("building:entrance:gate", origin, [0, 0.48, 0.34], [0.48, 0.72, 0.06], dark, yaw),
  ]
}

function depotNodes(snapshot: Snapshot) {
  const depot = snapshot.animal_care_depot
  const origin = {x: depot.x + 0.5, z: depot.y + 0.5}
  return [
    orientedBox("building:depot:base", origin, [0, 0.07, 0], [1.32, 0.14, 1.08], "#9e987e", 0),
    orientedBox("building:depot:shell", origin, [0, 0.55, 0], [1.18, 0.92, 0.94], "#c4bea8", 0),
    orientedBox("building:depot:roof", origin, [0, 1.07, 0], [1.34, 0.14, 1.08], "#526b64", 0),
    orientedBox("building:depot:door", origin, [0, 0.43, 0.49], [0.68, 0.62, 0.05], "#3d6259", 0),
    sceneCylinder("building:depot:vent", [origin.x + 0.28, 1.28, origin.z - 0.18], 0.08, 0.28, "#7d8b87"),
  ]
}

function concessionNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []
  for (const stand of snapshot.concessions) {
    const x = stand.x + 0.5
    const z = stand.y + 0.5
    const body: HexColor = stand.kind === "food" ? "#bb7143" : "#4f7d91"
    const accent: HexColor =
      stand.service_state === "failed"
        ? "#8f3f39"
        : stand.service_state === "degraded"
          ? "#c08b45"
          : "#e0cc83"
    nodes.push(
      sceneBox(`concession:${stand.id}:base`, [x, 0.08, z], [0.78, 0.16, 0.72], "#8d7c5f"),
      sceneBox(`concession:${stand.id}:body`, [x, 0.46, z], [0.7, 0.66, 0.64], body),
      sceneBox(`concession:${stand.id}:awning`, [x, 0.86, z + 0.12], [0.82, 0.12, 0.78], accent),
      sceneBox(`concession:${stand.id}:counter`, [x, 0.42, z + 0.35], [0.64, 0.12, 0.08], "#6f5239"),
    )
  }
  return nodes
}

function personNodes(
  id: string,
  x: number,
  z: number,
  shirt: HexColor,
  trousers: HexColor,
  head: HexColor = "#c79672",
) {
  return [
    sceneCylinder(`${id}:body`, [x, 0.48, z], 0.13, 0.46, shirt),
    sceneCylinder(`${id}:legs`, [x, 0.2, z], 0.1, 0.3, trousers),
    sceneSphere(`${id}:head`, [x, 0.82, z], 0.14, head),
  ]
}

function actorNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []

  for (const guest of snapshot.guests) {
    nodes.push(
      ...personNodes(
        `guest:${guest.id}`,
        guest.x + 0.5,
        guest.y + 0.5,
        guest.state === "viewing" ? "#568c73" : "#6b7f9d",
        "#39434f",
      ),
    )
  }

  for (const janitor of snapshot.animal_care_depot.janitors) {
    nodes.push(...personNodes(`janitor:${janitor.id}`, janitor.x + 0.5, janitor.y + 0.5, "#3c7d76", "#263f3b"))
  }

  for (const mechanic of snapshot.animal_care_depot.mechanics) {
    nodes.push(...personNodes(`mechanic:${mechanic.id}`, mechanic.x + 0.5, mechanic.y + 0.5, "#c37b3f", "#4a3a31"))
  }

  return nodes
}

function animalColor(species: Snapshot["animals"][number]["species"]): HexColor {
  switch (species) {
    case "capybara":
      return "#8c6748"
    case "flamingo":
      return "#d77f88"
    case "zebra":
      return "#e6e1d4"
    case "giraffe":
      return "#c89c4d"
    case "elephant":
      return "#777e7c"
    case "penguin":
      return "#313b3e"
  }
}

function animalNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []

  for (const animal of snapshot.animals) {
    const x = animal.x + 0.5 + ((animal.slot % 3) - 1) * 0.12
    const z = animal.y + 0.5 + (animal.slot % 2) * 0.12
    const color = animalColor(animal.species)
    const id = `animal:${animal.id}`

    if (animal.species === "flamingo") {
      nodes.push(
        sceneCylinder(`${id}:legs`, [x, 0.28, z], 0.035, 0.5, "#b56d6d"),
        sceneSphere(`${id}:body`, [x, 0.62, z], 0.18, color),
        sceneCylinder(`${id}:neck`, [x + 0.06, 0.87, z], 0.045, 0.38, color),
        sceneSphere(`${id}:head`, [x + 0.07, 1.08, z], 0.09, color),
      )
      continue
    }

    if (animal.species === "giraffe") {
      nodes.push(
        sceneBox(`${id}:body`, [x, 0.52, z], [0.5, 0.34, 0.28], color),
        sceneCylinder(`${id}:neck`, [x + 0.14, 1.02, z], 0.065, 0.78, color),
        sceneSphere(`${id}:head`, [x + 0.16, 1.46, z], 0.12, color),
        sceneCylinder(`${id}:legs-a`, [x - 0.15, 0.22, z - 0.08], 0.04, 0.44, "#7f6236"),
        sceneCylinder(`${id}:legs-b`, [x + 0.15, 0.22, z + 0.08], 0.04, 0.44, "#7f6236"),
      )
      continue
    }

    if (animal.species === "elephant") {
      nodes.push(
        sceneSphere(`${id}:body`, [x, 0.58, z], 0.34, color),
        sceneSphere(`${id}:head`, [x + 0.3, 0.63, z], 0.24, color),
        sceneCylinder(`${id}:trunk`, [x + 0.5, 0.38, z], 0.055, 0.45, color),
        sceneCylinder(`${id}:legs-a`, [x - 0.16, 0.22, z - 0.13], 0.075, 0.42, color),
        sceneCylinder(`${id}:legs-b`, [x + 0.16, 0.22, z + 0.13], 0.075, 0.42, color),
      )
      continue
    }

    if (animal.species === "penguin") {
      nodes.push(
        sceneSphere(`${id}:body`, [x, 0.46, z], 0.22, color),
        sceneSphere(`${id}:belly`, [x + 0.08, 0.46, z], 0.13, "#e9e7dc"),
        sceneSphere(`${id}:head`, [x, 0.72, z], 0.15, color),
      )
      continue
    }

    nodes.push(
      sceneSphere(`${id}:body`, [x, 0.48, z], animal.species === "capybara" ? 0.28 : 0.3, color),
      sceneSphere(`${id}:head`, [x + 0.27, 0.56, z], 0.16, color),
      sceneCylinder(`${id}:legs-a`, [x - 0.13, 0.2, z - 0.1], 0.04, 0.3, "#5f503f"),
      sceneCylinder(`${id}:legs-b`, [x + 0.13, 0.2, z + 0.1], 0.04, 0.3, "#5f503f"),
    )

    if (animal.species === "zebra") {
      nodes.push(
        sceneBox(`${id}:stripe-a`, [x - 0.1, 0.53, z], [0.05, 0.42, 0.31], "#2e3433"),
        sceneBox(`${id}:stripe-b`, [x + 0.08, 0.53, z], [0.05, 0.42, 0.31], "#2e3433"),
      )
    }
  }

  return nodes
}

function operationsNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []

  for (const task of snapshot.litter) {
    nodes.push(
      sceneBox(`litter:${task.id}:a`, [task.x + 0.43, 0.18, task.y + 0.48], [0.12, 0.06, 0.08], "#6f6048"),
      sceneBox(`litter:${task.id}:b`, [task.x + 0.56, 0.17, task.y + 0.55], [0.09, 0.05, 0.12], "#877757"),
    )
  }

  for (const task of snapshot.maintenance) {
    nodes.push(
      sceneCylinder(`maintenance:${task.id}:pole`, [task.x + 0.5, 0.55, task.y + 0.5], 0.035, 0.78, "#5b4b3b"),
      sceneBox(`maintenance:${task.id}:flag`, [task.x + 0.62, 0.82, task.y + 0.5], [0.25, 0.2, 0.05], "#c85d4e"),
    )
  }

  return nodes
}

function placementNodes(placement: PlacementEvaluation | null) {
  if (!placement) return []
  const color: HexColor = placement.ok ? "#dbcf72" : "#b6544a"
  return placement.occupied_tiles.map((tile) =>
    sceneBox(
      `placement:${tile.x}:${tile.y}`,
      tileCenter(tile.x, tile.y, 0.19),
      [0.9, 0.06, 0.9],
      color,
      0.42,
    ),
  )
}

function buildFrame(
  snapshot: Snapshot,
  camera: RendererCamera,
  placement: PlacementEvaluation | null,
  selectedTileIds: ReadonlySet<number>,
): RendererFrame {
  return {
    camera,
    nodes: [
      ...terrainNodes(snapshot, selectedTileIds),
      ...placementNodes(placement),
      ...fenceNodes(snapshot, placement),
      ...entranceNodes(snapshot),
      ...depotNodes(snapshot),
      ...concessionNodes(snapshot),
      ...operationsNodes(snapshot),
      ...actorNodes(snapshot),
      ...animalNodes(snapshot),
    ],
  }
}

function parseCameraFrame(bridge: ParkCameraBridge): CameraFrame {
  return JSON.parse(bridge.frame_json(RENDER_ASPECT)) as CameraFrame
}

function applyDepth(element: HTMLElement, depth: number) {
  const clamped = Number.isFinite(depth) ? Math.min(Math.max(depth, 0), 1) : 1
  element.dataset.sharedRendererDepth = clamped.toFixed(6)
  element.style.zIndex = String(PROJECTED_DEPTH_BASE + Math.round((1 - clamped) * PROJECTED_DEPTH_SCALE))
}

function projectTileButton(element: HTMLButtonElement, x: number, z: number, camera: RendererCamera) {
  const projected = tileCorners(x, z).map((corner) =>
    projectWorldPoint(camera, corner, {width: RENDER_WIDTH, height: RENDER_HEIGHT}),
  )
  const minX = Math.min(...projected.map((point) => point.x))
  const maxX = Math.max(...projected.map((point) => point.x))
  const minY = Math.min(...projected.map((point) => point.y))
  const maxY = Math.max(...projected.map((point) => point.y))
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const polygon = projected
    .map((point) => {
      const px = ((point.x - minX) / width) * 100
      const py = ((point.y - minY) / height) * 100
      return `${px.toFixed(3)}% ${py.toFixed(3)}%`
    })
    .join(", ")

  element.style.left = `${minX.toFixed(3)}px`
  element.style.top = `${minY.toFixed(3)}px`
  element.style.width = `${width.toFixed(3)}px`
  element.style.height = `${height.toFixed(3)}px`
  element.style.clipPath = `polygon(${polygon})`
  applyDepth(
    element,
    projected.reduce((sum, point) => sum + point.depth, 0) / projected.length,
  )
}

function projectWorldOverlay(element: HTMLElement, camera: RendererCamera) {
  const x = Number(element.dataset.worldX)
  const z = Number(element.dataset.worldZ)
  const y = Number(element.dataset.worldY ?? "0.55")
  if (![x, y, z].every(Number.isFinite)) return

  const projected = projectWorldPoint(camera, [x, y, z], {
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
  })
  const width = Number(element.dataset.hitWidth ?? "46")
  const height = Number(element.dataset.hitHeight ?? "46")
  element.style.left = `${(projected.x - width * 0.5).toFixed(3)}px`
  element.style.top = `${(projected.y - height * 0.5).toFixed(3)}px`
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.style.clipPath = "none"
  applyDepth(element, projected.depth)
}

function projectInteractionOverlay(park: HTMLElement, camera: RendererCamera) {
  for (const element of park.querySelectorAll<HTMLButtonElement>("button.tile[aria-label]")) {
    const match = element.getAttribute("aria-label")?.match(/tile (\d+), (\d+)$/)
    if (!match) continue
    projectTileButton(element, Number(match[1]), Number(match[2]), camera)
  }

  for (const element of park.querySelectorAll<HTMLElement>("[data-world-x][data-world-z]")) {
    if (element.classList.contains("tile")) continue
    projectWorldOverlay(element, camera)
  }
}

export default function Park3DRenderer({
  snapshot,
  placement,
  hoveredTile: _hoveredTile,
  selectedTileIds,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<ThreeSceneRenderer | null>(null)
  const bridgeRef = useRef<ParkCameraBridge | null>(null)
  const parkRef = useRef<HTMLElement | null>(null)
  const [cameraLabel, setCameraLabel] = useState({yaw: 0, pitch: 0})
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const renderCurrent = useCallback(() => {
    const renderer = rendererRef.current
    const bridge = bridgeRef.current
    const canvas = canvasRef.current
    const park = parkRef.current
    if (!renderer || !bridge || !canvas || !park) return false

    try {
      const camera = parseCameraFrame(bridge)
      const frame = buildFrame(snapshot, camera, placement, selectedTileIds)
      renderer.render(frame)
      projectInteractionOverlay(park, camera)

      const yaw = relativeYaw(camera.yawDegrees)
      const pitch = relativePitch(camera.pitchDegrees)
      park.dataset.cameraYaw = String(yaw)
      park.dataset.cameraPitch = String(pitch)
      canvas.dataset.sharedRendererNodeCount = String(frame.nodes.length)
      canvas.dataset.sharedRendererFenceNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("fence:")).length,
      )
      canvas.dataset.sharedRendererBuildingNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("building:")).length,
      )
      canvas.dataset.sharedRendererBoundaryFenceNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("fence:boundary:")).length,
      )
      canvas.dataset.sharedRendererHabitatFenceNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("fence:habitat:")).length,
      )
      canvas.dataset.sharedRendererPreviewFenceNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("fence:preview:")).length,
      )
      canvas.dataset.sharedRendererPlacementNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("placement:")).length,
      )
      canvas.dataset.sharedRendererActorNodes = String(
        frame.nodes.filter(
          (node) =>
            node.id.startsWith("guest:") ||
            node.id.startsWith("animal:") ||
            node.id.startsWith("janitor:") ||
            node.id.startsWith("mechanic:"),
        ).length,
      )
      canvas.dataset.sharedRendererGuestNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("guest:")).length,
      )
      canvas.dataset.sharedRendererAnimalNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("animal:")).length,
      )
      canvas.dataset.sharedRendererJanitorNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("janitor:")).length,
      )
      canvas.dataset.sharedRendererMechanicNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("mechanic:")).length,
      )
      canvas.dataset.sharedRendererConcessionNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("concession:")).length,
      )
      canvas.dataset.sharedRendererMaintenanceNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("maintenance:")).length,
      )
      canvas.dataset.sharedRendererLitterNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("litter:")).length,
      )
      canvas.dataset.sharedRendererProjection = "perspective"
      setCameraLabel((current) =>
        current.yaw === yaw && current.pitch === pitch ? current : {yaw, pitch},
      )
      park.classList.add("shared-three-renderer")
      setFailed(false)
      setReady(true)
      return true
    } catch (error) {
      console.error("Shared 3d-lab perspective renderer rejected Zoo frame", error)
      park.classList.add("shared-three-renderer")
      park.dataset.sharedRendererFailure = "true"
      setReady(false)
      setFailed(true)
      return false
    }
  }, [placement, selectedTileIds, snapshot])

  const resetCamera = useCallback(() => {
    bridgeRef.current?.free()
    bridgeRef.current = new ParkCameraBridge(snapshot.width, snapshot.height)
    renderCurrent()
  }, [snapshot.height, snapshot.width])

  useEffect(() => {
    const canvas = canvasRef.current
    const park = canvas?.parentElement
    if (!canvas || !(park instanceof HTMLElement)) return
    parkRef.current = park
    let cancelled = false

    void initScene()
      .then(() => {
        if (cancelled) return
        bridgeRef.current = new ParkCameraBridge(snapshot.width, snapshot.height)
        rendererRef.current = createThreeSceneRenderer(canvas, {
          alpha: false,
          antialias: true,
          background: "#315d43",
          shadows: true,
          pixelRatioLimit: 2,
        })
        rendererRef.current.setSize(RENDER_WIDTH, RENDER_HEIGHT, window.devicePixelRatio || 1)
        park.classList.add("shared-three-renderer")
        setReady(true)
      })
      .catch((error) => {
        console.error("Shared 3d-lab perspective renderer failed to initialize", error)
        park.classList.add("shared-three-renderer")
        park.dataset.sharedRendererFailure = "true"
        setFailed(true)
        setReady(false)
      })

    return () => {
      cancelled = true
      rendererRef.current?.dispose()
      rendererRef.current = null
      bridgeRef.current?.free()
      bridgeRef.current = null
      delete park.dataset.sharedRendererFailure
      park.classList.remove("shared-three-renderer")
      parkRef.current = null
      setReady(false)
    }
  }, [renderCurrent, snapshot.height, snapshot.width])

  useEffect(() => {
    if (ready) renderCurrent()
  }, [ready, renderCurrent])

  useEffect(() => {
    const reset = () => window.requestAnimationFrame(resetCamera)
    const topBarReset = document.querySelector<HTMLButtonElement>(".camera-reset")
    topBarReset?.addEventListener("click", reset)

    const resetForNewPark = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const button = event.target.closest<HTMLButtonElement>("button.secondary")
      if (button?.textContent?.trim() === "Start new park") reset()
    }
    document.addEventListener("click", resetForNewPark)

    return () => {
      topBarReset?.removeEventListener("click", reset)
      document.removeEventListener("click", resetForNewPark)
    }
  }, [resetCamera])

  const rotate = (steps: number) => {
    bridgeRef.current?.rotate_steps(steps)
    renderCurrent()
  }

  const tilt = (degrees: number) => {
    bridgeRef.current?.tilt_by_degrees(degrees)
    renderCurrent()
  }

  const viewport = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".viewport")

  return (
    <>
      <canvas
        ref={canvasRef}
        className="park-three-renderer-canvas"
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
        aria-label="3D Zoo world"
        data-shared-renderer={failed ? "failed" : ready ? "ready" : "loading"}
      />
      {failed && (
        <div className="renderer-failure" role="alert">
          3D renderer unavailable
        </div>
      )}
      {viewport &&
        createPortal(
          <div className="camera-orbit-controls bevel" aria-label="3D camera orientation">
            <span className="camera-orbit-label">3D view</span>
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
              perspective · {cameraLabel.yaw}° · {cameraLabel.pitch}°
            </small>
          </div>,
          viewport,
        )}
    </>
  )
}
