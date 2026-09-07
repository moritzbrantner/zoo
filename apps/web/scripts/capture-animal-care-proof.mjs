import {spawn} from "node:child_process"
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs"

const previewUrl = "http://127.0.0.1:4173/"
const debuggingPort = 9225
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

const profileDir = `/tmp/zoo-animal-care-proof-${process.pid}`
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
    if (await evaluate("Boolean(document.querySelector('.care-depot'))")) break
    if (attempt === 79) throw new Error("Animal care depot did not render")
    await sleep(250)
  }

  await evaluate("document.querySelector('.care-depot').click(); true")
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate("document.body.textContent.includes('Animal care depot')")) break
    if (attempt === 39) throw new Error("Animal care depot panel did not open")
    await sleep(100)
  }

  const clickPanelButton = async (label) => {
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.side-panel button')].find((candidate) =>
        candidate.textContent.includes(${JSON.stringify(label)}),
      )
      if (!button) return false
      button.click()
      return true
    })()`)
    if (!clicked) throw new Error(`Missing animal-care action: ${label}`)
    await sleep(100)
  }

  await clickPanelButton("Buy 10 feed crates")
  await clickPanelButton("Hire keeper")

  const finalState = JSON.parse(
    await evaluate(`JSON.stringify({
      hasDepot: Boolean(document.querySelector('.care-depot')),
      hasFeed: document.body.textContent.includes('10 crates'),
      hasKeeper: document.body.textContent.includes('Keeper #1'),
      hasAvailable: document.body.textContent.includes('Available for assignment'),
    })`),
  )
  if (!finalState.hasDepot || !finalState.hasFeed || !finalState.hasKeeper || !finalState.hasAvailable) {
    throw new Error(`Animal-care depot did not reach expected state: ${JSON.stringify(finalState)}`)
  }

  mkdirSync("test-results", {recursive: true})
  const screenshot = await cdp.send("Page.captureScreenshot", {format: "png", fromSurface: true})
  writeFileSync("test-results/animal-care-depot.png", Buffer.from(screenshot.data, "base64"))
  console.log("Animal-care dogfood passed: feed purchased and keeper hired from the central depot")
} finally {
  cdp?.close()
  chrome.kill("SIGTERM")
  rmSync(profileDir, {recursive: true, force: true})
}
