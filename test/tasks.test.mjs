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
