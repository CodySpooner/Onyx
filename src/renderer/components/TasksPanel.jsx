import { useMemo } from 'react'
import { openTasks } from '../lib/tasks.mjs'

// Read-only vault-wide open tasks. Row click opens the source note.
export function TasksPanel({ graph, onSelect, limit = 8 }) {
  const tasks = useMemo(() => openTasks(graph.notes), [graph])
  if (!tasks.length) return null
  return (
    <div className="taskspanel">
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
