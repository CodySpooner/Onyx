// Pure layout math for the VISTA views. No THREE, no DOM — node --test covers
// the spacing invariants that make these views browsable (the whole point).

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// ── Stacks (Folder Shelf Hall) ──────────────────────────────────
// 2D grid bent into a shallow arc: zero occlusion by construction.
export const SHELF = { COL_W: 48, ROW_H: 4.6, MAX_ROWS: 18, TOP_Y: 42, LANE_W: 20 }

// folders: [{id}], notes: [{id, folder, title}]
// → { pos: Map<id,{x,y,z}>, columns: [{folderId, x, z, count, lanes}] }
export function shelfLayout(folders, notes) {
  const { COL_W, ROW_H, MAX_ROWS, TOP_Y, LANE_W } = SHELF
  const pos = new Map()
  const columns = []
  const byFolder = new Map(folders.map((f) => [f.id, []]))
  for (const n of notes) {
    if (!byFolder.has(n.folder)) byFolder.set(n.folder, [])
    byFolder.get(n.folder).push(n)
  }
  const folderIds = [...byFolder.keys()]
  const mid = (folderIds.length - 1) / 2
  folderIds.forEach((fid, i) => {
    const xBase = (i - mid) * COL_W
    const z = 0.0011 * xBase * xBase // ends recede — hall curvature
    const members = byFolder.get(fid).slice().sort((a, b) => (a.title < b.title ? -1 : 1))
    const lanes = Math.max(1, Math.ceil(members.length / MAX_ROWS))
    members.forEach((n, k) => {
      const lane = Math.floor(k / MAX_ROWS)
      pos.set(n.id, {
        x: xBase + lane * LANE_W - ((lanes - 1) * LANE_W) / 2,
        y: TOP_Y - (k % MAX_ROWS) * ROW_H,
        z
      })
    })
    columns.push({ folderId: fid, x: xBase, z, count: members.length, lanes })
  })
  return { pos, columns }
}

// ── ArchiveCity (district tower grid) ───────────────────────────
// Centered square grid with wide streets; cells sorted center-out so the
// tallest tower (assigned first) crowns the district.
export function districtGrid(m, plot = 7.0) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(m)))
  const rows = Math.max(1, Math.ceil(m / cols))
  const cells = []
  for (let k = 0; k < cols * rows; k++) {
    cells.push({
      gx: ((k % cols) - (cols - 1) / 2) * plot,
      gz: (Math.floor(k / cols) - (rows - 1) / 2) * plot
    })
  }
  cells.sort((a, b) => Math.abs(a.gx) + Math.abs(a.gz) - (Math.abs(b.gx) + Math.abs(b.gz)))
  return cells.slice(0, m)
}

// ── Atlas (Cluster Archipelago) ─────────────────────────────────
// 17 islands with wide gulfs; every label owns its footprint.
export const ATLAS = { FOOT: 30, GULF: 45, ORPHAN_PAD: 100 }

// ids: [id], clusterOf: Map<id, ci>, degOf: Map<id, degree>
// → { pos: Map<id,{x,y,z}>, islands: [{ci, cx, cz, R, hubId}], orphanR }
export function archipelagoLayout(ids, clusterOf, degOf) {
  const { FOOT, GULF, ORPHAN_PAD } = ATLAS
  const pos = new Map()
  const byCluster = new Map()
  const orphans = []
  for (const id of ids) {
    const ci = clusterOf.get(id)
    if (ci == null || ci < 0) {
      orphans.push(id)
      continue
    }
    if (!byCluster.has(ci)) byCluster.set(ci, [])
    byCluster.get(ci).push(id)
  }

  // islands sorted by size desc so the biggest sits center of the spiral
  const islands = [...byCluster.entries()]
    .map(([ci, members]) => ({
      ci,
      members: members.slice().sort((a, b) => (degOf.get(b) || 0) - (degOf.get(a) || 0)),
      R: 0.62 * FOOT * Math.sqrt(members.length) + FOOT
    }))
    .sort((a, b) => b.members.length - a.members.length)

  const S = (islands[0]?.R || FOOT) + GULF
  islands.forEach((isl, i) => {
    isl.cx = S * Math.sqrt(i + 0.7) * Math.cos(i * GOLDEN)
    isl.cz = S * Math.sqrt(i + 0.7) * Math.sin(i * GOLDEN)
  })

  // relax island centers apart until every gulf is honored
  for (let pass = 0; pass < 20; pass++) {
    for (let a = 0; a < islands.length; a++) {
      for (let b = a + 1; b < islands.length; b++) {
        const A = islands[a]
        const B = islands[b]
        const dx = B.cx - A.cx
        const dz = B.cz - A.cz
        const d = Math.hypot(dx, dz) || 0.001
        const want = A.R + B.R + GULF
        if (d < want) {
          const push = (want - d) / 2
          const ux = dx / d
          const uz = dz / d
          A.cx -= ux * push
          A.cz -= uz * push
          B.cx += ux * push
          B.cz += uz * push
        }
      }
    }
  }

  // sunflower spiral inside each island; hubs (deg-sorted first) sit center
  for (const isl of islands) {
    isl.hubId = isl.members[0]
    isl.members.forEach((id, j) => {
      const r = 0.62 * FOOT * Math.sqrt(j)
      const th = j * GOLDEN
      pos.set(id, {
        x: isl.cx + Math.cos(th) * r,
        y: Math.min(degOf.get(id) || 0, 12) * 0.8,
        z: isl.cz + Math.sin(th) * r
      })
    })
  }

  // orphan reef: a ring beyond the furthest island
  let extent = 0
  for (const isl of islands) extent = Math.max(extent, Math.hypot(isl.cx, isl.cz) + isl.R)
  const orphanR = extent + ORPHAN_PAD
  const step = (FOOT * 1.2) / orphanR // arc length FOOT*1.2 → angle step
  orphans.forEach((id, k) => {
    const th = k * Math.max(step, (Math.PI * 2) / Math.max(orphans.length, 1))
    pos.set(id, { x: Math.cos(th) * orphanR, y: 0, z: Math.sin(th) * orphanR })
  })

  return { pos, islands: islands.map(({ ci, cx, cz, R, hubId }) => ({ ci, cx, cz, R, hubId })), orphanR }
}
