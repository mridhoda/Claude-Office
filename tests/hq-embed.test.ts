/**
 * What the office needs to be a view of JSM HQ (see src/hqBridge.ts, src/serverUrl.ts isHqEmbed):
 * the Plan wall's choice of board, a pull request's review as a scene, a worker's errand to the
 * plan wall, HQ's agent-to-agent messages as visits, and the one message HQ's page may send.
 */

import { describe, expect, it } from 'vitest'
import { createAgent } from '../src/agentManager'
import { createIncidentState, reduceIncident, signalIncidentInput } from '../src/incident'
import {
  A2A_VISIT_MS, MAIN_ROOM, BOSS_ID, CLAUDE_ID, initialOfficeState, reduceOffice,
  type OfficeEffect, type OfficeEnv, type OfficeState,
} from '../src/officeReducer'
import { parseFromHq } from '../src/hqBridge'
import { signalFailureLabel } from '../src/signals'
import { cycleBoards, lockBoard, reduceTaskBoards, shownBoard, type TaskBoardInfo, type TaskBoardsState } from '../src/taskBoard'
import type { Agent, SignalEvent } from '../src/types'

const T0 = 1_000_000
const env = (): OfficeEnv => ({ now: T0, live: true, computePath: () => [], random: () => 0.5 })
const spot = (id: string) => MAIN_ROOM.agentSpots.find(s => s.id === id)!

function seated(id: string, role: string, spotId: string, state: Agent['state'] = 'working'): Agent {
  const a = createAgent({ id, name: id, role, spot: spot(spotId), hiredAt: T0 })
  return { ...a, state, position: { ...a.deskPosition }, pathQueue: [] }
}

function office(...extra: Agent[]): OfficeState {
  return initialOfficeState([seated(BOSS_ID, 'boss', 'spot-1'), seated(CLAUDE_ID, 'assistant', 'spot-2'), ...extra], T0)
}

const agent = (s: OfficeState, id: string) => s.agents.find(a => a.id === id)
const kinds = (effects: OfficeEffect[], kind: string) => effects.filter(e => e.kind === kind)
const sfx = (effects: OfficeEffect[]) => effects.filter(e => e.kind === 'sfx').map(e => (e as { sfx: string }).sfx)

// ---------------------------------------------------------------------------
// The Plan wall's choice of board
// ---------------------------------------------------------------------------

const board = (id: string, updatedAt: number): TaskBoardInfo => ({ sessionId: id, project: `Board ${id}`, updatedAt, tasks: [{ id: `${id}-T01`, subject: 'Do it', status: 'pending', blockedBy: [] }] })
const two = (): TaskBoardsState => reduceTaskBoards({ boards: [], pinned: null, fx: null }, { type: 'task_board', boards: [board('A', 1_000), board('B', 2_000)] }, 5)

describe('the Plan wall choice (lockBoard)', () => {
  it('shows the board that changed last until HQ picks one, and HQ\'s pick wins over it', () => {
    const s = two()
    expect(shownBoard(s)?.sessionId).toBe('B')
    const locked = lockBoard(s, 'A')
    expect(shownBoard(locked)?.sessionId).toBe('A')
  })

  it('survives a change on another board, which a plain click-pin does not', () => {
    const locked = lockBoard(two(), 'A')
    const after = reduceTaskBoards(locked, { type: 'task_board', sessionId: 'B', board: board('B', 9_000) }, 10)
    expect(shownBoard(after)?.sessionId).toBe('A')
  })

  it('survives a reconnect snapshot while its board is there, and lets go when the board is gone', () => {
    const locked = lockBoard(two(), 'A')
    expect(shownBoard(reduceTaskBoards(locked, { type: 'task_board', boards: [board('A', 1), board('B', 2)] }))?.sessionId).toBe('A')
    expect(shownBoard(reduceTaskBoards(locked, { type: 'task_board', boards: [board('B', 2)] }))?.sessionId).toBe('B')
  })

  it('null goes back to the newest; an unknown board locks nothing; clicking to cycle lets go', () => {
    const locked = lockBoard(two(), 'A')
    expect(shownBoard(lockBoard(locked, null))?.sessionId).toBe('B')
    expect(lockBoard(two(), 'nope').locked ?? null).toBeNull()
    expect(cycleBoards(locked).locked).toBeNull()
  })

  it('returns the same state when nothing changes (so the page does not re-render)', () => {
    const s = two()
    expect(lockBoard(s, null)).toBe(s)
    const locked = lockBoard(s, 'A')
    expect(lockBoard(locked, 'A')).toBe(locked)
  })
})

