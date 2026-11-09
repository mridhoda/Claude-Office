/**
 * roleLabel.ts — the label under a character that says which field it works in (JSM HQ: the agent's
 * role, as the person typed it: "DevOps", "QA", "Backend"). Pure: the colour comes from the field, so
 * every DevOps agent looks alike and the office can be read at a glance.
 */

export interface RoleLabelStyle {
  /** The pill's background */
  bg: string
  /** The text on it */
  fg: string
}

// First match wins, so the specific fields come before the general ones
const FIELDS: ReadonlyArray<readonly [RegExp, RoleLabelStyle]> = [
  [/devops|infra|\bsre\b|\bops\b|platform|cloud|deploy/, { bg: '#f08c2e', fg: '#1a1208' }],
  [/\bqa\b|test|quality|penguji|pengujian/, { bg: '#3fb950', fg: '#07120a' }],
  [/review/, { bg: '#4c9ffe', fg: '#06101f' }],
  [/secur|pentest|audit|keamanan/, { bg: '#e5534b', fg: '#ffffff' }],
  [/mobile|android|\bios\b|flutter|react native/, { bg: '#2ec4b6', fg: '#04201d' }],
  [/front|\bui\b|\bux\b|design|\bweb\b/, { bg: '#e879b9', fg: '#1f0816' }],
  [/back|\bapi\b|server|database|\bdb\b|data/, { bg: '#a371f7', fg: '#12082a' }],
  [/\bdocs?\b|writer|content|dokumen|penulis/, { bg: '#e3c04a', fg: '#1f1800' }],
  [/lead|manager|architect|\bpm\b|plan/, { bg: '#d4a72c', fg: '#1a1208' }],
]
const OTHER: RoleLabelStyle = { bg: '#8b949e', fg: '#0d1117' }

/** The longest label drawn; longer ones are cut with an ellipsis so they never widen the pill past the sprite */
export const ROLE_LABEL_MAX = 16

/** Relative luminance of #rrggbb (WCAG) */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Whichever of white and the near-black text has the better contrast on `bg` (#rrggbb). */
function readableOn(bg: string): string {
  const L = luminance(bg)
  const white = 1.05 / (L + 0.05)
  const dark = (L + 0.05) / (luminance('#0d1117') + 0.05)
  return white > dark ? '#ffffff' : '#0d1117'
}

/**
 * The colours for a field. A colour chosen for the role in HQ (#rrggbb) wins; without one, the words in the
 * field decide, and any other field gets the neutral grey.
 */
export function roleLabelStyle(label: string, color?: string): RoleLabelStyle {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return { bg: color, fg: readableOn(color) }
  const text = label.toLowerCase()
  for (const [pattern, style] of FIELDS) if (pattern.test(text)) return style
  return OTHER
}

/** What is drawn: trimmed, one line, cut to ROLE_LABEL_MAX. Empty when there is nothing to say. */
export function roleLabelText(label: string | undefined): string {
  const text = (label ?? '').replace(/\s+/g, ' ').trim()
  return text.length > ROLE_LABEL_MAX ? `${text.slice(0, ROLE_LABEL_MAX - 1)}…` : text
}
