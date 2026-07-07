import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTasks, openTasks } from '../src/renderer/lib/tasks.mjs'

test('line indices count frontmatter lines (match disk)', () => {
  const raw = '---\ntitle: x\n---\n- [ ] first task\n'
  const tasks = parseTasks(raw, 'n.md')
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].line, 3)
  assert.equal(tasks[0].text, 'first task')
  assert.equal(tasks[0].done, false)
})

test('variants: star bullets, uppercase X, nesting; rejects non-tasks', () => {
  const raw = ['* [ ] star', '- [X] caps done', '  - [x] nested done', '- [] malformed', '-[ ] nospace', 'plain'].join('\n')
  const tasks = parseTasks(raw, 'n.md')
  assert.deepEqual(tasks.map((t) => [t.text, t.done]), [
    ['star', false],
    ['caps done', true],
    ['nested done', true]
  ])
})

test('skips fenced code blocks', () => {
  const raw = '- [ ] real\n```\n- [ ] fake in fence\n```\n- [x] after'
  const tasks = parseTasks(raw, 'n.md')
  assert.deepEqual(tasks.map((t) => t.text), ['real', 'after'])
})

test('openTasks filters done and sorts by source mtime desc', () => {
  const notes = [
    { title: 'Old', mtime: 100, tasks: parseTasks('- [ ] old open\n- [x] old done', 'a') },
    { title: 'New', mtime: 200, tasks: parseTasks('- [ ] new open', 'b') }
  ]
  const open = openTasks(notes)
  assert.deepEqual(open.map((t) => t.text), ['new open', 'old open'])
  assert.equal(open[0].title, 'New')
})

// ── toggleTask (content-guarded write-back) ─────────────────────
import { toggleTask } from '../src/renderer/lib/tasks.mjs'

test('toggleTask: flips at expected line, both directions, reports nowDone', () => {
  const raw = '# t\n- [ ] call bookie\n- [x] set lines\n'
  const on = toggleTask(raw, 1, '- [ ] call bookie')
  assert.equal(on.next, '# t\n- [x] call bookie\n- [x] set lines\n')
  assert.equal(on.nowDone, true)
  const off = toggleTask(raw, 2, '- [x] set lines')
  assert.equal(off.next, '# t\n- [ ] call bookie\n- [ ] set lines\n')
  assert.equal(off.nowDone, false)
})

test('toggleTask: relocates by exact match when lines shifted', () => {
  const raw = 'new intro line\n# t\n- [ ] call bookie\n'
  const r = toggleTask(raw, 1, '- [ ] call bookie') // stale index
  assert.ok(r.next.includes('- [x] call bookie'))
})

test('toggleTask: refuses on missing or duplicate expected lines', () => {
  assert.equal(toggleTask('- [ ] other\n', 0, '- [ ] gone'), null)
  assert.equal(toggleTask('- [ ] dup\n- [ ] dup\n', 5, '- [ ] dup'), null)
})

test('toggleTask: CRLF preserved; indented and starred bullets work', () => {
  const raw = 'a\r\n  * [ ] nested\r\n'
  const r = toggleTask(raw, 1, '  * [ ] nested')
  assert.equal(r.next, 'a\r\n  * [x] nested\r\n')
})

test('toggleTask: text containing brackets only flips the checkbox', () => {
  const raw = '- [x] fix [ ] placeholder later\n'
  const r = toggleTask(raw, 0, '- [x] fix [ ] placeholder later')
  assert.equal(r.next, '- [ ] fix [ ] placeholder later\n')
})
