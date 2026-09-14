import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9222
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean)
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate))

if (!chromePath) {
  throw new Error(`No Chrome/Chromium binary found. Checked: ${chromeCandidates.join(", ")}`)
}

const profileDir = `/tmp/zoo-fence-proof-${process.pid}`
rmSync(profileDir, {recursive: true, force: true})

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDir}`,
    "--window-size=1280,850",
    previewUrl,
  ],
  {stdio: "ignore"},
)

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForPageTarget() {
  let lastError = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(
          (candidate) => candidate.type === "page" && candidate.url.startsWith(previewUrl),
        )
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Chrome did not expose the Zoo page target: ${lastError ?? "timed out"}`)
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, {once: true})
    socket.addEventListener("error", reject, {once: true})
  })

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(`${message.error.code}: ${message.error.message}`))
    else request.resolve(message.result)
  })

  return {
    opened,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId
      nextId += 1
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject})
        socket.send(JSON.stringify({id, method, params}))
      })
    },
  }
}

let cdp = null
try {
  const target = await waitForPageTarget()
  cdp = connectCdp(target.webSocketDebuggerUrl)
  await cdp.opened
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  await cdp.send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 1})

  const evaluate = async (expression) => {
    const response = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed")
    }
    return response.result.value
  }

  let ready = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    ready = await evaluate(`Boolean(document.querySelector('[aria-label="grass tile 1, 8"]'))`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Zoo did not become interactive")

  const toolsReady = await evaluate(`(() => {
    document.querySelector('button[title="Pause"]')?.click()
    const drawHabitat = [...document.querySelectorAll('button.tool')].find((button) =>
      button.textContent?.includes('Draw habitat'),
    )
    if (!drawHabitat) return false
    drawHabitat.click()
    return true
  })()`)
  if (!toolsReady) throw new Error("Could not activate the habitat drawing tool")

  // The starter path occupies x=1..4 at y=7. This clear 4×3 rectangle sits
  // immediately below it, so Rust's path-adjacency rule makes it a valid enclosure.
  const points = await evaluate(`(() => {
    const center = (label) => {
      const element = document.querySelector('[aria-label="' + label + '"]')
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    }
    return {
      start: center('grass tile 1, 8'),
      end: center('grass tile 4, 10'),
    }
  })()`)
  if (!points.start || !points.end) throw new Error("Could not resolve fence drag coordinates")

  const touchPoint = (point) => [
    {
      x: point.x,
      y: point.y,
      radiusX: 2,
      radiusY: 2,
      force: 1,
      id: 1,
    },
  ]

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touchPoint(points.start),
  })
  await sleep(50)

  const builtOnPress = await evaluate(
    `document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false`,
  )
  if (builtOnPress) {
    throw new Error("Touch press committed the habitat before the finger was released")
  }

  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touchPoint({
        x: points.start.x + (points.end.x - points.start.x) * progress,
        y: points.start.y + (points.end.y - points.start.y) * progress,
      }),
    })
  }

  let previewState = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    previewState = await evaluate(`(() => {
      const rails = [...document.querySelectorAll('.fence-preview')]
      const ghosts = [...document.querySelectorAll('.placement-ghost')]
      return {
        rails: rails.length,
        projectedRails: rails.filter((element) =>
          element.style.transform.startsWith('rotate(') && Number.parseFloat(element.style.width) > 0,
        ).length,
        ghosts: ghosts.length,
        projectedGhosts: ghosts.filter((element) =>
          element.style.clipPath.startsWith('polygon(') &&
          Number.parseFloat(element.style.width) > 0 &&
          Number.parseFloat(element.style.height) > 0,
        ).length,
      }
    })()`)
    if (
      previewState.rails === 14 &&
      previewState.projectedRails === 14 &&
      previewState.ghosts === 12 &&
      previewState.projectedGhosts === 12
    ) break
    await sleep(50)
  }
  if (
    previewState?.rails !== 14 ||
    previewState?.projectedRails !== 14 ||
    previewState?.ghosts !== 12 ||
    previewState?.projectedGhosts !== 12
  ) {
    throw new Error(
      `Touch drag did not expose projected 4×3 placement geometry: ${JSON.stringify(previewState)}`,
    )
  }

  const builtBeforeRelease = await evaluate(
    `document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false`,
  )
  if (builtBeforeRelease) {
    throw new Error("Touch drag committed the habitat before touchEnd")
  }

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })

  let built = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    built = await evaluate(
      `document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false`,
    )
    if (built) break
    await sleep(100)
  }
  if (!built) {
    const message = await evaluate(`document.querySelector('.message')?.textContent ?? 'No message'`)
    throw new Error(`The 4×3 habitat was not created on touch release during browser dogfood: ${message}`)
  }

  const geometry = await evaluate(`(() => {
    const polygonPoints = (tile) => {
      const style = getComputedStyle(tile)
      const left = Number.parseFloat(style.left)
      const top = Number.parseFloat(style.top)
      const width = Number.parseFloat(style.width)
      const height = Number.parseFloat(style.height)
      const matches = [...style.clipPath.matchAll(/(-?[\\d.]+)%\\s+(-?[\\d.]+)%/g)]
      if (matches.length !== 4 || ![left, top, width, height].every(Number.isFinite)) return null
      return matches.map((match) => ({
        x: left + width * Number.parseFloat(match[1]) / 100,
        y: top + height * Number.parseFloat(match[2]) / 100,
      }))
    }
    const edgeIndices = {
      north: [0, 1],
      east: [1, 2],
      south: [3, 2],
      west: [0, 3],
    }
    const projectedEdges = [...document.querySelectorAll('button.tile')].flatMap((tile) => {
      const points = polygonPoints(tile)
      if (!points) return []
      const label = tile.getAttribute('aria-label') ?? 'unknown tile'
      return Object.entries(edgeIndices).map(([side, indices]) => ({
        id: label + ':' + side,
        side,
        start: points[indices[0]],
        end: points[indices[1]],
      }))
    })
    const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y)
    const edgeError = (actualStart, actualEnd, edge) => Math.min(
      distance(actualStart, edge.start) + distance(actualEnd, edge.end),
      distance(actualStart, edge.end) + distance(actualEnd, edge.start),
    )

    return [...document.querySelectorAll('.fence-segment:not(.fence-preview)')].map((element) => {
      const side = ['north', 'east', 'south', 'west'].find((candidate) =>
        element.classList.contains('fence-' + candidate),
      )
      const style = getComputedStyle(element)
      const width = Number.parseFloat(style.width)
      const left = Number.parseFloat(style.left)
      const top = Number.parseFloat(style.top)
      const halfHeight = Number.parseFloat(style.height) / 2
      const matrix = new DOMMatrix(style.transform)
      const axisLength = Math.hypot(matrix.a, matrix.b)
      const directionX = axisLength > 0 ? matrix.a / axisLength : Number.NaN
      const directionY = axisLength > 0 ? matrix.b / axisLength : Number.NaN
      const actualStart = {x: left, y: top + halfHeight}
      const actualEnd = {
        x: actualStart.x + width * directionX,
        y: actualStart.y + width * directionY,
      }
      const finiteGeometry = [
        width,
        left,
        top,
        halfHeight,
        directionX,
        directionY,
        actualStart.x,
        actualStart.y,
        actualEnd.x,
        actualEnd.y,
      ].every(Number.isFinite)
      const candidates = finiteGeometry
        ? projectedEdges
            .filter((edge) => edge.side === side)
            .map((edge) => ({...edge, error: edgeError(actualStart, actualEnd, edge)}))
            .filter((edge) => Number.isFinite(edge.error))
            .sort((leftEdge, rightEdge) => leftEdge.error - rightEdge.error)
        : []
      const best = candidates[0]
      return {
        side,
        finiteGeometry,
        raw: {
          width: style.width,
          left: style.left,
          top: style.top,
          height: style.height,
          transform: style.transform,
        },
        matchedEdge: best?.id ?? null,
        edgeError: best?.error ?? null,
      }
    })
  })()`)

  if (geometry.length !== 14) {
    throw new Error(`Expected 14 fence segments for a 4×3 habitat, found ${geometry.length}`)
  }
  const expectedSideCounts = {north: 4, east: 3, south: 4, west: 3}
  for (const [side, expectedCount] of Object.entries(expectedSideCounts)) {
    const count = geometry.filter((segment) => segment.side === side).length
    if (count !== expectedCount) {
      throw new Error(`Expected ${expectedCount} ${side} fence segments, found ${count}`)
    }
  }
  const invalid = geometry.filter(
    (segment) => !segment.finiteGeometry || segment.matchedEdge === null || segment.edgeError === null,
  )
  if (invalid.length > 0) {
    throw new Error(`Projected fence proof could not resolve finite rail geometry: ${JSON.stringify(invalid)}`)
  }
  const misplaced = geometry.filter((segment) => segment.edgeError > 3)
  if (misplaced.length > 0) {
    throw new Error(`Projected fence rails are off rendered tile edges: ${JSON.stringify(misplaced)}`)
  }
  const distinctEdges = new Set(geometry.map((segment) => segment.matchedEdge))
  if (distinctEdges.size !== geometry.length) {
    throw new Error(`Projected fence rails do not map one-to-one to rendered tile edges: ${JSON.stringify(geometry)}`)
  }

  const clip = await evaluate(`(() => {
    const rects = [...document.querySelectorAll('.fence-segment:not(.fence-preview)')].map((element) =>
      element.getBoundingClientRect(),
    )
    const left = Math.max(0, Math.min(...rects.map((rect) => rect.left)) - 70)
    const top = Math.max(0, Math.min(...rects.map((rect) => rect.top)) - 70)
    const right = Math.min(window.innerWidth, Math.max(...rects.map((rect) => rect.right)) + 70)
    const bottom = Math.min(window.innerHeight, Math.max(...rects.map((rect) => rect.bottom)) + 70)
    return {x: left, y: top, width: right - left, height: bottom - top, scale: 1}
  })()`)

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip,
  })
  mkdirSync("test-results", {recursive: true})
  writeFileSync("test-results/fence-rendering.png", Buffer.from(screenshot.data, "base64"))

  console.log(
    "Fence browser dogfood passed: touch drag previews projected 4×3 geometry, commits only on release, and renders 14 rails one-to-one on projected tile edges.",
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
