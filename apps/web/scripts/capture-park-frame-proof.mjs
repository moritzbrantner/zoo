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
      document.querySelector('.park-entrance-building') &&
      document.querySelector('.park-border-tile') &&
      document.querySelector('.park-boundary-fence')
    )`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Park frame did not become ready")

  const frame = await evaluate(`(() => {
    const tileElements = [...document.querySelectorAll('.tile[aria-label]')]
    const tiles = tileElements.map((element) => {
      const match = element.getAttribute('aria-label')?.match(/tile (\\d+), (\\d+)$/)
      return match ? {x: Number(match[1]), y: Number(match[2]), element} : null
    }).filter(Boolean)
    const width = Math.max(...tiles.map((tile) => tile.x)) + 1
    const height = Math.max(...tiles.map((tile) => tile.y)) + 1
    const entrance = document.querySelector('.tile-entrance')
    const base = document.querySelector('.park-entrance-base')
    const entranceRect = entrance.getBoundingClientRect()
    const baseRect = base.getBoundingClientRect()
    const viewportRect = document.querySelector('.viewport').getBoundingClientRect()
    return {
      width,
      height,
      borderCount: document.querySelectorAll('.park-border-tile').length,
      fenceCount: document.querySelectorAll('.park-boundary-fence').length,
      approachCount: document.querySelectorAll('.park-border-approach').length,
      baseDx: baseRect.left - entranceRect.left,
      baseDy: baseRect.top - entranceRect.top,
      baseWidthDelta: baseRect.width - entranceRect.width,
      baseHeightDelta: baseRect.height - entranceRect.height,
      oldGateVisible: getComputedStyle(document.querySelector('.entrance-gate')).display !== 'none',
      viewport: {
        x: viewportRect.left,
        y: viewportRect.top,
        width: Math.min(viewportRect.width, window.innerWidth - viewportRect.left),
        height: Math.min(viewportRect.height, window.innerHeight - viewportRect.top),
      },
    }
  })()`)

  const expectedBorderCount = (frame.width + 8) * (frame.height + 8) - frame.width * frame.height
  if (frame.borderCount !== expectedBorderCount) {
    throw new Error(`Expected ${expectedBorderCount} four-tile border tiles, found ${frame.borderCount}`)
  }

  const expectedFenceCount = frame.width * 2 + frame.height * 2 - 1
  if (frame.fenceCount !== expectedFenceCount) {
    throw new Error(`Expected ${expectedFenceCount} park fence segments with one entrance gap, found ${frame.fenceCount}`)
  }
  if (frame.approachCount !== 4) {
    throw new Error(`Expected a four-tile entrance approach, found ${frame.approachCount}`)
  }

  for (const [label, delta] of Object.entries({
    baseDx: frame.baseDx,
    baseDy: frame.baseDy,
    baseWidthDelta: frame.baseWidthDelta,
    baseHeightDelta: frame.baseHeightDelta,
  })) {
    if (Math.abs(delta) > 1.5) {
      throw new Error(`Entrance building base is not aligned with its entrance tile: ${label}=${delta}`)
    }
  }
  if (frame.oldGateVisible) throw new Error("Legacy floating entrance gate is still visible")

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {...frame.viewport, scale: 1},
  })
  mkdirSync("test-results", {recursive: true})
  writeFileSync("test-results/park-frame.png", Buffer.from(screenshot.data, "base64"))

  console.log(
    `Park-frame browser dogfood passed: ${frame.width}×${frame.height} buildable area, ${frame.borderCount} outer tiles, ${frame.fenceCount} fence segments, tiled entrance building aligned.`,
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
