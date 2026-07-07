import { useEffect, useRef, useState } from 'react'

export function QuickCapture({ targetLabel, onCapture, onClose }) {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => inputRef.current?.focus(), [])

  const submit = async () => {
    const t = text.trim()
    if (!t) return onClose()
    await onCapture(t)
    setFlash(true)
    setTimeout(onClose, 380)
  }

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className={`capture glass ${flash ? 'flash' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="capture-input"
          placeholder="Capture a thought…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="capture-foot u-label">
          {flash ? '✓ CAPTURED' : `↵ APPEND TO ${targetLabel} · ESC CANCEL`}
        </div>
      </div>
    </div>
  )
}
