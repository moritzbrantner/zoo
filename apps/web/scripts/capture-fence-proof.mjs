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

  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: points.start.x,
    y: points.start.y,
  })
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: points.start.x,
    y: points.start.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  })
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: points.start.x + (points.end.x - points.start.x) * progress,
      y: points.start.y + (points.end.y - points.start.y) * progress,
      button: "left",
      buttons: 1,
    })
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: points.end.x,
    y: points.end.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  })

  let built = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    built = await evaluate(`document.querySelector('.message')?.textContent?.includes('Habitat #1 fenced') ?? false`)
    if (built) break
    await sleep(100)
  }
  if (!built) {
    const message = await evaluate(`document.querySelector('.message')?.textContent ?? 'No message'`)
    throw new Error(`The 4×3 habitat was not created during browser dogfood: ${message}`)
  }

  const geometry = await evaluate(`(() => {
    const expectedCenters = {
      north: [43.5, 7.5],
      east: [43.5, 22.5],
      south: [14.5, 22.5],
      west: [14.5, 7.5],
    }
    const park = document.querySelector('.park')
    const parkRect = park.getBoundingClientRect()
    return [...document.querySelectorAll('.fence-segment:not(.fence-preview)')].map((element) => {
      const side = ['north', 'east', 'south', 'west'].find((candidate) =>
        element.classList.contains('fence-' + candidate),
      )
      const rect = element.getBoundingClientRect()
      const [edgeX, edgeY] = expectedCenters[side]
      const expectedX = parkRect.left + Number.parseFloat(element.style.left) + edgeX
      const expectedY = parkRect.top + Number.parseFloat(element.style.top) + edgeY
      return {
        side,
        dx: rect.left + rect.width / 2 - expectedX,
        dy: rect.top + rect.height / 2 - expectedY,
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
  const misplaced = geometry.filter(
    (segment) => Math.abs(segment.dx) > 1.5 || Math.abs(segment.dy) > 1.5,
  )
  if (misplaced.length > 0) {
    throw new Error(`Fence rails are off their tile edges: ${JSON.stringify(misplaced)}`)
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

  console.log("Fence browser dogfood passed: 4×3 enclosure, 14 aligned perimeter rails, screenshot captured.")
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
