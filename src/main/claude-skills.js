// Scans the machine's installed Claude skills for the ARSENAL showcase.
// Thin fs walker — all parsing/grouping logic lives (tested) in
// src/renderer/lib/installed-skills.mjs.
import os from 'node:os'
import path from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import matter from 'gray-matter'
import { cmpVersion, blurb, groupSkills } from '../renderer/lib/installed-skills.mjs'

function parseSkillMd(file, dirName) {
  let name = dirName
  let description = ''
  try {
    const raw = readFileSync(file, 'utf8')
    try {
      const fm = matter(raw).data || {}
      name = String(fm.name || '').trim() || dirName
      description = String(fm.description || '').trim().slice(0, 600)
    } catch {
      /* malformed frontmatter → dirName + empty description */
    }
  } catch {
    return null // no SKILL.md → not a skill dir
  }
  return { name, description, blurb: blurb(description) }
}

// single-skill plugins declare themselves in a root skill.json instead of a
// skills/<name>/SKILL.md tree (e.g. ui-ux-pro-max) — parse that shape too
function parseSkillJson(file, fallbackName) {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    const name = String(j.name || j.displayName || '').trim() || fallbackName
    const description = String(j.description || '').trim().slice(0, 600)
    return { name, description, blurb: blurb(description) }
  } catch {
    return null // no/invalid skill.json
  }
}

function listDirs(dir) {
  // no dirent filtering: skill dirs are often junctions/symlinks on Windows
  // (37 of this machine's 40 are) — the SKILL.md read try/catch is the filter
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export function scanInstalledSkills() {
  const home = os.homedir()
  const skills = []

  // user skills: ~/.claude/skills/<name>/SKILL.md
  const userRoot = path.join(home, '.claude', 'skills')
  for (const dir of listDirs(userRoot)) {
    const parsed = parseSkillMd(path.join(userRoot, dir, 'SKILL.md'), dir)
    if (parsed) skills.push({ id: 'user:' + dir, ...parsed, source: 'user', plugin: null, owner: null, version: null })
  }

  // plugin skills: ~/.claude/plugins/cache/<owner>/<plugin>/<version>/skills/<name>/SKILL.md
  const cacheRoot = path.join(home, '.claude', 'plugins', 'cache')
  for (const owner of listDirs(cacheRoot)) {
    for (const plugin of listDirs(path.join(cacheRoot, owner))) {
      const versions = listDirs(path.join(cacheRoot, owner, plugin)).sort(cmpVersion).reverse()
      for (const version of versions) {
        const verDir = path.join(cacheRoot, owner, plugin, version)
        const names = listDirs(path.join(verDir, 'skills'))
        if (names.length) {
          for (const dir of names) {
            const parsed = parseSkillMd(path.join(verDir, 'skills', dir, 'SKILL.md'), dir)
            if (parsed) skills.push({ id: `plugin:${plugin}/${dir}`, ...parsed, source: 'plugin', plugin, owner, version })
          }
          break // one version per plugin ever reaches the payload
        }
        // no skills/ tree → single-skill plugin (root skill.json or SKILL.md)?
        const single = parseSkillJson(path.join(verDir, 'skill.json'), plugin) || parseSkillMd(path.join(verDir, 'SKILL.md'), plugin)
        if (single) {
          skills.push({ id: 'plugin:' + plugin, ...single, source: 'plugin', plugin, owner, version })
          break
        }
        // commands-only or partial cache → try the next-highest version
      }
    }
  }

  return { scannedAt: Date.now(), skills: groupSkills(skills) }
}
