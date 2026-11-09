/**
 * The pull requests on the wall TV (src/prScreen.ts, src/components/PrScreen.tsx) and the marks on the
 * task board's post-its (BoardTask.tag), both fed by JSM HQ.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import PrScreen from '../src/components/PrScreen'
import TaskBoard from '../src/components/TaskBoard'
import {
  PR_RECT, PR_ROWS, cleanPrScreen, dispatchPrScreen, getPrScreen, prSummary, reducePrScreen, resetPrScreen,
  subscribePrScreen, visibleRows,
} from '../src/prScreen'
import { BOARD_RECT, cleanBoard, dispatchTaskBoards, resetTaskBoards, taskCaption, type BoardTask, type TaskBoardInfo } from '../src/taskBoard'
import type { PrItem, PrScreenInfo } from '../src/types'

const pr = (number: number, state: PrItem['state'], title = `PR ${number}`, author?: string): PrItem => ({ number, title, state, ...(author ? { author } : {}) })
const screen = (...items: PrItem[]): PrScreenInfo => ({ items, open: items.filter(i => i.state !== 'merged').length, updatedAt: 1 })

afterEach(() => { resetPrScreen(); resetTaskBoards() })

describe('cleanPrScreen', () => {
  it('keeps well-formed pull requests and counts the open ones', () => {
    const info = cleanPrScreen({ items: [pr(1, 'passed', 'Chat', 'Amy'), pr(2, 'merged'), pr(3, 'changes')], updatedAt: 9 })!
    expect(info.items.map(i => i.number)).toEqual([1, 2, 3])
    expect(info.open).toBe(2)
    expect(info.items[0].author).toBe('Amy')
    expect(info.updatedAt).toBe(9)
  })

  it('drops the malformed ones, and gives null when none is left', () => {
    expect(cleanPrScreen({ items: [{ number: 'x', state: 'passed' }, { number: 1, state: 'weird' }, null, 7] })).toBeNull()
    expect(cleanPrScreen({ items: [{ number: 1, state: 'passed' }, { number: 1.5, state: 'passed' }] })!.items).toHaveLength(1)
    expect(cleanPrScreen({ items: [] })).toBeNull()
    expect(cleanPrScreen({})).toBeNull()
    expect(cleanPrScreen(null)).toBeNull()
    expect(cleanPrScreen('x')).toBeNull()
  })

  it('does not trust a title or author that is not a string', () => {
    const info = cleanPrScreen({ items: [{ number: 1, state: 'pending', title: 5, author: { a: 1 } }] })!
    expect(info.items[0]).toEqual({ number: 1, title: '', state: 'pending' })
  })
})

describe('reducePrScreen', () => {
  it('replaces the picture on a pr_screen event, and clears it on an empty one', () => {
    const a = reducePrScreen(null, { type: 'pr_screen', screen: screen(pr(1, 'pending')) })
    expect(a?.open).toBe(1)
    expect(reducePrScreen(a, { type: 'pr_screen', screen: screen() })).toBeNull()
    expect(reducePrScreen(a, { type: 'pr_screen', screen: null })).toBeNull()
  })

  it('leaves it alone for any other event', () => {
    const a = screen(pr(1, 'pending'))
    expect(reducePrScreen(a, { type: 'agent_working', agentId: 'x' })).toBe(a)
  })
})

describe('what the TV draws', () => {
  it('shows open pull requests first, newest first, then the latest merge; at most three rows', () => {
    const info = screen(pr(1, 'merged'), pr(2, 'passed'), pr(5, 'changes'), pr(3, 'pending'), pr(4, 'reviewing'))
    const { shown, more } = visibleRows(info)
    expect(shown.map(i => i.number)).toEqual([5, 4, 3])
    expect(more).toBe(2)
    expect(shown).toHaveLength(PR_ROWS)
  })

  it('shows all of them when they fit', () => {
    const { shown, more } = visibleRows(screen(pr(1, 'passed'), pr(2, 'merged')))
    expect(shown.map(i => i.number)).toEqual([1, 2])
    expect(more).toBe(0)
  })

  it('says it in words for hovering and for a screen reader', () => {
    expect(prSummary(screen(pr(1, 'reviewing'), pr(2, 'changes'), pr(3, 'passed'), pr(4, 'merged')))).toBe('3 open, 1 in review, 1 with changes requested, 1 approved, 1 merged')
    expect(prSummary(screen(pr(1, 'pending')))).toBe('1 open')
  })

  it('sits on the same wall as the task board, so it leans the same way', () => {
    expect(PR_RECT.skewDeg).toBe(BOARD_RECT.skewDeg)
    expect(PR_RECT.left).toBeGreaterThan(BOARD_RECT.left + BOARD_RECT.width) // right of the board
  })
})

describe('the store', () => {
  it('tells its listeners once per change, and not for the same picture twice', () => {
    let n = 0
    const off = subscribePrScreen(() => { n++ })
    dispatchPrScreen({ type: 'pr_screen', screen: screen(pr(1, 'pending')) })
    expect(n).toBe(1)
    resetPrScreen()
    expect(n).toBe(2)
    resetPrScreen()
    expect(n).toBe(2)
    off()
    dispatchPrScreen({ type: 'pr_screen', screen: screen(pr(2, 'pending')) })
    expect(n).toBe(2)
    expect(getPrScreen()?.items[0].number).toBe(2)
  })
})

describe('the component', () => {
  const html = () => renderToStaticMarkup(createElement(PrScreen))

  it('draws nothing while there are no pull requests outside JSM HQ (the TV keeps its art)', () => {
    expect(html()).toBe('')
    expect(renderToStaticMarkup(createElement(PrScreen, { embedded: false }))).toBe('')
  })

  it('inside JSM HQ the TV is still a button with no pull requests: an invisible hit area that opens the PRs panel', () => {
    const out = renderToStaticMarkup(createElement(PrScreen, { embedded: true }))
    expect(out).toContain('pr-screen-empty')
    expect(out).toContain('role="button"')
    expect(out).toContain('Click to open the PRs panel')
    expect(out).not.toContain('pr-row')
    expect(out).toContain(`left:${PR_RECT.left}%`)
  })

  it('draws a row per pull request with its state, and the count', () => {
    dispatchPrScreen({ type: 'pr_screen', screen: screen(pr(7, 'changes', 'Chat route'), pr(8, 'passed', 'Login')) })
    const out = html()
    expect(out).toContain('pr-screen')
    expect(out).toContain('2 open')
    expect(out).toContain('pr-row changes')
    expect(out).toContain('pr-row passed')
    expect(out).toContain('#7')
    expect(out).toContain('Chat route')
    expect(out).toContain(`left:${PR_RECT.left}%`)
    expect(out).toContain('role="button"')
  })

  it('names every pull request on hover, even the ones the TV has no row for', () => {
    dispatchPrScreen({ type: 'pr_screen', screen: screen(pr(1, 'pending', 'A'), pr(2, 'pending', 'B'), pr(3, 'pending', 'C'), pr(4, 'passed', 'D', 'Amy')) })
    const out = html()
    expect(out).toContain('+1')
    expect(out).toContain('#4 D: approved (Amy)')
  })
})

// ---------------------------------------------------------------------------
// The marks on the task board
// ---------------------------------------------------------------------------

const task = (id: string, status: BoardTask['status'], over: Partial<BoardTask> = {}): BoardTask => ({ id, subject: `Task ${id}`, status, blockedBy: [], ...over })
const board = (tasks: BoardTask[]): TaskBoardInfo => ({ sessionId: 'B1', project: 'Backlog', tasks, updatedAt: 1 })

describe('post-it marks (BoardTask.tag)', () => {
  it('keeps a review or blocked tag from the wire and drops anything else', () => {
    const b = cleanBoard(board([task('1', 'in_progress', { tag: 'review' }), task('2', 'in_progress', { tag: 'blocked' }), task('3', 'pending', { tag: 'bogus' as never })]))!
    expect(b.tasks.map(t => t.tag)).toEqual(['review', 'blocked', undefined])
  })

  it('says it on hover, with what HQ added (the PR, the reason)', () => {
    const b = board([])
    expect(taskCaption(task('1', 'in_progress', { subject: 'Chat route', tag: 'review', activeForm: 'PR #7' }), b)).toBe('#1 In review: Chat route — PR #7')
    expect(taskCaption(task('2', 'in_progress', { subject: 'Login', tag: 'blocked', activeForm: 'needs a key' }), b)).toBe('#2 Blocked: Login — needs a key')
    expect(taskCaption(task('3', 'in_progress', { subject: 'Plain', activeForm: 'Doing plain' }), b)).toBe('#3 In progress: Doing plain')
  })

  it('marks the post-its on the wall', () => {
    dispatchTaskBoards({ type: 'task_board', boards: [board([task('1', 'in_progress', { tag: 'review' }), task('2', 'in_progress', { tag: 'blocked' }), task('3', 'in_progress')])] })
    const out = renderToStaticMarkup(createElement(TaskBoard, { sessions: [], night: 0 }))
    expect(out.match(/task-note in_progress review/g)).toHaveLength(1)
    expect(out.match(/task-note in_progress blocked/g)).toHaveLength(1)
    expect(out.match(/class="task-note in_progress"/g)).toHaveLength(1)
  })
})
