/**
 * The pull requests on the wall TV (JSM HQ): the screen in the room art, over-drawn with the open PRs and
 * where each stands. Nothing is drawn while there are none, so the TV keeps its own art. Sized in cqw
 * like the task board, so it scales with the room. A click is for HQ to answer (its PRs panel).
 */

import React from 'react'
import { PR_RECT, prSummary, usePrScreen, visibleRows } from '../prScreen'
import { isHqEmbed } from '../serverUrl'
import type { PrState } from '../types'
import '../styles/prscreen.css'

const MARK: Record<PrState, string> = { pending: '·', reviewing: '…', changes: '✗', passed: '✓', merged: '⇡' }
const WORD: Record<PrState, string> = { pending: 'waiting for review', reviewing: 'in review', changes: 'changes requested', passed: 'approved', merged: 'merged' }

interface PrScreenProps {
  /** A click on the TV: what the 'tv-monitor' hotspot under it does, and HQ's PRs panel */
  onActivate?: () => void
  /** Inside JSM HQ the TV is a button even with no pull requests (it opens HQ's PRs panel); defaults to isHqEmbed() */
  embedded?: boolean
}

const PrScreen: React.FC<PrScreenProps> = ({ onActivate, embedded = isHqEmbed() }) => {
  const info = usePrScreen()
  if (!info) {
    // Nothing to draw: the TV keeps its own art, with an invisible button on it so a click still opens the PRs panel
    if (!embedded) return null
    return (
      <div
        className="pr-screen pr-screen-empty"
        style={{ left: `${PR_RECT.left}%`, top: `${PR_RECT.top}%`, width: `${PR_RECT.width}%`, height: `${PR_RECT.height}%`, transform: `skewY(${PR_RECT.skewDeg}deg)` }}
        role="button"
        tabIndex={0}
        aria-label="Pull requests: none yet. Open the PRs panel"
        title="No pull requests yet. Click to open the PRs panel"
        onClick={e => { e.stopPropagation(); onActivate?.() }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onActivate?.() } }}
      />
    )
  }
  const { shown, more } = visibleRows(info)
  const detail = info.items.map(i => `#${i.number} ${i.title || 'untitled'}: ${WORD[i.state]}${i.author ? ` (${i.author})` : ''}`).join('\n')

  const activate = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    onActivate?.()
  }

  return (
    <div
      className="pr-screen"
      style={{
        left: `${PR_RECT.left}%`,
        top: `${PR_RECT.top}%`,
        width: `${PR_RECT.width}%`,
        height: `${PR_RECT.height}%`,
        transform: `skewY(${PR_RECT.skewDeg}deg)`,
      }}
      role="button"
      tabIndex={0}
      aria-label={`Pull requests: ${prSummary(info)}`}
      title={`${prSummary(info)}\n${detail}`}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') activate(e) }}
    >
      <div className="pr-screen-body">
      <div className="pr-screen-head">
        <b>PR</b>
        <span>{info.open} open</span>
      </div>
      {shown.map(item => (
        <div key={item.number} className={`pr-row ${item.state}`}>
          <i className="pr-mark">{MARK[item.state]}</i>
          <span className="pr-num">#{item.number}</span>
          <span className="pr-title">{item.title}</span>
        </div>
      ))}
      {more > 0 && <div className="pr-more">+{more}</div>}
      </div>
    </div>
  )
}

export default PrScreen
