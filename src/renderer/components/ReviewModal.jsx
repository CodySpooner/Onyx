import { useEffect, useState } from 'react'

// Glass flip-card SRS review. Space/click = flip · 1/2/3 = grade · Esc = close
export function ReviewModal({ due, onGrade, onClose }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = due[idx]

  useEffect(() => {
    const onKey = (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') return onClose()
      if (!card) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        onGrade(card, +e.key)
        setFlipped(false)
        if (idx + 1 >= due.length) onClose()
        else setIdx(idx + 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [card, flipped, idx, due.length, onGrade, onClose])

  if (!card) return null
  const gradeAnd = (g) => {
    onGrade(card, g)
    setFlipped(false)
    if (idx + 1 >= due.length) onClose()
    else setIdx(idx + 1)
  }

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="review glass" onMouseDown={(e) => e.stopPropagation()}>
        <div className="u-label rv-head">
          REVIEW · {idx + 1} / {due.length}
        </div>
        <div className={`rv-flip ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
          <div className="rv-inner">
            <div className="rv-face rv-front">
              <div className="rv-text">{card.question}</div>
              <div className="rv-hint u-label">SPACE TO FLIP</div>
            </div>
            <div className="rv-face rv-back">
              <div className="rv-text">{card.answer}</div>
            </div>
          </div>
        </div>
        {flipped ? (
          <div className="rv-grades">
            <button className="rv-g again" onClick={() => gradeAnd(1)}>1 AGAIN</button>
            <button className="rv-g good" onClick={() => gradeAnd(2)}>2 GOOD</button>
            <button className="rv-g easy" onClick={() => gradeAnd(3)}>3 EASY</button>
          </div>
        ) : (
          <div className="rv-src u-label">{card.noteId.split('/').pop()}</div>
        )}
      </div>
    </div>
  )
}
