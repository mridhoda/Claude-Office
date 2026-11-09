/**
 * src/components/Character.tsx for the workers JSM HQ puts in the office (agent_state):
 * they are not a session's Claude (no `main-` id), but once they carry a main state they
 * must wear it like one: a hand up while they wait on you, a warning on an error.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Character from '../src/components/Character'
import { createAgent } from '../src/agentManager'
import { MAIN_ROOM } from '../src/officeReducer'
import type { Agent } from '../src/types'

const spot = MAIN_ROOM.agentSpots[2]

function worker(over: Partial<Agent> = {}): Agent {
  const a = createAgent({ id: 'amy', name: 'Amy', role: 'frontend-developer', spot, hiredAt: 1_000 })
  return { ...a, state: 'idle', position: { ...a.deskPosition }, pathQueue: [], ...over }
}

const html = (agent: Agent) => renderToStaticMarkup(createElement(Character, { agent }))

describe('a worker that carries a main state (JSM HQ)', () => {
  it('raises the needs-you hand and label, and says so on the wrapper', () => {
    const out = html(worker({ mainState: 'needs-you', needsYou: { kind: 'agent-input', summary: 'Asking: which db?' }, statusText: 'Asking: which db?' }))
    expect(out).toContain('main-needs-you')
    expect(out).toContain('data-main-state="needs-you"')
    expect(out).toContain('effect-emoji needs-you')
  })

  it('shows the warning on an error state', () => {
    const out = html(worker({ mainState: 'error', statusText: 'API error' }))
    expect(out).toContain('effect-emoji error')
  })

  it('a plain worker (a subagent, no main state) looks exactly as before: no main-state class, no hand', () => {
    const out = html(worker())
    expect(out).not.toContain('main-')
    expect(out).not.toContain('data-main-state')
    expect(out).not.toContain('needs-you')
  })
})
