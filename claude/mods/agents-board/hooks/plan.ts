import type { Task } from '../types'

import { TEST_TASK, TESTS_GROUP } from './constants'
import { gutterLength } from './gutter'
import { layoutOf, levelsOf, reducedOf } from './layout'
import { newTask } from './tasks'

const DONE_STATE = { color: '#2f4a3a', mark: '✓' }
const INTERRUPTED_STATE = { color: '#5a3a1e', mark: '✗' }
const RUNNING_STATE = { color: '#2f4260', mark: '●' }
const READY_STATE = { color: '#3a3a40', mark: '●' }
const WAITING_STATE = { color: '#3a3a40', mark: '○' }

function statesOf(graph: Task[], active: Set<string>) {
  const doneIds = new Set(graph.filter(task => task.isDone).map(task => task.id))
  const known = new Set(graph.map(task => task.id))

  return (task: Task) => {
    if (task.isDone) {
      return DONE_STATE
    }

    if (task.isInterrupted) {
      return INTERRUPTED_STATE
    }

    if (active.has(task.id)) {
      return RUNNING_STATE
    }

    const isReady = task.deps.filter(dep => known.has(dep)).every(dep => doneIds.has(dep))

    return isReady ? READY_STATE : WAITING_STATE
  }
}

export function planOf(graph: Task[], active: Set<string>) {
  const members: Task[] = []

  for (const task of graph) {
    if (TEST_TASK.test(task.id)) {
      members.push(task)
    }
  }

  if (members.length < 3) {
    const columns = levelsOf(graph)

    return { graph, columns, stateOf: statesOf(graph, active), ...layoutOf(reducedOf(columns)) }
  }

  const memberIds = new Set<string>()

  for (const member of members) {
    memberIds.add(member.id)
  }

  const groupDeps = new Set<string>()

  for (const member of members) {
    for (const dep of member.deps) {
      if (!memberIds.has(dep)) {
        groupDeps.add(dep)
      }
    }
  }

  const group: Task = { ...newTask(TESTS_GROUP, 'Tests', [...groupDeps]), isDone: members.every(task => task.isDone) }
  const shown: Task[] = []

  for (const task of graph) {
    if (task === members[0]) {
      shown.push(group)
    }

    if (memberIds.has(task.id)) {
      continue
    }

    const deps = new Set<string>()

    for (const dep of task.deps) {
      deps.add(memberIds.has(dep) ? TESTS_GROUP : dep)
    }

    shown.push({ ...task, deps: [...deps] })
  }

  const memberStateOf = statesOf(graph, active)
  const isGroupRunning = members.some(member => active.has(member.id))
  const isGroupReady = members.some(member => memberStateOf(member) === READY_STATE)
  const shownStateOf = statesOf(shown, active)
  const stateOf = (task: Task) => {
    if (task.id !== TESTS_GROUP) {
      return shownStateOf(task)
    }

    return group.isDone ? DONE_STATE : isGroupRunning ? RUNNING_STATE : isGroupReady ? READY_STATE : WAITING_STATE
  }
  const columns = levelsOf(shown)

  return { graph: shown, columns, stateOf, ...layoutOf(reducedOf(columns)) }
}

export function labelWidth(task: Task): number {
  return task.name.length + 4
}

export function horizontalWidthOf(plan: ReturnType<typeof planOf>): number {
  const columnsWidth = plan.columns.reduce((sum, column) => sum + Math.max(...column.map(labelWidth)), 0)

  return columnsWidth + plan.edges.reduce((sum, group) => sum + gutterLength(group), 0)
}
