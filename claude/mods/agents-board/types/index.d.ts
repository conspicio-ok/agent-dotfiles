export type Agent = { id: string; type: string; status: 'running' | 'done' }

export type Task = { id: string; name: string; deps: string[]; files: string[]; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'agents-board': { agents: Agent[]; tasks: Task[]; bindings: Record<string, string> }
  }
}
