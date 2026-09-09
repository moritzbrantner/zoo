import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import App from "./App"
import Park3DCamera from "./Park3DCamera"
import ParkFrameOverlay from "./ParkFrameOverlay"
import {installTouchTileDragSupport} from "./touch-input"
import "./styles.css"
import "./interaction.css"
import "./fence.css"
import "./park-frame.css"
import "./concessions.css"
import "./mobile.css"
import "./three-d.css"
import "./three-d-overrides.css"

installTouchTileDragSupport()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ParkFrameOverlay />
    <Park3DCamera />
  </StrictMode>,
)
