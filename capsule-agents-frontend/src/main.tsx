import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"

const resolveBasePath = () => {
  if (typeof globalThis.window === "undefined") return "/"
  return globalThis.location.pathname.startsWith("/editor") ? "/editor" : "/"
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={resolveBasePath()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
