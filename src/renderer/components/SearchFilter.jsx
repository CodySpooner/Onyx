import { useMemo } from 'react'

const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort()

export function SearchFilter({ graph, filter, onChange }) {
  const facets = useMemo(
    () => ({
      folders: graph.folders.map((f) => f.id),
      types: uniq(graph.notes.map((n) => n.type)),
      tags: uniq(graph.notes.flatMap((n) => n.tags || []))
    }),
    [graph]
  )

  const toggle = (key, val) => {
    const set = new Set(filter[key])
    if (set.has(val)) set.delete(val)
    else set.add(val)
    onChange({ ...filter, [key]: [...set] })
  }

  const Chips = ({ k, values }) =>
    values.length ? (
      <div className="facet">
        {values.map((v) => (
          <button
            key={String(v)}
            className={`chip toggle ${filter[k].includes(v) ? 'on' : ''}`}
            onClick={() => toggle(k, v)}
          >
            {String(v)}
          </button>
        ))}
      </div>
    ) : null

  const active = filter.q || filter.folders.length || filter.types.length || filter.statuses.length || filter.tags.length

  return (
    <div className="filters">
      <input
        className="search"
        placeholder="Search notes…"
        value={filter.q}
        onChange={(e) => onChange({ ...filter, q: e.target.value })}
      />
      <Chips k="folders" values={facets.folders} />
      <Chips k="types" values={facets.types} />
      <Chips k="tags" values={facets.tags} />
      {active ? (
        <button
          className="chip clear"
          onClick={() => onChange({ q: '', folders: [], types: [], statuses: [], tags: [] })}
        >
          clear
        </button>
      ) : null}
    </div>
  )
}
