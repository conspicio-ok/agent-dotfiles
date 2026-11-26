import type { On } from 'claude-code'

import { bashDenial, guarded, typeOf } from './permissions'

export function registerGuards(on: On): void {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      return next(e)
    }

    const denial = await bashDenial($, await typeOf($, e.agentId), e.agentId, e.command)

    return denial === null ? next(e) : { deny: denial }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'garde Bash en échec' }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await guarded($, e.agentId, e.file_path, next.signal)

    return denial === null ? next(e) : { deny: denial }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: "garde d'écriture en échec" }))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await guarded($, e.agentId, e.file_path, next.signal)

    return denial === null ? next(e) : { deny: denial }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: "garde d'écriture en échec" }))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await guarded($, e.agentId, e.notebook_path, next.signal)

    return denial === null ? next(e) : { deny: denial }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: "garde d'écriture en échec" }))
}
