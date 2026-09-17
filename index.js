/**
 * dsh-agent-studio — host half.
 *
 * Serves the Agent Studio API over the browser HTTP carrier (`ctx.webServer`).
 * The client half (lib/client.js) mounts a native sidebar entry and a main
 * panel, then calls these endpoints.
 *
 * Why an HTTP route instead of a typert @Remote namespace: this surface is a
 * plugin-private UI bridge, it needs no cross-plugin contract, no wire schema
 * generation, and no gateway registration. A named route under a single prefix
 * is the smallest thing that works, and it keeps the plugin self-contained.
 *
 * Scope: reads custom (trust === 'user') presets from the deployment roster,
 * exposes their on-disk files for editing, and writes back only the
 * documentation files (SOUL / USER / AGENT / MEMORY). It never touches the
 * four shipped presets: `listAgents()` filters on trust.
 */
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { BUNDLES, renderComposition } from './forge.js'

export const name = 'agent-studio'

/** The HTTP carrier is a hard dependency: without it there is no surface. */
export const inject = ['webServer']

/** Single prefix for every endpoint this plugin owns. */
const ROUTE = '/agent-studio-api'

/**
 * Files the settings page may create or overwrite, relative to a preset dir.
 * Deliberately excludes `agent.cordis.yml` and `preset.yml`: editing the
 * composition is a later, separately-verified step, because a malformed
 * composition makes the preset fail to mount.
 */
const EDITABLE_FILES = new Set(['SOUL.md', 'USER.md', 'AGENT.md', 'MEMORY.md'])

