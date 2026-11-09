/**
 * prScreen.ts — the pull requests on the wall TV (JSM HQ). Same shape as the task board's store:
 * a pure reducer for the `pr_screen` event (the server's whole picture, replaced on every change),
 * and a tiny external store the component reads. Outside HQ nothing sends the event, the store stays
 * empty, and the TV stays the art it is in the room image.
 */

import { useSyncExternalStore } from 'react'
import type { OfficeEvent, PrItem, PrScreenInfo, PrState } from './types'

/** Rows the TV has room for */
export const PR_ROWS = 3
/** The TV's screen in the room art, as % of the room image (measured on the PNG; same wall as the board, so the same skew) */
export const PR_RECT = Object.freeze({ left: 87.4, top: 32.2, width: 5.8, height: 5.2, skewDeg: 23.1 })

const STATES: ReadonlySet<string> = new Set<PrState>(['pending', 'reviewing', 'changes', 'passed', 'merged'])

/** The wire's picture, checked: null unless it holds at least one well-formed pull request. */
export function cleanPrScreen(raw: unknown): PrScreenInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PrScreenInfo>
  if (!Array.isArray(r.items)) return null
  const items = r.items
    .filter((i): i is PrItem => !!i && typeof i === 'object' && Number.isInteger(i.number) && STATES.has(i.state))
    .map(i => ({ number: i.number, title: typeof i.title === 'string' ? i.title : '', state: i.state, ...(typeof i.author === 'string' && i.author ? { author: i.author } : {}) }))
  if (items.length === 0) return null
  const open = items.filter(i => i.state !== 'merged').length
  return { items, open, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0 }
}

export function reducePrScreen(prev: PrScreenInfo | null, event: OfficeEvent): PrScreenInfo | null {
  return event.type === 'pr_screen' ? cleanPrScreen(event.screen) : prev
}

/** What the TV draws: the open ones first (the ones that need someone), newest first, then the latest merge. */
export function visibleRows(info: PrScreenInfo, max = PR_ROWS): { shown: PrItem[]; more: number } {
  const order = (i: PrItem) => (i.state === 'merged' ? 1 : 0)
  const sorted = [...info.items].sort((a, b) => order(a) - order(b) || b.number - a.number)
  return { shown: sorted.slice(0, max), more: Math.max(0, sorted.length - max) }
}

/** The words on hover and for a screen reader */
export function prSummary(info: PrScreenInfo): string {
  const by = (s: PrState) => info.items.filter(i => i.state === s).length
  const parts = [`${info.open} open`]
  if (by('reviewing')) parts.push(`${by('reviewing')} in review`)
  if (by('changes')) parts.push(`${by('changes')} with changes requested`)
  if (by('passed')) parts.push(`${by('passed')} approved`)
  if (by('merged')) parts.push(`${by('merged')} merged`)
  return parts.join(', ')
}

let state: PrScreenInfo | null = null
const listeners = new Set<() => void>()

function set(next: PrScreenInfo | null) {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

export function getPrScreen(): PrScreenInfo | null {
  return state
}

export function subscribePrScreen(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function usePrScreen(): PrScreenInfo | null {
  return useSyncExternalStore(subscribePrScreen, getPrScreen, getPrScreen)
}

/** Forward a pr_screen event from the socket (the server sends the whole picture each time). */
export function dispatchPrScreen(event: OfficeEvent) {
  set(reducePrScreen(state, event))
}

export function resetPrScreen() {
  set(null)
}
