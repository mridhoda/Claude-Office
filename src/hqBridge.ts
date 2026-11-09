/**
 * hqBridge.ts — the office's line to JSM HQ, the page that embeds it at /office/
 * (src/serverUrl.ts isHqEmbed). Out: a click on a character or on the task board is
 * HQ's to answer (its panels hold the terminals and the boards). In: HQ's "Plan wall"
 * choice picks the board on the wall. Only the embedding page of this origin is
 * trusted, in both directions. Outside HQ every function here does nothing.
 */

import { isHqEmbed } from './serverUrl'
import { getTaskBoards, lockTaskBoard, subscribeTaskBoards } from './taskBoard'

/** What this page tells HQ */
export type ToHq =
  | { type: 'agent-click'; agentId: string }
  | { type: 'board-click'; boardId: string | null }
  | { type: 'prs-click' }

/** What HQ tells this page */
export type FromHq = { type: 'show-board'; boardId: string | null }

/** Tags the messages so HQ can tell them from anything else a page might post. */
export const OFFICE_SOURCE = 'agent-office'
export const HQ_SOURCE = 'hq'

const MAX_ID = 80

/** HQ's message, checked: null unless it is one this page understands. */
export function parseFromHq(data: unknown): FromHq | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { source?: unknown; type?: unknown; boardId?: unknown }
  if (d.source !== HQ_SOURCE || d.type !== 'show-board') return null
  if (d.boardId === null) return { type: 'show-board', boardId: null }
  if (typeof d.boardId === 'string' && d.boardId.length > 0 && d.boardId.length <= MAX_ID) return { type: 'show-board', boardId: d.boardId }
  return null
}

/** Tells HQ. False when this page is not inside HQ (the office then answers the click itself). */
export function postToHq(msg: ToHq): boolean {
  if (typeof window === 'undefined' || !isHqEmbed() || window.parent === window) return false
  window.parent.postMessage({ source: OFFICE_SOURCE, ...msg }, window.location.origin)
  return true
}

// The board HQ's Plan wall wants. Kept, so a board that only gets its first task later still lands on the wall.
let wanted: string | null = null

/** Listens to HQ. Call once, at start. */
export function initHqBridge(): void {
  if (typeof window === 'undefined' || !isHqEmbed()) return
  const apply = () => lockTaskBoard(wanted)
  window.addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== window.location.origin) return
    const msg = parseFromHq(e.data)
    if (!msg) return
    wanted = msg.boardId
    apply()
  })
  subscribeTaskBoards(() => {
    if (wanted && getTaskBoards().locked !== wanted) apply()
  })
}
