import { test } from 'node:test'
import assert from 'node:assert/strict'
import { easeOutCubic, shortPath, emaFps, fpsTier, bootLines } from '../src/renderer/lib/hud.mjs'

test('easeOutCubic endpoints', () => {
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  assert.ok(easeOutCubic(0.5) > 0.5)
})

test('shortPath no-op when short, middle-ellipsis when long', () => {
  assert.equal(shortPath('C:\\vault', 42), 'C:\\vault')
  const long = 'C:\\Users\\Xody2\\OneDrive\\Desktop\\Xody Bets Website Vault\\deep\\deeper'
  const s = shortPath(long, 42)
  assert.ok(s.length <= 42, `${s.length} <= 42`)
  assert.ok(s.includes('…'))
  assert.ok(s.startsWith('C:\\Users'))
  assert.ok(s.endsWith('deeper'))
})

test('emaFps converges to 60 at 16.67ms', () => {
  let fps = 30
  for (let i = 0; i < 200; i++) fps = emaFps(fps, 1000 / 60)
  assert.ok(Math.abs(fps - 60) < 0.5, String(fps))
})

test('fpsTier boundaries', () => {
  assert.equal(fpsTier(60), 'ok')
  assert.equal(fpsTier(50), 'ok')
  assert.equal(fpsTier(49.9), 'warn')
  assert.equal(fpsTier(30), 'warn')
  assert.equal(fpsTier(29), 'err')
})

test('bootLines: 6 lines, strictly increasing times', () => {
  const lines = bootLines({ path: 'C:\\v', notes: 103, links: 533, clusters: 17 })
  assert.equal(lines.length, 6)
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].t > lines[i - 1].t)
  assert.match(lines[1].text, /103/)
  assert.match(lines[5].text, /OK$/)
})
