/**
 * Brand icon for a skill-manager agent (BH round, Plan C).
 *
 * Hand-written in the aek-web pattern (P16 — the reference's AgentIcon source
 * is NOT copied): a fixed rounded bordered box that holds either the agent's
 * MIT brand glyph (resolved through `agentIconUrl`) or a globe fallback when
 * the agent has no brand icon. The reference renders a 20×20 box with the
 * glyph `object-contain` inside; we mirror that shape with aek-web tokens.
 */
import { useState } from 'react'

import { Icon } from '@/Icons'
import { cn } from '@/lib/utils'

import { agentIconUrl } from '../domain/agentIcons'

interface AgentIconProps {
  /** The aeksm agent catalog id (kebab-case, e.g. `claude-code`). */
  agentId: string
  /** Optional accessible label (the agent display name). */
  label?: string
  /** Box size in px; defaults to the reference's 20px row glyph. */
  size?: number
  className?: string
}

export function AgentIcon({ agentId, label, size = 20, className }: AgentIconProps) {
  const [broken, setBroken] = useState(false)
  const url = agentIconUrl(agentId)
  const showImage = url !== null && !broken

  return (
    <span
      aria-hidden={label === undefined ? true : undefined}
      role={label !== undefined ? 'img' : undefined}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary/60',
        className,
      )}
      style={{ height: size, width: size }}
    >
      {showImage ? (
        <img
          src={url}
          alt={label ?? agentId}
          onError={() => { setBroken(true) }}
          className="h-full w-full object-contain"
        />
      ) : (
        <Icon name="globe" size={Math.round(size * 0.5)} className="text-muted-foreground" />
      )}
    </span>
  )
}
