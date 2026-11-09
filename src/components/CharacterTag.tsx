/**
 * The name and field label under a character (JSM HQ). Drawn in its own layer above the furniture, not inside
 * Character: a character's z-index follows its y position, so desks and monitors would cover a tag that lived there.
 */

import React from 'react'
import { roleLabelStyle, roleLabelText } from '../roleLabel'
import type { Agent } from '../types'

/** Above every character and piece of furniture in the room (those run by y, up to 100) */
export const TAG_Z = 110

const CharacterTag: React.FC<{ agent: Pick<Agent, 'name' | 'roleLabel' | 'roleColor' | 'position'> }> = ({ agent }) => {
  const label = roleLabelText(agent.roleLabel)
  if (!label) return null
  const field = roleLabelStyle(label, agent.roleColor)
  return (
    <div
      className="char-tag"
      style={{ left: `${agent.position.x}%`, top: `${agent.position.y}%`, zIndex: TAG_Z, ['--tag-bg' as string]: field.bg, ['--tag-fg' as string]: field.fg }}
      data-role-label={label}
    >
      <span className="char-tag-name">{agent.name}</span>
      <span className="char-tag-role">{label}</span>
    </div>
  )
}

export default CharacterTag
