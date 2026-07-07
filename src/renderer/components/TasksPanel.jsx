import { useMemo } from 'react'
import { openTasks } from '../lib/tasks.mjs'

// Vault-wide open tasks. The checkbox writes back (content-guarded toggle in
// App); the text still navigates. Owns its header so mounts never show a
// dangling label when the vault has zero open tasks.
export function TasksPanel({ graph, onSelect, onToggle, pending, limit = 8, header = true, showEmpty = false }) {
  const tasks = useMemo(() => openTasks(graph.notes), [graph])
  if (!tasks.length) return showEmpty ? <div className="dp-sub ok">no open tasks — inbox zero</div> : null
  return (
    <div className="taskspanel">
      {header && <div className="u-label taskspanel-h">TASKS · {tasks.length} OPEN</div>}
      {tasks.slice(0, limit).map((t) => {
        const isPending = pending?.has(`${t.noteId}:${t.line}`)
        return (
          <div key={`${t.noteId}:${t.line}`} className={`task-row${isPending ? ' pending' : ''}`}>
            {onToggle ? (
              <button className="task-box live" data-tip="Mark done" disabled={isPending} onClick={() => onToggle(t)}>
                {isPending ? '◌' : '▢'}
              </button>
            ) : (
              <span className="task-box">▢</span>
            )}
            <button className="task-go" onClick={() => onSelect(t.noteId)}>
              <span className="task-text">{t.text}</span>
              <span className="task-src">{t.title}</span>
            </button>
          </div>
        )
      })}
      {tasks.length > limit && <div className="task-more u-label">+{tasks.length - limit} MORE</div>}
    </div>
  )
}
