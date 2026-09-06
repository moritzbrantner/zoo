import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import init, {ZooGame} from "./wasm/zoo_core"

type Tool = "select" | "pan" | "path" | "habitat" | "bulldoze"
type Speed = 0 | 1 | 2 | 4
type SpeciesKey = "capybara" | "flamingo" | "zebra" | "giraffe" | "elephant" | "penguin"
type FenceSide = "north" | "east" | "south" | "west"

type Point = {
  x: number
  y: number
}

type FenceSegment = Point & {
  side: FenceSide
}

type Tile = Point & {
  kind: "grass" | "path" | "entrance" | "habitat"
  habitat_id: number | null
}

type Habitat = Point & {
  id: number
  width: number
  height: number
  orientation: "horizontal" | "vertical"
  footprint_area: number
  fence_length: number
  fence_segments: FenceSegment[]
  species: SpeciesKey | null
  animals: number
  capacity: number
  welfare: number
  welfare_target: number
  social_score: number
  space_score: number
  welfare_status: string
  food: number
  water: number
  cleanliness: number
  has_shelter: boolean
  care_status: string
  appeal: number
}

type Animal = Point & {
  id: number
  habitat_id: number
  species: SpeciesKey
  slot: number
  animation_phase: number
}

type Guest = Point & {
  id: number
  happiness: number
  energy: number
  hunger: number
  thirst: number
  value_perception: number
  target_habitat: number
  state: "arriving" | "walking_to_habitat" | "viewing" | "walking_to_exit"
  thought: string
}

type SpeciesOffer = {
  key: SpeciesKey
  label: string
  purchase_cost_cents: number
  appeal: number
  minimum_social_group: number
  space_per_animal: number
}

type Snapshot = {
  width: number
  height: number
  day: number
  minute_of_day: number
  cash_cents: number
  rating: number
  guest_count: number
  entrance: {
    x: number
    y: number
    arrivals_total: number
  }
  tiles: Tile[]
  habitats: Habitat[]
  animals: Animal[]
  guests: Guest[]
  species_catalog: SpeciesOffer[]
  complaints: {
    hungry: number
    thirsty: number
    tired: number
    poor_value: number
  }
  finance: {
    income_today_cents: number
    expenses_today_cents: number
    profit_today_cents: number
    admission_price_cents: number
  }
}

type ActionResult = {
  ok: boolean
  message: string
}

type PlacementEvaluation = {
  ok: boolean
  message: string
  x: number
  y: number
  width: number
  height: number
  orientation: "horizontal" | "vertical"
  cost_cents: number
  occupied_tiles: Point[]
  fence_segments: FenceSegment[]
}

const tileWidth = 58
const tileHeight = 30
const originX = 620
const originY = 68

function isoPosition(x: number, y: number) {
  return {
    left: originX + (x - y) * (tileWidth / 2),
    top: originY + (x + y) * (tileHeight / 2),
  }
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

function speciesGlyph(species: SpeciesKey) {
  switch (species) {
    case "flamingo":
      return "🦩"
    case "zebra":
      return "🦓"
    case "giraffe":
      return "🦒"
    case "elephant":
      return "🐘"
    case "penguin":
      return "🐧"
    default:
      return "C"
  }
}

function speciesLabel(species: SpeciesKey | null, catalog: SpeciesOffer[]) {
  if (!species) return "Empty habitat"
  return catalog.find((offer) => offer.key === species)?.label ?? species
}

function guestStateLabel(state: Guest["state"]) {
  switch (state) {
    case "arriving":
      return "Entering through the gate"
    case "walking_to_habitat":
      return "Walking to habitat"
    case "viewing":
      return "Viewing animals"
    default:
      return "Walking to exit"
  }
}

function toolHint(tool: Tool) {
  switch (tool) {
    case "pan":
      return "Drag anywhere on the park to pan. Use –/+ to zoom."
    case "path":
      return "Drag across tiles to paint paths · $10 per new tile."
    case "habitat":
      return "Press on one corner, drag to the opposite corner, and release to close the fence."
    case "bulldoze":
      return "Click a path or any tile inside a habitat to remove it."
    default:
      return "Click a habitat, guest, animal, or ground tile to inspect it."
  }
}

function previewTiles(start: Point | null, end: Point | null, snapshot: Snapshot) {
  if (!start || !end) return []
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)
  const tiles: Point[] = []
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (x >= 0 && y >= 0 && x < snapshot.width && y < snapshot.height) {
        tiles.push({x, y})
      }
    }
  }
  return tiles
}

