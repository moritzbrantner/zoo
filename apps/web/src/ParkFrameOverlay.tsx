import {useEffect, useMemo, useState} from "react"
import {createPortal} from "react-dom"

const OUTSIDE_BORDER_TILES = 4

type Point = {
  x: number
  y: number
}

type ScreenPoint = {
  left: number
  top: number
}

type FenceSide = "north" | "east" | "south" | "west"

type FrameMetrics = {
  park: HTMLElement
  width: number
  height: number
  entrance: Point
  origin: ScreenPoint
  xStep: ScreenPoint
  yStep: ScreenPoint
}

type FenceSegment = Point & {
  side: FenceSide
}

function readPosition(element: HTMLElement): ScreenPoint | null {
  const left = Number.parseFloat(element.style.left)
  const top = Number.parseFloat(element.style.top)
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return {left, top}
}

function readTile(element: HTMLElement) {
  const label = element.getAttribute("aria-label")
  const match = label?.match(/^(?:grass|path|entrance|habitat) tile (\d+), (\d+)$/)
  if (!match) return null
  return {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10),
    entrance: element.classList.contains("tile-entrance"),
    element,
  }
}

function sameMetrics(current: FrameMetrics | null, next: FrameMetrics) {
  return (
    current?.park === next.park &&
    current.width === next.width &&
    current.height === next.height &&
    current.entrance.x === next.entrance.x &&
    current.entrance.y === next.entrance.y &&
    current.origin.left === next.origin.left &&
    current.origin.top === next.origin.top &&
    current.xStep.left === next.xStep.left &&
    current.xStep.top === next.xStep.top &&
    current.yStep.left === next.yStep.left &&
    current.yStep.top === next.yStep.top
  )
}

function measureFrame(): FrameMetrics | null {
  const park = document.querySelector<HTMLElement>(".park")
  if (!park) return null

  const tiles = [...park.querySelectorAll<HTMLElement>(".tile[aria-label]")]
    .map(readTile)
    .filter((tile): tile is NonNullable<ReturnType<typeof readTile>> => tile !== null)
  if (tiles.length === 0) return null

  const originTile = tiles.find((tile) => tile.x === 0 && tile.y === 0)
  const xTile = tiles.find((tile) => tile.x === 1 && tile.y === 0)
  const yTile = tiles.find((tile) => tile.x === 0 && tile.y === 1)
  const entranceTile = tiles.find((tile) => tile.entrance)
  if (!originTile || !xTile || !yTile || !entranceTile) return null

  const origin = readPosition(originTile.element)
  const xPosition = readPosition(xTile.element)
  const yPosition = readPosition(yTile.element)
  if (!origin || !xPosition || !yPosition) return null

  return {
    park,
    width: Math.max(...tiles.map((tile) => tile.x)) + 1,
    height: Math.max(...tiles.map((tile) => tile.y)) + 1,
    entrance: {x: entranceTile.x, y: entranceTile.y},
    origin,
    xStep: {
      left: xPosition.left - origin.left,
      top: xPosition.top - origin.top,
    },
    yStep: {
      left: yPosition.left - origin.left,
      top: yPosition.top - origin.top,
    },
  }
}

function project(frame: FrameMetrics, point: Point): ScreenPoint {
  return {
    left: frame.origin.left + point.x * frame.xStep.left + point.y * frame.yStep.left,
    top: frame.origin.top + point.x * frame.xStep.top + point.y * frame.yStep.top,
  }
}

function entranceSide(frame: FrameMetrics): FenceSide {
  if (frame.entrance.x === 0) return "west"
  if (frame.entrance.x === frame.width - 1) return "east"
  if (frame.entrance.y === 0) return "north"
  return "south"
}

function isEntranceFenceGap(segment: FenceSegment, frame: FrameMetrics) {
  return (
    segment.side === entranceSide(frame) &&
    segment.x === frame.entrance.x &&
    segment.y === frame.entrance.y
  )
}

function fenceSegments(frame: FrameMetrics) {
  const segments: FenceSegment[] = []
  for (let x = 0; x < frame.width; x += 1) {
    segments.push({x, y: 0, side: "north"})
    segments.push({x, y: frame.height - 1, side: "south"})
  }
  for (let y = 0; y < frame.height; y += 1) {
    segments.push({x: 0, y, side: "west"})
    segments.push({x: frame.width - 1, y, side: "east"})
  }
  return segments.filter((segment) => !isEntranceFenceGap(segment, frame))
}

