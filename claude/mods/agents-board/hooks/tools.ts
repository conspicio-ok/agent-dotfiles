import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { Agent, Task } from '../types'

import { DONE_TOOL, GRAPH_TOOL, SOLO_PREFIX, START_TOOL, TASK_PLANNERS, TASK_TOOL } from './constants'
import { changeDenial, startDenial, typeOf } from './permissions'
import { serial } from './serial'
import { autoPlaced, pipelineAgents, writers } from './state'
import { dropped, isActive, isSolo, marked, parseTask, parseTasks, pendingDenial, runningTasks, unaged } from './tasks'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)
const ages = atom({ plugin: 'agents-board', key: 'ages' } as const, {} as Record<string, number>)

export function registerTools(on: On): void {
  on('session.start', async ($, e, next) => {
    const taskSchema = {
      type: 'object',
      required: ['id', 'name', 'deps'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        deps: { type: 'array', items: { type: 'string' } },
        files: { type: 'array', items: { type: 'string' } },
      },
    }

    await $.tool.register({
      name: 'pipeline_graph',
      description:
        'Replace the whole task graph of the pipeline. Each task: id, name, deps (ids of tasks it depends on), files (paths the task may write). An empty list clears the graph.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        required: ['tasks'],
        properties: { tasks: { type: 'array', items: taskSchema } },
      },
    })

    await $.tool.register({
      name: 'pipeline_task',
      description:
        'Add one task to the pipeline graph, or update the task with the same id. Fields: id, name, deps (ids of tasks it depends on), files (paths the task may write).',
      isDeferred: false,
      inputSchema: taskSchema,
    })

    await $.tool.register({
      name: 'pipeline_start',
      description:
        'Subagents only: announce which pipeline task this agent works on, by its id. Required before writing files.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    })

    await $.tool.register({
      name: 'pipeline_done',
      description: 'Mark a task of the pipeline graph as done, by its id.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    })

    return next(e)
  })

  on('tool.run', { tool: GRAPH_TOOL }, ($, e) =>
    serial(async () => {
      const input = e as Record<string, unknown>

      if (input.agentId !== undefined) {
        return { deny: "pipeline_graph : réservé à l'orchestrateur" }
      }

      const parsed = parseTasks(input.tasks)

      if (parsed === null) {
        return { deny: 'pipeline_graph : tasks doit être une liste de { id, name, deps, files? } aux identifiants uniques' }
      }

      if (parsed.some(task => isSolo(task.id))) {
        return { deny: `pipeline_graph : préfixe ${SOLO_PREFIX} réservé au mod` }
      }

      const [current, bound, cwd, known] = await Promise.all([
        read($, tasks),
        read($, bindings),
        $.session.cwd(),
        read($, agents),
      ])
      const next = [...parsed, ...current.filter(task => isSolo(task.id) && !task.isDone)]
      const denial = await changeDenial($, next, current, bound, cwd, runningTasks(bound, known, current))

      if (denial !== null) {
        return { deny: `pipeline_graph : ${denial}` }
      }

      const kept = new Set(next.map(task => task.id))
      const removed = new Set<string>()

      for (const task of current) {
        if (!kept.has(task.id)) {
          removed.add(task.id)
        }
      }

      await dropped($, removed)
      await update($, tasks, () => next)
      await update($, bindings, list => {
        const result: Record<string, string> = {}

        for (const [agent, id] of Object.entries(list)) {
          if (kept.has(id)) {
            result[agent] = id
          }
        }

        return result
      })
      await update($, ages, () => ({}))

      return { result: `graph set: ${parsed.length} tasks` }
    }),
  )

  on('tool.run', { tool: TASK_TOOL }, ($, e) =>
    serial(async () => {
      const { agentId } = e as { agentId?: string }

      if (agentId !== undefined) {
        const type = await typeOf($, agentId)

        if (type === undefined || !TASK_PLANNERS.has(type)) {
          return { deny: `pipeline_task : réservé à l'orchestrateur et au chercheur, pas à ${type ?? 'un agent inconnu'}` }
        }
      }

      const parsed = parseTask(e)

      if (parsed === null) {
        return { deny: 'pipeline_task : attendu { id, name, deps, files? }' }
      }

      if (isSolo(parsed.id)) {
        return { deny: `pipeline_task : préfixe ${SOLO_PREFIX} réservé au mod` }
      }

      const [current, bound, cwd] = await Promise.all([read($, tasks), read($, bindings), $.session.cwd()])
      const denial = await changeDenial($, [parsed], current, bound, cwd, new Set())

      if (denial !== null) {
        return { deny: `pipeline_task : ${denial}` }
      }

      await update($, tasks, list =>
        list.some(task => task.id === parsed.id)
          ? list.map(task => (task.id === parsed.id ? { ...parsed, isDone: task.isDone } : task))
          : [...list, parsed],
      )
      await update($, ages, current => unaged(current, parsed.id))

      return { result: `task set: ${parsed.id}` }
    }),
  )

  on('tool.run', { tool: START_TOOL }, ($, e) =>
    serial(async () => {
      const { id, agentId } = e as { id?: unknown; agentId?: string }

      if (agentId === undefined) {
        return { deny: 'pipeline_start : réservé aux sous-agents' }
      }

      const [graph, bound, known] = await Promise.all([read($, tasks), read($, bindings), read($, agents)])
      const task = graph.find(item => item.id === id)

      if (task === undefined) {
        return { deny: `pipeline_start : tâche inconnue ${String(id)}` }
      }

      const denial = startDenial(task, agentId, graph, bound, known, writers.has(agentId))

      if (denial !== null) {
        return { deny: `pipeline_start : ${denial}` }
      }

      await update($, bindings, current => ({ ...current, [agentId]: task.id }))
      await update($, ages, current => unaged(current, task.id))
      pipelineAgents.add(agentId)

      const auto = autoPlaced.get(agentId)

      if (auto !== undefined && auto !== task.id) {
        autoPlaced.delete(agentId)
        const isShared = Object.entries(bound).some(([other, id]) => other !== agentId && id === auto)

        if (!isShared) {
          await update($, tasks, current => {
            const kept: Task[] = []

            for (const item of current) {
              if (item.id !== auto || item.isDone) {
                kept.push(item)
              }
            }

            return kept
          })
        }
      }

      return { result: `started: ${task.id}` }
    }),
  )

  on('tool.run', { tool: DONE_TOOL }, ($, e) =>
    serial(async () => {
      const { id, agentId } = e as { id?: unknown; agentId?: string }
      const [graph, bound, known] = await Promise.all([read($, tasks), read($, bindings), read($, agents)])
      const task = graph.find(item => item.id === id)

      if (task === undefined) {
        return { deny: `pipeline_done : tâche inconnue ${String(id)}` }
      }

      if (agentId !== undefined) {
        const isOthers = Object.entries(bound).some(
          ([other, taskId]) => taskId === task.id && other !== agentId && isActive(other, taskId, known, graph),
        )
        const pending = pendingDenial(task, graph)

        if (isOthers) {
          return { deny: `pipeline_done : tâche ${task.id} rattachée à un autre agent` }
        }

        if (pending !== null) {
          return { deny: `pipeline_done : ${pending}` }
        }
      }

      if (isSolo(task.id)) {
        await dropped($, new Set([task.id]))

        return { result: `done: ${task.id}` }
      }

      await update($, tasks, current => marked(current, task.id, true))
      await update($, ages, current => unaged(current, task.id))

      return { result: `done: ${task.id}` }
    }),
  )
}
