// FNV-1a 32-bit — shared deterministic hash (resurface seeding, SRS card ids)
export function fnv1a32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
