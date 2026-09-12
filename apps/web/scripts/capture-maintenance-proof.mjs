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
if (!chromePath) throw new Error(`No Chrome/Chromium binary found: ${chromeCandidates.join(", ")}`)

const profileDir = `/tmp/zoo-maintenance-proof-${process.pid}`
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith(previewUrl))
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch {}
    await sleep(250)
  }
  throw new Error("Chrome did not expose the Zoo page target")
}

function connectCdp(url) {
  const socket = new WebSocket(url)
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
    if (message.error) request.reject(new Error(message.error.message))
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

let cdp = null
try {
  const target = await waitForPageTarget()
  cdp = connectCdp(target.webSocketDebuggerUrl)
  await cdp.opened
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  const evaluate = async (expression) => {
    const response = await cdp.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true})
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed")
    return response.result.value
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector('[aria-label="grass tile 1, 6"]'))`)) break
    if (attempt === 79) throw new Error("Zoo UI did not become ready")
    await sleep(250)
  }

  await evaluate(`(() => {
    const tool = [...document.querySelectorAll('.tool')].find((button) => button.textContent.includes('Food stand'))
    tool?.click()
    document.querySelector('[aria-label="grass tile 1, 6"]')?.click()
    const speed = [...document.querySelectorAll('.speed-controls button')].find((button) => button.textContent.includes('4×'))
    speed?.click()
    return true
  })()`)

  let failed = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    failed = await evaluate(`Boolean(document.querySelector('.concession-failed') && document.querySelector('.maintenance-alert'))`)
    if (failed) break
    await sleep(250)
  }
  if (!failed) throw new Error("Concession did not visibly fail and create maintenance work")

  await evaluate("document.querySelector('.care-depot').click(); true")
  const hired = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.side-panel button')].find((candidate) => candidate.textContent.includes('Hire mechanic'))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!hired) throw new Error("Could not hire mechanic from central operations depot")

  let repaired = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    repaired = await evaluate(`Boolean(document.querySelector('.concession-healthy') && !document.querySelector('.maintenance-alert'))`)
    if (repaired) break
    await sleep(250)
  }
  if (!repaired) throw new Error("Mechanic did not reach and repair the failed stand")

  const finalState = JSON.parse(await evaluate(`JSON.stringify({
    mechanic: Boolean(document.querySelector('.mechanic')),
    healthy: Boolean(document.querySelector('.concession-healthy')),
    noTask: !document.querySelector('.maintenance-alert'),
    panel: document.body.textContent.includes('Repairs'),
  })`))
  if (!finalState.mechanic || !finalState.healthy || !finalState.noTask || !finalState.panel) {
    throw new Error(`Maintenance proof ended in unexpected state: ${JSON.stringify(finalState)}`)
  }

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})
  writeFileSync("test-results/maintenance.png", Buffer.from(screenshot.data, "base64"))
  console.log("Maintenance dogfood passed: stand failed visibly and mechanic repaired it by path")
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
