/**
 * dsh-agent-studio/persona — the agent file model, host half.
 *
 * Replaces `@deepseek-ai/dsh-persona` inside an agent preset: instead of
 * inlining the persona text in the composition, it registers the same
 * `deployment:persona-prefix` / `deployment:persona-suffix` sections with
 * FUNCTION-valued text, so the files are re-read on every prompt assembly.
 *
 * Why a function and not a string: `dsh-system-prompt` evaluates
 * `typeof section.text === 'function' ? section.text(context) : section.text`
 * during assembly, and interpolates `{{…}}` afterwards. That means editing
 * SOUL.md takes effect on the next model step — no restart, no remount, no
 * regeneration step. It is what makes "one agent = one directory of files"
 * behave like a live document rather than a build artifact.
 *
 * The files are concatenated in a fixed order and each stream is trimmed; a
 * missing file is simply absent rather than fatal, so a new agent can start
 * with only a SOUL.md and grow the rest.
 *
 * This module is deliberately host-only: it publishes no service and touches
 * no browser surface.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'agent-studio-persona'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/**
 * Concatenation order, and it is a deliberate one:
 * who she is → what her job is → who she works for → what she has learned.
 */
const FILES = ['SOUL.md', 'AGENT.md', 'USER.md', 'MEMORY.md']

/** The one line that has to come before the files: it names her and the route. */
const OPENER = '你是「萧潇」，一位私人助理·情报官·调度前端，powered by the {{model}} model。'

/** Closing line, mirroring the shipped persona row's default suffix. */
const SUFFIX = 'Your working directory is {{cwd}}.'

export function apply(ctx, config = {}) {
  const dir = typeof config.dir === 'string' && config.dir !== '' ? config.dir : undefined
  if (dir === undefined) {
    throw new Error('agent-studio/persona: `dir` is required (the agent preset directory)')
  }

  /**
   * Read the agent's files, in order, skipping absent or whitespace-only ones.
   * A read failure is treated as "this file has nothing to say" — never as a
   * reason to drop the agent's whole identity.
   */
  function readFiles() {
    const parts = []
    for (const file of FILES) {
      try {
        const text = readFileSync(join(dir, file), 'utf8').trim()
        if (text !== '') parts.push(text)
      } catch {
        /* absent file: nothing to contribute */
      }
    }
    return parts.join('\n\n')
  }

  ctx.systemPrompt.section({
    name: 'deployment:persona-prefix',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    text: () => {
      const body = readFiles()
      return body === '' ? OPENER : `${OPENER}\n\n${body}`
    },
  })

  ctx.systemPrompt.section({
    name: 'deployment:persona-suffix',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
    text: SUFFIX,
  })
}
