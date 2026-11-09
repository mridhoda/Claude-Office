/**
 * "→ Bob: can you test my branch…" over the agent that just spoke to Bob (JSM HQ). Same layer and stacking as the
 * name tags (above the furniture), so a desk never hides it. The agent stays clickable through it.
 */

import React from 'react'
import { TAG_Z } from './CharacterTag'
import type { Agent } from '../types'

const CharacterTalk: React.FC<{ agent: Pick<Agent, 'talk' | 'position'> }> = ({ agent }) => {
  const talk = agent.talk
  if (!talk) return null
  return (
    <div
      className="char-talk"
      role="status"
      style={{ left: `${agent.position.x}%`, top: `${agent.position.y}%`, zIndex: TAG_Z + 1, ['--talk-to' as string]: talk.toColor }}
    >
      <b className="char-talk-to">→ {talk.to}:</b> <span className="char-talk-text">{talk.text}</span>
    </div>
  )
}

export default CharacterTalk
