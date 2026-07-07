// Link-flow motes for the NEXUS CORE lens. Pure math (no three import) so
// the curve table and mote kinematics are node --test coverable.

function cr(p0, p1, p2, p3, t) {
  // standard Catmull-Rom basis
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

// triples: flat [ax,ay,az, mx,my,mz, bx,by,bz] per link → sampled table
// Float32Array(nLinks * samples * 3). Curve passes A → M → B.
export function buildCurveTable(triples, samples = 24) {
  const n = Math.floor(triples.length / 9)
  const out = new Float32Array(n * samples * 3)
  for (let i = 0; i < n; i++) {
    const o = i * 9
    const A = [triples[o], triples[o + 1], triples[o + 2]]
    const M = [triples[o + 3], triples[o + 4], triples[o + 5]]
    const B = [triples[o + 6], triples[o + 7], triples[o + 8]]
    for (let s = 0; s < samples; s++) {
      const u = s / (samples - 1)
      // two CR spans (A→M with phantom A, M→B with phantom B), stitched at u=0.5
      let x, y, z
      if (u <= 0.5) {
        const t = u * 2
        x = cr(A[0], A[0], M[0], B[0], t)
        y = cr(A[1], A[1], M[1], B[1], t)
        z = cr(A[2], A[2], M[2], B[2], t)
      } else {
        const t = (u - 0.5) * 2
        x = cr(A[0], M[0], B[0], B[0], t)
        y = cr(A[1], M[1], B[1], B[1], t)
        z = cr(A[2], M[2], B[2], B[2], t)
      }
      const p = (i * samples + s) * 3
      out[p] = x
      out[p + 1] = y
      out[p + 2] = z
    }
  }
  return out
}

// mote: { seg, t, speed }. Advances along its curve with a core-gravity
// boost (faster near the origin — thoughts accelerate into the heart).
// Writes the interpolated position into out[0..2]; returns the boost used.
export function advanceMote(mote, dt, nSeg, samples, table, out) {
  const base = mote.seg * samples * 3
  const idxF = Math.min(samples - 1.001, mote.t * (samples - 1))
  const i0 = Math.floor(idxF)
  const f = idxF - i0
  const a = base + i0 * 3
  const b = a + 3
  const x = table[a] + (table[b] - table[a]) * f
  const y = table[a + 1] + (table[b + 1] - table[a + 1]) * f
  const z = table[a + 2] + (table[b + 2] - table[a + 2]) * f
  out[0] = x
  out[1] = y
  out[2] = z
  const d2 = x * x + y * y + z * z
  const boost = 1 + 2.2 / (1 + d2 / 900)
  mote.t += mote.speed * boost * dt
  while (mote.t > 1) {
    mote.t -= 1
    mote.seg = (mote.seg + 7) % Math.max(1, nSeg)
  }
  return boost
}
