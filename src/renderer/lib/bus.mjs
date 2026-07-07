// Tiny app-wide event emitter. Lets leaf components (HoverLayer, Toasts)
// own high-frequency state so App never re-renders on pointermove.
const m = new Map()

export const bus = {
  on(ev, fn) {
    if (!m.has(ev)) m.set(ev, new Set())
    m.get(ev).add(fn)
    return () => m.get(ev)?.delete(fn)
  },
  emit(ev, data) {
    m.get(ev)?.forEach((fn) => fn(data))
  }
}
