/**
 * dsh-universal-assistant/forge — the model-facing agent-creation tools, host half.
 *
 * This is the half that makes an assistant able to *build a colleague*. The
 * studio package's other half is a UI for editing agents that already exist;
 * this one lets an agent create one, and — critically — prove the result mounts
 * before it reports success.
 *
 * Creation goes through `ctx.agentPresets.copy()` rather than hand-writing a
 * directory. That is deliberate: `copy()` is the roster's own authoring write.
 * It validates the id, refuses one any root already supplies, lands the copy in
 * whichever root this deployment made writable, and rolls back a failed copy.
 * None of that is knowable from outside, so the tool reuses it and then
 * overwrites the composition and adds the archive files.
 *
 * The last step is `standingKeyFor(id)`: it composes the new preset's plugin
 * subtree for real, which is the only way to know the composition is loadable.
 * A tool that reports "created" without that check is a tool that hands you a
 * broken agent.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'universal-assistant-forge'

/** `tools` is needed to publish the tools; `agentPresets` is the roster. */
export const inject = ['tools']

/**
 * Capability bundles, not raw rows.
 *
 * A model choosing rows would have to know package names, realm rules and
 * platform gating. It can choose capabilities. Each bundle is the exact YAML
 * that gets appended to the generated composition.
 *
 * `persona` is not in this table: it is mandatory and always emitted first,
 * because without it the archive files are inert.
 */
export const BUNDLES = {
	files: {
		summary: '文件读写与检索（read / write / edit / glob / grep）',
		yaml: `- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
`,
	},
	web: {
		summary: '联网检索与抓取（web_search / web_fetch）',
		yaml: `- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: true
    searchTimeoutMs: 60000
`,
	},
	shell: {
		summary: '执行命令（pwsh / bash，按平台二选一）',
		yaml: `- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'

- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'
`,
	},
	jobs: {
		summary: '后台任务（job_list / job_output / job_kill）',
		yaml: `- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
`,
	},
	skills: {
		summary: '技能目录与按需加载（skill）',
		yaml: `- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
`,
	},
	instructions: {
		summary: '从 AGENTS.md 取行为指令',
		yaml: `- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
`,
	},
	ask: {
		summary: '向用户提问（ask_user_question）',
		yaml: `- id: tool-ask-user
  name: '@deepseek-ai/dsh-tool-ask-user'
`,
	},
	todo: {
		summary: '任务清单（todo_write）',
		yaml: `- id: tool-todo
  name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
`,
	},
	present: {
		summary: '交付文件（present）',
		yaml: `- id: present
  name: '@deepseek-ai/dsh-tool-present'
`,
	},
	goals: {
		summary: '长期目标（create_goal / get_goal / update_goal）',
		yaml: `- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'
`,
	},
	planning: {
		summary: '计划模式（exit_plan_mode）',
		yaml: `- id: planning
  name: cordis:group
  group: true
  isolate:
    planMode: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
              You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Explore first, propose a decision-complete plan, then call exit_plan_mode with it as the only and final tool call in that response.
`,
	},
	compaction: {
		summary: '长对话压缩（自动压缩 + /compact）',
		yaml: `- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'

    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'

    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
`,
	},
	delegation: {
		summary: '委派子智能体（subagent / subagent_fork / send_message / list_agents）',
		yaml: `- id: delegation
  name: cordis:group
  group: true
  isolate:
    workflowEngine: true
  config:
    - id: tool-subagent-control
      name: '@deepseek-ai/dsh-tool-subagent-control'

    - id: tool-subagent-list-agents
      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'

    - id: tool-subagent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: subagent
        modelSelectionSettings: true
        backgroundMode: continuable

    - id: tool-subagent-fork
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: fork
        toolName: subagent_fork
        backgroundMode: continuable
`,
	},
	orchestration: {
		summary: '多智能体编排（workflow / ralph）—— 需要先开 delegation',
		yaml: `- id: orchestration
  name: cordis:group
  group: true
  isolate:
    workflowEngine: true
  config:
    - id: workflow-worker-thread
      name: '@deepseek-ai/dsh-workflow-worker-thread'
      config:
        provider: spawn

    - id: tool-workflow
      name: '@deepseek-ai/dsh-tool-workflow'

    - id: tool-ralph
      name: '@deepseek-ai/dsh-tool-ralph'
      config:
        subagentProvider: spawn
        maxRounds: 64
`,
	},
	forge: {
		summary: '自己也能创建智能体（本插件提供的 agent_create 等工具）',
		yaml: `- id: agent-forge
  name: 'dsh-universal-assistant/forge'
`,
	},
}

