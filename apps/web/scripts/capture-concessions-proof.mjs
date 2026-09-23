import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9224
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

const profileDir = `/tmp/zoo-concession-proof-${process.pid}`
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

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      await evaluate(
        "Boolean(document.querySelector('.toolbar') && document.querySelector('[aria-label=\"grass tile 1, 6\"]'))",
      )
    ) {
      break
    }
    if (attempt === 79) throw new Error("Zoo UI did not become ready")
    await sleep(250)
  }

  const clickTool = async (label) => {
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.tool')].find((candidate) =>
        candidate.textContent.includes(${JSON.stringify(label)}),
      )
      if (!button) throw new Error('Missing tool: ' + ${JSON.stringify(label)})
      button.click()
      return true
    })()`)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const active = await evaluate(
        `Boolean(document.querySelector('.tool.active')?.textContent.includes(${JSON.stringify(label)}))`,
      )
      if (active) return
      await sleep(50)
    }
    throw new Error(`Tool did not become active: ${label}`)
  }

  const clickGrassTile = async (x, y) => {
    const clicked = await evaluate(`(() => {
      const tile = document.querySelector('[aria-label="grass tile ${x}, ${y}"]')
      if (!tile) return false
      tile.click()
      return true
    })()`)
    if (!clicked) throw new Error(`Missing grass tile ${x}, ${y}`)
  }

  const waitForStand = async (kind) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(`Boolean(document.querySelector('.concession-${kind}'))`)) return
      await sleep(100)
    }
    throw new Error(`${kind} stand did not render after placement`)
  }

  await clickTool("Drink stand")
  await clickGrassTile(1, 6)
  await waitForStand("drink")
  await clickTool("Food stand")
  await clickGrassTile(3, 6)
  await waitForStand("food")

  const finalState = JSON.parse(
    await evaluate(`JSON.stringify({
      count: document.querySelectorAll('.concession').length,
      food: Boolean(document.querySelector('.concession-food')),
      drink: Boolean(document.querySelector('.concession-drink')),
    })`),
  )
  if (finalState.count !== 2 || !finalState.food || !finalState.drink) {
    throw new Error(`Expected two rendered stands, got ${JSON.stringify(finalState)}`)
  }

  let rendererState = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    rendererState = JSON.parse(
      await evaluate(`JSON.stringify((() => {
        const canvas = document.querySelector('.park-three-renderer-canvas')
        const stands = [...document.querySelectorAll('.concession')]
        const artworkHidden = stands.every((stand) => {
          const style = getComputedStyle(stand)
          const childrenHidden = [...stand.children].every(
            (child) => getComputedStyle(child).visibility === 'hidden',
          )
          return (
            style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
            style.borderTopColor === 'rgba(0, 0, 0, 0)' &&
            style.boxShadow === 'none' &&
            childrenHidden
          )
        })
        return {
          ready: canvas?.dataset.sharedRenderer === 'ready',
          nodeCount: Number(canvas?.dataset.sharedRendererConcessionNodes ?? 0),
          artworkHidden,
          anchors: stands.map((stand) => ({
            kind: stand.classList.contains('concession-food') ? 'food' : 'drink',
            x: Number(stand.dataset.sharedRendererWorldX),
            y: Number(stand.dataset.sharedRendererWorldY),
            z: Number(stand.dataset.sharedRendererWorldZ),
          })),
        }
      })())`),
    )
    if (rendererState.ready && rendererState.nodeCount === 16 && rendererState.artworkHidden) break
    await sleep(50)
  }
  if (!rendererState?.ready || rendererState.nodeCount !== 16 || !rendererState.artworkHidden) {
    throw new Error(
      `Concessions did not settle as renderer-owned 3D models: ${JSON.stringify(rendererState)}`,
    )
  }

  const anchorByKind = Object.fromEntries(rendererState.anchors.map((anchor) => [anchor.kind, anchor]))
  if (
    anchorByKind.drink?.x !== 2 ||
    anchorByKind.drink?.z !== 6 ||
    anchorByKind.food?.x !== 4 ||
    anchorByKind.food?.z !== 6
  ) {
    throw new Error(`Concession hit targets do not share model anchors: ${JSON.stringify(rendererState.anchors)}`)
  }

  const focusVisible = await evaluate(`(() => {
    const stand = document.querySelector('.concession-food')
    stand.focus()
    const style = getComputedStyle(stand)
    return (
      document.activeElement === stand &&
      style.outlineStyle !== 'none' &&
      Number.parseFloat(style.outlineWidth) >= 3
    )
  })()`)
  if (!focusVisible) throw new Error("Renderer-owned concession hit target lost visible keyboard focus")

  const beforeRotation = JSON.parse(
    await evaluate(`JSON.stringify((() => {
      const stand = document.querySelector('.concession-food')
      const rect = stand.getBoundingClientRect()
      return {left: rect.left, top: rect.top, x: Number(stand.dataset.sharedRendererWorldX)}
    })())`),
  )
  await evaluate(`document.querySelector('.camera-orbit-right').click(); true`)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rotated = JSON.parse(
      await evaluate(`JSON.stringify((() => {
        const stand = document.querySelector('.concession-food')
        const rect = stand.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        return {
          yaw: Number(document.querySelector('.park').dataset.cameraYaw),
          left: rect.left,
          top: rect.top,
          worldX: Number(stand.dataset.sharedRendererWorldX),
          worldZ: Number(stand.dataset.sharedRendererWorldZ),
          ownsCenter: document.elementFromPoint(centerX, centerY) === stand,
        }
      })())`),
    )
    if (
      rotated.yaw !== 0 &&
      rotated.worldX === 4 &&
      rotated.worldZ === 6 &&
      rotated.ownsCenter &&
      (rotated.left !== beforeRotation.left || rotated.top !== beforeRotation.top)
    ) {
      break
    }
    if (attempt === 39) {
      throw new Error(`Concession hit target did not stay on its model anchor after rotation: ${JSON.stringify(rotated)}`)
    }
    await sleep(50)
  }
  await evaluate(`document.querySelector('.concession-food').blur(); true`)

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})
  writeFileSync("test-results/concessions.png", Buffer.from(screenshot.data, "base64"))
  console.log("Concession dogfood passed: stands are renderer-owned 3D models; transparent hit targets keep model anchors through camera rotation and remain keyboard-focus visible")
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
