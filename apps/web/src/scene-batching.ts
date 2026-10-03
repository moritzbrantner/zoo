import type {
  RendererInstance,
  RendererInstanceBatch,
  RendererSceneNode,
} from "@moritzbrantner/three-d-renderer"

// Groups static scene nodes into shared-renderer instance batches: one draw call per distinct
// geometry/material instead of one per node. Picking never reads renderer objects (it uses
// zoo-scene ground picks and projected anchors), so batching does not change interaction.

type Geometry = RendererSceneNode["geometry"]
type Vec3 = [number, number, number]

const UNIT_BOX: Geometry = { kind: "box", size: [1, 1, 1] }
const UNIT_SPHERE: Geometry = { kind: "sphere", radius: 1 }
const UNIT_CYLINDER: Geometry = { kind: "cylinder", radius: 1, height: 1 }

/**
 * Primitive sizes become instance scale on a shared unit primitive, so differently sized parts
 * (e.g. trees at varied scales) still share one batch. Mesh geometry is keyed by resource.
 */
function normalizeGeometry(geometry: Geometry): {
  key: string
  geometry: Geometry
  size: Vec3 | null
} {
  switch (geometry.kind) {
    case "box":
      return { key: "box", geometry: UNIT_BOX, size: [...geometry.size] }
    case "sphere":
      return {
        key: "sphere",
        geometry: UNIT_SPHERE,
        size: [geometry.radius, geometry.radius, geometry.radius],
      }
    case "cylinder":
      return {
        key: "cylinder",
        geometry: UNIT_CYLINDER,
        size: [geometry.radius, geometry.height, geometry.radius],
      }
    case "mesh":
      return { key: `mesh:${geometry.resourceKey}`, geometry, size: null }
  }
}

function sizedInstance(node: RendererSceneNode, size: Vec3 | null): RendererInstance {
  if (node.modelMatrix) {
    if (!size) {
      return { modelMatrix: node.modelMatrix, color: node.color }
    }
    // Column-major: scale the three basis columns (local size is applied before the model matrix).
    const matrix = [...node.modelMatrix] as typeof node.modelMatrix
    for (let column = 0; column < 3; column += 1) {
      const factor = size[column] ?? 1
      for (let row = 0; row < 4; row += 1) {
        const index = column * 4 + row
        matrix[index] = (matrix[index] ?? 0) * factor
      }
    }
    return { modelMatrix: matrix, color: node.color }
  }
  const transform = node.transform!
  if (!size) {
    return { transform, color: node.color }
  }
  const scale = transform.scale ?? [1, 1, 1]
  return {
    transform: {
      ...transform,
      scale: [scale[0] * size[0], scale[1] * size[1], scale[2] * size[2]],
    },
    color: node.color,
  }
}

/** Ground-plane (x, z) position of a node, used to bucket batches into cullable cells. */
function groundPosition(node: RendererSceneNode): [number, number] {
  return node.modelMatrix
    ? [node.modelMatrix[12], node.modelMatrix[14]]
    : [node.transform!.translation[0], node.transform!.translation[2]]
}

/**
 * Batches are split into square ground cells of `cellSize` tiles so the renderer can still
 * frustum-cull off-screen parts of the park and its surroundings.
 *
 * `revision` must change whenever `nodes` change; batches built from unchanged nodes with the
 * same revision are not re-uploaded by the renderer.
 */
export function batchNodes(
  prefix: string,
  nodes: RendererSceneNode[],
  revision: string,
  cellSize = 16,
): RendererInstanceBatch[] {
  const groups = new Map<
    string,
    {
      geometry: Geometry
      color: RendererSceneNode["color"]
      opacity?: number
      instances: RendererInstance[]
    }
  >()
  for (const node of nodes) {
    if (node.visible === false) {
      continue
    }
    const normalized = normalizeGeometry(node.geometry)
    const [x, z] = groundPosition(node)
    const cell = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`
    const key = `${normalized.key}|${node.opacity ?? 1}|${cell}`
    let group = groups.get(key)
    if (!group) {
      group = {
        geometry: normalized.geometry,
        color: node.color,
        instances: [],
        ...(node.opacity === undefined ? {} : { opacity: node.opacity }),
      }
      groups.set(key, group)
    }
    group.instances.push(sizedInstance(node, normalized.size))
  }
  return [...groups].map(([key, group]) => {
    const batch: RendererInstanceBatch = {
      id: `${prefix}:${key}`,
      geometry: group.geometry,
      color: group.color,
      revision,
      instances: group.instances,
    }
    if (group.opacity !== undefined) {
      batch.opacity = group.opacity
    }
    return batch
  })
}
