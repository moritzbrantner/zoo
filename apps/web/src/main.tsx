import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import App from "./App"
import ParkFrameOverlay from "./ParkFrameOverlay"
import "./styles.css"
import "./interaction.css"
import "./fence.css"
import "./park-frame.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ParkFrameOverlay />
  </StrictMode>,
)
