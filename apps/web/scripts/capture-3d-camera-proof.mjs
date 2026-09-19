import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9227
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

const profileDir = `/tmp/zoo-3d-camera-proof-${process.pid}`
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
      Number(document.querySelector('.park-three-renderer-canvas')?.dataset.sharedRendererFenceNodes) > 0 &&
      Number(document.querySelector('.park-three-renderer-canvas')?.dataset.sharedRendererBuildingNodes) > 0 &&
      document.querySelector('.camera-orbit-controls') &&
      document.querySelector('[aria-label="grass tile 1, 8"]')
    )`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Shared perspective 3D camera/renderer did not become interactive")

  const baseline = await evaluate(`(() => {
    const park = document.querySelector('.park')
    const canvas = document.querySelector('.park-three-renderer-canvas')
    const tile = document.querySelector('[aria-label="grass tile 1, 8"]')
    const widths = [...document.querySelectorAll('button.tile')]
      .map((element) => Number.parseFloat(element.style.width))
      .filter(Number.isFinite)
    return {
      yaw: park?.dataset.cameraYaw,
      pitch: park?.dataset.cameraPitch,
      tileLeft: tile?.style.left,
      tileTop: tile?.style.top,
      tileWidth: tile?.style.width,
      tileHeight: tile?.style.height,
      tileClipPath: tile?.style.clipPath,
      renderer: canvas?.dataset.sharedRenderer,
      projection: canvas?.dataset.sharedRendererProjection,
      nodeCount: Number(canvas?.dataset.sharedRendererNodeCount),
      fenceNodes: Number(canvas?.dataset.sharedRendererFenceNodes),
      buildingNodes: Number(canvas?.dataset.sharedRendererBuildingNodes),
      perspectiveWidthSpread: widths.length > 0 ? Math.max(...widths) - Math.min(...widths) : 0,
      viewportPerspective: getComputedStyle(document.querySelector('.viewport')).perspective,
      canvasTransform: getComputedStyle(canvas).transform,
      depotOpacity: getComputedStyle(document.querySelector('.care-depot')).opacity,
      legacyFrameElements: document.querySelectorAll(
        '.park-entrance-building, .park-border-tile, .park-boundary-fence, .entrance-gate, .fence-segment, .placement-ghost'
      ).length,
    }
  })()`)

  if (
    baseline.yaw !== "0" ||
    baseline.pitch !== "0" ||
    baseline.renderer !== "ready" ||
    baseline.projection !== "perspective" ||
    !(baseline.nodeCount > 0) ||
    !(baseline.fenceNodes > 0) ||
    !(baseline.buildingNodes > 0) ||
    !(baseline.perspectiveWidthSpread > 0.25) ||
    baseline.viewportPerspective !== "none" ||
    baseline.canvasTransform !== "none" ||
    baseline.depotOpacity !== "0" ||
    baseline.legacyFrameElements !== 0
  ) {
    throw new Error(`Default view is not a clean renderer-owned perspective scene: ${JSON.stringify(baseline)}`)
  }
  if (!baseline.tileClipPath?.startsWith("polygon(")) {
    throw new Error(`3D tile hit geometry is not projected from the shared camera: ${JSON.stringify(baseline)}`)
  }

  const activated = await evaluate(`(() => {
    const rotate = document.querySelector('.camera-orbit-right')
    const tilt = document.querySelector('.camera-tilt-up')
    if (!rotate || !tilt) return false
    rotate.click()
    tilt.click()
    tilt.click()
    return true
  })()`)
  if (!activated) throw new Error("Could not activate perspective camera controls")

  let moved = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    moved = await evaluate(`(() => {
      const park = document.querySelector('.park')
      const tile = document.querySelector('[aria-label="grass tile 1, 8"]')
      const rect = tile?.getBoundingClientRect()
      const hit = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : null
      return {
        yaw: park?.dataset.cameraYaw,
        pitch: park?.dataset.cameraPitch,
        tileLeft: tile?.style.left,
        tileTop: tile?.style.top,
        tileWidth: tile?.style.width,
        tileHeight: tile?.style.height,
        tileClipPath: tile?.style.clipPath,
        hitTile: hit?.closest?.('button.tile')?.getAttribute('aria-label'),
      }
    })()`)
    if (
      moved.yaw === "45" &&
      moved.pitch === "12" &&
      moved.tileClipPath?.startsWith("polygon(") &&
      moved.hitTile === "grass tile 1, 8" &&
      (moved.tileLeft !== baseline.tileLeft ||
        moved.tileTop !== baseline.tileTop ||
        moved.tileWidth !== baseline.tileWidth ||
        moved.tileHeight !== baseline.tileHeight)
    ) break
    await sleep(50)
  }

  if (
    moved?.yaw !== "45" ||
    moved?.pitch !== "12" ||
    !moved?.tileClipPath?.startsWith("polygon(") ||
    moved?.hitTile !== "grass tile 1, 8" ||
    (moved.tileLeft === baseline.tileLeft &&
      moved.tileTop === baseline.tileTop &&
      moved.tileWidth === baseline.tileWidth &&
      moved.tileHeight === baseline.tileHeight)
  ) {
    throw new Error(`Perspective camera and projected hit targets diverged: ${JSON.stringify(moved)}`)
  }

  const viewport = await evaluate(`(() => {
    const rect = document.querySelector('.viewport').getBoundingClientRect()
    return {
      x: rect.left,
      y: rect.top,
      width: Math.min(rect.width, window.innerWidth - rect.left),
      height: Math.min(rect.height, window.innerHeight - rect.top),
      scale: 1,
    }
  })()`)

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: viewport,
  })
  writeFileSync("test-results/3d-camera.png", Buffer.from(screenshot.data, "base64"))

  const newParkReset = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button.secondary')].find(
      (candidate) => candidate.textContent?.trim() === 'Start new park',
    )
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!newParkReset) throw new Error("Could not start a new park during perspective camera dogfood")

  let restored = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    restored = await evaluate(`(() => {
      const park = document.querySelector('.park')
      return park?.dataset.cameraYaw === '0' && park?.dataset.cameraPitch === '0'
    })()`)
    if (restored) break
    await sleep(50)
  }
  if (!restored) throw new Error("Starting a new park did not reset the perspective camera")

  const rotatedAgain = await evaluate(`(() => {
    const button = document.querySelector('.camera-orbit-right')
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!rotatedAgain) throw new Error("Could not rotate perspective camera after new-park reset")

  let rotated = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    rotated = await evaluate(`document.querySelector('.park')?.dataset.cameraYaw === '45'`)
    if (rotated) break
    await sleep(50)
  }
  if (!rotated) throw new Error("Perspective camera did not rotate after new-park reset")

  const topBarReset = await evaluate(`(() => {
    const button = document.querySelector('.camera-reset')
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!topBarReset) throw new Error("Could not activate the existing top-bar camera reset")

  restored = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    restored = await evaluate(`(() => {
      const park = document.querySelector('.park')
      return park?.dataset.cameraYaw === '0' && park?.dataset.cameraPitch === '0'
    })()`)
    if (restored) break
    await sleep(50)
  }
  if (!restored) throw new Error("Top-bar camera reset did not restore the perspective rig")

  console.log(
    "Perspective 3D camera dogfood passed: WebGL scene owns park visuals, perspective foreshortening is measurable, orbit/tilt reprojects interaction targets, and legacy CSS perspective is absent.",
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
