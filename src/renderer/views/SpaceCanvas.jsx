import { useEffect, useRef } from 'react'
import { SolarSystemView } from './SolarSystemView.js'
import { GraphView } from './GraphView.js'
import { CoreView } from './CoreView.js'
import { GlobeView } from './GlobeView.js'

const VIEWS = { solar: SolarSystemView, constellation: GraphView, core: CoreView, globe: GlobeView }

export function SpaceCanvas({ view, graph, activeIds, onSelect, showAllLinks = true, showLabels = false }) {
  const ref = useRef(null)
  const inst = useRef(null)

  useEffect(() => {
    const View = VIEWS[view] || SolarSystemView
    inst.current = new View(ref.current, { onSelect })
    inst.current.update(graph)
    inst.current.setActive(activeIds)
    inst.current.setLinksMode?.(showAllLinks)
    inst.current.setLabels?.(showLabels)
    return () => {
      inst.current?.dispose()
      inst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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

  return <div className="canvas" ref={ref} />
}
