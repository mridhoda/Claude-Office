/**
 * serverUrl.ts — where the office server is, derived from where the page was
 * loaded instead of a constant.
 *
 * Two ways the page is served:
 *
 *   by the office server   `npm run build && npm run server`, the packaged
 *                          desktop app. The page's own origin is the server
 *                          (it serves dist/ at /), whatever port that is:
 *                          http://127.0.0.1:3334, http://localhost:4000,
 *                          https behind a local proxy. Use location.origin
 *                          and ws(s)://<location.host>/ws.
 *   by the Vite dev server `npm run dev`, `start-office.sh`, the Electron
 *                          dev window. The server is a different process
 *                          on the port Vite was told about: vite.config.ts
 *                          defines import.meta.env.VITE_AGENT_OFFICE_PORT
 *                          from AGENT_OFFICE_PORT (default 3334). Keep the
 *                          page's hostname (localhost or 127.0.0.1, both on
 *                          the server's origin allowlist).
 *
 * The dev case is recognised by import.meta.env.DEV (true under `vite`,
 * false in a build) or by the page being on 3333, Vite's port; everything
 * else is office-served. Pure: the location and the environment come in as
 * arguments so tests pass fake ones, and nothing runs at import time, so
 * modules that import this still load in Node (the tests) where there is no
 * window — the fallback there is the default server on 127.0.0.1.
 */

export const DEFAULT_SERVER_PORT = 3334
export const VITE_DEV_PORT = 3333

/** The parts of window.location the helpers read. */
export interface PageLocation {
  protocol: string
  hostname: string
  host: string
  port: string
  origin: string
  pathname?: string
}

/**
 * JSM HQ embed: HQ serves this page at /office/ and answers the office API
 * (WebSocket + GET routes) under /office-api/, because HQ's own /ws is taken.
 */
export const HQ_EMBED_PAGE = '/office/'
export const HQ_EMBED_API = '/office-api'

/** True when the page is the one JSM HQ serves at /office/. */
export function isHqEmbed(loc: PageLocation = pageLocation()): boolean {
  return (loc.pathname ?? '').startsWith(HQ_EMBED_PAGE)
}

/** What Vite says about the build: dev or not, and the configured server port. */
export interface BuildEnv {
  dev: boolean
  /** import.meta.env.VITE_AGENT_OFFICE_PORT as defined in vite.config.ts */
  port?: string | number
}

const NO_WINDOW: PageLocation = {
  protocol: 'http:',
  hostname: '127.0.0.1',
  host: `127.0.0.1:${DEFAULT_SERVER_PORT}`,
  port: String(DEFAULT_SERVER_PORT),
  origin: `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
}

function pageLocation(): PageLocation {
  return typeof window !== 'undefined' && window.location ? window.location : NO_WINDOW
}

function buildEnv(): BuildEnv {
  return { dev: !!import.meta.env.DEV, port: import.meta.env.VITE_AGENT_OFFICE_PORT }
}

/** The configured server port as a number, 3334 when unset or not a port. */
export function configuredServerPort(env: BuildEnv = buildEnv()): number {
  const n = Number(env.port)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_SERVER_PORT
}

/** True when the page comes from the Vite dev server rather than the office server. */
export function isDevServerPage(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): boolean {
  return env.dev || loc.port === String(VITE_DEV_PORT)
}

/** The server's http(s) origin, no trailing slash: fetch(`${officeHttpBase()}/chat`). */
export function officeHttpBase(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): string {
  if (isHqEmbed(loc)) return `${loc.origin}${HQ_EMBED_API}`
  if (!isDevServerPage(loc, env)) return loc.origin
  // 127.0.0.1, never the page's own host name: `localhost` can resolve to
  // [::1] first (macOS does), where any local user could be listening while
  // the office binds 127.0.0.1 only — and the page sends its token there
  return `http://127.0.0.1:${configuredServerPort(env)}`
}

/** The WebSocket URL: wss when the page is https, ws otherwise. */
export function officeWsUrl(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): string {
  if (isHqEmbed(loc)) return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${HQ_EMBED_API}/ws`
  if (!isDevServerPage(loc, env)) return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`
  return `ws://127.0.0.1:${configuredServerPort(env)}/ws`
}
