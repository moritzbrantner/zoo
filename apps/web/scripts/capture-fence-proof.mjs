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
    ready = await evaluate(`Boolean(
      document.querySelector('[aria-label="grass tile 1, 8"]') &&
      document.querySelector('.park-three-renderer-canvas[data-shared-renderer="ready"][data-shared-renderer-projection="perspective"]')
    )`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Perspective Zoo renderer did not become interactive")

  const ownership = await evaluate(`(() => {
    const viewport = document.querySelector('.viewport')
    const canvas = document.querySelector('.park-three-renderer-canvas')
    return {
      viewportPerspective: viewport ? getComputedStyle(viewport).perspective : null,
      canvasTransform: canvas ? getComputedStyle(canvas).transform : null,
      boundaryNodes: Number(canvas?.dataset.sharedRendererBoundaryFenceNodes),
    }
  })()`)
  if (
    ownership.viewportPerspective !== "none" ||
    ownership.canvasTransform !== "none" ||
    !(ownership.boundaryNodes > 0)
  ) {
    throw new Error(`Fence visualization is not owned exclusively by the real 3D scene: ${JSON.stringify(ownership)}`)
  }

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
  if (!points.start || !points.end) throw new Error("Could not resolve 3D tile drag coordinates")

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
  if (builtOnPress) throw new Error("Touch press committed the habitat before release")

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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    previewState = await evaluate(`(() => {
      const canvas = document.querySelector('.park-three-renderer-canvas')
      return {
        rendererPreviewRails: Number(canvas?.dataset.sharedRendererPreviewFenceNodes),
        rendererPlacementTiles: Number(canvas?.dataset.sharedRendererPlacementNodes),
        legacyPreviewElements: document.querySelectorAll('.fence-preview, .placement-ghost').length,
      }
    })()`)
    if (
      previewState.rendererPreviewRails === 28 &&
      previewState.rendererPlacementTiles === 12 &&
      previewState.legacyPreviewElements === 0
    ) break
    await sleep(50)
  }

  if (
    previewState?.rendererPreviewRails !== 28 ||
    previewState?.rendererPlacementTiles !== 12 ||
    previewState?.legacyPreviewElements !== 0
  ) {
    throw new Error(
      `Touch drag did not move the 4×3 preview into renderer-owned 3D geometry: ${JSON.stringify(previewState)}`,
    )
  }

  const builtBeforeRelease = await evaluate(
    `document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false`,
  )
  if (builtBeforeRelease) throw new Error("Touch drag committed the habitat before touchEnd")

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })

  let committedState = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    committedState = await evaluate(`(() => {
      const canvas = document.querySelector('.park-three-renderer-canvas')
      return {
        built: document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false,
        rendererHabitatRails: Number(canvas?.dataset.sharedRendererHabitatFenceNodes),
        legacyFenceElements: document.querySelectorAll('.fence-segment').length,
        rendererPreviewRails: Number(canvas?.dataset.sharedRendererPreviewFenceNodes),
        rendererPlacementTiles: Number(canvas?.dataset.sharedRendererPlacementNodes),
      }
    })()`)
    if (
      committedState.built &&
      committedState.rendererHabitatRails === 28 &&
      committedState.rendererPreviewRails === 0 &&
      committedState.rendererPlacementTiles === 0 &&
      committedState.legacyFenceElements === 0
    ) break
    await sleep(100)
  }

  if (
    !committedState?.built ||
    committedState?.rendererHabitatRails !== 28 ||
    committedState?.rendererPreviewRails !== 0 ||
    committedState?.rendererPlacementTiles !== 0 ||
    committedState?.legacyFenceElements !== 0
  ) {
    throw new Error(`Committed habitat did not settle into real 3D fence geometry: ${JSON.stringify(committedState)}`)
  }

  const clip = await evaluate(`(() => {
    const rect = document.querySelector('.viewport').getBoundingClientRect()
    return {
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      width: Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)),
      height: Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)),
      scale: 1,
    }
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
    "Fence browser dogfood passed: touch preview and committed enclosure are renderer-owned perspective 3D geometry, while DOM fence elements remain invisible semantics only.",
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
