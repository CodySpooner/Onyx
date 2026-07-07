import { useEffect, useState } from 'react'
import { bus } from '../lib/bus.mjs'
import { HoverCard } from './HoverCard.jsx'

// Owns the 60fps hover stream so App never re-renders on pointermove.
export function HoverLayer({ graph }) {
  const [hover, setHover] = useState(null)
  useEffect(() => bus.on('hover', setHover), [])
  return <HoverCard hover={hover} graph={graph} />
}
