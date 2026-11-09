import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadRuntimeConfig } from './config'
import { captureOfficeToken } from './officeToken'
import { isHqEmbed } from './serverUrl'
import { initHqBridge } from './hqBridge'

// The office link carries the token in its fragment (#token=...): keep it and
// take it out of the address bar before the first render and the WebSocket
// that presents it (src/officeToken.ts)
captureOfficeToken()

// Served by JSM HQ at /office/: office.css drops the window chrome (HQ's panels take its place),
// and the fixed-size window is scaled to fit whatever frame HQ gives it (--hq-scale)
if (isHqEmbed()) {
  const root = document.documentElement
  root.setAttribute('data-hq-embed', '')
  initHqBridge() // HQ's Plan wall choice picks the board on the wall
  const fit = () => {
    const win = document.querySelector<HTMLElement>('.app-wrapper')
    if (win) root.style.setProperty('--hq-scale', String(Math.min(2, root.clientWidth / win.offsetWidth, root.clientHeight / win.offsetHeight)))
  }
  window.addEventListener('resize', fit)
  // The window appears when the app first renders (and again after a Suspense fallback)
  new MutationObserver(fit).observe(document.getElementById('root')!, { childList: true })
  fit()
}

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// The boss's name, sprite and colour come from the server's office.config.json
// (GET /config) and are applied before the first render, so nothing captures
// the bundled name first. ?sim and ?video have no server, and the Vite dev
// server may run without one: those render at once, and a server that does
// not answer within loadRuntimeConfig's timeout leaves the build-time boss
// in place. A promise chain rather than top-level await: the build target
// rejects the latter.
const params = new URLSearchParams(window.location.search)
const standalone = params.has('sim') || params.has('video')
const ready = standalone ? Promise.resolve(null) : loadRuntimeConfig()
ready.then(render, render)
