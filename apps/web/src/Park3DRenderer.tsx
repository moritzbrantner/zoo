import {
  createThreeSceneRenderer,
  projectWorldPoint,
  type RendererCamera,
  type RendererFrame,
  type RendererSceneNode,
  type ThreeSceneRenderer,
} from "@moritzbrantner/three-d-renderer"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
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

type Props = RendererInputs & {
  tool: Tool
  selectedHabitatId: number | null
  selectedGuestId: number | null
  selectedDepot: boolean
  hoveredTile: TilePoint | null
  onTilePointerDown(pointerId: number, tile: Snapshot["tiles"][number]): void
  onTilePointerMove(pointerId: number, tile: Snapshot["tiles"][number]): void
  onTileClick(tile: Snapshot["tiles"][number]): void
  onHoverTile(tile: TilePoint | null): void
  onGuestClick(guestId: number): void
  onDepotClick(): void
}

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

function entranceOrigin(snapshot: Snapshot) {
  const side = entranceBoundarySide(snapshot)
  const center = tileCenter(snapshot.entrance.x, snapshot.entrance.y)
  const outward =
    side === "west"
      ? {x: -0.9, z: 0}
      : side === "east"
        ? {x: 0.9, z: 0}
        : side === "north"
          ? {x: 0, z: -0.9}
          : {x: 0, z: 0.9}
  return {x: center[0] + outward.x, z: center[2] + outward.z}
}

