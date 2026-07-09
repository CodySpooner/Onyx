const ICONS = {
  links: (
    <path
      d="M9 15l6-6M8.5 12.5l-1.8 1.8a3 3 0 104.2 4.2l1.8-1.8M15.5 11.5l1.8-1.8a3 3 0 10-4.2-4.2l-1.8 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
  labels: (
    <path
      d="M4 5h9l7 7-7 7-9-9V5z M9.5 9.5h.01"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),
  tune: (
    <path
      d='M4 8h10M18 8h2M4 16h2M10 16h10M14 5v6M8 13v6'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
    />
  ),
  reset: (
    <path
      d="M19 12a7 7 0 11-2-4.9M19 4v4h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  path: (
    <path
      d="M6 18a3 3 0 100-6 3 3 0 000 6zM18 12a3 3 0 100-6 3 3 0 000 6zM8.5 15.5l7-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

function TBtn({ icon, on, onClick, title }) {
  return (
    <button className={`tbtn tip-left ${on ? 'on' : ''}`} onClick={onClick} data-tip={title}>
      <svg viewBox="0 0 24 24" width="20" height="20">
        {ICONS[icon]}
      </svg>
    </button>
  )
}

export function HudToolbar({ showAllLinks, onLinks, showLabels, onLabels, onReset, onTune, tuneOn = false, onPath, pathOn = false }) {
  return (
    <aside className="hud-right glass">
      <TBtn icon="links" on={showAllLinks} onClick={onLinks} title="Toggle links" />
      <TBtn icon="labels" on={showLabels} onClick={onLabels} title="Toggle labels" />
      <TBtn icon="path" on={pathOn} onClick={onPath} title="Find path between two notes" />
      <TBtn icon="tune" on={tuneOn} onClick={onTune} title="Customize graphs" />
      <TBtn icon="reset" onClick={onReset} title="Reset camera" />
    </aside>
  )
}
