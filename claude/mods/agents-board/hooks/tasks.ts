import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, Task } from '../types'

import { SOLO_PREFIX } from './constants'
import { autoPlaced, pipelineAgents, writers } from './state'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)
const ages = atom({ plugin: 'agents-board', key: 'ages' } as const, {} as Record<string, number>)

export function isSolo(id: string): boolean {
  return id.startsWith(SOLO_PREFIX)
}

export function newTask(id: string, name: string, deps: string[]): Task {
  return { id, name, deps, files: [], isDone: false, isInterrupted: false }
}

export function isActive(agentId: string, taskId: string, known: Agent[], graph: Task[]): boolean {
  return (
    known.some(agent => agent.id === agentId && agent.status === 'running') &&
    graph.some(task => task.id === taskId && !task.isDone)
  )
}

export function runningTasks(bound: Record<string, string>, known: Agent[], graph: Task[]): Set<string> {
  const held = new Set<string>()

  for (const [agent, id] of Object.entries(bound)) {
    if (isActive(agent, id, known, graph)) {
      held.add(id)
    }
  }

  return held
}

export function marked(graph: Task[], id: string | undefined, isDone: boolean): Task[] {
  const result: Task[] = []

  for (const task of graph) {
    result.push(task.id === id ? { ...task, isDone, isInterrupted: false } : task)
  }

  return result
}

export function isFresh(graph: Task[]): boolean {
  return graph.every(task => task.isDone || task.isInterrupted || isSolo(task.id))
}

export function unaged(current: Record<string, number>, id: string): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [key, age] of Object.entries(current)) {
    if (key !== id) {
      result[key] = age
    }
  }

  return result
}

export async function dropped($: EngineInterface, ids: Set<string>): Promise<void> {
  const bound = await read($, bindings)
  const freed = new Set<string>()

  for (const [agent, id] of Object.entries(bound)) {
    if (ids.has(id)) {
      freed.add(agent)
    }
  }

  await update($, tasks, list => list.filter(task => !ids.has(task.id)))
  await update($, bindings, current => {
    const kept: Record<string, string> = {}

    for (const [agent, id] of Object.entries(current)) {
      if (!ids.has(id)) {
        kept[agent] = id
      }
    }

    return kept
  })
  await update($, agents, list => list.filter(agent => !freed.has(agent.id)))

  for (const agent of freed) {
    pipelineAgents.delete(agent)
    writers.delete(agent)
  }

  for (const [agent, id] of [...autoPlaced]) {
    if (ids.has(id)) {
      autoPlaced.delete(agent)
    }
  }

  await update($, ages, current => {
    const kept: Record<string, number> = {}

    for (const [id, age] of Object.entries(current)) {
      if (!ids.has(id)) {
        kept[id] = age
      }
    }

    return kept
  })
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function parseTask(item: unknown): Task | null {
  const raw = item as Record<string, unknown> | null
  const isValid =
    typeof raw === 'object' &&
    raw !== null &&
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    isStringList(raw.deps) &&
    (raw.files === undefined || isStringList(raw.files))

  if (!isValid) {
    return null
  }

  return {
    ...newTask(raw.id as string, raw.name as string, raw.deps as string[]),
    files: (raw.files as string[] | undefined) ?? [],
  }
}

export function parseTasks(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) {
    return null
  }

  const parsed = raw.map(parseTask)
  const ids = new Set(parsed.map(task => task?.id))

  return parsed.every(task => task !== null) && ids.size === parsed.length ? (parsed as Task[]) : null
}

export function pendingDeps(task: Task, graph: Task[]): string[] {
  return task.deps.filter(dep => graph.some(item => item.id === dep && !item.isDone))
}

export function pendingDenial(task: Task, graph: Task[]): string | null {
  const pending = pendingDeps(task, graph)

  return pending.length > 0 ? `tâche ${task.id} en attente de : ${pending.join(', ')}` : null
}
