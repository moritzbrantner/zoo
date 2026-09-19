import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import App from "./App"
import {installTouchTileDragSupport} from "./touch-input"
import "./styles.css"
import "./interaction.css"
import "./fence.css"
import "./park-frame.css"
import "./concessions.css"
import "./mobile.css"
import "./shared-renderer.css"

installTouchTileDragSupport()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
