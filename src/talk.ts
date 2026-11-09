/** The bubble over an agent that has just spoken to another (JSM HQ): who to, and the start of it. */

import { clip } from './taskBoard'
import type { AgentTalk } from './types'

/** Characters of the message the bubble shows */
export const TALK_CHARS = 40

export function makeTalk(to: string, toColor: string, text: string, at: number): AgentTalk {
  return { to: clip(to, 20), toColor, text: clip(text, TALK_CHARS), at }
}
