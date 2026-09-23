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

const port = 9224
const profileDir = `/tmp/zoo-concession-proof-${process.pid}`
let chrome = null
let cdp = null
try {
  const opened = await openZoo(port, profileDir)
  chrome = opened.chrome
  cdp = opened.cdp
  const evaluate = opened.evaluate

  await evaluate(`document.querySelector('button[title="Pause"]')?.click(); true`)
  const clickTool = async (label) => {
    const ok = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button.tool')].find((candidate) =>
        candidate.textContent?.includes(${JSON.stringify(label)}),
      )
      button?.click()
      return Boolean(button)
    })()`)
    if (!ok) throw new Error(`Missing tool: ${label}`)
  }
  const clickTile = async (x, y) => {
    const point = JSON.parse(await evaluate(`JSON.stringify(
      document.querySelector('.park-three-renderer-canvas').__zooWorldDebug.tileCenterClient(${x}, ${y})
    )`))
    if (!point) throw new Error(`Missing tile projection ${x},${y}`)
    await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1})
    await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1})
  }

  await clickTool("Drink stand")
  await clickTile(1, 6)
  await clickTool("Food stand")
  await clickTile(3, 6)

  let state = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = JSON.parse(await evaluate(`JSON.stringify((() => {
      const canvas = document.querySelector('.park-three-renderer-canvas')
      const debug = canvas.__zooWorldDebug
      return {
        concessions: debug.state().concessionCount,
        nodes: Number(canvas.dataset.sharedRendererConcessionNodes ?? 0),
        visualDom: document.querySelectorAll('.park > .concession').length,
        semanticFood: Boolean(document.querySelector('.world-accessibility .concession-food')),
        semanticDrink: Boolean(document.querySelector('.world-accessibility .concession-drink')),
      }
    })())`))
    if (state.concessions === 2 && state.nodes > 0) break
    await sleep(50)
  }
  if (
    state?.concessions !== 2 ||
    !(state.nodes > 0) ||
    state.visualDom !== 0 ||
    !state.semanticFood ||
    !state.semanticDrink
  ) {
    throw new Error(`Concessions are not renderer-owned: ${JSON.stringify(state)}`)
  }

  const before = JSON.parse(await evaluate(`JSON.stringify(
    document.querySelector('.park-three-renderer-canvas').__zooWorldDebug.entityCenterClient('concession', 2)
  )`))
  await evaluate(`document.querySelector('.camera-orbit-right').click(); true`)
  await sleep(100)
  const after = JSON.parse(await evaluate(`JSON.stringify(
    document.querySelector('.park-three-renderer-canvas').__zooWorldDebug.entityCenterClient('concession', 2)
  )`))
  if (!before || !after || (before.x === after.x && before.y === after.y)) {
    throw new Error(`Concession world projection did not follow camera rotation: ${JSON.stringify({before, after})}`)
  }

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})
  writeFileSync("test-results/concessions.png", Buffer.from(screenshot.data, "base64"))
  console.log("Concession dogfood passed: placement and camera projection use the 3D renderer with no visual DOM stand-ins.")
} finally {
  cdp?.close()
  chrome?.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