export default function App() {
  const gameRef = useRef<ZooGame | null>(null)
  const paintingRef = useRef(false)
  const paintedTilesRef = useRef(new Set<string>())
  const drawingFenceRef = useRef(false)
  const fenceStartRef = useRef<Point | null>(null)
  const fenceEndRef = useRef<Point | null>(null)
  const panSessionRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: Point
  } | null>(null)

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [speed, setSpeed] = useState<Speed>(1)
  const [message, setMessage] = useState(
    "Extend the entrance path, draw a fenced habitat, then adopt animals.",
  )
  const [messageKind, setMessageKind] = useState<"info" | "error">("info")
  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null)
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null)
  const [fenceStart, setFenceStart] = useState<Point | null>(null)
  const [fenceEnd, setFenceEnd] = useState<Point | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({x: 0, y: 0})

  const refresh = useCallback(() => {
    const game = gameRef.current
    if (!game) return
    setSnapshot(JSON.parse(game.snapshot_json()) as Snapshot)
  }, [])

  const perform = useCallback(
    (command: () => string) => {
      const result = JSON.parse(command()) as ActionResult
      setMessage(result.message)
      setMessageKind(result.ok ? "info" : "error")
      refresh()
      return result
    },
    [refresh],
  )

  useEffect(() => {
    let cancelled = false
    void init().then(() => {
      if (cancelled) return
      gameRef.current = new ZooGame()
      refresh()
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    if (!snapshot || speed === 0) return
    const handle = window.setInterval(() => {
      gameRef.current?.tick(speed)
      refresh()
    }, 250)
    return () => window.clearInterval(handle)
  }, [refresh, snapshot !== null, speed])

  useEffect(() => {
    const finishGesture = () => {
      paintingRef.current = false
      paintedTilesRef.current.clear()

      const game = gameRef.current
      const start = fenceStartRef.current
      const end = fenceEndRef.current
      if (drawingFenceRef.current && game && start && end) {
        perform(() => game.place_habitat_rect(start.x, start.y, end.x, end.y))
      }

      drawingFenceRef.current = false
      fenceStartRef.current = null
      fenceEndRef.current = null
      setFenceStart(null)
      setFenceEnd(null)
    }

    window.addEventListener("pointerup", finishGesture)
    window.addEventListener("pointercancel", finishGesture)
    return () => {
      window.removeEventListener("pointerup", finishGesture)
      window.removeEventListener("pointercancel", finishGesture)
    }
  }, [perform])

  useEffect(() => {
    if (tool === "habitat") return
    drawingFenceRef.current = false
    fenceStartRef.current = null
    fenceEndRef.current = null
    setFenceStart(null)
    setFenceEnd(null)
  }, [tool])

  const selectedHabitat = useMemo(
    () => snapshot?.habitats.find((habitat) => habitat.id === selectedHabitatId) ?? null,
    [selectedHabitatId, snapshot],
  )

  const selectedGuest = useMemo(
    () => snapshot?.guests.find((guest) => guest.id === selectedGuestId) ?? null,
    [selectedGuestId, snapshot],
  )

  const placement = useMemo(() => {
    const game = gameRef.current
    if (!game || !snapshot || tool !== "habitat" || !fenceStart || !fenceEnd) return null
    return JSON.parse(
      game.evaluate_habitat_rect(fenceStart.x, fenceStart.y, fenceEnd.x, fenceEnd.y),
    ) as PlacementEvaluation
  }, [fenceEnd, fenceStart, snapshot, tool])

  const paintPath = useCallback(
    (tile: Tile) => {
      const game = gameRef.current
      if (!game) return
      const key = `${tile.x}:${tile.y}`
      if (paintedTilesRef.current.has(key)) return
      paintedTilesRef.current.add(key)
      perform(() => game.place_path(tile.x, tile.y))
    },
    [perform],
  )

  const onTilePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, tile: Tile) => {
    if (tool === "path") {
      event.preventDefault()
      event.stopPropagation()
      paintingRef.current = true
      paintedTilesRef.current.clear()
      paintPath(tile)
      return
    }

    if (tool === "habitat") {
      event.preventDefault()
      event.stopPropagation()
      const point = {x: tile.x, y: tile.y}
      drawingFenceRef.current = true
      fenceStartRef.current = point
      fenceEndRef.current = point
      setFenceStart(point)
      setFenceEnd(point)
    }
  }

  const onTilePointerEnter = (tile: Tile) => {
    const point = {x: tile.x, y: tile.y}
    setHoveredTile(point)
    if (tool === "path" && paintingRef.current) {
      paintPath(tile)
    }
    if (tool === "habitat" && drawingFenceRef.current) {
      fenceEndRef.current = point
      setFenceEnd(point)
    }
  }

  const onTileClick = (tile: Tile) => {
    const game = gameRef.current
    if (!game || tool === "path" || tool === "pan" || tool === "habitat") return

    if (tool === "select") {
      setSelectedGuestId(null)
      setSelectedHabitatId(tile.habitat_id)
      setMessage(tile.habitat_id ? `Habitat #${tile.habitat_id} selected` : "Ground selected")
      setMessageKind("info")
      return
    }

    perform(() => game.bulldoze(tile.x, tile.y))
    if (tile.habitat_id === selectedHabitatId) setSelectedHabitatId(null)
  }

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "pan") return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    panSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: pan,
    }
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    setPan({
      x: session.origin.x + event.clientX - session.startX,
      y: session.origin.y + event.clientY - session.startY,
    })
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panSessionRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panSessionRef.current = null
  }

  const adopt = (species: SpeciesKey) => {
    const game = gameRef.current
    if (!game || selectedHabitatId === null) return
    perform(() => game.adopt(selectedHabitatId, species))
  }

  const careForHabitat = (action: "feed" | "water" | "clean" | "shelter") => {
    const game = gameRef.current
    if (!game || selectedHabitatId === null) return
    if (action === "feed") perform(() => game.feed_habitat(selectedHabitatId))
    if (action === "water") perform(() => game.refill_water(selectedHabitatId))
    if (action === "clean") perform(() => game.clean_habitat(selectedHabitatId))
    if (action === "shelter") perform(() => game.add_shelter(selectedHabitatId))
  }

  const reset = () => {
    gameRef.current?.reset()
    setTool("select")
    setSelectedHabitatId(null)
    setSelectedGuestId(null)
    setHoveredTile(null)
    setFenceStart(null)
    setFenceEnd(null)
    setZoom(1)
    setPan({x: 0, y: 0})
    setMessage("New park started.")
    setMessageKind("info")
    refresh()
  }

  const changeZoom = (delta: number) => {
    setZoom((current) => Math.min(1.6, Math.max(0.55, Number((current + delta).toFixed(2)))))
  }

  if (!snapshot) {
    return <main className="loading">Preparing the park simulation…</main>
  }

  const selectedTileIds = new Set<number>(
    selectedHabitat
      ? snapshot.tiles
          .filter((tile) => tile.habitat_id === selectedHabitat.id)
          .map((tile) => tile.y * snapshot.width + tile.x)
      : [],
  )
  const ghostTiles = previewTiles(fenceStart, fenceEnd, snapshot)
  const entrancePosition = isoPosition(snapshot.entrance.x, snapshot.entrance.y)

  return (
    <main className="game-shell">
      <header className="topbar bevel">
        <div className="brand">
          <strong>Zoo</strong>
          <span>Opening Day</span>
        </div>
        <div className="stat">
          <span>Cash</span>
          <strong>{money(snapshot.cash_cents)}</strong>
        </div>
        <div className="stat">
          <span>Guests</span>
          <strong>{snapshot.guest_count}</strong>
        </div>
        <div className="stat">
          <span>Rating</span>
          <strong>{snapshot.rating}/999</strong>
        </div>
        <div className="stat">
          <span>Day</span>
          <strong>
            {snapshot.day} · {clock(snapshot.minute_of_day)}
          </strong>
        </div>
        <div className="camera-controls" aria-label="Camera zoom">
          <button onClick={() => changeZoom(-0.15)} title="Zoom out">
            −
          </button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button onClick={() => changeZoom(0.15)} title="Zoom in">
            +
          </button>
          <button
            className="camera-reset"
            onClick={() => {
              setZoom(1)
              setPan({x: 0, y: 0})
            }}
            title="Reset camera"
          >
            ⌂
          </button>
        </div>
        <div className="speed-controls" aria-label="Simulation speed">
          {([0, 1, 2, 4] as const).map((value) => (
            <button
              key={value}
              className={speed === value ? "active" : ""}
              onClick={() => setSpeed(value)}
              title={value === 0 ? "Pause" : `${value}x speed`}
            >
              {value === 0 ? "Ⅱ" : `${value}×`}
            </button>
          ))}
        </div>
      </header>

      <section className="workspace">
        <div className={`viewport ${tool === "pan" ? "panning" : ""}`}>
          <div
            className={`park ${speed === 0 ? "paused" : ""}`}
            style={{
              width: 1240,
              height: 720,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onPointerLeave={() => setHoveredTile(null)}
          >
            <div className="park-label">Starter Meadow</div>

            {snapshot.tiles
              .slice()
              .sort((a, b) => a.x + a.y - (b.x + b.y))
              .map((tile) => {
                const position = isoPosition(tile.x, tile.y)
                const tileId = tile.y * snapshot.width + tile.x
                return (
                  <button
                    key={`${tile.x}:${tile.y}`}
                    className={`tile tile-${tile.kind} ${
                      selectedTileIds.has(tileId) ? "selected" : ""
                    }`}
                    style={{
                      left: position.left,
                      top: position.top,
                      zIndex: tile.x + tile.y,
                    }}
                    onPointerDown={(event) => onTilePointerDown(event, tile)}
                    onPointerEnter={() => onTilePointerEnter(tile)}
                    onClick={() => onTileClick(tile)}
                    title={`${tile.kind} (${tile.x}, ${tile.y})`}
                    aria-label={`${tile.kind} tile ${tile.x}, ${tile.y}`}
                  />
                )
              })}

            {snapshot.habitats.flatMap((habitat) =>
              habitat.fence_segments.map((segment, index) => {
                const position = isoPosition(segment.x, segment.y)
                return (
                  <span
                    className={`fence-segment fence-${segment.side}`}
                    key={`fence:${habitat.id}:${segment.x}:${segment.y}:${segment.side}:${index}`}
                    style={{
                      left: position.left,
                      top: position.top,
                      zIndex: 340 + segment.x + segment.y,
                    }}
                  />
                )
              }),
            )}

            {ghostTiles.map((tile) => {
              const position = isoPosition(tile.x, tile.y)
              return (
                <div
                  className={`placement-ghost ${placement?.ok ? "valid" : "invalid"}`}
                  key={`ghost:${tile.x}:${tile.y}`}
                  style={{
                    left: position.left,
                    top: position.top,
                    zIndex: 300 + tile.x + tile.y,
                  }}
                />
              )
            })}

            {placement?.fence_segments.map((segment, index) => {
              const position = isoPosition(segment.x, segment.y)
              return (
                <span
                  className={`fence-segment fence-${segment.side} fence-preview`}
                  key={`preview-fence:${segment.x}:${segment.y}:${segment.side}:${index}`}
                  style={{
                    left: position.left,
                    top: position.top,
                    zIndex: 360 + segment.x + segment.y,
                  }}
                />
              )
            })}

            {placement && hoveredTile && (
              <div
                className={`placement-price bevel ${placement.ok ? "valid" : "invalid"}`}
                style={{
                  left: isoPosition(hoveredTile.x, hoveredTile.y).left + 24,
                  top: isoPosition(hoveredTile.x, hoveredTile.y).top - 52,
                  zIndex: 900,
                }}
              >
                <b>
                  {placement.ok ? "✓ Fence closes" : "! Cannot build"} · {placement.width}×
                  {placement.height} · {money(placement.cost_cents)}
                </b>
                <small>{placement.message}</small>
              </div>
            )}

            <div
              className="entrance-gate"
              style={{
                left: entrancePosition.left - 24,
                top: entrancePosition.top - 48,
                zIndex: 760,
              }}
              title={`${snapshot.entrance.arrivals_total} guests have entered here`}
              aria-label="Zoo entrance gate"
            >
              <span className="gate-roof" />
              <span className="gate-sign">ZOO</span>
              <span className="gate-post gate-post-left" />
              <span className="gate-post gate-post-right" />
              <span className="turnstile" />
            </div>

            {snapshot.animals.map((animal) => {
              const position = isoPosition(animal.x, animal.y)
              const offset = (animal.slot % 3) - 1
              return (
                <button
                  type="button"
                  className={`animal animal-${animal.species}`}
                  key={animal.id}
                  style={{
                    left: position.left + 14 + offset * 6,
                    top: position.top - 16 + (animal.slot % 2) * 5,
                    zIndex: 520 + animal.x + animal.y + animal.slot,
                    animationDelay: `-${animal.animation_phase / 20}s`,
                  }}
                  title={`${speciesLabel(animal.species, snapshot.species_catalog)} · Habitat #${
                    animal.habitat_id
                  }`}
                  onClick={() => {
                    if (tool === "pan") return
                    setSelectedGuestId(null)
                    setSelectedHabitatId(animal.habitat_id)
                    setTool("select")
                  }}
                >
                  <span>{speciesGlyph(animal.species)}</span>
                </button>
              )
            })}

            {snapshot.habitats
              .filter((habitat) => habitat.animals === 0)
              .map((habitat) => {
                const center = isoPosition(
                  habitat.x + (habitat.width - 1) / 2,
                  habitat.y + (habitat.height - 1) / 2,
                )
                return (
                  <button
                    type="button"
                    className="empty-habitat-marker"
                    key={`empty:${habitat.id}`}
                    style={{
                      left: center.left + 15,
                      top: center.top - 10,
                      zIndex: 500 + habitat.x + habitat.y,
                    }}
                    onClick={() => {
                      if (tool === "pan") return
                      setSelectedGuestId(null)
                      setSelectedHabitatId(habitat.id)
                      setTool("select")
                    }}
                    title={`Habitat #${habitat.id}: empty`}
                  >
                    +
                  </button>
                )
              })}

            {snapshot.guests.map((guest) => {
              const position = isoPosition(guest.x, guest.y)
              return (
                <button
                  type="button"
                  className={`guest guest-${guest.state} ${
                    selectedGuestId === guest.id ? "selected" : ""
                  }`}
                  key={guest.id}
                  style={{
                    left: position.left + 24,
                    top: position.top - 4,
                    zIndex: 800 + guest.x + guest.y,
                  }}
                  title={`Guest #${guest.id} · ${guest.thought}`}
                  onClick={() => {
                    if (tool === "pan") return
                    setSelectedGuestId(guest.id)
                    setSelectedHabitatId(null)
                    setTool("select")
                  }}
                >
                  <i />
                  <b />
                </button>
              )
            })}
          </div>
        </div>

        <aside className="side-panel bevel">
          {selectedGuest ? (
            <>
              <div className="window-title">
                <span>Guest #{selectedGuest.id}</span>
                <button onClick={() => setSelectedGuestId(null)}>×</button>
              </div>
              <div className="guest-card">
                <div className="guest-thought">“{selectedGuest.thought}”</div>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{guestStateLabel(selectedGuest.state)}</dd>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>Habitat #{selectedGuest.target_habitat}</dd>
                  </div>
                  <div>
                    <dt>Happiness</dt>
                    <dd>{selectedGuest.happiness}%</dd>
                  </div>
                </dl>
                <h3>Needs</h3>
                <NeedBar label="Energy" value={selectedGuest.energy} />
                <NeedBar label="Hunger" value={selectedGuest.hunger} badWhenHigh />
                <NeedBar label="Thirst" value={selectedGuest.thirst} badWhenHigh />
                <NeedBar label="Value" value={selectedGuest.value_perception} />
              </div>
            </>
          ) : selectedHabitat ? (
            <>
              <div className="window-title">
                <span>Habitat #{selectedHabitat.id}</span>
                <button onClick={() => setSelectedHabitatId(null)}>×</button>
              </div>
              <div className="habitat-card">
                <div className="habitat-name">
                  {speciesLabel(selectedHabitat.species, snapshot.species_catalog)}
                </div>
                <div className="guest-thought">{selectedHabitat.welfare_status}</div>
                <dl>
                  <div>
                    <dt>Animals</dt>
                    <dd>
                      {selectedHabitat.animals}/{selectedHabitat.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt>Enclosed area</dt>
                    <dd>{selectedHabitat.footprint_area} tiles</dd>
                  </div>
                  <div>
                    <dt>Fence</dt>
                    <dd>{selectedHabitat.fence_length} sections</dd>
                  </div>
                  <div>
                    <dt>Current welfare</dt>
                    <dd>{selectedHabitat.welfare}%</dd>
                  </div>
                  <div>
                    <dt>Welfare target</dt>
                    <dd>{selectedHabitat.welfare_target}%</dd>
                  </div>
                  <div>
                    <dt>Social fit</dt>
                    <dd>{selectedHabitat.social_score}%</dd>
                  </div>
                  <div>
                    <dt>Space fit</dt>
                    <dd>{selectedHabitat.space_score}%</dd>
                  </div>
                  <div>
                    <dt>Appeal</dt>
                    <dd>{selectedHabitat.appeal}</dd>
                  </div>
                </dl>
                <div className="meter">
                  <span style={{width: `${selectedHabitat.welfare}%`}} />
                </div>

                <h3>Care</h3>
                <div className="guest-thought">{selectedHabitat.care_status}</div>
                <NeedBar label="Food" value={selectedHabitat.food} />
                <NeedBar label="Water" value={selectedHabitat.water} />
                <NeedBar label="Cleanliness" value={selectedHabitat.cleanliness} />
                <dl>
                  <div>
                    <dt>Shelter</dt>
                    <dd>{selectedHabitat.has_shelter ? "Installed" : "Missing"}</dd>
                  </div>
                </dl>
                <button className="shop-row" onClick={() => careForHabitat("feed")}>
                  <span>
                    <b>Restock food</b>
                    <small>Fill habitat food stores</small>
                  </span>
                </button>
                <button className="shop-row" onClick={() => careForHabitat("water")}>
                  <span>
                    <b>Refill water</b>
                    <small>Fill habitat water stores</small>
                  </span>
                </button>
                <button className="shop-row" onClick={() => careForHabitat("clean")}>
                  <span>
                    <b>Clean habitat</b>
                    <small>Restore habitat cleanliness</small>
                  </span>
                </button>
                <button className="shop-row" onClick={() => careForHabitat("shelter")}>
                  <span>
                    <b>Add basic shelter</b>
                    <small>Give animals a protected resting area</small>
                  </span>
                </button>

                <h3>Adopt animal</h3>
                {snapshot.species_catalog.map((offer) => {
                  const wrongSpecies =
                    selectedHabitat.species !== null && selectedHabitat.species !== offer.key
                  const full = selectedHabitat.animals >= selectedHabitat.capacity
                  return (
                    <button
                      className="shop-row species-row"
                      key={offer.key}
                      disabled={wrongSpecies || full}
                      onClick={() => adopt(offer.key)}
                    >
                      <span className="species-offer">
                        <i>{speciesGlyph(offer.key)}</i>
                        <span>
                          <b>{offer.label}</b>
                          <small>
                            Group {offer.minimum_social_group}+ · {offer.space_per_animal} space each
                          </small>
                        </span>
                      </span>
                      <strong>{money(offer.purchase_cost_cents)}</strong>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="window-title">
                <span>Park manager</span>
              </div>
              <div className="manager-card">
                <h2>Opening objective</h2>
                <ol>
                  <li>Guests enter through the gate on the west edge.</li>
                  <li>Drag the path tool to extend the entrance route.</li>
                  <li>Choose Habitat and drag a closed rectangular fence around clear grass.</li>
                  <li>Select the enclosure and adopt one of the available species.</li>
                  <li>Watch individual animals roam while guests arrive and pay admission.</li>
                </ol>
                <div className="finance-grid">
                  <span>Income today</span>
                  <strong>{money(snapshot.finance.income_today_cents)}</strong>
                  <span>Expenses today</span>
                  <strong>{money(snapshot.finance.expenses_today_cents)}</strong>
                  <span>Profit today</span>
                  <strong>{money(snapshot.finance.profit_today_cents)}</strong>
                  <span>Admission</span>
                  <strong>{money(snapshot.finance.admission_price_cents)}</strong>
                </div>
                <h3>Guest complaints</h3>
                <div className="complaint-grid">
                  <span>Hungry</span>
                  <strong>{snapshot.complaints.hungry}</strong>
                  <span>Thirsty</span>
                  <strong>{snapshot.complaints.thirsty}</strong>
                  <span>Tired</span>
                  <strong>{snapshot.complaints.tired}</strong>
                  <span>Poor value</span>
                  <strong>{snapshot.complaints.poor_value}</strong>
                </div>
                <button className="secondary" onClick={reset}>
                  Start new park
                </button>
              </div>
            </>
          )}
        </aside>
      </section>

      <footer className="bottom-dock">
        <div className="message-stack">
          <div className={`message bevel ${messageKind === "error" ? "error" : ""}`}>
            {message}
          </div>
          <div className="tool-hint">{toolHint(tool)}</div>
        </div>
        <nav className="toolbar bevel" aria-label="Build tools">
          <ToolButton
            active={tool === "select"}
            icon="↖"
            label="Inspect"
            onClick={() => setTool("select")}
          />
          <ToolButton
            active={tool === "pan"}
            icon="✋"
            label="Pan map"
            onClick={() => setTool("pan")}
          />
          <ToolButton
            active={tool === "path"}
            icon="▦"
            label="Path · $10"
            onClick={() => setTool("path")}
          />
          <ToolButton
            active={tool === "habitat"}
            icon="⌗"
            label="Draw habitat"
            onClick={() => setTool("habitat")}
          />
          <ToolButton
            active={tool === "bulldoze"}
            icon="⌫"
            label="Demolish"
            onClick={() => setTool("bulldoze")}
          />
        </nav>
      </footer>
    </main>
  )
}

function ToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button className={`tool ${active ? "active" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  )
}

function NeedBar({
  label,
  value,
  badWhenHigh = false,
}: {
  label: string
  value: number
  badWhenHigh?: boolean
}) {
  const warning = badWhenHigh ? value >= 60 : value <= 35
  return (
    <div className={`need-row ${warning ? "warning" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="need-track">
        <span style={{width: `${value}%`}} />
      </div>
    </div>
  )
}
