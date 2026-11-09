/**
 * The field label under a JSM HQ worker (src/roleLabel.ts, src/components/Character.tsx): the colour
 * follows the field, the text is kept short, and nothing changes for a character without one.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Character from '../src/components/Character'
import CharacterTag, { TAG_Z } from '../src/components/CharacterTag'
import { createAgent } from '../src/agentManager'
import { BOSS_ID, CLAUDE_ID, MAIN_ROOM, initialOfficeState, reduceOffice, type OfficeEnv } from '../src/officeReducer'
import { ROLE_LABEL_MAX, roleLabelStyle, roleLabelText } from '../src/roleLabel'
import type { Agent } from '../src/types'

const ORANGE = '#f08c2e', GREEN = '#3fb950', BLUE = '#4c9ffe', RED = '#e5534b', PINK = '#e879b9', PURPLE = '#a371f7', YELLOW = '#e3c04a', GOLD = '#d4a72c', TEAL = '#2ec4b6', GREY = '#8b949e'

describe('roleLabelStyle: the colour follows the field', () => {
  it.each([
    ['DevOps', ORANGE], ['devops engineer', ORANGE], ['Infra', ORANGE], ['SRE', ORANGE],
    ['QA', GREEN], ['Tester', GREEN], ['Pengujian', GREEN],
    ['Code reviewer', BLUE],
    ['Security', RED], ['Keamanan', RED],
    ['Mobile', TEAL], ['Flutter dev', TEAL],
    ['Frontend developer', PINK], ['Designer', PINK], ['UI', PINK],
    ['Backend', PURPLE], ['API', PURPLE], ['Database admin', PURPLE],
    ['Docs', YELLOW], ['Technical writer', YELLOW], ['Dokumentasi', YELLOW],
    ['Lead', GOLD], ['Architect', GOLD],
    ['Developer', GREY], ['Whatever it is', GREY], ['', GREY],
  ])('%s', (label, bg) => {
    expect(roleLabelStyle(label).bg).toBe(bg)
  })

  it('is not case sensitive, and the more specific field wins (a QA lead is QA)', () => {
    expect(roleLabelStyle('DEVOPS').bg).toBe(ORANGE)
    expect(roleLabelStyle('QA Lead').bg).toBe(GREEN)
  })

  it('always gives text a colour it can be read in', () => {
    for (const label of ['DevOps', 'QA', 'review', 'security', 'mobile', 'frontend', 'backend', 'docs', 'lead', 'other']) {
      const { bg, fg } = roleLabelStyle(label)
      expect(bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(fg).toMatch(/^#[0-9a-f]{6}$/)
      expect(bg).not.toBe(fg)
    }
  })
})

describe('roleLabelText', () => {
  it('keeps a short label as it is, on one line', () => {
    expect(roleLabelText('DevOps')).toBe('DevOps')
    expect(roleLabelText('  Front   end \n dev ')).toBe('Front end dev')
  })

  it('cuts a long one to the limit with an ellipsis', () => {
    const out = roleLabelText('Principal Staff Reliability Engineer')
    expect(out.length).toBe(ROLE_LABEL_MAX)
    expect(out.endsWith('…')).toBe(true)
  })

  it('says nothing when there is nothing to say', () => {
    expect(roleLabelText(undefined)).toBe('')
    expect(roleLabelText('   ')).toBe('')
  })
})

describe('the label on a character', () => {
  const spot = MAIN_ROOM.agentSpots[2]
  const worker = (over: Partial<Agent> = {}): Agent => {
    const a = createAgent({ id: 'amy', name: 'Amy', role: 'devops-engineer', spot, hiredAt: 1_000 })
    return { ...a, state: 'working', position: { ...a.deskPosition }, pathQueue: [], ...over }
  }
  const html = (agent: Agent) => renderToStaticMarkup(createElement(Character, { agent }))

  const tag = (agent: Agent) => renderToStaticMarkup(createElement(CharacterTag, { agent }))

  it('shows the name and the field, coloured for the field, in a layer of its own', () => {
    const out = tag(worker({ roleLabel: 'DevOps' }))
    expect(out).toContain('char-tag')
    expect(out).toContain('data-role-label="DevOps"')
    expect(out).toContain('char-tag-name">Amy<')
    expect(out).toContain('char-tag-role">DevOps<')
    expect(out).toContain(`--tag-bg:${ORANGE}`)
    // above every character and desk (those stack by y, up to 100), and on the character's feet
    expect(TAG_Z).toBeGreaterThan(100)
    expect(out).toContain(`z-index:${TAG_Z}`)
    expect(out).toContain(`left:${spot.x}%`)
  })

  it('is not inside the character, so a desk in front of the character cannot cover it', () => {
    const out = html(worker({ roleLabel: 'DevOps' }))
    expect(out).not.toContain('char-tag')
    expect(out).toContain('has-tag') // the state labels still make room for it
  })

  it('names the field in the tooltip too', () => {
    expect(html(worker({ roleLabel: 'DevOps' }))).toMatch(/title="[^"]*Amy[^"]*DevOps/)
  })

  it('keeps the needs-input label as well, so a waiting worker still shows its field', () => {
    const agent = worker({ roleLabel: 'QA', mainState: 'needs-you', needsYou: { kind: 'agent-input', summary: 'ok?' } })
    expect(tag(agent)).toContain('char-tag')
    expect(html(agent)).toContain('char-needs-you')
  })

  it('draws nothing for a character without a field (every Claude Office character today)', () => {
    expect(html(worker())).not.toContain('has-tag')
    expect(tag(worker())).toBe('')
    expect(tag(worker({ roleLabel: '   ' }))).toBe('')
  })
})

describe('the field travels with the agent', () => {
  const env = (): OfficeEnv => ({ now: 1_000_000, live: true, computePath: () => [], random: () => 0.5 })
  const seated = (id: string, role: string, spotId: string): Agent => {
    const a = createAgent({ id, name: id, role, spot: MAIN_ROOM.agentSpots.find(s => s.id === spotId)!, hiredAt: 1_000_000 })
    return { ...a, state: 'working', position: { ...a.deskPosition }, pathQueue: [] }
  }
  const empty = () => initialOfficeState([seated(BOSS_ID, 'boss', 'spot-1'), seated(CLAUDE_ID, 'assistant', 'spot-2')], 1_000_000)

  it('agent_spawned carries it onto the agent', () => {
    const { state } = reduceOffice(empty(), { type: 'agent_spawned', agent: { id: 'amy', name: 'Amy', role: 'devops-engineer', task: 'x', roleLabel: 'DevOps' } }, env())
    expect(state.agents.find(a => a.id === 'amy')!.roleLabel).toBe('DevOps')
  })

  it('a reconnect snapshot does too, for agents that walk in', () => {
    const { state } = reduceOffice(empty(), { type: 'snapshot', activeAgents: [{ id: 'bob', name: 'Bob', role: 'test-engineer', task: 'QA', roleLabel: 'QA' }] }, env())
    expect(state.agents.find(a => a.id === 'bob')!.roleLabel).toBe('QA')
  })

  it('an agent without one has none (no empty label)', () => {
    const { state } = reduceOffice(empty(), { type: 'agent_spawned', agent: { id: 'cat', name: 'Cat', role: 'debugger', task: 'x' } }, env())
    expect(state.agents.find(a => a.id === 'cat')!.roleLabel).toBeUndefined()
  })
})
