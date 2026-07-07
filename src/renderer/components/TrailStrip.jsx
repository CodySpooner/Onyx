import { CLUSTER_PALETTE } from '../lib/clusters.mjs'

// Session trail — a breadcrumb of where your head has been. Chips double as
// 3D navigation history: click one and the camera flies back to that thought.
export function TrailStrip({ trail, graph, clusters, current, onOpen, onClear }) {
  const titleOf = (id) => graph.notes.find((n) => n.id === id)?.title || id.split('/').pop()
  const colorOf = (id) => {
    const ci = clusters?.clusterOf?.get(id)
    return ci >= 0 ? CLUSTER_PALETTE[ci % CLUSTER_PALETTE.length] : '#4a5470'
  }
  return (
    <div className="trailstrip glass">
      <span className="u-label ts-label">TRAIL</span>
      <div className="ts-chips">
        {trail.map((e) => (
          <button
            key={e.id}
            className={`ts-chip${e.id === current ? ' on' : ''}`}
            onClick={() => onOpen(e.id)}
            title={titleOf(e.id)}
          >
            <i style={{ background: colorOf(e.id) }} />
            {titleOf(e.id)}
          </button>
        ))}
      </div>
      <button className="ts-clear u-label" onClick={onClear}>
        CLEAR
      </button>
    </div>
  )
}
