import { useEffect, useRef } from 'react'
import { SolarSystemView } from './SolarSystemView.js'
import { GraphView } from './GraphView.js'
import { CoreView } from './CoreView.js'
import { GlobeView } from './GlobeView.js'
import { BrainView } from './BrainView.js'
import { StacksView } from './StacksView.js'
import { AtlasView } from './AtlasView.js'
import { ArchiveCityView } from './ArchiveCityView.js'
import { NexusView } from './NexusView.js'
import { EcoView } from './EcoView.js'

const VIEWS = { brain: BrainView, nexus: NexusView, atlas: AtlasView, stacks: StacksView, city: ArchiveCityView, eco: EcoView, solar: SolarSystemView, constellation: GraphView, core: CoreView, globe: GlobeView }

export function SpaceCanvas({ view, graph, activeIds, onSelect, onHover, showAllLinks = true, showLabels = false, resetNonce = 0, paused = false, focus = null, settings = null, dueCount = 0 }) {
  const ref = useRef(null)
  const inst = useRef(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings // mount effect below reads the latest
  const dueRef = useRef(dueCount)
  dueRef.current = dueCount

  useEffect(() => {
    const View = VIEWS[view] || BrainView
    inst.current = new View(ref.current, { onSelect, onHover, settings: settingsRef.current })
    inst.current.update(graph)
    inst.current.setActive(activeIds)
    inst.current.setLinksMode?.(showAllLinks)
    inst.current.setLabels?.(showLabels)
    inst.current.setDue?.(dueRef.current)
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
    // update() rebuilds lines/pulses with their stock look — re-apply the
    // user's live settings so they survive every graph refresh
    inst.current?.setSettings?.(settingsRef.current)
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

  useEffect(() => {
    if (focus?.id) inst.current?.focus?.(focus.id)
  }, [focus])

  useEffect(() => {
    inst.current?.setSettings?.(settings)
  }, [settings])

  useEffect(() => {
    inst.current?.setDue?.(dueCount)
  }, [dueCount])

  return <div className="canvas" ref={ref} />
}
