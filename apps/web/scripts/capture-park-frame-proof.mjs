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

const port = 9223
const profileDir = `/tmp/zoo-park-frame-proof-${process.pid}`
let chrome = null
let cdp = null
try {
  const opened = await openZoo(port, profileDir)
  chrome = opened.chrome
  cdp = opened.cdp
  const evaluate = opened.evaluate

  const state = JSON.parse(await evaluate(`JSON.stringify((() => {
    const canvas = document.querySelector('.park-three-renderer-canvas')
    const debug = canvas.__zooWorldDebug
    const world = debug.state()
    const forbidden = document.querySelectorAll(
      '.park > .tile, .park > .fence-segment, .park > .park-boundary-fence, .park > .park-entrance-building, .park > .care-depot, .park > .concession, .park > .animal, .park > .guest, .park > .litter, .park > .maintenance-alert, .park > .mechanic'
    ).length
    return {
      ...world,
      buildingNodes: Number(canvas.dataset.sharedRendererBuildingNodes ?? 0),
      tileNodes: Number(canvas.dataset.sharedRendererTileNodes ?? 0),
      forbidden,
      depotPoint: debug.entityCenterClient('depot'),
    }
  })())`))
  const expectedBoundary = state.width * 2 + state.height * 2 - 1
  if (
    state.boundaryFenceSegments !== expectedBoundary ||
    state.tileNodes !== state.tileCount ||
    state.buildingNodes <= 0 ||
    state.forbidden !== 0 ||
    !state.depotPoint
  ) {
    throw new Error(`Park frame is not renderer-exclusive: ${JSON.stringify({state, expectedBoundary})}`)
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
  writeFileSync("test-results/park-frame.png", Buffer.from(screenshot.data, "base64"))
  console.log("Park-frame browser dogfood passed: terrain, entrance, depot and boundary fence exist only in the 3D renderer.")
} finally {
  cdp?.close()
  chrome?.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
