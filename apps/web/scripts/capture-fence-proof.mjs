import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean)
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate))
if (!chromePath) throw new Error(`No Chrome/Chromium binary found. Checked: ${chromeCandidates.join(", ")}`)

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject})
        socket.send(JSON.stringify({id, method, params}))
      })
    },
  }
}

async function waitForPageTarget(port) {
  let lastError = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith(previewUrl))
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Chrome did not expose the Zoo page target: ${lastError ?? "timed out"}`)
}

async function openZoo(port, profileDir) {
  rmSync(profileDir, {recursive: true, force: true})
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=1280,850",
      previewUrl,
    ],
    {stdio: "ignore"},
  )
  const target = await waitForPageTarget(port)
  const cdp = connectCdp(target.webSocketDebuggerUrl)
  await cdp.opened
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  const evaluate = async (expression) => {
    const response = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed")
    return response.result.value
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(`Boolean(
      document.querySelector('.park-three-renderer-canvas[data-shared-renderer="ready"][data-world-renderer="exclusive"]')?.__zooWorldDebug
    )`)
    if (ready) return {chrome, cdp, evaluate}
    await sleep(250)
  }
  throw new Error("3D Zoo world did not become interactive")
}

const port = 9222
const profileDir = `/tmp/zoo-fence-proof-${process.pid}`
let chrome = null
let cdp = null
try {
  const opened = await openZoo(port, profileDir)
  chrome = opened.chrome
  cdp = opened.cdp
  const evaluate = opened.evaluate

  await cdp.send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 1})
  await evaluate(`document.querySelector('button[title="Pause"]')?.click(); true`)
  const activated = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button.tool')].find((candidate) =>
      candidate.textContent?.includes('Draw habitat'),
    )
    button?.click()
    return Boolean(button)
  })()`)
  if (!activated) throw new Error("Could not activate habitat tool")

  const points = JSON.parse(await evaluate(`JSON.stringify((() => {
    const debug = document.querySelector('.park-three-renderer-canvas').__zooWorldDebug
    return {start: debug.tileCenterClient(1, 8), end: debug.tileCenterClient(4, 10)}
  })())`))
  if (!points.start || !points.end) throw new Error("Could not resolve renderer tile coordinates")

  const touch = (point) => [{x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1, id: 1}]
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: touch(points.start)})
  await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: touch(points.end)})
  await sleep(100)

  const preview = JSON.parse(await evaluate(`JSON.stringify((() => {
    const canvas = document.querySelector('.park-three-renderer-canvas')
    return {
      previewSegments: Number(canvas.dataset.sharedRendererPreviewFenceSegments ?? 0),
      visualDomFenceCount: document.querySelectorAll('.park > .fence-segment').length,
    }
  })())`))
  if (preview.previewSegments !== 14 || preview.visualDomFenceCount !== 0) {
    throw new Error(`Renderer fence preview is not authoritative: ${JSON.stringify(preview)}`)
  }

  await cdp.send("Input.dispatchTouchEvent", {type: "touchCancel", touchPoints: []})
  await sleep(100)
  const cancelled = JSON.parse(await evaluate(`JSON.stringify((() => {
    const canvas = document.querySelector('.park-three-renderer-canvas')
    return {
      previewSegments: Number(canvas.dataset.sharedRendererPreviewFenceSegments ?? 0),
      habitatSegments: Number(canvas.dataset.sharedRendererHabitatFenceSegments ?? 0),
      message: document.querySelector('.message')?.textContent ?? '',
    }
  })())`))
  if (cancelled.previewSegments !== 0 || cancelled.habitatSegments !== 0 || cancelled.message.includes("Habitat #1 fenced")) {
    throw new Error(`Cancelled renderer gesture mutated Zoo state: ${JSON.stringify(cancelled)}`)
  }

  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: touch(points.start)})
  await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: touch(points.end)})
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []})

  let committed = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    committed = JSON.parse(await evaluate(`JSON.stringify((() => {
      const canvas = document.querySelector('.park-three-renderer-canvas')
      return {
        habitatSegments: Number(canvas.dataset.sharedRendererHabitatFenceSegments ?? 0),
        previewSegments: Number(canvas.dataset.sharedRendererPreviewFenceSegments ?? 0),
        message: document.querySelector('.message')?.textContent ?? '',
      }
    })())`))
    if (committed.habitatSegments === 14 && committed.previewSegments === 0) break
    await sleep(50)
  }
  if (committed?.habitatSegments !== 14 || !committed.message.includes("Habitat #1 fenced")) {
    throw new Error(`Habitat did not commit through canvas interaction: ${JSON.stringify(committed)}`)
  }

  const keyboardBuilt = await evaluate(`(() => {
    const reset = [...document.querySelectorAll('button.secondary')].find(
      (button) => button.textContent?.trim() === 'Start new park',
    )
    reset?.click()
    const tool = [...document.querySelectorAll('button.tool')].find((button) =>
      button.textContent?.includes('Draw habitat'),
    )
    tool?.click()
    document.querySelector('[aria-label="grass tile 1, 8"]')?.click()
    document.querySelector('[aria-label="grass tile 4, 10"]')?.click()
    return Boolean(reset && tool)
  })()`)
  if (!keyboardBuilt) throw new Error("Could not exercise semantic keyboard habitat controls")

  let semanticCommitted = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    semanticCommitted = JSON.parse(await evaluate(`JSON.stringify((() => {
      const canvas = document.querySelector('.park-three-renderer-canvas')
      return {
        habitatSegments: Number(canvas.dataset.sharedRendererHabitatFenceSegments ?? 0),
        message: document.querySelector('.message')?.textContent ?? '',
      }
    })())`))
    if (semanticCommitted.habitatSegments === 14) break
    await sleep(50)
  }
  if (semanticCommitted?.habitatSegments !== 14) {
    throw new Error(`Semantic two-tile habitat flow failed: ${JSON.stringify(semanticCommitted)}`)
  }

  const viewport = JSON.parse(await evaluate(`JSON.stringify((() => {
    const rect = document.querySelector('.viewport').getBoundingClientRect()
    return {x: rect.left, y: rect.top, width: rect.width, height: rect.height, scale: 1}
  })())`))
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: viewport,
  })
  mkdirSync("test-results", {recursive: true})
  writeFileSync("test-results/fence-rendering.png", Buffer.from(screenshot.data, "base64"))
  console.log("Fence browser dogfood passed: canvas touch preview/cancel/commit and semantic keyboard construction both use authoritative 3D fences.")
} finally {
  cdp?.close()
  chrome?.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
