import { useEffect, useRef, useState } from 'react'

export function QuickCapture({ targetLabel, onCapture, onClose }) {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const inputRef = useRef(null)
  const busy = useRef(false) // blocks double-Enter / key auto-repeat
  useEffect(() => inputRef.current?.focus(), [])

  const submit = async () => {
    if (busy.current) return
    const t = text.trim()
    if (!t) return onClose()
    busy.current = true
    const ok = await onCapture(t)
    if (ok === false) {
      busy.current = false // capture failed — keep the text, let them retry
      return
    }
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
