import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { Agent, Task } from '../types'

import { ALLOWED_HEADER, EXECUTION_AGENT, SOLO_PREFIX, TEST_LAUNCHERS } from './constants'
import { placementOf, stepOf } from './placement'
import type { Placement } from './placement'
import { serial } from './serial'
import { allowedCommands, autoPlaced, pipelineAgents } from './state'
import { dropped, isActive, isFresh, isSolo, marked, newTask, unaged } from './tasks'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)
const ages = atom({ plugin: 'agents-board', key: 'ages' } as const, {} as Record<string, number>)

function branchOf(start: Task, finished: Map<string, Task>, seen: Set<string>): Task[] {
  const branch = [start]
  seen.add(start.id)

  for (const node of branch) {
    for (const other of finished.values()) {
      if (!seen.has(other.id) && (node.deps.includes(other.id) || other.deps.includes(node.id))) {
        seen.add(other.id)
        branch.push(other)
      }
    }
  }

  return branch
}

function commandsOf(prompt: string): string[] {
  const lines = prompt.split('\n')
  const commands: string[] = []

  if (lines[0]?.trim() !== ALLOWED_HEADER) {
    return commands
  }

  for (const line of lines.slice(1)) {
    const command = line.trim()

    if (command === '') {
      break
    }

    if (TEST_LAUNCHERS.has(command)) {
      commands.push(command)
    }
  }

  return commands
}

export function registerAgents(on: On): void {
  on('prompt.submit', async ($, e, next) => {
    await serial(async () => {
      await update($, agents, list => list.filter(agent => agent.status === 'running'))

      if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') {
        return
      }

      const [graph, aged] = await Promise.all([read($, tasks), read($, ages)])
      const finished = new Map<string, Task>()
      const counted: Record<string, number> = {}

      for (const task of graph) {
        const age = aged[task.id]

        if (age !== undefined) {
          counted[task.id] = age
        }

        if ((task.isDone || task.isInterrupted) && !isSolo(task.id)) {
          finished.set(task.id, task)
        }
      }

      const seen = new Set<string>()
      const doomed = new Set<string>()

      for (const start of finished.values()) {
        if (seen.has(start.id)) {
          continue
        }

        const branch = branchOf(start, finished, seen)
        const isOpen = graph.some(
          task => !task.isDone && !task.isInterrupted && task.deps.some(dep => branch.some(item => item.id === dep)),
        )

        if (isOpen) {
          continue
        }

        let lowest = Infinity

        for (const { id } of branch) {
          counted[id] = (counted[id] ?? 0) + 1
          lowest = Math.min(lowest, counted[id])
        }

        if (lowest >= 2) {
          for (const { id } of branch) {
            doomed.add(id)
          }
        }
      }

      await update($, ages, () => counted)

      if (doomed.size > 0) {
        await dropped($, doomed)
      }
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = 'agentId' in result ? result.agentId : undefined

    if (agentId !== undefined && e.subagentType === EXECUTION_AGENT && e.parentAgentId === undefined && e.resume === undefined) {
      allowedCommands.set(agentId, commandsOf(e.prompt))
    }

    return result
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await serial(() =>
      update($, agents, list => {
        const others: Agent[] = []

        for (const agent of list) {
          if (agent.id !== e.agent_id) {
            others.push(agent)
          }
        }

        return [...others, { id: e.agent_id, type: e.agent_type, status: 'running' }]
      }),
    )

    const result = await next(e)
    const step = stepOf(e.agent_type)

    const placedId = await serial(async () => {
      const [graph, bound, known] = await Promise.all([read($, tasks), read($, bindings), read($, agents)])
      const resumed = bound[e.agent_id]

      if (resumed !== undefined && graph.some(task => task.id === resumed)) {
        await update($, tasks, current => marked(current, resumed, false))
        await update($, ages, current => unaged(current, resumed))

        return resumed
      }

      if (step === null) {
        const description = (await $.agent.list()).find(agent => agent.id === e.agent_id)?.description
        const solo = newTask(`${SOLO_PREFIX}${e.agent_id}`, description ?? e.agent_type, [])

        await update($, tasks, current =>
          current.some(task => task.id === solo.id) ? marked(current, solo.id, false) : [...current, solo],
        )
        await update($, ages, current => unaged(current, solo.id))
        autoPlaced.set(e.agent_id, solo.id)
        await update($, bindings, current => ({ ...current, [e.agent_id]: solo.id }))
        pipelineAgents.add(e.agent_id)

        return solo.id
      }

      if (step.base === 'cadrage' && isFresh(graph)) {
        const old = new Set<string>()
        const solos = new Set<string>()

        for (const task of graph) {
          if (!isSolo(task.id)) {
            old.add(task.id)
          } else if (!task.isDone) {
            solos.add(task.id)
          }
        }

        await dropped($, old)
        await update($, bindings, current => {
          const kept: Record<string, string> = {}

          for (const [agent, id] of Object.entries(current)) {
            if (solos.has(id)) {
              kept[agent] = id
            }
          }

          return kept
        })
      }

      let placed: Placement = { id: step.base, graph: [] }
      let isCreated = false

      await update($, tasks, current => {
        placed = placementOf(step, current, bound, known)
        isCreated = !current.some(task => task.id === placed.id)

        return placed.graph
      })

      if (isCreated) {
        autoPlaced.set(e.agent_id, placed.id)
      }

      await update($, bindings, current => ({ ...current, [e.agent_id]: placed.id }))
      await update($, ages, current => unaged(current, placed.id))

      pipelineAgents.add(e.agent_id)

      return placed.id
    })

    if (placedId === null) {
      return result
    }

    return {
      ...result,
      additionalContext: [...(result.additionalContext ?? []), `Ta tâche pipeline : ${placedId}`],
    }
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await serial(async () => {
      await update($, agents, list =>
        list.map(agent => (agent.id === e.agent_id ? { ...agent, status: 'done' } : agent)),
      )

      const [graph, bound, known] = await Promise.all([read($, tasks), read($, bindings), read($, agents)])
      const taskId = bound[e.agent_id]
      const isHeld = Object.entries(bound).some(
        ([other, id]) => other !== e.agent_id && id === taskId && isActive(other, id, known, graph),
      )

      if (taskId === undefined || isHeld) {
        return
      }

      if (e.agent_type === 'cadrage' || e.agent_type === 'conclusion') {
        await update($, tasks, current => marked(current, taskId, true))
        await update($, ages, current => unaged(current, taskId))

        return
      }

      if (isSolo(taskId)) {
        await dropped($, new Set([taskId]))

        return
      }

      await update($, tasks, current => {
        const result: Task[] = []

        for (const task of current) {
          result.push(task.id === taskId && !task.isDone ? { ...task, isInterrupted: true } : task)
        }

        return result
      })
      await update($, ages, current => unaged(current, taskId))
    })

    $.clock.after(3000, () =>
      void serial(() =>
        update($, agents, list => {
          const remaining: Agent[] = []

          for (const agent of list) {
            if (agent.id !== e.agent_id || agent.status === 'running') {
              remaining.push(agent)
            }
          }

          return remaining
        }),
      ),
    )

    return next(e)
  })
}
