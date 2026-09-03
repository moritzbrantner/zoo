import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import init, {ZooGame} from "./wasm/zoo_core"

type Tool = "select" | "path" | "habitat" | "bulldoze"
type Speed = 0 | 1 | 2 | 4

type Tile = {
  x: number
  y: number
  kind: "grass" | "path" | "entrance" | "habitat"
  habitat_id: number | null
}

type Habitat = {
  id: number
  x: number
  y: number
  width: number
  height: number
  species: "capybara" | "flamingo" | null
  animals: number
  capacity: number
  welfare: number
  appeal: number
}

type Guest = {
  id: number
  x: number
  y: number
  happiness: number
  target_habitat: number
  state: "walking_to_habitat" | "viewing" | "walking_to_exit"
}

type Snapshot = {
  width: number
  height: number
  day: number
  minute_of_day: number
  cash_cents: number
  rating: number
  guest_count: number
  tiles: Tile[]
  habitats: Habitat[]
  guests: Guest[]
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

function speciesLabel(species: Habitat["species"]) {
  if (species === "capybara") return "Capybara"
  if (species === "flamingo") return "Flamingo"
  return "Empty habitat"
}

export default function App() {
  const gameRef = useRef<ZooGame | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [speed, setSpeed] = useState<Speed>(1)
  const [message, setMessage] = useState("Build a path, place a habitat beside it, then adopt animals.")
  const [messageKind, setMessageKind] = useState<"info" | "error">("info")
  const [selectedHabitatId, setSelectedHabitatId] = useState<number | null>(null)

  const refresh = useCallback(() => {
    const game = gameRef.current
    if (!game) return
    setSnapshot(JSON.parse(game.snapshot_json()) as Snapshot)
  }, [])

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

  const perform = useCallback(
    (command: () => string) => {
      const result = JSON.parse(command()) as ActionResult
      setMessage(result.message)
      setMessageKind(result.ok ? "info" : "error")
      refresh()
    },
    [refresh],
  )

  const selectedHabitat = useMemo(
    () => snapshot?.habitats.find((habitat) => habitat.id === selectedHabitatId) ?? null,
    [selectedHabitatId, snapshot],
  )

  const onTileClick = (tile: Tile) => {
    const game = gameRef.current
    if (!game) return

    if (tool === "select") {
      setSelectedHabitatId(tile.habitat_id)
      setMessage(tile.habitat_id ? `Habitat #${tile.habitat_id} selected` : "Ground selected")
      setMessageKind("info")
      return
    }
    if (tool === "path") {
      perform(() => game.place_path(tile.x, tile.y))
      return
    }
    if (tool === "habitat") {
      perform(() => game.place_habitat(tile.x, tile.y))
      return
    }
    perform(() => game.bulldoze(tile.x, tile.y))
    if (tile.habitat_id === selectedHabitatId) setSelectedHabitatId(null)
  }

  const adopt = (species: "capybara" | "flamingo") => {
    const game = gameRef.current
    if (!game || selectedHabitatId === null) return
    perform(() => game.adopt(selectedHabitatId, species))
  }

  const reset = () => {
    gameRef.current?.reset()
    setTool("select")
    setSelectedHabitatId(null)
    setMessage("New park started.")
    setMessageKind("info")
    refresh()
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

  return (
    <main className="game-shell">
      <header className="topbar bevel">
        <div className="brand">
          <strong>Zoo</strong>
          <span>Opening Day</span>
        </div>
        <div className="stat"><span>Cash</span><strong>{money(snapshot.cash_cents)}</strong></div>
        <div className="stat"><span>Guests</span><strong>{snapshot.guest_count}</strong></div>
        <div className="stat"><span>Rating</span><strong>{snapshot.rating}/999</strong></div>
        <div className="stat"><span>Day</span><strong>{snapshot.day} · {clock(snapshot.minute_of_day)}</strong></div>
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
        <div className="viewport">
          <div className="park" style={{width: 1240, height: 720}}>
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
                    className={`tile tile-${tile.kind} ${selectedTileIds.has(tileId) ? "selected" : ""}`}
                    style={{
                      left: position.left,
                      top: position.top,
                      zIndex: tile.x + tile.y,
                    }}
                    onClick={() => onTileClick(tile)}
                    title={`${tile.kind} (${tile.x}, ${tile.y})`}
                    aria-label={`${tile.kind} tile ${tile.x}, ${tile.y}`}
                  />
                )
              })}

            {snapshot.habitats.map((habitat) => {
              const center = isoPosition(
                habitat.x + (habitat.width - 1) / 2,
                habitat.y + (habitat.height - 1) / 2,
              )
              return (
                <button
                  className={`animal-marker ${habitat.species ? "" : "empty"}`}
                  key={habitat.id}
                  style={{
                    left: center.left + 18,
                    top: center.top - 13,
                    zIndex: 500 + habitat.x + habitat.y,
                  }}
                  onClick={() => {
                    setSelectedHabitatId(habitat.id)
                    setTool("select")
                  }}
                  title={`Habitat #${habitat.id}: ${speciesLabel(habitat.species)}`}
                >
                  <span className="animal-glyph">
                    {habitat.species === "capybara" ? "C" : habitat.species === "flamingo" ? "F" : "+"}
                  </span>
                  {habitat.animals > 1 && <small>×{habitat.animals}</small>}
                </button>
              )
            })}

            {snapshot.guests.map((guest) => {
              const position = isoPosition(guest.x, guest.y)
              return (
                <div
                  className={`guest guest-${guest.state}`}
                  key={guest.id}
                  style={{
                    left: position.left + 24,
                    top: position.top - 4,
                    zIndex: 800 + guest.x + guest.y,
                  }}
                  title={`Guest #${guest.id} · happiness ${guest.happiness}%`}
                >
                  <i />
                  <b />
                </div>
              )
            })}
          </div>
        </div>

        <aside className="side-panel bevel">
          {selectedHabitat ? (
            <>
              <div className="window-title">
                <span>Habitat #{selectedHabitat.id}</span>
                <button onClick={() => setSelectedHabitatId(null)}>×</button>
              </div>
              <div className="habitat-card">
                <div className="habitat-name">{speciesLabel(selectedHabitat.species)}</div>
                <dl>
                  <div><dt>Animals</dt><dd>{selectedHabitat.animals}/{selectedHabitat.capacity}</dd></div>
                  <div><dt>Welfare</dt><dd>{selectedHabitat.welfare}%</dd></div>
                  <div><dt>Appeal</dt><dd>{selectedHabitat.appeal}</dd></div>
                </dl>
                <div className="meter"><span style={{width: `${selectedHabitat.welfare}%`}} /></div>
                <h3>Adopt animal</h3>
                <button className="shop-row" onClick={() => adopt("capybara")}>
                  <span><b>Capybara</b><small>High appeal, social</small></span>
                  <strong>{money(25_000)}</strong>
                </button>
                <button className="shop-row" onClick={() => adopt("flamingo")}>
                  <span><b>Flamingo</b><small>Lower cost, colorful</small></span>
                  <strong>{money(18_000)}</strong>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="window-title"><span>Park manager</span></div>
              <div className="manager-card">
                <h2>Opening objective</h2>
                <ol>
                  <li>Extend the entrance path.</li>
                  <li>Place a 4×3 meadow habitat beside a path.</li>
                  <li>Select the habitat and adopt animals.</li>
                  <li>Watch guests arrive and pay admission.</li>
                </ol>
                <div className="finance-grid">
                  <span>Income today</span><strong>{money(snapshot.finance.income_today_cents)}</strong>
                  <span>Expenses today</span><strong>{money(snapshot.finance.expenses_today_cents)}</strong>
                  <span>Profit today</span><strong>{money(snapshot.finance.profit_today_cents)}</strong>
                </div>
                <button className="secondary" onClick={reset}>Start new park</button>
              </div>
            </>
          )}
        </aside>
      </section>

      <footer className="bottom-dock">
        <div className={`message bevel ${messageKind === "error" ? "error" : ""}`}>{message}</div>
        <nav className="toolbar bevel" aria-label="Build tools">
          <ToolButton active={tool === "select"} icon="↖" label="Inspect" onClick={() => setTool("select")} />
          <ToolButton active={tool === "path"} icon="▦" label="Path · $10" onClick={() => setTool("path")} />
          <ToolButton active={tool === "habitat"} icon="▱" label="Habitat · $700" onClick={() => setTool("habitat")} />
          <ToolButton active={tool === "bulldoze"} icon="⌫" label="Demolish" onClick={() => setTool("bulldoze")} />
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
