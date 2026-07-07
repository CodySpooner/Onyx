// Line-level LCS diff for the Time Capsule. Guarded: beyond ~4M cells the
// quadratic table isn't worth it — return { big: true } and let the UI show
// full before/after instead of a diff.

export function diffLines(a, b, maxCells = 4e6) {
  const A = String(a ?? '').split(/\r?\n/)
  const B = String(b ?? '').split(/\r?\n/)
  if (A.length * B.length > maxCells) return { big: true, ops: [] }

  const n = A.length
  const m = B.length
  // LCS length table (single Uint32 buffer, row-major (n+1)x(m+1))
  const W = m + 1
  const T = new Uint32Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      T[i * W + j] = A[i] === B[j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ type: 'same', text: A[i] })
      i++
      j++
    } else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) {
      ops.push({ type: 'del', text: A[i] })
      i++
    } else {
      ops.push({ type: 'add', text: B[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: A[i++] })
  while (j < m) ops.push({ type: 'add', text: B[j++] })
  return { big: false, ops }
}

export function diffStats(ops) {
  let add = 0
  let del = 0
  for (const o of ops) {
    if (o.type === 'add') add++
    else if (o.type === 'del') del++
  }
  return { add, del }
}
