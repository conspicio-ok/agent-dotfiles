import type { Register } from 'claude-code'

import { registerAgents } from './agents'
import { registerBoard } from './board'
import { registerGuards } from './guards'
import { registerTools } from './tools'

export const register: Register = on => {
  registerTools(on)
  registerGuards(on)
  registerAgents(on)
  registerBoard(on)
}