// ---------------------------------------------------------------------------
// The only message HQ's page may send
// ---------------------------------------------------------------------------

describe('parseFromHq', () => {
  it('accepts a board id or null from HQ', () => {
    expect(parseFromHq({ source: 'hq', type: 'show-board', boardId: 'P1' })).toEqual({ type: 'show-board', boardId: 'P1' })
    expect(parseFromHq({ source: 'hq', type: 'show-board', boardId: null })).toEqual({ type: 'show-board', boardId: null })
  })

  it('rejects anything else: another source, another type, a non-string or oversized id', () => {
    expect(parseFromHq({ source: 'evil', type: 'show-board', boardId: 'P1' })).toBeNull()
    expect(parseFromHq({ source: 'hq', type: 'eval', boardId: 'P1' })).toBeNull()
    expect(parseFromHq({ source: 'hq', type: 'show-board', boardId: 7 })).toBeNull()
    expect(parseFromHq({ source: 'hq', type: 'show-board', boardId: '' })).toBeNull()
    expect(parseFromHq({ source: 'hq', type: 'show-board', boardId: 'x'.repeat(81) })).toBeNull()
    expect(parseFromHq(null)).toBeNull()
    expect(parseFromHq('hq')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// A pull request's review as a scene
// ---------------------------------------------------------------------------

const review = (kind: 'review_changes' | 'review_passed', over: Partial<SignalEvent> = {}): SignalEvent =>
  ({ type: 'signal', kind, target: 'PR #3 Chat route', agentId: 'w1', ...over })

describe('review signals (review_changes / review_passed)', () => {
  it('changes requested: a red scene on the author and the error sound, and no chat line', () => {
    const { state, effects } = reduceOffice(office(seated('w1', 'debugger', 'spot-3')), review('review_changes', { detail: '2 comments' }), env())
    expect(agent(state, 'w1')!.scene?.kind).toBe('red')
    expect(sfx(effects)).toEqual(['error'])
    expect(kinds(effects, 'msg')).toEqual([])
    expect(kinds(effects, 'schedule')).toHaveLength(1) // the scene ends by itself
  })

  it('passed: the shipped scene and the celebration, and no chat line', () => {
    const { state, effects } = reduceOffice(office(seated('w1', 'debugger', 'spot-3')), review('review_passed'), env())
    expect(agent(state, 'w1')!.scene?.kind).toBe('shipped')
    expect(sfx(effects)).toEqual(['celebration'])
    expect(kinds(effects, 'msg')).toEqual([])
  })

  it('an author who is not in the office is not an error: nothing is drawn', () => {
    const s = office()
    const { state, effects } = reduceOffice(s, review('review_changes', { agentId: 'ghost' }), env())
    expect(state.agents.map(a => a.scene)).toEqual(s.agents.map(a => a.scene))
    expect(kinds(effects, 'msg')).toEqual([])
  })

  it('never opens an incident, however many reviews ask for changes', () => {
    const start = createIncidentState()
    for (const kind of ['review_changes', 'review_changes', 'review_passed'] as const) {
      const input = signalIncidentInput(review(kind), T0)!
      expect(input).not.toBeNull()
      const t = reduceIncident(start, input)
      expect(t.state).toBe(start)
      expect(t.state.variant).toBe('none')
    }
  })

  it('has a sentence for the chat: "changes requested on PR #3: 2 comments"', () => {
    expect(signalFailureLabel(review('review_changes', { detail: '2 comments' }))).toBe('changes requested on PR #3 Chat route: 2 comments')
    expect(signalFailureLabel(review('review_passed'))).toBeUndefined()
  })

  it('a merged PR is a push to main: the pushed scene and a line naming the PR', () => {
    const merged: SignalEvent = { type: 'signal', kind: 'push_done', branch: 'main', toDefault: true, target: 'PR #3 Chat route', agentId: 'w1' }
    const { state, effects } = reduceOffice(office(seated('w1', 'debugger', 'spot-3')), merged, env())
    expect(agent(state, 'w1')!.scene?.kind).toBe('pushed')
    const lines = kinds(effects, 'msg').map(e => (e as { text: string }).text)
    expect(lines).toEqual(['🎉 pushed to main · PR #3 Chat route'])
  })
})

// ---------------------------------------------------------------------------
// An errand: the lead walks to the plan wall
// ---------------------------------------------------------------------------

const WALL = { x: 78, y: 48 }

describe('agent_errand', () => {
  it('walks a seated worker to the spot, says why, and schedules the walk back', () => {
    const { state, effects } = reduceOffice(office(seated('lead', 'architect-reviewer', 'spot-3')), { type: 'agent_errand', agentId: 'lead', spot: WALL, label: 'updating the plan wall' }, env())
    const lead = agent(state, 'lead')!
    expect(lead.state).toBe('walking-to-desk')
    expect(lead.targetPosition).toEqual(WALL)
    expect(lead.statusText).toBe('updating the plan wall')
    const back = kinds(effects, 'schedule')[0] as { action: { type: string; agentId: string }; delayMs: number }
    expect(back.action).toEqual({ type: 'a2a_visit_over', agentId: 'lead' })
    expect(back.delayMs).toBe(A2A_VISIT_MS)
  })

  it('then goes back to its desk', () => {
    const away = reduceOffice(office(seated('lead', 'architect-reviewer', 'spot-3')), { type: 'agent_errand', agentId: 'lead', spot: WALL }, env()).state
    const home = reduceOffice(away, { type: 'a2a_visit_over', agentId: 'lead' }, env()).state
    expect(agent(home, 'lead')!.targetPosition).toEqual(agent(home, 'lead')!.deskPosition)
  })

  it('keeps the time sensible: no shorter than a second, no longer than half a minute', () => {
    const s = office(seated('lead', 'architect-reviewer', 'spot-3'))
    const delay = (ms: number) => (kinds(reduceOffice(s, { type: 'agent_errand', agentId: 'lead', spot: WALL, ms }, env()).effects, 'schedule')[0] as { delayMs: number }).delayMs
    expect(delay(5)).toBe(1_000)
    expect(delay(999_999)).toBe(30_000)
  })

  it('ignores a worker that is not at its desk working, an unknown one, and a missing spot', () => {
    const idle = office(seated('lead', 'architect-reviewer', 'spot-3', 'idle'))
    expect(reduceOffice(idle, { type: 'agent_errand', agentId: 'lead', spot: WALL }, env()).state).toBe(idle)
    const s = office(seated('lead', 'architect-reviewer', 'spot-3'))
    expect(reduceOffice(s, { type: 'agent_errand', agentId: 'ghost', spot: WALL }, env()).state).toBe(s)
    expect(reduceOffice(s, { type: 'agent_errand', agentId: 'lead' }, env()).state).toBe(s)
  })
})

// ---------------------------------------------------------------------------
// HQ's agent-to-agent messages
// ---------------------------------------------------------------------------

describe('a directed message from HQ (senderId / recipientId)', () => {
  const message = { type: 'chat_message' as const, id: 7, sender: 'Amy', role: 'frontend-developer', text: 'take a look at my branch', recipient: 'Bob', senderId: 'amy', recipientId: 'bob', timestamp: T0 }

  it('walks a working sender over to the recipient\'s desk and names who it is for', () => {
    const s = office(seated('amy', 'frontend-developer', 'spot-3'), seated('bob', 'test-engineer', 'spot-4'))
    const { state, effects } = reduceOffice(s, message, env())
    expect(agent(state, 'amy')!.state).toBe('walking-to-desk')
    expect(agent(state, 'amy')!.statusText).toBe('talking to bob')
    expect(kinds(effects, 'msg').map(e => (e as { text: string }).text).join(' ')).toContain('@bob: take a look at my branch')
    // the walk back, and the end of the bubble over the sender (tests/talk-bubble.test.ts)
    expect(kinds(effects, 'schedule').map(e => (e as { action: { type: string } }).action.type).sort()).toEqual(['a2a_visit_over', 'talk_over'])
  })

  it('does not move a sender who is idle, and still posts the line', () => {
    const s = office(seated('amy', 'frontend-developer', 'spot-3', 'idle'), seated('bob', 'test-engineer', 'spot-4'))
    const { state, effects } = reduceOffice(s, message, env())
    expect(agent(state, 'amy')!.state).toBe('idle')
    expect(kinds(effects, 'msg').length).toBe(1)
  })
})