function renderEntranceBuildingNodes(snapshot: Snapshot): RendererSceneNode[] {
  const origin = entranceOrigin(snapshot)
  const yaw = yawForSide(entranceBoundarySide(snapshot))
  const wall: HexColor = "#d8c79d"
  const trim: HexColor = "#eadfbf"
  const roof: HexColor = "#9d4937"
  const dark: HexColor = "#244d45"

  return [
    buildingBox("building:entrance:left-plinth", origin, [-0.68, 0.06, 0], [0.72, 0.12, 0.9], "#b7aa88", yaw),
    buildingBox("building:entrance:right-plinth", origin, [0.68, 0.06, 0], [0.72, 0.12, 0.9], "#b7aa88", yaw),
    buildingBox("building:entrance:left-wing", origin, [-0.68, 0.52, 0], [0.62, 0.9, 0.72], wall, yaw),
    buildingBox("building:entrance:right-wing", origin, [0.68, 0.52, 0], [0.62, 0.9, 0.72], wall, yaw),
    buildingBox("building:entrance:left-roof", origin, [-0.68, 1.02, 0], [0.76, 0.16, 0.86], roof, yaw),
    buildingBox("building:entrance:right-roof", origin, [0.68, 1.02, 0], [0.76, 0.16, 0.86], roof, yaw),
    buildingBox("building:entrance:bridge", origin, [0, 1.08, 0.02], [1.7, 0.2, 0.28], roof, yaw),
    buildingBox("building:entrance:sign", origin, [0, 1.29, 0.05], [0.82, 0.24, 0.08], "#e0bf65", yaw),
    buildingBox("building:entrance:left-column", origin, [-0.35, 0.58, 0.34], [0.1, 0.92, 0.1], trim, yaw),
    buildingBox("building:entrance:right-column", origin, [0.35, 0.58, 0.34], [0.1, 0.92, 0.1], trim, yaw),
    buildingBox("building:entrance:left-window", origin, [-0.68, 0.58, 0.37], [0.24, 0.3, 0.04], "#87c7d8", yaw),
    buildingBox("building:entrance:right-window", origin, [0.68, 0.58, 0.37], [0.24, 0.3, 0.04], "#87c7d8", yaw),
    buildingBox("building:entrance:left-turnstile", origin, [-0.18, 0.28, 0.1], [0.08, 0.5, 0.08], dark, yaw),
    buildingBox("building:entrance:right-turnstile", origin, [0.18, 0.28, 0.1], [0.08, 0.5, 0.08], dark, yaw),
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

function tileTopCorners(x: number, z: number): WorldPoint[] {
  return [
    [x + 0.5, 0.07, z - 0.5],
    [x + 1.5, 0.07, z - 0.5],
    [x + 1.5, 0.07, z + 0.5],
    [x + 0.5, 0.07, z + 0.5],
  ]
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

function personNodes(
  id: string,
  x: number,
  z: number,
  shirt: HexColor,
  trousers: HexColor,
  head: HexColor = "#d5a57d",
) {
  return [
    sceneCylinder(`${id}:legs`, [x, 0.19, z], 0.075, 0.28, trousers),
    sceneCylinder(`${id}:body`, [x, 0.46, z], 0.12, 0.42, shirt),
    sceneSphere(`${id}:head`, [x, 0.78, z], 0.13, head),
  ]
}

function animalColor(species: Snapshot["animals"][number]["species"]): HexColor {
  switch (species) {
    case "capybara":
      return "#8c6748"
    case "flamingo":
      return "#d77f88"
    case "zebra":
      return "#e8e4da"
    case "giraffe":
      return "#c89c4d"
    case "elephant":
      return "#777e7c"
    case "penguin":
      return "#30393c"
    default:
      return "#8c6748"
  }
}

function renderAnimalNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []

  for (const animal of snapshot.animals) {
    const x = animal.x + 1 + ((animal.slot % 3) - 1) * 0.13
    const z = animal.y + (animal.slot % 2) * 0.13
    const color = animalColor(animal.species)
    const id = `animal:${animal.id}`

    if (animal.species === "flamingo") {
      nodes.push(
        sceneCylinder(`${id}:legs`, [x, 0.28, z], 0.03, 0.48, "#b56d6d"),
        sceneSphere(`${id}:body`, [x, 0.6, z], 0.18, color),
        sceneCylinder(`${id}:neck`, [x + 0.06, 0.86, z], 0.04, 0.36, color),
        sceneSphere(`${id}:head`, [x + 0.07, 1.06, z], 0.085, color),
      )
      continue
    }

    if (animal.species === "giraffe") {
      nodes.push(
        sceneBox(`${id}:body`, [x, 0.51, z], [0.48, 0.32, 0.28], color),
        sceneCylinder(`${id}:neck`, [x + 0.13, 1.0, z], 0.06, 0.74, color),
        sceneSphere(`${id}:head`, [x + 0.15, 1.42, z], 0.11, color),
        sceneCylinder(`${id}:leg-left`, [x - 0.14, 0.22, z - 0.08], 0.035, 0.42, "#7f6236"),
        sceneCylinder(`${id}:leg-right`, [x + 0.14, 0.22, z + 0.08], 0.035, 0.42, "#7f6236"),
      )
      continue
    }

    if (animal.species === "elephant") {
      nodes.push(
        sceneSphere(`${id}:body`, [x, 0.56, z], 0.32, color),
        sceneSphere(`${id}:head`, [x + 0.28, 0.61, z], 0.23, color),
        sceneCylinder(`${id}:trunk`, [x + 0.48, 0.37, z], 0.05, 0.42, color),
        sceneCylinder(`${id}:leg-left`, [x - 0.15, 0.2, z - 0.12], 0.07, 0.38, color),
        sceneCylinder(`${id}:leg-right`, [x + 0.15, 0.2, z + 0.12], 0.07, 0.38, color),
      )
      continue
    }

    if (animal.species === "penguin") {
      nodes.push(
        sceneSphere(`${id}:body`, [x, 0.45, z], 0.2, color),
        sceneSphere(`${id}:belly`, [x + 0.07, 0.44, z], 0.12, "#ece9df"),
        sceneSphere(`${id}:head`, [x, 0.69, z], 0.14, color),
      )
      continue
    }

    nodes.push(
      sceneSphere(`${id}:body`, [x, 0.47, z], animal.species === "capybara" ? 0.27 : 0.29, color),
      sceneSphere(`${id}:head`, [x + 0.25, 0.55, z], 0.15, color),
      sceneCylinder(`${id}:leg-left`, [x - 0.12, 0.19, z - 0.09], 0.035, 0.28, "#5f503f"),
      sceneCylinder(`${id}:leg-right`, [x + 0.12, 0.19, z + 0.09], 0.035, 0.28, "#5f503f"),
    )

    if (animal.species === "zebra") {
      nodes.push(
        sceneBox(`${id}:stripe-left`, [x - 0.09, 0.52, z], [0.045, 0.38, 0.3], "#303433"),
        sceneBox(`${id}:stripe-right`, [x + 0.08, 0.52, z], [0.045, 0.38, 0.3], "#303433"),
      )
    }
  }

  return nodes
}

function renderPeopleNodes(snapshot: Snapshot, selectedGuestId: number | null) {
  const nodes: RendererSceneNode[] = []

  for (const guest of snapshot.guests) {
    const x = guest.x + 1
    const z = guest.y
    nodes.push(
      ...personNodes(
        `guest:${guest.id}`,
        x,
        z,
        guest.state === "viewing" ? "#6e8f73" : "#69809d",
        "#36424c",
      ),
    )
    if (guest.id === selectedGuestId) {
      nodes.push(
        sceneCylinder(`guest:${guest.id}:selection`, [x, 0.09, z], 0.28, 0.035, "#f6d36f", 0.68),
      )
    }
  }

  for (const janitor of snapshot.animal_care_depot.janitors) {
    nodes.push(
      ...personNodes(
        `janitor:${janitor.id}`,
        janitor.x + 1,
        janitor.y,
        "#4d876b",
        "#2d493b",
      ),
    )
  }

  for (const mechanic of snapshot.animal_care_depot.mechanics) {
    nodes.push(
      ...personNodes(
        `mechanic:${mechanic.id}`,
        mechanic.x + 1,
        mechanic.y,
        "#c78343",
        "#4a3a31",
      ),
    )
  }

  return nodes
}

function renderOperationsNodes(snapshot: Snapshot) {
  const nodes: RendererSceneNode[] = []

  for (const task of snapshot.litter) {
    nodes.push(
      sceneBox(`litter:${task.id}:paper`, [task.x + 0.94, 0.13, task.y - 0.04], [0.2, 0.04, 0.13], "#876f4d"),
      sceneCylinder(`litter:${task.id}:cup`, [task.x + 1.12, 0.16, task.y + 0.06], 0.05, 0.1, "#b88758"),
    )
  }

  for (const task of snapshot.maintenance) {
    nodes.push(
      sceneCylinder(`maintenance:${task.id}:pole`, [task.x + 1, 0.52, task.y], 0.03, 0.72, "#5b4b3b"),
      sceneBox(`maintenance:${task.id}:flag`, [task.x + 1.13, 0.77, task.y], [0.24, 0.18, 0.05], "#d26855"),
    )
  }

  for (const habitat of snapshot.habitats) {
    if (habitat.animals !== 0) continue
    const x = habitat.x + habitat.width * 0.5 + 0.5
    const z = habitat.y + (habitat.height - 1) * 0.5
    nodes.push(
      sceneCylinder(`habitat:${habitat.id}:empty-marker`, [x, 0.22, z], 0.13, 0.3, "#d9d79a"),
      sceneBox(`habitat:${habitat.id}:empty-cap`, [x, 0.39, z], [0.22, 0.05, 0.22], "#48623e"),
    )
  }

  return nodes
}

function renderSelectionNodes(snapshot: Snapshot, selectedDepot: boolean) {
  if (!selectedDepot) return []
  const origin = depotOrigin(snapshot)
  return [
    sceneBox(
      "selection:depot",
      [origin.x, 0.04, origin.z],
      [1.48, 0.035, 1.18],
      "#f6d36f",
      undefined,
      0.5,
    ),
  ]
}

function pointInPolygon(point: {x: number; y: number}, polygon: Array<{x: number; y: number}>) {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function projectTilePolygon(camera: RendererCamera, x: number, y: number) {
  return tileTopCorners(x, y).map((corner) => projectWorldPoint(camera, corner, RENDER_VIEWPORT))
}

function pickTile(snapshot: Snapshot, camera: RendererCamera, point: {x: number; y: number}) {
  for (const tile of snapshot.tiles) {
    if (pointInPolygon(point, projectTilePolygon(camera, tile.x, tile.y))) return tile
  }
  return null
}

type WorldPick =
  | {kind: "guest"; id: number}
  | {kind: "depot"}
  | {kind: "tile"; tile: Snapshot["tiles"][number]}

function projectedDistance(camera: RendererCamera, point: {x: number; y: number}, world: WorldPoint) {
  const projected = projectWorldPoint(camera, world, RENDER_VIEWPORT)
  return Math.hypot(point.x - projected.x, point.y - projected.y)
}

function pickWorld(snapshot: Snapshot, camera: RendererCamera, point: {x: number; y: number}): WorldPick | null {
  let nearestGuest: {id: number; distance: number} | null = null
  for (const guest of snapshot.guests) {
    const distance = projectedDistance(camera, point, [guest.x + 1, 0.58, guest.y])
    if (distance <= 18 && (nearestGuest === null || distance < nearestGuest.distance)) {
      nearestGuest = {id: guest.id, distance}
    }
  }
  if (nearestGuest) return {kind: "guest", id: nearestGuest.id}

  const depot = depotOrigin(snapshot)
  if (projectedDistance(camera, point, [depot.x, 0.55, depot.z]) <= 36) {
    return {kind: "depot"}
  }

  for (const stand of snapshot.concessions) {
    const origin = concessionOrigin(stand)
    if (projectedDistance(camera, point, [origin.x, 0.55, origin.z]) <= 32) {
      const tile = snapshot.tiles.find((candidate) => candidate.x === stand.x && candidate.y === stand.y)
      if (tile) return {kind: "tile", tile}
    }
  }

  for (const animal of snapshot.animals) {
    if (projectedDistance(camera, point, [animal.x + 1, 0.55, animal.y]) <= 20) {
      const tile = snapshot.tiles.find((candidate) => candidate.x === animal.x && candidate.y === animal.y)
      if (tile) return {kind: "tile", tile}
    }
  }

  const tile = pickTile(snapshot, camera, point)
  return tile ? {kind: "tile", tile} : null
}

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * RENDER_WIDTH,
    y: ((clientY - rect.top) / rect.height) * RENDER_HEIGHT,
  }
}

function clientPointForWorld(canvas: HTMLCanvasElement, camera: RendererCamera, world: WorldPoint) {
  const projected = projectWorldPoint(camera, world, RENDER_VIEWPORT)
  const rect = canvas.getBoundingClientRect()
  return {
    x: rect.left + (projected.x / RENDER_WIDTH) * rect.width,
    y: rect.top + (projected.y / RENDER_HEIGHT) * rect.height,
  }
}

type WorldDebug = {
  tileCenterClient(x: number, y: number): {x: number; y: number} | null
  entityCenterClient(kind: "depot" | "guest" | "concession", id?: number): {x: number; y: number} | null
  state(): {
    width: number
    height: number
    tileCount: number
    boundaryFenceSegments: number
    habitatFenceSegments: number
    concessionCount: number
    guestCount: number
  }
}

type WorldCanvas = HTMLCanvasElement & {
  __zooWorldDebug?: WorldDebug
}

function parseCameraFrame(bridge: ParkCameraBridge): CameraFrame {
  return JSON.parse(bridge.frame_json(RENDER_ASPECT)) as CameraFrame
}

export default function Park3DRenderer({
  snapshot,
  placement,
  tool,
  selectedHabitatId,
  selectedGuestId,
  selectedDepot,
  hoveredTile,
  onTilePointerDown,
  onTilePointerMove,
  onTileClick,
  onHoverTile,
  onGuestClick,
  onDepotClick,
}: Props) {
  const canvasRef = useRef<WorldCanvas | null>(null)
  const rendererRef = useRef<ThreeSceneRenderer | null>(null)
  const bridgeRef = useRef<ParkCameraBridge | null>(null)
  const cameraRef = useRef<CameraFrame | null>(null)
  const lastHoverKeyRef = useRef<string | null>(null)
  const [cameraLabel, setCameraLabel] = useState({yaw: 0, pitch: 0})
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const renderCurrent = useCallback(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    const bridge = bridgeRef.current
    if (!canvas || !renderer || !bridge) return false

    try {
      const camera = parseCameraFrame(bridge)
      cameraRef.current = camera

      const terrainNodes = renderTerrainNodes(
        snapshot,
        selectedHabitatId,
        placement,
        hoveredTile,
        tool,
      )
      const fenceFrame = renderFenceNodes(snapshot, placement)
      const buildingNodes = renderBuildingNodes(snapshot)
      const concessionNodes = renderConcessionNodes(snapshot)
      const animalNodes = renderAnimalNodes(snapshot)
      const peopleNodes = renderPeopleNodes(snapshot, selectedGuestId)
      const operationsNodes = renderOperationsNodes(snapshot)
      const selectionNodes = renderSelectionNodes(snapshot, selectedDepot)

      const frame: RendererFrame = {
        camera,
        nodes: [
          ...terrainNodes,
          ...fenceFrame.nodes,
          ...buildingNodes,
          ...concessionNodes,
          ...animalNodes,
          ...peopleNodes,
          ...operationsNodes,
          ...selectionNodes,
        ],
      }
      renderer.render(frame)

      canvas.dataset.sharedRenderer = "ready"
      canvas.dataset.worldRenderer = "exclusive"
      canvas.dataset.sharedRendererNodeCount = String(frame.nodes.length)
      canvas.dataset.sharedRendererTileNodes = String(
        frame.nodes.filter((node) => node.id.startsWith("tile:")).length,
      )
      canvas.dataset.sharedRendererFenceNodes = String(fenceFrame.nodes.length)
      canvas.dataset.sharedRendererBoundaryFenceSegments = String(fenceFrame.counts.boundary)
      canvas.dataset.sharedRendererHabitatFenceSegments = String(fenceFrame.counts.habitat)
      canvas.dataset.sharedRendererPreviewFenceSegments = String(fenceFrame.counts.preview)
      canvas.dataset.sharedRendererBuildingNodes = String(buildingNodes.length)
      canvas.dataset.sharedRendererConcessionNodes = String(concessionNodes.length)
      canvas.dataset.sharedRendererAnimalNodes = String(animalNodes.length)
      canvas.dataset.sharedRendererGuestCount = String(snapshot.guests.length)
      canvas.dataset.sharedRendererJanitorCount = String(snapshot.animal_care_depot.janitors.length)
      canvas.dataset.sharedRendererMechanicCount = String(snapshot.animal_care_depot.mechanics.length)
      canvas.dataset.sharedRendererLitterCount = String(snapshot.litter.length)
      canvas.dataset.sharedRendererMaintenanceCount = String(snapshot.maintenance.length)

      const park = canvas.parentElement
      const yaw = relativeYaw(camera.yawDegrees)
      const pitch = relativePitch(camera.pitchDegrees)
      if (park instanceof HTMLElement) {
        park.dataset.cameraYaw = String(yaw)
        park.dataset.cameraPitch = String(pitch)
      }
      setCameraLabel((current) =>
        current.yaw === yaw && current.pitch === pitch ? current : {yaw, pitch},
      )

      canvas.__zooWorldDebug = {
        tileCenterClient(x, y) {
          const activeCamera = cameraRef.current
          if (!activeCamera || !snapshot.tiles.some((tile) => tile.x === x && tile.y === y)) {
            return null
          }
          return clientPointForWorld(canvas, activeCamera, tileCenter(x, y, 0.08))
        },
        entityCenterClient(kind, id) {
          const activeCamera = cameraRef.current
          if (!activeCamera) return null
          if (kind === "depot") {
            const origin = depotOrigin(snapshot)
            return clientPointForWorld(canvas, activeCamera, [origin.x, 0.55, origin.z])
          }
          if (kind === "guest") {
            const guest = snapshot.guests.find((candidate) => candidate.id === id)
            return guest
              ? clientPointForWorld(canvas, activeCamera, [guest.x + 1, 0.58, guest.y])
              : null
          }
          const stand = snapshot.concessions.find((candidate) => candidate.id === id)
          if (!stand) return null
          const origin = concessionOrigin(stand)
          return clientPointForWorld(canvas, activeCamera, [origin.x, 0.55, origin.z])
        },
        state() {
          return {
            width: snapshot.width,
            height: snapshot.height,
            tileCount: snapshot.tiles.length,
            boundaryFenceSegments: fenceFrame.counts.boundary,
            habitatFenceSegments: fenceFrame.counts.habitat,
            concessionCount: snapshot.concessions.length,
            guestCount: snapshot.guests.length,
          }
        },
      }

      setFailed(false)
      setReady(true)
      return true
    } catch (error) {
      console.error("3D Zoo world frame rejected", error)
      canvas.dataset.sharedRenderer = "failed"
      canvas.dataset.worldRenderer = "failed"
      setReady(false)
      setFailed(true)
      return false
    }
  }, [
    hoveredTile,
    placement,
    selectedDepot,
    selectedGuestId,
    selectedHabitatId,
    snapshot,
    tool,
  ])

  const resetCamera = useCallback(() => {
    bridgeRef.current?.free()
    bridgeRef.current = new ParkCameraBridge(snapshot.width, snapshot.height)
    renderCurrent()
  }, [renderCurrent, snapshot.height, snapshot.width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
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
        setReady(true)
      })
      .catch((error) => {
        console.error("3D Zoo world failed to initialize", error)
        canvas.dataset.sharedRenderer = "failed"
        canvas.dataset.worldRenderer = "failed"
        setFailed(true)
        setReady(false)
      })

    return () => {
      cancelled = true
      rendererRef.current?.dispose()
      rendererRef.current = null
      bridgeRef.current?.free()
      bridgeRef.current = null
      cameraRef.current = null
      delete canvas.__zooWorldDebug
      setReady(false)
    }
  }, [snapshot.height, snapshot.width])

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

  const pointFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const camera = cameraRef.current
    if (!canvas || !camera) return null
    const point = canvasPoint(canvas, event.clientX, event.clientY)
    return point ? {canvas, camera, point} : null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "pan") return
    const context = pointFromPointer(event)
    if (!context) return
    const tile = pickTile(snapshot, context.camera, context.point)
    if (!tile) return

    if (tool === "path" || tool === "habitat") {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      onTilePointerDown(event.pointerId, tile)
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = pointFromPointer(event)
    if (!context) return
    const tile = pickTile(snapshot, context.camera, context.point)
    const key = tile ? `${tile.x}:${tile.y}` : null
    if (key !== lastHoverKeyRef.current) {
      lastHoverKeyRef.current = key
      onHoverTile(tile ? {x: tile.x, y: tile.y} : null)
    }
    if (tile && (tool === "path" || tool === "habitat")) {
      onTilePointerMove(event.pointerId, tile)
    }
  }

  const handlePointerLeave = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return
    lastHoverKeyRef.current = null
    onHoverTile(null)
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (tool === "pan" || tool === "path" || tool === "habitat") return
    const canvas = canvasRef.current
    const camera = cameraRef.current
    if (!canvas || !camera) return
    const point = canvasPoint(canvas, event.clientX, event.clientY)
    if (!point) return

    // Construction is ground-authoritative: nearby rendered actors/buildings must not steal
    // the tile the user is explicitly trying to build on.
    if (tool === "food" || tool === "drink") {
      const tile = pickTile(snapshot, camera, point)
      if (tile) onTileClick(tile)
      return
    }

    const pick = pickWorld(snapshot, camera, point)
    if (!pick) return

    if (pick.kind === "guest") {
      onGuestClick(pick.id)
      return
    }
    if (pick.kind === "depot") {
      onDepotClick()
      return
    }
    onTileClick(pick.tile)
  }

  const rotate = (steps: number) => {
    bridgeRef.current?.rotate_steps(steps)
    renderCurrent()
  }

  const tilt = (degrees: number) => {
    bridgeRef.current?.tilt_by_degrees(degrees)
    renderCurrent()
  }

  const viewport =
    typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".viewport")

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`park-three-renderer-canvas world-tool-${tool}`}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
        tabIndex={0}
        role="application"
        aria-label="3D Zoo world. Use the build toolbar to select a tool, then interact with the park."
        data-shared-renderer={failed ? "failed" : ready ? "ready" : "loading"}
        data-world-renderer="exclusive"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
      {failed && (
        <div className="renderer-failure" role="alert">
          3D renderer unavailable
        </div>
      )}
      {viewport &&
        createPortal(
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
          viewport,
        )}
    </>
  )
}
