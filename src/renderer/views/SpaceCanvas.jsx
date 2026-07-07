import { useEffect, useRef } from 'react'
import { SolarSystemView } from './SolarSystemView.js'
import { GraphView } from './GraphView.js'
import { CoreView } from './CoreView.js'
import { GlobeView } from './GlobeView.js'
import { BrainView } from './BrainView.js'

const VIEWS = { brain: BrainView, solar: SolarSystemView, constellation: GraphView, core: CoreView, globe: GlobeView }

export function SpaceCanvas({ view, graph, activeIds, onSelect, onHover, showAllLinks = true, showLabels = false, resetNonce = 0, paused = false }) {
  const ref = useRef(null)
  const inst = useRef(null)

  useEffect(() => {
    const View = VIEWS[view] || BrainView
    inst.current = new View(ref.current, { onSelect, onHover })
    inst.current.update(graph)
    inst.current.setActive(activeIds)
    inst.current.setLinksMode?.(showAllLinks)
    inst.current.setLabels?.(showLabels)
    inst.current.setPaused?.(paused)
    return () => {
      inst.current?.dispose()
      inst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, resetNonce])

  useEffect(() => {
    inst.current?.update(graph)
    inst.current?.setActive(activeIds)
  }, [graph])

  useEffect(() => {
    inst.current?.setActive(activeIds)
  }, [activeIds])

  useEffect(() => {
    inst.current?.setLinksMode?.(showAllLinks)
  }, [showAllLinks])

  useEffect(() => {
    inst.current?.setLabels?.(showLabels)
  }, [showLabels])

  useEffect(() => {
    inst.current?.setPaused?.(paused)
  }, [paused])

  return <div className="canvas" ref={ref} />
}
