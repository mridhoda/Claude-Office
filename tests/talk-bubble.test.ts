/**
 * The bubble over an agent that has just spoken to another (src/talk.ts, src/components/CharacterTalk.tsx):
 * who it is for and the start of the message, for a few seconds, one per agent.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createAgent } from '../src/agentManager'
import CharacterTalk from '../src/components/CharacterTalk'
import { TAG_Z } from '../src/components/CharacterTag'
import {
  MAIN_ROOM, BOSS_ID, CLAUDE_ID, TALK_MS, initialOfficeState, reduceOffice,
  type OfficeEffect, type OfficeEnv, type OfficeState,
} from '../src/officeReducer'
import { TALK_CHARS, makeTalk } from '../src/talk'
import type { Agent, OfficeEvent } from '../src/types'

const T0 = 1_000_000
const env = (now = T0): OfficeEnv => ({ now, live: true, computePath: () => [], random: () => 0.5 })
const spot = (id: string) => MAIN_ROOM.agentSpots.find(s => s.id === id)!
const seated = (id: string, role: string, spotId: string, state: Agent['state'] = 'working'): Agent => {
  const a = createAgent({ id, name: id, role, spot: spot(spotId), hiredAt: T0 })
  return { ...a, state, position: { ...a.deskPosition }, pathQueue: [] }
}
const office = (...extra: Agent[]): OfficeState => initialOfficeState([seated(BOSS_ID, 'boss', 'spot-1'), seated(CLAUDE_ID, 'assistant', 'spot-2'), ...extra], T0)
const agent = (s: OfficeState, id: string) => s.agents.find(a => a.id === id)!
const say = (id: number, from: string, to: string, text: string): OfficeEvent => ({ type: 'chat_message', id, sender: from, senderId: from, text, timestamp: id, recipient: to, recipientId: to })
const talkOver = (effects: OfficeEffect[]) => effects.filter(e => e.kind === 'schedule').map(e => (e as { action: { type: string; agentId: string; at: number }; delayMs: number })).find(e => e.action.type === 'talk_over')

describe('makeTalk', () => {
  it('keeps a short message and names who it is for', () => {
    expect(makeTalk('Bob', '#3fb950', 'can you test my branch?', 5)).toEqual({ to: 'Bob', toColor: '#3fb950', text: 'can you test my branch?', at: 5 })
  })

  it('cuts a long one to the limit on one line', () => {
    const t = makeTalk('Bob', '#fff', `first line\nsecond ${'x'.repeat(100)}`, 1)
    expect(t.text.length).toBeLessThanOrEqual(TALK_CHARS)
    expect(t.text.endsWith('…')).toBe(true)
    expect(t.text).not.toContain('\n')
  })
})

describe('a directed message in the reducer', () => {
  it('puts the bubble on the sender, and schedules its end', () => {
    const { state, effects } = reduceOffice(office(seated('amy', 'frontend-developer', 'spot-3'), seated('bob', 'test-engineer', 'spot-4')), say(1, 'amy', 'bob', 'can you test my branch?'), env())
    expect(agent(state, 'amy').talk).toMatchObject({ to: 'bob', text: 'can you test my branch?', at: T0 })
    expect(agent(state, 'bob').talk).toBeUndefined()
    expect(talkOver(effects)).toMatchObject({ action: { type: 'talk_over', agentId: 'amy', at: T0 }, delayMs: TALK_MS })
  })

  it('also when the sender is not seated (a walking or waiting sender still speaks)', () => {
    const { state } = reduceOffice(office(seated('amy', 'frontend-developer', 'spot-3', 'idle'), seated('bob', 'test-engineer', 'spot-4')), say(1, 'amy', 'bob', 'hi'), env())
    expect(agent(state, 'amy').talk?.to).toBe('bob')
  })

  it('clears at the end of its time', () => {
    const s = reduceOffice(office(seated('amy', 'frontend-developer', 'spot-3'), seated('bob', 'test-engineer', 'spot-4')), say(1, 'amy', 'bob', 'hi'), env()).state
    expect(agent(reduceOffice(s, { type: 'talk_over', agentId: 'amy', at: T0 }, env(T0 + TALK_MS)).state, 'amy').talk).toBeUndefined()
  })

  it('a quick reply: each speaks, and the first one\'s timer does not cut the second short', () => {
    let s = office(seated('amy', 'frontend-developer', 'spot-3'), seated('bob', 'test-engineer', 'spot-4'))
    s = reduceOffice(s, say(1, 'amy', 'bob', 'can you test my branch?'), env(T0)).state
    s = reduceOffice(s, say(2, 'bob', 'amy', 'on it'), env(T0 + 2000)).state
    expect(agent(s, 'amy').talk?.to).toBe('bob')
    expect(agent(s, 'bob').talk?.to).toBe('amy')
    // amy says it twice in a row: the newer message replaces the older one...
    s = reduceOffice(s, say(3, 'amy', 'bob', 'thanks, also check the lint'), env(T0 + 4000)).state
    expect(agent(s, 'amy').talk).toMatchObject({ text: 'thanks, also check the lint', at: T0 + 4000 })
    // ...and the first message's timer (T0 + 6 s) must not clear the newer bubble
    s = reduceOffice(s, { type: 'talk_over', agentId: 'amy', at: T0 }, env(T0 + TALK_MS)).state
    expect(agent(s, 'amy').talk?.text).toBe('thanks, also check the lint')
    expect(agent(s, 'bob').talk?.text).toBe('on it')
    // the newer one ends on its own timer
    s = reduceOffice(s, { type: 'talk_over', agentId: 'amy', at: T0 + 4000 }, env(T0 + 4000 + TALK_MS)).state
    expect(agent(s, 'amy').talk).toBeUndefined()
  })

  it('a message with no recipient (a plain chat line) makes no bubble', () => {
    const s = reduceOffice(office(seated('amy', 'frontend-developer', 'spot-3')), { type: 'chat_message', id: 1, sender: 'amy', senderId: 'amy', text: 'hello all', timestamp: 1 }, env()).state
    expect(agent(s, 'amy').talk).toBeUndefined()
  })

  it('a recipient the office does not know: still a bubble, in a neutral colour', () => {
    const s = reduceOffice(office(seated('amy', 'frontend-developer', 'spot-3')), say(1, 'amy', 'ghost', 'anyone?'), env()).state
    expect(agent(s, 'amy').talk).toMatchObject({ to: 'ghost', toColor: '#8b8d91' })
  })
})

describe('the bubble on the page', () => {
  const html = (a: Pick<Agent, 'talk' | 'position'>) => renderToStaticMarkup(createElement(CharacterTalk, { agent: a }))

  it('draws nothing while the agent has not spoken', () => {
    expect(html({ position: { x: 40, y: 60 } })).toBe('')
  })

  it('shows who it is for and the start of the message, above the name tags', () => {
    const out = html({ position: { x: 40, y: 60 }, talk: makeTalk('Bob', '#3fb950', 'can you test my branch?', 1) })
    expect(out).toContain('→ Bob:')
    expect(out).toContain('can you test my branch?')
    expect(out).toContain('left:40%')
    expect(out).toContain('top:60%')
    expect(out).toContain(`z-index:${TAG_Z + 1}`)
    expect(out).toContain('--talk-to:#3fb950')
  })

  it('escapes the message (it comes from an agent)', () => {
    const out = html({ position: { x: 1, y: 1 }, talk: makeTalk('Bob', '#fff', '<img src=x onerror=alert(1)>', 1) })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})
