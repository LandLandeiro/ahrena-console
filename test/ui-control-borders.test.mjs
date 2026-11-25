// #749: a field, a checkbox and a background-less button are drawn with --border-control (3:1),
// #749: never with --border, which is only the divider (ADR-0028, docs/design.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const UI = join(ROOT, 'packages/nucleo/ui')

// #749: controls the screens render, checked against the JS that builds them (tag or role), not the name.
// #749: a pattern matches the last compound of a selector: `.x` is the class, `select.x` only the select.
const CONTROLS = [
  '.ac-select', '.ac-field', '.ac-input', '.ac-text',
  '.an-dl-select', '.an-dl-field',
  '.feed-field', '.feed-selector',
  '.hist-search', '.ns-folder', '.prj-milestone', '.repo-field', '.dec-search',
  '.adr-field', '.adr-select', '.ins-field', '.pp-search', '.pp-field',
  '.sd-select', '.sd-field', '.sd-search', '.sd-date', 'select.sd-chip',
  '.sm-input', '.dk-find', '.fwi-input', '.fwi-issue', '.wb-select',
  '.wb-edit-title', '.wb-edit-input', '.wb-edit-textarea', '.wb-edit-select',
  '.field',
  '.fwi-box', '.fwi-plat',
  // #749: background-less buttons: transparent, or the same colour as the surface behind
  '.btn.outline', '.btn.danger', '.pp-chip', '.up-version', '.kb-more', '.wb-done-more',
  '.sm-cmd', '.sm-mic', '.open-icon', '.sd-note-head',
]

// #749: the visible box of these is drawn by a child or the browser; nothing may give them the divider.
const EDGELESS = ['.fwi-plug']

// #749: anything that targets these elements is a control, named or not: a new rule is caught too.
const CONTROL_TAG = /(^|[^\w-])(input|select|textarea)(?![\w-])/
const CONTROL_ROLE = /\[role=["']?checkbox["']?\]/
const DIVIDER = /var\(\s*--border\s*\)/

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}

// #749: flat list of { selector, body, line }; descends into @media/@supports/@layer, skips other at-rules.
function rules(src, from = 0, to = src.length, out = []) {
  let i = from
  let start = from
  while (i < to) {
    if (src[i] === ';') start = i + 1
    if (src[i] === '{') {
      let depth = 1
      let j = i + 1
      while (j < to && depth > 0) {
        if (src[j] === '{') depth++
        if (src[j] === '}') depth--
        j++
      }
      const prelude = src.slice(start, i).trim()
      if (prelude.startsWith('@')) {
        if (/^@(media|supports|layer|container)/.test(prelude)) rules(src, i + 1, j - 1, out)
      } else {
        const first = start + (src.slice(start, i).length - src.slice(start, i).trimStart().length)
        out.push({ selector: prelude, body: src.slice(i + 1, j - 1), line: src.slice(0, first).split('\n').length })
      }
      i = j
      start = j
      continue
    }
    i++
  }
  return out
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

function subject(part) {
  const compounds = part.trim().split(/\s*[>+~]\s*|\s+(?![^[]*\])/).filter(Boolean)
  return compounds.at(-1) ?? ''
}

// #749: `.x` is the class (not `.x-y`), `select.x` only a select with it.
function matchesPattern(compound, pattern) {
  let at = compound.indexOf(pattern)
  while (at !== -1) {
    const end = at + pattern.length
    if (!/[\w-]/.test(compound[end] ?? '')) return true
    at = compound.indexOf(pattern, at + 1)
  }
  return false
}

function matchesControl(compound) {
  return CONTROL_TAG.test(compound) || CONTROL_ROLE.test(compound) || [...CONTROLS, ...EDGELESS].some((p) => matchesPattern(compound, p))
}

const parts = (selector) => selector.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean)

const files = cssFiles(UI).sort()
const all = files.flatMap((file) =>
  rules(stripComments(readFileSync(file, 'utf8'))).map((r) => ({ ...r, file: relative(ROOT, file) })),
)

test('#749: no field, checkbox or background-less button is drawn with the divider --border', () => {
  assert.ok(all.length > 500, `read ${all.length} rules from ${files.length} css files`)
  const bad = []
  for (const r of all) {
    const hits = parts(r.selector).filter((p) => matchesControl(subject(p)))
    if (!hits.length) continue
    for (const decl of r.body.split(';')) {
      if (DIVIDER.test(decl)) bad.push(`${r.file}:${r.line} ${hits.join(', ')} { ${decl.trim()} }`)
    }
  }
  assert.deepEqual(bad, [], `controls must use var(--border-control):\n${bad.join('\n')}`)
})

test('#749: each known control draws its edge with --border-control', () => {
  const missing = CONTROLS.filter(
    (pattern) => !all.some((r) => /var\(\s*--border-control\s*\)/.test(r.body) && parts(r.selector).some((p) => matchesPattern(subject(p), pattern))),
  )
  assert.deepEqual(missing, [], `no rule gives these controls var(--border-control): ${missing.join(', ')}`)
})

test('#749: --border and --border-control stay defined in the brand css, in both themes', () => {
  const brand = readFileSync(join(UI, 'brand.css'), 'utf8')
  assert.ok((brand.match(/--border-control:/g) ?? []).length >= 2, 'brand.css defines --border-control for dark and light')
  assert.ok((brand.match(/--border:/g) ?? []).length >= 2, 'brand.css defines --border for dark and light')
})