/** Write a JSON (or plain-text) response. */
function send(res, code, body) {
  const isText = typeof body === 'string'
  const payload = isText ? body : JSON.stringify(body)
  res.writeHead(code, {
    'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read and parse a JSON request body; empty bodies become `{}`. */
async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Read a UTF-8 file, or `null` when it does not exist / is unreadable. */
async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** List a preset's `memory/` directory as plain name+size rows. */
async function listMemoryFiles(dir) {
  const memoryDir = join(dir, 'memory')
  let entries
  try {
    entries = await readdir(memoryDir, { withFileTypes: true })
  } catch {
    return []
  }
  const rows = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    let size = 0
    try {
      size = (await stat(join(memoryDir, entry.name))).size
    } catch {
      /* a file that vanished between readdir and stat is simply reported as 0 */
    }
    rows.push({ name: entry.name, size })
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return rows
}

/**
 * Count the model-facing rows a composition mounts, for the list summary.
 * A light textual count, not a parse: the panel only needs an order of
 * magnitude, and a real parse would duplicate the loader.
 */
function countRows(composition) {
  if (typeof composition !== 'string') return null
  const matches = composition.match(/^\s*- id:\s*\S+/gm)
  return matches === null ? 0 : matches.length
}

export function apply(ctx) {
  /** The roster answers trust and the absolute composition path. */
  const roster = ctx.get('agentPresets')

  /** Every custom preset, with everything the list needs to render a card. */
  async function listAgents() {
    if (roster === undefined) return []
    const all = await roster.list()
    const agents = []
    for (const preset of all) {
      // `system` is the shipped set; this surface never touches it.
      if (preset.trust !== 'user') continue
      const dir = dirname(preset.path)
      const composition = await readIfExists(join(dir, 'agent.cordis.yml'))
      agents.push({
        id: preset.id,
        name: preset.name ?? null,
        description: preset.description ?? null,
        order: preset.order ?? null,
        dir,
        compositionPath: preset.path,
        rowCount: countRows(composition),
        hasSoul: (await readIfExists(join(dir, 'SOUL.md'))) !== null,
      })
    }
    agents.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.id < b.id ? -1 : 1))
    return agents
  }

  /** Resolve one custom preset's directory, or `undefined` when it is not ours. */
  async function resolveEditable(id) {
    if (typeof id !== 'string' || id === '') return undefined
    const all = await listAgents()
    return all.find((agent) => agent.id === id)
  }

  /** One preset's full editable payload. */
  async function readAgent(id) {
    const agent = await resolveEditable(id)
    if (agent === undefined) return undefined
    const dir = agent.dir
    return {
      id: agent.id,
      dir,
      compositionPath: agent.compositionPath,
      rowCount: agent.rowCount,
      files: {
        'preset.yml': await readIfExists(join(dir, 'preset.yml')),
        'agent.cordis.yml': await readIfExists(join(dir, 'agent.cordis.yml')),
        'SOUL.md': await readIfExists(join(dir, 'SOUL.md')),
        'USER.md': await readIfExists(join(dir, 'USER.md')),
        'AGENT.md': await readIfExists(join(dir, 'AGENT.md')),
        'MEMORY.md': await readIfExists(join(dir, 'MEMORY.md')),
      },
      memory: await listMemoryFiles(dir),
      capabilities: mountedBundles(await readIfExists(join(dir, 'agent.cordis.yml'))),
    }
  }

  /** Persist one documentation file inside a custom preset directory. */
  async function writeAgentFile(id, file, content) {
    if (!EDITABLE_FILES.has(file)) {
      throw new Error(`refusing to write "${file}": not an editable documentation file`)
    }
    if (typeof content !== 'string') throw new Error('content must be a string')
    const agent = await resolveEditable(id)
    if (agent === undefined) throw new Error(`unknown custom preset "${id}"`)
    const target = resolve(join(agent.dir, file))
    // The path is built from a fixed allowlist, but keep the containment check
    // anyway: it is the difference between a bug and an escape.
    if (!target.startsWith(resolve(agent.dir) + sep)) {
      throw new Error('refusing to write outside the preset directory')
    }
    await writeFile(target, content, 'utf8')
    return { id, file, bytes: Buffer.byteLength(content, 'utf8') }
  }

  // ── capability mounting ───────────────────────────────────────────────────
  // The settings page edits capabilities, not rows: a person should not have to
  // know a package name to give their agent a shell. The bundle table lives in
  // forge.js so the tool an agent calls and the page a person clicks generate
  // the composition from one source.

  /** Row ids declared by a composition or a bundle's YAML. */
  function rowIdsOf(text) {
    const ids = new Set()
    if (typeof text !== 'string') return ids
    const re = /^\s*-\s*id:\s*(\S+)/gm
    let match
    while ((match = re.exec(text)) !== null) ids.add(match[1])
    return ids
  }

  /** A bundle counts as mounted when every row it declares is present. */
  function mountedBundles(composition) {
    const present = rowIdsOf(composition)
    return Object.keys(BUNDLES).filter((key) => {
      const needed = [...rowIdsOf(BUNDLES[key].yaml)]
      return needed.length > 0 && needed.every((id) => present.has(id))
    })
  }

  /** Everything the settings page needs to render the mounting controls. */
  async function catalog() {
    const bundles = Object.entries(BUNDLES).map(([key, bundle]) => ({
      key,
      summary: bundle.summary,
      rows: [...rowIdsOf(bundle.yaml)],
    }))
    let skills = []
    const registry = ctx.get('skills')
    if (registry !== undefined) {
      try {
        const list = await registry.list({})
        skills = list.map((skill) => ({ name: skill.name, description: skill.description ?? '' }))
      } catch {
        /* a catalogue read failure must not hide the bundles */
      }
    }
    return { bundles, skills }
  }

  /**
   * Rewrite one agent's composition from a capability selection.
   *
   * Composing is the check: `standingKeyFor` runs the real mount. On failure the
   * previous text is restored, because a preset that does not mount is worse
   * than a preset with the wrong capabilities — and this page is exactly where
   * someone would otherwise strand an agent.
   */
  async function writeCapabilities(id, capabilities) {
    const agent = await resolveEditable(id)
    if (agent === undefined) throw new Error(`unknown custom preset "${id}"`)
    const unknown = capabilities.filter((key) => BUNDLES[key] === undefined)
    if (unknown.length > 0) throw new Error(`unknown capability bundle(s): ${unknown.join(', ')}`)

    const compositionPath = join(agent.dir, 'agent.cordis.yml')
    const previous = await readIfExists(compositionPath)
    await writeFile(compositionPath, renderComposition(capabilities, agent.name ?? id), 'utf8')

    if (roster !== undefined) {
      try {
        await roster.standingKeyFor(id)
      } catch (error) {
        if (previous !== null) await writeFile(compositionPath, previous, 'utf8')
        const message = error !== null && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error)
        throw new Error(`the new composition does not mount, so it was rolled back: ${message}`)
      }
    }
    return { id, capabilities, mounts: true }
  }

  ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    async handler(req, res) {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const op = url.pathname.slice(ROUTE.length)

        if (op === '/agents' && req.method === 'GET') {
          return send(res, 200, { agents: await listAgents() })
        }

        if (op === '/agent' && req.method === 'GET') {
          const payload = await readAgent(url.searchParams.get('id') ?? '')
          if (payload === undefined) return send(res, 404, { error: 'unknown custom preset' })
          return send(res, 200, payload)
        }

        if (op === '/agent' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const result = await writeAgentFile(body.id, body.file, body.content)
          return send(res, 200, result)
        }

        if (op === '/catalog' && req.method === 'GET') {
          return send(res, 200, await catalog())
        }

        if (op === '/capabilities' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const capabilities = Array.isArray(body.capabilities) ? body.capabilities.map(String) : []
          return send(res, 200, await writeCapabilities(body.id, capabilities))
        }

        return send(res, 404, { error: `unknown op "${op}"` })
      } catch (error) {
        const message = error !== null && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error)
        ctx.logger?.warn?.(`agent-studio: ${message}`)
        return send(res, 500, { error: message })
      }
    },
  })
}
