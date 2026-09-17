/**
 * Composition checker for the forge.
 *
 * `agent_create` generates a composition from capability bundles and then lets
 * `standingKeyFor()` decide whether it loads. That check happens at tool-call
 * time, which is the wrong time to discover a YAML indentation bug — it means a
 * failed creation for whoever is waiting.
 *
 * This script moves that discovery to development time: it renders every bundle
 * (and every realistic combination) and parses the result as YAML using the
 * deployment's own parser, then asserts the shape the loader expects — a
 * top-level array of rows, each with an `id` and a `name`, and the persona row
 * present and first.
 *
 * Run: node scripts/check-composition.mjs
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '..', 'package.json'))
const yaml = require('js-yaml')

const { BUNDLES, renderComposition } = await import('../forge.js')

/**
 * The loader's YAML dialect has a `!!js` tag (a JavaScript expression evaluated
 * at load time — the persona row uses it to resolve the preset directory).
 * Stock js-yaml rejects unknown tags, so register it: a `!!js` scalar is kept
 * as an opaque string here, which is all this checker needs to see.
 */
const JsTag = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: () => true,
  construct: (data) => ({ __js: data }),
})
const DIALECT = yaml.DEFAULT_SCHEMA.extend([JsTag])

const ALL = Object.keys(BUNDLES)

let failures = 0
function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` — ${detail}`}`)
}

/** Parse and assert the row shape the preset loader requires. */
function inspect(label, text) {
  let rows
  try {
    rows = yaml.load(text, { schema: DIALECT })
  } catch (error) {
    check(label, false, `YAML parse error: ${error.message}`)
    return
  }
  if (!Array.isArray(rows)) {
    check(label, false, `top level is ${typeof rows}, expected an array of rows`)
    return
  }
  const bad = rows.filter((row) => row === null || typeof row !== 'object' || row.id === undefined || row.name === undefined)
  if (bad.length > 0) {
    check(label, false, `${bad.length} row(s) missing id/name: ${JSON.stringify(bad).slice(0, 160)}`)
    return
  }
  const persona = rows.findIndex((row) => row.id === 'persona')
  if (persona !== 0) {
    check(label, false, `persona row is at index ${persona}, expected 0`)
    return
  }
  check(label, true, `${rows.length} rows, ids: ${rows.map((row) => row.id).join(', ')}`)
}

console.log('=== every bundle on its own ===')
for (const key of ALL) {
  inspect(`bundle:${key}`, renderComposition([key], 'check'))
}

console.log('\n=== every bundle at once ===')
inspect('all-bundles', renderComposition(ALL, 'check'))

console.log('\n=== unknown keys are skipped, not fatal ===')
inspect('with-unknown', renderComposition(['files', 'does-not-exist'], 'check'))

console.log(`\n${failures === 0 ? 'COMPOSITIONS OK' : `COMPOSITION FAILURES (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
