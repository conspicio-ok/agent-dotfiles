import type { Agent, Task } from '../types'

import { EARLY_STEPS, FIXED_ID, TEST_TASK } from './constants'
import { isFresh, isSolo, marked, newTask, pendingDeps, runningTasks } from './tasks'

type Step = { base: string; name: string }
export type Placement = { id: string; graph: Task[] }

export function stepOf(type: string): Step | null {
  if (type === 'cadrage') {
    return { base: 'cadrage', name: 'Cadrage' }
  }

  if (type === 'chercheur') {
    return { base: 'recherche', name: 'Recherche solution' }
  }

  if (type === 'tests') {
    return { base: 'tests', name: 'Tests' }
  }

  if (type === 'conclusion') {
    return { base: 'conclusion', name: 'Conclusion' }
  }

  if (type.startsWith('audit-')) {
    return { base: type, name: `Audit ${type.slice('audit-'.length)}` }
  }

  return null
}

function rootOf(id: string): string {
  return /^tests(-|$)/.test(id) ? 'tests' : id.replace(/-\d+$/, '')
}

function idsWhere(graph: Task[], test: (root: string) => boolean): string[] {
  const ids: string[] = []

  for (const task of graph) {
    if (FIXED_ID.test(task.id) && test(rootOf(task.id))) {
      ids.push(task.id)
    }
  }

  return ids
}

function depsOf(base: string, graph: Task[]): string[] {
  if (base === 'cadrage') {
    return []
  }

  if (base === 'recherche') {
    return idsWhere(graph, root => root === 'cadrage').slice(-1)
  }

  if (base === 'conclusion') {
    return idsWhere(graph, root => root === 'tests' || root.startsWith('audit-'))
  }

  if (base.startsWith('audit-asserts-') || base === 'audit-execution') {
    return idsWhere(graph, root => EARLY_STEPS.has(root))
  }

  const free: string[] = []

  for (const task of graph) {
    if (!FIXED_ID.test(task.id) && !isSolo(task.id)) {
      free.push(task.id)
    }
  }

  return free.length > 0 ? free : idsWhere(graph, root => root === 'recherche')
}

function placeStep(step: Step, graph: Task[], held: Set<string>): Placement {
  let id = step.base

  for (let index = 2; held.has(id) && index < graph.length + 2; index += 1) {
    id = `${step.base}-${index}`
  }

  const existing = graph.find(task => task.id === id)

  if (existing === undefined) {
    return {
      id,
      graph: [...graph, newTask(id, step.name, depsOf(step.base, graph))],
    }
  }

  if (!existing.isDone) {
    return { id, graph }
  }

  let sibling = `${step.base}-2`

  for (let index = 3; graph.some(task => task.id === sibling); index += 1) {
    sibling = `${step.base}-${index}`
  }

  const deps = depsOf(step.base, graph)

  return {
    id: sibling,
    graph: [
      ...graph,
      newTask(sibling, step.name, deps.length === 0 ? idsWhere(graph, root => root === 'cadrage').slice(-1) : deps),
    ],
  }
}

export function placementOf(step: Step, graph: Task[], bound: Record<string, string>, known: Agent[]): Placement {
  if (step.base === 'cadrage' && isFresh(graph)) {
    const solos: Task[] = []

    for (const task of graph) {
      if (isSolo(task.id) && !task.isDone) {
        solos.push(task)
      }
    }

    return {
      id: step.base,
      graph: [...solos, newTask(step.base, step.name, [])],
    }
  }

  const held = runningTasks(bound, known, graph)

  if (step.base === 'tests') {
    const free = graph.find(
      task => TEST_TASK.test(task.id) && !task.isDone && !held.has(task.id) && pendingDeps(task, graph).length === 0,
    )

    if (free !== undefined) {
      return { id: free.id, graph }
    }
  }

  if (step.base !== 'cadrage') {
    return placeStep(step, graph, held)
  }

  if (!graph.some(task => task.id === 'cadrage')) {
    return {
      id: 'cadrage',
      graph: [...graph, newTask('cadrage', step.name, [])],
    }
  }

  return { id: 'cadrage', graph: marked(graph, 'cadrage', false) }
}
