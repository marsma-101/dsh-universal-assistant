/**
 * dsh-agent-studio — client half (built bundle).
 *
 * Format is the DSH client module loader contract: executing this file only
 * registers a factory; the module body (and any CSS it injects) runs when the
 * module is materialized. React arrives from the frozen platform module table,
 * so it is `require`d rather than imported.
 *
 * Surfaces:
 *   sidebar.panellist  — the native sidebar panel entry. The sidebar owns the
 *                        button and hands the occupant { size, active }, so the
 *                        expanded row and the collapsed rail icon are both
 *                        handled by the shell rather than by DOM inspection.
 *   main               — the panel body, dispatched by the same entry id.
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

		const CSS = `
.ags-root{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.ags-head{flex:none;display:flex;align-items:baseline;gap:10px;padding:18px 22px 12px}
.ags-title{margin:0;font-size:16px;font-weight:600}
.ags-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
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
`

		/** Inject the stylesheet once per document. */
		function ensureStyles() {
			if (document.getElementById('dsh-agent-studio-css') !== null) return
			const tag = document.createElement('style')
			tag.id = 'dsh-agent-studio-css'
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		/**
		 * The sidebar entry glyph. The shell supplies `size` for the current
		 * sidebar state and `active` for selection, so no collapsed-state
		 * detection is needed here.
		 */
		function StudioIcon(props) {
			const size = props !== undefined && typeof props.size === 'number' ? props.size : 20
			const common = {
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
			}
			return React.createElement(
				'svg',
				common,
				React.createElement('rect', { key: 'a', x: 3, y: 4, width: 18, height: 16, rx: 3 }),
				React.createElement('circle', { key: 'b', cx: 9, cy: 10, rx: 2, r: 2 }),
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
				{ type: 'button', className: 'ags-card' },
				React.createElement('span', { className: 'ags-avatar' }, '🤖'),
				React.createElement(
					'span',
					{ className: 'ags-meta' },
					React.createElement('span', { className: 'ags-name' }, agent.name !== null ? agent.name : agent.id),
					React.createElement('span', { className: 'ags-desc' }, agent.description !== null ? agent.description : agent.id),
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
		function StudioPanel() {
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
				body = React.createElement('div', { className: 'ags-note' }, '还没有自定义智能体。系统自带的四个模式不在这里显示。')
			} else {
				body = state.agents.map((agent) => React.createElement(AgentCard, { key: agent.id, agent }))
			}

			return React.createElement(
				'div',
				{ className: 'ags-root' },
				React.createElement(
					'div',
					{ className: 'ags-head' },
					React.createElement('h1', { className: 'ags-title' }, '智能体设定'),
					React.createElement('span', { className: 'ags-sub' }, '自定义智能体 · 系统自带模式不在其中'),
				),
				React.createElement('div', { className: 'ags-body' }, body),
			)
		}

		exports.name = 'agent-studio'
		exports.inject = ['slots']

		exports.apply = function apply(ctx) {
			const slots = ctx.get('slots')
			if (slots === undefined) return

			// The sidebar entry: the shell renders the button and passes { size, active }.
			slots.inject('sidebar.panellist', () =>
				slots.register({ name: 'sidebar.panellist', id: ENTRY_ID, label: ENTRY_LABEL, order: 50 }, (props) =>
					React.createElement(StudioIcon, { size: props.size, active: props.active }),
				),
			)

			// The panel body, dispatched by the same entry id.
			slots.inject('main', () =>
				slots.register({ name: 'main', key: ENTRY_ID }, () => React.createElement(StudioPanel, null)),
			)
		}

		return module.exports
	},
})
