import { useMemo } from 'react'
import { openTasks } from '../lib/tasks.mjs'

// Read-only vault-wide open tasks. Owns its header so mounts never show a
// dangling label when the vault has zero open tasks.
export function TasksPanel({ graph, onSelect, limit = 8, header = true, showEmpty = false }) {
  const tasks = useMemo(() => openTasks(graph.notes), [graph])
  if (!tasks.length) return showEmpty ? <div className="dp-sub ok">no open tasks — inbox zero</div> : null
  return (
    <div className="taskspanel">
      {header && <div className="u-label taskspanel-h">TASKS · {tasks.length} OPEN</div>}
      {tasks.slice(0, limit).map((t) => (
        <button key={`${t.noteId}:${t.line}`} className="task-row" onClick={() => onSelect(t.noteId)}>
          <span className="task-box">▢</span>
          <span className="task-text">{t.text}</span>
          <span className="task-src">{t.title}</span>
        </button>
      ))}
      {tasks.length > limit && <div className="task-more u-label">+{tasks.length - limit} MORE</div>}
    </div>
  )
}
