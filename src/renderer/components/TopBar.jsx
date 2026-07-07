import { ViewSwitcher } from '../views/ViewSwitcher.jsx'
import { Kbd } from './chrome.jsx'

const MODES = [
  { id: 'brain', label: 'BRAIN' },
  { id: 'dashboard', label: 'DASHBOARD' },
  { id: 'skills', label: 'SKILLS' }
]

export function TopBar({ mode, onMode, view, onView, onSearch, skillTab }) {
  return (
    <header className="topbar">
      <span className="brand">◑ ONYX</span>
      <nav className="mtabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mtab ${mode === m.id ? 'on' : ''}`}
            onClick={() => onMode(m.id)}
          >
            {m.id === 'skills' && skillTab ? (
              <span className="mtab-skill">
                SKILLS · LV {skillTab.level}
                <span className="rule-progress mtab-xp">
                  <i style={{ width: `${Math.round((skillTab.levelPct || 0) * 100)}%` }} />
                </span>
              </span>
            ) : (
              m.label
            )}
          </button>
        ))}
      </nav>
      <div className="spacer" />
      <button className="searchbtn" onClick={onSearch}>
        <span className="searchbtn-glyph">⌕</span> SEARCH <Kbd>Ctrl K</Kbd>
      </button>
      {mode === 'brain' && (
        <span className="lens">
          <span className="u-label">LENS</span>
          <ViewSwitcher view={view} onChange={onView} />
        </span>
      )}
    </header>
  )
}
