/**
 * dsh-agent-studio — client half (built bundle), v0.2.
 *
 * Format is the DSH client module loader contract: executing this file only
 * registers a factory; the module body (and any CSS it injects) runs when the
 * module is materialized. React arrives from the frozen platform module table,
 * so it is `require`d rather than imported.
 *
 * Surfaces:
 *   sidebar.panellist  — the native sidebar panel entry. The shell owns the
 *                        button and hands { size, active }, so the expanded row
 *                        and the collapsed rail icon are both handled for us.
 *   main               — the panel body, dispatched by the same entry id.
 *   shell.overlay      — the settings dialog. That layer is click-through, so
 *                        the backdrop opts back into pointer events itself.
 *
 * Returning to the Conversation is `ctx.layout.selectPanel(null)`; the layout
 * contract documents `null` as "show the Conversation".
 */
window.__ModuleLoader__.load({
	id: 'dsh-agent-studio',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports

		const React = require('react')

		/** Must match ROUTE in index.js and the entry id in cordis.patch.yml. */
		const API = '/agent-studio-api'
		const ENTRY_ID = 'agent-studio'
		const ENTRY_LABEL = '智能体设定'

		/** Editable documentation files, in tab order. Mirrors the host allowlist. */
		const EDITABLE = ['SOUL.md', 'USER.md', 'AGENT.md', 'MEMORY.md']
		/** Shown read-only: editing the composition is a later, separately-verified step. */
		const READ_ONLY = ['agent.cordis.yml', 'preset.yml']
		/** A directory listing, not a file. */
		const MEMORY_TAB = '记忆目录'

		const CSS = `
.ags-root{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.ags-head{flex:none;display:flex;align-items:center;gap:12px;padding:16px 22px 12px}
.ags-title{margin:0;font-size:16px;font-weight:600}
.ags-sub{font-size:12px;color:var(--dsw-alias-label-secondary);flex:auto;min-width:0}
.ags-back{flex:none;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;
  border:none;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
.ags-back:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}
.ags-body{flex:auto;min-height:0;overflow:auto;padding:0 22px 22px}
.ags-card{box-sizing:border-box;display:flex;align-items:center;gap:14px;width:100%;text-align:left;
  padding:14px 16px;margin-bottom:10px;border:none;border-radius:12px;cursor:pointer;
  background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));
  color:var(--dsw-alias-label-primary);font:inherit;
  box-shadow:inset 0 0 0 1px var(--dsw-alias-separator,rgba(127,127,127,.18))}
.ags-card:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ags-avatar{flex:none;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;
  justify-content:center;font-size:18px;background:var(--dsw-alias-interactive-bg-hover)}
.ags-meta{min-width:0;flex:auto}
.ags-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ags-desc{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ags-tags{flex:none;display:flex;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.ags-tag{padding:2px 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover)}
.ags-note{padding:14px 16px;border-radius:12px;font-size:13px;line-height:1.6;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
.ags-err{color:var(--dsw-alias-label-error,inherit)}
.ags-backdrop{position:fixed;inset:0;pointer-events:auto;z-index:60;display:flex;
  align-items:center;justify-content:center;padding:32px;background:rgba(0,0,0,.45)}
.ags-dialog{box-sizing:border-box;width:min(940px,100%);height:min(740px,100%);display:flex;
  flex-direction:column;overflow:hidden;border-radius:14px;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  box-shadow:0 24px 64px rgba(0,0,0,.38)}
.ags-dlg-head{flex:none;display:flex;align-items:center;gap:12px;padding:16px 20px 12px;
  box-shadow:inset 0 -1px 0 var(--dsw-alias-separator,rgba(127,127,127,.18))}
.ags-dlg-title{margin:0;font-size:15px;font-weight:600}
.ags-dlg-path{font-size:11px;color:var(--dsw-alias-label-secondary);flex:auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ags-tabs{flex:none;display:flex;flex-wrap:wrap;gap:6px;padding:12px 20px}
.ags-tab{height:28px;padding:0 12px;border:none;border-radius:8px;cursor:pointer;font:inherit;
  font-size:12px;color:var(--dsw-alias-label-secondary);background:transparent}
.ags-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ags-tab[data-active]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active);font-weight:600}
.ags-dlg-body{flex:auto;min-height:0;display:flex;flex-direction:column;padding:0 20px;overflow:auto}
.ags-editor{box-sizing:border-box;flex:auto;min-height:240px;resize:none;width:100%;padding:12px 14px;
  border:1px solid var(--dsw-alias-separator,rgba(127,127,127,.22));border-radius:10px;
  background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));color:inherit;
  font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;tab-size:2}
.ags-readonly{margin:0;padding:12px 14px;border-radius:10px;overflow:auto;max-height:100%;
  background:var(--dsw-alias-interactive-bg-hover);font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre}
.ags-dlg-foot{flex:none;display:flex;align-items:center;gap:12px;padding:12px 20px 16px}
.ags-status{flex:auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ags-btn{flex:none;height:32px;padding:0 16px;border:none;border-radius:8px;cursor:pointer;
  font:inherit;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-interactive-bg-active)}
.ags-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ags-btn[disabled]{opacity:.5;cursor:default}
.ags-memrow{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;
  font-size:12px;background:var(--dsw-alias-interactive-bg-hover);margin-bottom:6px}
`

		/** Inject the stylesheet once per document. */
		function ensureStyles() {
			if (document.getElementById('dsh-agent-studio-css') !== null) return
			const tag = document.createElement('style')
			tag.id = 'dsh-agent-studio-css'
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		// ── shared dialog state ───────────────────────────────────────────────
		// The panel opens the dialog; the overlay renders it. They are two
		// separate slot occupants in one module, so a tiny store links them.

		const listeners = new Set()
		let openId = null

		function subscribeOpen(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		}

		function setOpenId(next) {
			if (openId === next) return
			openId = next
			for (const listener of [...listeners]) listener()
		}

		/** Subscribe a component to the currently-open agent id. */
		function useOpenId() {
			const [value, setValue] = React.useState(openId)
			React.useEffect(() => {
				setValue(openId)
				return subscribeOpen(() => setValue(openId))
			}, [])
			return value
		}

		/**
		 * The sidebar entry glyph. The shell supplies `size` for the current
		 * sidebar state and `active` for selection, so no collapsed-state
		 * detection is needed here.
		 */
		function StudioIcon(props) {
			const size = props !== undefined && typeof props.size === 'number' ? props.size : 20
			return React.createElement(
				'svg',
				{
					width: size,
					height: size,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeWidth: 1.8,
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					'aria-hidden': 'true',
					focusable: 'false',
				},
				React.createElement('rect', { key: 'a', x: 3, y: 4, width: 18, height: 16, rx: 3 }),
				React.createElement('circle', { key: 'b', cx: 9, cy: 10, r: 2 }),
				React.createElement('path', { key: 'c', d: 'M5.6 17.2c.9-1.9 2.5-2.9 3.4-2.9s2.5 1 3.4 2.9' }),
				React.createElement('path', { key: 'd', d: 'M16 9.5h3.2M16 13h3.2' }),
			)
		}

		/** One agent card in the list. */
		function AgentCard(props) {
			const agent = props.agent
			const rows = agent.rowCount === null ? '—' : String(agent.rowCount)
			return React.createElement(
				'button',
				{ type: 'button', className: 'ags-card', onClick: () => setOpenId(agent.id) },
				React.createElement('span', { className: 'ags-avatar' }, '🤖'),
				React.createElement(
					'span',
					{ className: 'ags-meta' },
					React.createElement('span', { className: 'ags-name' }, agent.name !== null ? agent.name : agent.id),
					React.createElement(
						'span',
						{ className: 'ags-desc' },
						agent.description !== null ? agent.description : agent.id,
					),
				),
				React.createElement(
					'span',
					{ className: 'ags-tags' },
					React.createElement('span', { className: 'ags-tag' }, `工具行 ${rows}`),
					agent.hasSoul ? React.createElement('span', { className: 'ags-tag' }, 'SOUL') : null,
				),
			)
		}

		/** The main-column panel: every custom agent preset on this deployment. */
		function StudioPanel(props) {
			const [state, setState] = React.useState({ status: 'loading', agents: [], error: null })

			React.useEffect(() => {
				ensureStyles()
			}, [])

			React.useEffect(() => {
				let alive = true
				fetch(`${API}/agents`, { headers: { accept: 'application/json' } })
					.then((response) => response.json())
					.then((data) => {
						if (!alive) return
						setState({ status: 'ready', agents: Array.isArray(data.agents) ? data.agents : [], error: null })
					})
					.catch((error) => {
						if (!alive) return
						setState({ status: 'error', agents: [], error: String((error && error.message) || error) })
					})
				return () => {
					alive = false
				}
			}, [])

			let body
			if (state.status === 'loading') {
				body = React.createElement('div', { className: 'ags-note' }, '正在读取自定义智能体…')
			} else if (state.status === 'error') {
				body = React.createElement('div', { className: 'ags-note ags-err' }, `读取失败：${state.error}`)
			} else if (state.agents.length === 0) {
				body = React.createElement(
					'div',
					{ className: 'ags-note' },
					'还没有自定义智能体。系统自带的四个模式不在这里显示。',
				)
			} else {
				body = state.agents.map((agent) => React.createElement(AgentCard, { key: agent.id, agent }))
			}

			const back =
				props.layout === undefined || props.layout === null
					? null
					: React.createElement(
							'button',
							{ type: 'button', className: 'ags-back', onClick: () => props.layout.selectPanel(null) },
							'← 返回会话',
						)

			return React.createElement(
				'div',
				{ className: 'ags-root' },
				React.createElement(
					'div',
					{ className: 'ags-head' },
					React.createElement('h1', { className: 'ags-title' }, '智能体设定'),
					React.createElement('span', { className: 'ags-sub' }, '自定义智能体 · 系统自带模式不在其中'),
					back,
				),
				React.createElement('div', { className: 'ags-body' }, body),
			)
		}

		/** The settings dialog: file tabs across the top, editor below. */
		function AgentDialog(props) {
			const id = props.id
			const [payload, setPayload] = React.useState(null)
			const [error, setError] = React.useState(null)
			const [tab, setTab] = React.useState(EDITABLE[0])
			const [draft, setDraft] = React.useState('')
			const [status, setStatus] = React.useState('')
			const [busy, setBusy] = React.useState(false)

			React.useEffect(() => {
				let alive = true
				setPayload(null)
				setError(null)
				setStatus('')
				setTab(EDITABLE[0])
				fetch(`${API}/agent?id=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })
					.then((response) => response.json())
					.then((data) => {
						if (!alive) return
						if (data.error !== undefined) throw new Error(String(data.error))
						setPayload(data)
						setDraft(data.files[EDITABLE[0]] ?? '')
					})
					.catch((failure) => {
						if (alive) setError(String((failure && failure.message) || failure))
					})
				return () => {
					alive = false
				}
			}, [id])

			React.useEffect(() => {
				const onKey = (event) => {
					if (event.key === 'Escape') props.onClose()
				}
				window.addEventListener('keydown', onKey)
				return () => window.removeEventListener('keydown', onKey)
			}, [])

			const isEditable = EDITABLE.includes(tab)

			function pickTab(next) {
				setTab(next)
				setStatus('')
				if (payload !== null) setDraft(payload.files[next] ?? '')
			}

			async function save() {
				setBusy(true)
				setStatus('')
				try {
					const response = await fetch(`${API}/agent`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ id, file: tab, content: draft }),
					})
					const result = await response.json()
					if (result.error !== undefined) throw new Error(String(result.error))
					setPayload((previous) => ({ ...previous, files: { ...previous.files, [tab]: draft } }))
					setStatus(`已保存 ${tab}（${result.bytes} 字节）`)
				} catch (failure) {
					setStatus(`保存失败：${String((failure && failure.message) || failure)}`)
				} finally {
					setBusy(false)
				}
			}

			let body
			if (error !== null) {
				body = React.createElement('div', { className: 'ags-note ags-err' }, `读取失败：${error}`)
			} else if (payload === null) {
				body = React.createElement('div', { className: 'ags-note' }, '读取中…')
			} else if (tab === MEMORY_TAB) {
				const rows = Array.isArray(payload.memory) ? payload.memory : []
				body =
					rows.length === 0
						? React.createElement('div', { className: 'ags-note' }, 'memory/ 目录为空或不存在。')
						: React.createElement(
								'div',
								null,
								rows.map((row) =>
									React.createElement(
										'div',
										{ key: row.name, className: 'ags-memrow' },
										React.createElement('span', null, row.name),
										React.createElement('span', { style: { marginLeft: 'auto' } }, `${row.size} 字节`),
									),
								),
							)
			} else if (isEditable) {
				body = React.createElement('textarea', {
					className: 'ags-editor',
					value: draft,
					spellCheck: false,
					onChange: (event) => setDraft(event.target.value),
				})
			} else {
				body = React.createElement(
					'div',
					null,
					React.createElement('pre', { className: 'ags-readonly' }, payload.files[tab] ?? '（文件不存在）'),
					React.createElement(
						'div',
						{ className: 'ags-note', style: { marginTop: '10px' } },
						'组装文件暂不支持在界面里编辑 —— 写坏会让 preset 挂载失败，这一步要单独验证后再开。',
					),
				)
			}

			const tabs = [...EDITABLE, ...READ_ONLY, MEMORY_TAB]

			return React.createElement(
				'div',
				{
					className: 'ags-backdrop',
					onClick: (event) => {
						if (event.target === event.currentTarget) props.onClose()
					},
				},
				React.createElement(
					'div',
					{ className: 'ags-dialog', role: 'dialog', 'aria-label': '智能体设定' },
					React.createElement(
						'div',
						{ className: 'ags-dlg-head' },
						React.createElement('h2', { className: 'ags-dlg-title' }, id),
						React.createElement('span', { className: 'ags-dlg-path' }, payload !== null ? payload.dir : ''),
						React.createElement('button', { type: 'button', className: 'ags-back', onClick: props.onClose }, '✕ 关闭'),
					),
					React.createElement(
						'div',
						{ className: 'ags-tabs' },
						tabs.map((name) =>
							React.createElement(
								'button',
								{
									key: name,
									type: 'button',
									className: 'ags-tab',
									'data-active': name === tab ? 'true' : undefined,
									onClick: () => pickTab(name),
								},
								name,
							),
						),
					),
					React.createElement('div', { className: 'ags-dlg-body' }, body),
					React.createElement(
						'div',
						{ className: 'ags-dlg-foot' },
						React.createElement('span', { className: 'ags-status' }, status),
						isEditable
							? React.createElement(
									'button',
									{ type: 'button', className: 'ags-btn', disabled: busy, onClick: save },
									busy ? '保存中…' : '保存',
								)
							: null,
					),
				),
			)
		}

		/** The overlay occupant: renders nothing until a card is clicked. */
		function StudioOverlay() {
			React.useEffect(() => {
				ensureStyles()
			}, [])
			const id = useOpenId()
			if (id === null) return null
			return React.createElement(AgentDialog, { id, onClose: () => setOpenId(null) })
		}

		exports.name = 'agent-studio'
		exports.inject = ['slots']

		exports.apply = function apply(ctx) {
			const slots = ctx.get('slots')
			if (slots === undefined) return

			// `ctx.layout` selects the main panel; null returns to the Conversation.
			const layout = ctx.get('layout')

			// The sidebar entry: the shell renders the button and passes { size, active }.
			slots.inject('sidebar.panellist', () =>
				slots.register({ name: 'sidebar.panellist', id: ENTRY_ID, label: ENTRY_LABEL, order: 50 }, (props) =>
					React.createElement(StudioIcon, { size: props.size, active: props.active }),
				),
			)

			// The panel body, dispatched by the same entry id.
			slots.inject('main', () =>
				slots.register({ name: 'main', key: ENTRY_ID }, () => React.createElement(StudioPanel, { layout })),
			)

			// The settings dialog. The overlay layer is click-through, so the
			// backdrop opts back into pointer events in its own stylesheet.
			slots.inject('shell.overlay', () =>
				slots.register({ name: 'shell.overlay', id: 'agent-studio-dialog', order: 50 }, () =>
					React.createElement(StudioOverlay, null),
				),
			)
		}

		return module.exports
	},
})
