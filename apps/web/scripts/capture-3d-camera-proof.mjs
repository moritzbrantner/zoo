import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9226
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
      document.querySelector('.park-three-renderer-canvas[data-shared-renderer="ready"]') &&
      document.querySelector('.camera-orbit-controls') &&
      document.querySelector('[aria-label="grass tile 1, 8"]')
    )`)
    if (ready) break
    await sleep(250)
  }
  if (!ready) throw new Error("Shared 3d-lab camera/renderer did not become interactive")

  const baseline = await evaluate(`(() => {
    const park = document.querySelector('.park')
    const tile = document.querySelector('[aria-label="grass tile 1, 8"]')
    return {
      yaw: park?.dataset.cameraYaw,
      pitch: park?.dataset.cameraPitch,
      tileLeft: tile?.style.left,
      tileTop: tile?.style.top,
      renderer: document.querySelector('.park-three-renderer-canvas')?.dataset.sharedRenderer,
    }
  })()`)
  if (baseline.yaw !== "0" || baseline.pitch !== "0" || baseline.renderer !== "ready") {
    throw new Error(`Unexpected default shared 3D camera: ${JSON.stringify(baseline)}`)
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
  if (!activated) throw new Error("Could not activate shared 3D camera controls")

  let moved = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    moved = await evaluate(`(() => {
      const park = document.querySelector('.park')
      const tile = document.querySelector('[aria-label="grass tile 1, 8"]')
      return {
        yaw: park?.dataset.cameraYaw,
        pitch: park?.dataset.cameraPitch,
        tileLeft: tile?.style.left,
        tileTop: tile?.style.top,
      }
    })()`)
    if (
      moved.yaw === "45" &&
      moved.pitch === "12" &&
      (moved.tileLeft !== baseline.tileLeft || moved.tileTop !== baseline.tileTop)
    ) break
    await sleep(50)
  }
  if (
    moved?.yaw !== "45" ||
    moved?.pitch !== "12" ||
    (moved.tileLeft === baseline.tileLeft && moved.tileTop === baseline.tileTop)
  ) {
    throw new Error(`Shared 3D camera projection did not move as expected: ${JSON.stringify(moved)}`)
  }

  const overlayFacing = await evaluate(`(() => {
    const park = document.querySelector('.park')
    const label = document.querySelector('.park-label')
    return {
      inverseYaw: park?.style.getPropertyValue('--zoo-camera-yaw-inverse').trim(),
      labelTransform: label ? getComputedStyle(label).transform : 'none',
    }
  })()`)
  if (overlayFacing.inverseYaw !== "-45deg" || overlayFacing.labelTransform === "none") {
    throw new Error(`Viewer-facing overlays did not follow the shared camera: ${JSON.stringify(overlayFacing)}`)
  }

  const raisedObjects = await evaluate(`(() => {
    const style = getComputedStyle(document.querySelector('.empty-habitat-marker') ?? document.querySelector('.care-depot'))
    return style.transform
  })()`)
  if (!raisedObjects || raisedObjects === "none") {
    throw new Error("The transitional overlay does not expose a raised park object")
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
  if (!newParkReset) throw new Error("Could not start a new park during shared 3D camera dogfood")

  let restored = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    restored = await evaluate(`(() => {
      const park = document.querySelector('.park')
      return park?.dataset.cameraYaw === '0' && park?.dataset.cameraPitch === '0'
    })()`)
    if (restored) break
    await sleep(50)
  }
  if (!restored) throw new Error("Starting a new park did not reset the shared 3D camera")

  const rotatedAgain = await evaluate(`(() => {
    const button = document.querySelector('.camera-orbit-right')
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!rotatedAgain) throw new Error("Could not rotate the shared 3D camera after new-park reset")

  let rotated = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    rotated = await evaluate(`document.querySelector('.park')?.dataset.cameraYaw === '45'`)
    if (rotated) break
    await sleep(50)
  }
  if (!rotated) throw new Error("Shared 3D camera did not rotate after new-park reset")

  const reset = await evaluate(`(() => {
    const button = document.querySelector('.camera-orbit-reset')
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!reset) throw new Error("Could not reset shared 3D camera")

  restored = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    restored = await evaluate(`(() => {
      const park = document.querySelector('.park')
      return park?.dataset.cameraYaw === '0' && park?.dataset.cameraPitch === '0'
    })()`)
    if (restored) break
    await sleep(50)
  }
  if (!restored) throw new Error("Shared 3D camera did not return to the default isometric view")

  console.log(
    "Shared 3D camera dogfood passed: 3d-lab rendering, orbit/tilt projection, overlay reprojection, new-park reset, explicit reset, and visual proof are coherent.",
  )
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
