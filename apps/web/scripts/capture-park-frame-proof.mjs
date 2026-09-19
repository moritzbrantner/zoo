import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9223
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

const profileDir = `/tmp/zoo-park-frame-proof-${process.pid}`
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
      document.querySelector('.park.shared-three-renderer') &&
      document.querySelector('.park-three-renderer-canvas[data-shared-renderer="ready"][data-shared-renderer-projection="perspective"]') &&
      document.querySelector('[aria-label="grass tile 1, 8"]')
    )`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Perspective park scene did not become ready")

  const frame = await evaluate(`(() => {
    const tileElements = [...document.querySelectorAll('.tile[aria-label]')]
    const tiles = tileElements.map((element) => {
      const match = element.getAttribute('aria-label')?.match(/tile (\\d+), (\\d+)$/)
      return match ? {x: Number(match[1]), y: Number(match[2])} : null
    }).filter(Boolean)
    const width = Math.max(...tiles.map((tile) => tile.x)) + 1
    const height = Math.max(...tiles.map((tile) => tile.y)) + 1
    const canvas = document.querySelector('.park-three-renderer-canvas')
    const viewportRect = document.querySelector('.viewport').getBoundingClientRect()
    return {
      width,
      height,
      projection: canvas?.dataset.sharedRendererProjection,
      boundaryNodes: Number(canvas?.dataset.sharedRendererBoundaryFenceNodes),
      buildingNodes: Number(canvas?.dataset.sharedRendererBuildingNodes),
      nodeCount: Number(canvas?.dataset.sharedRendererNodeCount),
      legacyFrameElements: document.querySelectorAll(
        '.park-entrance-building, .park-entrance-base, .entrance-gate, .park-boundary-fence, .park-border-tile'
      ).length,
      viewport: {
        x: viewportRect.left,
        y: viewportRect.top,
        width: Math.min(viewportRect.width, window.innerWidth - viewportRect.left),
        height: Math.min(viewportRect.height, window.innerHeight - viewportRect.top),
      },
    }
  })()`)

  const expectedBoundarySegments = frame.width * 2 + frame.height * 2 - 1
  const expectedBoundaryRailNodes = expectedBoundarySegments * 2
  if (frame.projection !== "perspective") {
    throw new Error(`Park frame is not using perspective projection: ${JSON.stringify(frame)}`)
  }
  if (frame.boundaryNodes !== expectedBoundaryRailNodes) {
    throw new Error(
      `Expected ${expectedBoundaryRailNodes} renderer-owned boundary rail nodes, found ${frame.boundaryNodes}`,
    )
  }
  if (frame.buildingNodes < 10 || frame.nodeCount <= frame.boundaryNodes + frame.buildingNodes) {
    throw new Error(`3D park scene is missing expected terrain/building geometry: ${JSON.stringify(frame)}`)
  }

  if (frame.legacyFrameElements !== 0) {
    throw new Error(
      `Legacy 2D park frame elements are still mounted over the renderer: ${frame.legacyFrameElements}`,
    )
  }

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {...frame.viewport, scale: 1},
  })
  mkdirSync("test-results", {recursive: true})
  writeFileSync("test-results/park-frame.png", Buffer.from(screenshot.data, "base64"))

  console.log(
    `Park-frame browser dogfood passed: ${frame.width}×${frame.height} world, ${expectedBoundarySegments} boundary segments and buildings are real renderer-owned 3D geometry; legacy frame visuals are hidden.`,
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
