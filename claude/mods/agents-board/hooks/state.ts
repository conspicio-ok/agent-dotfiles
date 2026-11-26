import type { Timer } from 'claude-code'

type ScrollRequest = { in: string; to: { key: string }; block: 'center' }

export const pipelineAgents = new Set<string>()
export const writers = new Set<string>()
export const autoPlaced = new Map<string, string>()
export const allowedCommands = new Map<string, string[]>()

export const scroll = {
  offset: 0,
  isManual: false,
  readySignature: '',
  request: null as ScrollRequest | null,
  timer: null as Timer | null,
}

export const pan = {
  offset: 0,
  target: 0,
  timer: null as Timer | null,
}
