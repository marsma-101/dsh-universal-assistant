/**
 * Install dsh-agent-studio into a DSH profile, offline.
 *
 *   node scripts/install.mjs                  # read-only verification (profile: web)
 *   node scripts/install.mjs --apply          # perform the installation
 *   node scripts/install.mjs --profile <name> # target another profile
 *
 * Writes (apply only):
 *   <DSH_HOME>/profiles/<profile>/node_modules/dsh-agent-studio  (junction -> this repo)
 *   <DSH_HOME>/profiles/<profile>/package.json                   (dependency + bundle entry)
 *
 * It never touches the profile's cordis.patch.yml: this package carries its own
 * bundle patch (`- insert:` of the `agent-studio` row), which the loader applies
 * as a layer.
 *
 * DSH_HOME defaults to ~/.dsh, which on this machine is a junction to the real
 * data directory — either spelling resolves to the same place.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  lstatSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = resolve(HERE, '..')

const argv = process.argv.slice(2)
const mode = argv.includes('--apply') ? 'apply' : 'check'
const profileFlag = argv.indexOf('--profile')
const PROFILE_NAME = profileFlag >= 0 && argv[profileFlag + 1] ? argv[profileFlag + 1] : 'web'

const HOME = process.env.USERPROFILE ?? process.env.HOME
const DSH_HOME = process.env.DSH_HOME ?? join(HOME, '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', PROFILE_NAME)
const PROFILE_MANIFEST = join(PROFILE_DIR, 'package.json')

const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'))
const PACKAGE_NAME = manifest.name
const LINK_PATH = join(PROFILE_DIR, 'node_modules', PACKAGE_NAME)

const report = []
const fail = []

function check(label, ok, detail = '') {
  report.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) fail.push(label)
}

// ── the package itself ──────────────────────────────────────────────────────

check('package directory exists', existsSync(PACKAGE_DIR), PACKAGE_DIR)
check('package name', PACKAGE_NAME === 'dsh-agent-studio', PACKAGE_NAME)
check('declares dsh.bundle.patch', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('declares a web client half', manifest.dsh?.client?.platform === 'web')
check('main entry exists', existsSync(join(PACKAGE_DIR, manifest.main ?? 'index.js')))

const clientExport = manifest.exports?.['./client']
const clientPath = typeof clientExport === 'string' ? clientExport : clientExport?.default
check('exports ./client', typeof clientPath === 'string', String(clientPath))
check(
  'client bundle exists (must be prebuilt)',
  typeof clientPath === 'string' && existsSync(join(PACKAGE_DIR, clientPath)),
  typeof clientPath === 'string' ? clientPath : '',
)

const entryText = readFileSync(join(PACKAGE_DIR, manifest.main ?? 'index.js'), 'utf8')
check('host entry exports apply()', /export\s+function\s+apply\s*\(/.test(entryText))
check('host entry registers a webServer route', /webServer\.register\(\{/.test(entryText))
check('host entry consumes ctx.agentPresets', /get\(['"]agentPresets['"]\)/.test(entryText))

const clientText = typeof clientPath === 'string' ? readFileSync(join(PACKAGE_DIR, clientPath), 'utf8') : ''
check('client bundle uses the module loader', /__ModuleLoader__\.load\(\{/.test(clientText))
check('client bundle exports apply', /exports\.apply\s*=/.test(clientText))
check('client bundle registers the sidebar seat', /sidebar\.panellist/.test(clientText))
check('client bundle registers the main seat', /['"]main['"]/.test(clientText))

// The bundle patch must parse as YAML and carry exactly one plain insert whose
// row names this package, or the loader silently mounts nothing.
const yaml = createRequire(join(PROFILE_DIR, 'package.json'))('js-yaml')
const patch = yaml.load(readFileSync(join(PACKAGE_DIR, 'cordis.patch.yml'), 'utf8'))
const insertRows = Array.isArray(patch) ? patch.flatMap((layer) => layer?.insert ?? []) : []
check(
  'bundle patch is one plain insert',
  Array.isArray(patch) && patch.length === 1 && insertRows.length === 1,
  JSON.stringify(patch),
)
check(
  'bundle patch row names the package',
  insertRows[0]?.name === PACKAGE_NAME && insertRows[0]?.id === 'agent-studio',
  JSON.stringify(insertRows[0]),
)

// ── the target profile ──────────────────────────────────────────────────────

check('profile manifest exists', existsSync(PROFILE_MANIFEST), PROFILE_MANIFEST)
const before = existsSync(PROFILE_MANIFEST) ? JSON.parse(readFileSync(PROFILE_MANIFEST, 'utf8')) : {}
const depSpec = before.dependencies?.[PACKAGE_NAME]
check('profile dependency spec', depSpec === undefined || depSpec.startsWith('link:'), String(depSpec))
if (depSpec !== undefined) {
  check('profile bundle layer', (before.dsh?.profile?.bundles ?? []).includes(PACKAGE_NAME), 'listed')
}

if (mode === 'check') {
  console.log(report.join('\n'))
  console.log(`\n${fail.length === 0 ? 'CHECK OK' : `CHECK FAILED (${fail.length})`}`)
  process.exit(fail.length === 0 ? 0 : 1)
}

// ── apply ───────────────────────────────────────────────────────────────────

if (fail.length > 0) {
  console.log(report.join('\n'))
  console.error(`\nrefusing to install: ${fail.length} check(s) failed`)
  process.exit(1)
}

// 1. node_modules link. A junction needs no elevation on Windows, and pnpm's
//    hoisted linker treats a real directory the same as a link.
mkdirSync(join(PROFILE_DIR, 'node_modules'), { recursive: true })
let existed = false
try {
  existed = lstatSync(LINK_PATH).isDirectory() || lstatSync(LINK_PATH).isSymbolicLink()
} catch {
  existed = false
}
if (existed) {
  console.log(`node_modules entry already present: ${LINK_PATH}`)
} else {
  symlinkSync(PACKAGE_DIR, LINK_PATH, 'junction')
  console.log(`linked ${LINK_PATH} -> ${PACKAGE_DIR}`)
}

// 2. profile manifest: dependency (link:) + bundle layer.
const after = structuredClone(before)
after.dependencies = { ...(after.dependencies ?? {}), [PACKAGE_NAME]: `link:${PACKAGE_DIR}` }
after.dependencies = Object.fromEntries(
  Object.entries(after.dependencies).sort(([a], [b]) => a.localeCompare(b)),
)
const bundles = [...(after.dsh?.profile?.bundles ?? [])]
if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME)
after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles } }
writeFileSync(PROFILE_MANIFEST, JSON.stringify(after, null, 2) + '\n')
console.log(`updated ${PROFILE_MANIFEST}`)

// 3. verify the loader's own resolution path finds the package.
const requireFromProfile = createRequire(PROFILE_MANIFEST)
let resolved
try {
  resolved = requireFromProfile.resolve
    .paths(PACKAGE_NAME)
    ?.map((p) => join(p, PACKAGE_NAME))
    .find((p) => existsSync(join(p, 'package.json')))
} catch {
  resolved = undefined
}
console.log(
  resolved === undefined
    ? 'RESOLVE FAILED — the loader would not find this package'
    : `resolves from the profile anchor: ${resolved}`,
)
console.log(resolved === undefined ? 'INSTALL INCOMPLETE' : 'INSTALL OK')
console.log('\nReload the Web GUI. If the sidebar entry does not appear, restart the profile.')