function outsideTiles(frame: FrameMetrics) {
  const tiles: Point[] = []
  for (let y = -OUTSIDE_BORDER_TILES; y < frame.height + OUTSIDE_BORDER_TILES; y += 1) {
    for (let x = -OUTSIDE_BORDER_TILES; x < frame.width + OUTSIDE_BORDER_TILES; x += 1) {
      const inside = x >= 0 && y >= 0 && x < frame.width && y < frame.height
      if (!inside) tiles.push({x, y})
    }
  }
  return tiles.sort((a, b) => a.x + a.y - (b.x + b.y))
}

function ringDepth(point: Point, frame: FrameMetrics) {
  const horizontal = point.x < 0 ? -point.x : point.x >= frame.width ? point.x - frame.width + 1 : 0
  const vertical = point.y < 0 ? -point.y : point.y >= frame.height ? point.y - frame.height + 1 : 0
  return Math.max(horizontal, vertical)
}

function isEntranceApproach(point: Point, frame: FrameMetrics) {
  switch (entranceSide(frame)) {
    case "west":
      return point.y === frame.entrance.y && point.x < 0
    case "east":
      return point.y === frame.entrance.y && point.x >= frame.width
    case "north":
      return point.x === frame.entrance.x && point.y < 0
    case "south":
      return point.x === frame.entrance.x && point.y >= frame.height
  }
}

function mutationTouchesTiles(record: MutationRecord) {
  return [...record.addedNodes, ...record.removedNodes].some((node) => {
    if (!(node instanceof Element)) return false
    return node.matches(".tile") || node.querySelector(".tile") !== null
  })
}

export default function ParkFrameOverlay() {
  const [frame, setFrame] = useState<FrameMetrics | null>(null)

  useEffect(() => {
    const root = document.getElementById("root")
    if (!root) return

    const sync = () => {
      const next = measureFrame()
      if (!next) return
      setFrame((current) => (sameMetrics(current, next) ? current : next))
    }

    sync()
    const observer = new MutationObserver((records) => {
      if (records.some(mutationTouchesTiles)) sync()
    })
    observer.observe(root, {childList: true, subtree: true})
    return () => observer.disconnect()
  }, [])

  const outer = useMemo(() => (frame ? outsideTiles(frame) : []), [frame])
  const fence = useMemo(() => (frame ? fenceSegments(frame) : []), [frame])

  useEffect(() => {
    if (!frame) return
    const projected = outer.map((point) => project(frame, point))
    const maxLeft = Math.max(...projected.map((point) => point.left), frame.origin.left)
    const maxTop = Math.max(...projected.map((point) => point.top), frame.origin.top)
    frame.park.style.minWidth = `${Math.ceil(maxLeft + 92)}px`
    frame.park.style.minHeight = `${Math.ceil(maxTop + 90)}px`
  }, [frame, outer])

  if (!frame) return null

  const entrancePosition = project(frame, frame.entrance)
  const side = entranceSide(frame)

  return createPortal(
    <>
      <div className="park-outside-terrain" aria-hidden="true" />
      {outer.map((point) => {
        const position = project(frame, point)
        const approach = isEntranceApproach(point, frame)
        return (
          <span
            aria-hidden="true"
            className={`park-border-tile ${approach ? "park-border-approach" : ""}`}
            data-ring={ringDepth(point, frame)}
            key={`park-border:${point.x}:${point.y}`}
            style={{
              left: position.left,
              top: position.top,
              zIndex: 70 + point.x + point.y + OUTSIDE_BORDER_TILES * 2,
            }}
          />
        )
      })}

      {fence.map((segment) => {
        const position = project(frame, segment)
        return (
          <span
            aria-hidden="true"
            className={`park-boundary-fence park-boundary-fence-${segment.side}`}
            key={`park-fence:${segment.x}:${segment.y}:${segment.side}`}
            style={{
              left: position.left,
              top: position.top,
              zIndex: 320 + segment.x + segment.y,
            }}
          />
        )
      })}

      <div
        className={`park-entrance-building park-entrance-building-${side}`}
        style={{
          left: entrancePosition.left,
          top: entrancePosition.top - 64,
          zIndex: 760 + frame.entrance.x + frame.entrance.y,
        }}
        title="Zoo entrance building"
        aria-label="Zoo entrance building"
      >
        <span className="park-entrance-base" />
        <span className="park-entrance-wing park-entrance-wing-left" />
        <span className="park-entrance-wing park-entrance-wing-right" />
        <span className="park-entrance-center" />
        <span className="park-entrance-roof" />
        <span className="park-entrance-sign">ZOO</span>
        <span className="park-entrance-door" />
      </div>
    </>,
    frame.park,
  )
}