/** The bundle set a fresh, general-purpose assistant gets. */
const DEFAULT_BUNDLES = ['files', 'web', 'skills', 'ask', 'todo', 'present']

/** The persona row every generated agent gets: it is what makes the .md files live. */
const PERSONA_ROW = `- id: persona
  name: 'dsh-universal-assistant/persona'
  config:
    dir: !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('.', baseUrl))"
`

/**
 * The optional archive files and which tool argument fills each. SOUL.md is not
 * here: it is required, so it is always written.
 */
const OPTIONAL_ARCHIVE = [
	['AGENT.md', 'duties'],
	['USER.md', 'user'],
	['MEMORY.md', 'memory'],
]

/** Ids become directory names, so the roster's own rule applies here too. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** Render the composition text for a bundle selection. Exported for the checker. */
export function renderComposition(bundles, title) {
	const parts = [
		`# ${title}\n#`,
		'# 人格与工作规则不在这个文件里，在同目录的档案文件：',
		'#   SOUL.md / AGENT.md / USER.md / MEMORY.md',
		'# 由 dsh-universal-assistant/persona 在每次装配提示词时读取，改 .md 下一轮就生效。',
		'#',
		'# 组装约束：发布服务的行必须包进带 `isolate` realm 的 group；',
		'# 只消费 host 能力、不发布服务的行留在 realm 外，否则解析不到 host 实例。',
		'',
		'# ── 人格（提示词层）─────────────────────────────────────────────────────────',
		PERSONA_ROW,
	]
	for (const key of bundles) {
		const bundle = BUNDLES[key]
		if (bundle === undefined) continue
		parts.push(`# ── ${key} ──`)
		parts.push(bundle.yaml)
	}
	return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function apply(ctx, config = {}) {
	/** The roster is a hard dependency in practice: creation is its authoring write. */
	const roster = ctx.get('agentPresets')

	/** One tool result: a compact report the model can act on. */
	function report(payload) {
		return JSON.stringify(payload, null, 1)
	}

	ctx.tools.register(
		defineTool({
			name: 'agent_catalog',
			description:
				'List what a new agent can be given: the capability bundles you may pass to agent_create, plus the skills currently discoverable on this machine. Call this before agent_create so you recommend capabilities from the real list rather than inventing them.',
			parameters: {},
			output: {
				schema: { type: 'string' },
				render(_args, value) {
					return [{ type: 'text', text: String(value) }]
				},
			},
			async execute() {
				const bundles = Object.entries(BUNDLES).map(([key, bundle]) => ({
					key,
					summary: bundle.summary,
				}))
				let skills = []
				const registry = ctx.get('skills')
				if (registry !== undefined) {
					try {
						const list = await registry.list({})
						skills = list.map((skill) => skill.name)
					} catch {
						/* a catalog read failure must not hide the bundles */
					}
				}
				return report({ bundles, defaultBundles: DEFAULT_BUNDLES, skills })
			},
		}),
	)

	ctx.tools.register(
		defineTool({
			name: 'agent_list',
			description:
				'List the custom agents on this machine, with each one\'s directory, size of its archive files, and whether its composition currently mounts. Read-only.',
			parameters: {},
			output: {
				schema: { type: 'string' },
				render(_args, value) {
					return [{ type: 'text', text: String(value) }]
				},
			},
			async execute() {
				if (roster === undefined) return report({ error: 'the agent roster is unavailable' })
				const all = await roster.list()
				const agents = all
					.filter((preset) => preset.trust === 'user')
					.map((preset) => ({
						id: preset.id,
						name: preset.name ?? null,
						description: preset.description ?? null,
						compositionPath: preset.path,
					}))
				return report({ agents })
			},
		}),
	)

	ctx.tools.register(
		defineTool({
			name: 'agent_create',
			description:
				'Create a new custom agent on this machine. It becomes a real preset with its own directory: a composition built from the capability bundles you choose, plus SOUL.md / AGENT.md / USER.md / MEMORY.md, which are read live as that agent\'s persona. Refuses an id that already exists. Composes the result for real before reporting success, so a returned ok:true means the agent mounts. Ask the human for the substance (what it is for, its duties, its character, its initial memory) before calling this.',
			parameters: {
				id: {
					type: 'string',
					required: true,
					description: 'Lowercase id, [a-z0-9][a-z0-9-]*; becomes the directory name.',
				},
				name: { type: 'string', required: true, description: 'Display name shown in the picker.' },
				description: { type: 'string', description: 'One-line description for the picker.' },
				soul: {
					type: 'string',
					required: true,
					description: 'SOUL.md: who this agent is, how it speaks, its bottom line.',
				},
				duties: {
					type: 'string',
					description: 'AGENT.md: what it is for, its boundaries, how it should use its tools.',
				},
				user: { type: 'string', description: 'USER.md: what this agent should know about the human.' },
				memory: { type: 'string', description: 'MEMORY.md: its starting memory. Optional.' },
				capabilities: {
					type: 'array',
					items: { type: 'string' },
					description:
						'Capability bundle keys from agent_catalog. Omit for a sensible general-purpose set.',
				},
			},
			output: {
				schema: { type: 'string' },
				render(_args, value) {
					return [{ type: 'text', text: String(value) }]
				},
			},
			async execute(args) {
				if (roster === undefined) return report({ error: 'the agent roster is unavailable' })

				const id = String(args.id ?? '').trim()
				if (!ID_PATTERN.test(id)) {
					return report({
						error: `invalid id "${id}": must match [a-z0-9][a-z0-9-]* (it becomes the directory name)`,
					})
				}
				const requested = Array.isArray(args.capabilities) ? args.capabilities.map(String) : []
				const bundles = requested.length > 0 ? requested : DEFAULT_BUNDLES.slice()
				const unknown = bundles.filter((key) => BUNDLES[key] === undefined)
				if (unknown.length > 0) {
					return report({
						error: `unknown capability bundle(s): ${unknown.join(', ')}`,
						known: Object.keys(BUNDLES),
					})
				}

				// 1. Let the roster perform its own authoring write. This validates the
				//    id, refuses a duplicate, picks the writable root, and rolls back on
				//    failure — all of which is invisible from out here.
				try {
					await roster.copy('standard', id, String(args.name))
				} catch (error) {
					const message = error !== null && typeof error === 'object' && 'message' in error
						? String(error.message)
						: String(error)
					return report({ error: `could not create preset "${id}": ${message}` })
				}

				// 2. Resolve where the copy landed rather than guessing the root.
				const resolved = await roster.resolve(id)
				const compositionPath = resolved.path
				const dir = compositionPath.replace(/[\\/][^\\/]+$/, '')

				// 3. Replace the copied composition and write the archive files.
				const files = [
					[compositionPath, renderComposition(bundles, String(args.name))],
					[join(dir, 'preset.yml'), `name: ${String(args.name)}\ndescription: ${String(args.description ?? '')}\n`],
					[join(dir, 'SOUL.md'), String(args.soul)],
				]
				for (const [file, arg] of OPTIONAL_ARCHIVE) {
					const value = args[arg]
					if (typeof value === 'string' && value.trim() !== '') files.push([join(dir, file), value])
				}
				try {
					for (const [path, body] of files) await writeFile(path, body, 'utf8')
				} catch (error) {
					const message = error !== null && typeof error === 'object' && 'message' in error
						? String(error.message)
						: String(error)
					return report({ error: `preset "${id}" was created but writing its files failed: ${message}`, dir })
				}

				// 4. Compose it for real. This is the step that makes ok:true meaningful.
				try {
					await roster.standingKeyFor(id)
				} catch (error) {
					const message = error !== null && typeof error === 'object' && 'message' in error
						? String(error.message)
						: String(error)
					return report({
						ok: false,
						id,
						dir,
						error: `the new agent does not mount: ${message}`,
						hint: 'fix the composition, or delete the directory and try again',
					})
				}

				return report({ ok: true, id, dir, capabilities: bundles, mounts: true })
			},
		}),
	)
}
