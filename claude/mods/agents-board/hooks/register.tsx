import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Agent, Task } from '../types'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)

const GRAPH_TOOL = 'mcp__agents-board__pipeline_graph'
const TASK_TOOL = 'mcp__agents-board__pipeline_task'
const START_TOOL = 'mcp__agents-board__pipeline_start'
const DONE_TOOL = 'mcp__agents-board__pipeline_done'

const READ_ONLY_AGENTS = new Set([
  'audit-proprete',
  'audit-securite',
  'audit-cadrage',
  'audit-asserts-code',
  'audit-asserts-cadrage',
])
const SCOPED_WRITERS = new Set(['implementeur', 'tests'])
const TASK_PLANNERS = new Set(['chercheur'])
const READ_ONLY_COMMAND =
  /^(git( -C [^\s;&|<>`$()\\]+)? (diff|status|log|show|ls-files|grep|blame)|grep|rg|ls|find|cat|head|tail|wc|file|stat|diff)( [^;&|<>`$()\\\n]*)?$/
const UNSAFE_OPTION =
  /(^|\s)(--output|--ext-diff|--textconv|--pre|-exec|-execdir|-ok|-okdir|-delete|-fprint|-fprint0|-fprintf|-fls)(=|\s|$)/

const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8
const SCROLL_TICK_MS = 40
const SCROLL_EASING = 4

type Node = { id: string; isPass: boolean; parents: string[] }
type Edge = { from: number; to: number; isJoin: boolean }
type ScrollRequest = { in: string; to: { key: string }; block: 'center' }
type Mode = 'horizontal' | 'vertical' | 'staggered'

const scroll = {
  offset: 0,
  isManual: false,
  readySignature: '',
  request: null as ScrollRequest | null,
  timer: null as Timer | null,
}

const GLYPHS: Record<number, string> = {
  [LEFT | RIGHT]: '─',
  [UP | DOWN]: '│',
  [RIGHT | DOWN]: '┌',
  [LEFT | DOWN]: '┐',
  [RIGHT | UP]: '└',
  [LEFT | UP]: '┘',
  [UP | DOWN | RIGHT]: '├',
  [UP | DOWN | LEFT]: '┤',
  [LEFT | RIGHT | DOWN]: '┬',
  [LEFT | RIGHT | UP]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}

function glyphOf(mask: number): string {
  if (mask === 0) {
    return ' '
  }

  return GLYPHS[mask] ?? (mask & (UP | DOWN) ? '│' : '─')
}

function cancelScroll(): void {
  scroll.timer?.cancel()
  scroll.timer = null
  scroll.request = null
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function parseTask(item: unknown): Task | null {
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
    id: raw.id as string,
    name: raw.name as string,
    deps: raw.deps as string[],
    files: (raw.files as string[] | undefined) ?? [],
    isDone: false,
  }
}

function parseTasks(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) {
    return null
  }

  const parsed = raw.map(parseTask)
  const ids = new Set(parsed.map(task => task?.id))

  return parsed.every(task => task !== null) && ids.size === parsed.length ? (parsed as Task[]) : null
}

function normalize(path: string): string {
  const parts: string[] = []

  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue
    }

    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }

  return `/${parts.join('/')}`
}

function absolute(cwd: string, path: string): string {
  return normalize(path.startsWith('/') ? path : `${cwd}/${path}`)
}

function isInside(cwd: string, path: string): boolean {
  const root = normalize(cwd)
  const target = absolute(cwd, path)

  return root === '/' || target === root || target.startsWith(`${root}/`)
}

function isSameFiles(left: string[], right: string[]): boolean {
  const set = new Set(left)

  return set.size === new Set(right).size && right.every(file => set.has(file))
}

function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim()

  return READ_ONLY_COMMAND.test(trimmed) && !UNSAFE_OPTION.test(trimmed)
}

function pendingDeps(task: Task, graph: Task[]): string[] {
  return task.deps.filter(dep => graph.some(item => item.id === dep && !item.isDone))
}

function changeDenial(next: Task[], current: Task[], bound: Record<string, string>, cwd: string): string | null {
  for (const task of next) {
    const outside = task.files.find(file => !isInside(cwd, file))

    if (outside !== undefined) {
      return `chemin hors du projet pour la tâche ${task.id} : ${outside}`
    }
  }

  for (const id of new Set(Object.values(bound))) {
    const before = current.find(task => task.id === id)
    const after = next.find(task => task.id === id)

    if (before !== undefined && !before.isDone && after !== undefined && !isSameFiles(before.files, after.files)) {
      return `tâche ${id} en cours : ses fichiers sont figés`
    }
  }

  return null
}

function startDenial(task: Task, agentId: string, graph: Task[], bound: Record<string, string>, known: Agent[]): string | null {
  if (task.isDone) {
    return `tâche ${task.id} déjà faite`
  }

  const pending = pendingDeps(task, graph)

  if (pending.length > 0) {
    return `tâche ${task.id} en attente de : ${pending.join(', ')}`
  }

  const current = bound[agentId]

  if (current !== undefined && current !== task.id && graph.some(item => item.id === current && !item.isDone)) {
    return `déjà rattaché à la tâche ${current}`
  }

  const isTaken = Object.entries(bound).some(
    ([other, id]) => id === task.id && other !== agentId && known.some(agent => agent.id === other && agent.status === 'running'),
  )

  return isTaken ? `tâche ${task.id} déjà prise par un autre agent` : null
}

async function typeOf($: EngineInterface, agentId: string): Promise<string | undefined> {
  const known = (await read($, agents)).find(agent => agent.id === agentId)

  if (known !== undefined) {
    return known.type
  }

  return (await $.agent.list()).find(agent => agent.id === agentId)?.type
}

async function writeDenial($: EngineInterface, agentId: string, filePath: string): Promise<string | null> {
  const [type, graph, bound, cwd] = await Promise.all([
    typeOf($, agentId),
    read($, tasks),
    read($, bindings),
    $.session.cwd(),
  ])

  if (type === undefined) {
    return `agent inconnu : écriture refusée sur ${filePath}`
  }

  const task = graph.find(item => item.id === bound[agentId])

  if (task === undefined) {
    if (SCOPED_WRITERS.has(type) || graph.some(item => !item.isDone)) {
      return `${type} : appelle pipeline_start avec l'identifiant de ta tâche avant d'écrire`
    }

    return null
  }

  const target = absolute(cwd, filePath)

  if (task.files.some(file => absolute(cwd, file) === target)) {
    return null
  }

  return `hors périmètre : ${filePath}. Fichiers de la tâche ${task.id} : ${task.files.join(', ') || 'aucun'}`
}

function levelsOf(list: Task[]): Task[][] {
  const byId = new Map(list.map(task => [task.id, task]))
  const memo = new Map<string, number>()
  const open = new Set<string>()

  const levelOf = (task: Task): number => {
    const known = memo.get(task.id)

    if (known !== undefined) {
      return known
    }

    if (open.has(task.id)) {
      return 0
    }

    open.add(task.id)
    const parents = task.deps.map(dep => byId.get(dep)).filter((dep): dep is Task => dep !== undefined)
    const level = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(levelOf))
    open.delete(task.id)
    memo.set(task.id, level)

    return level
  }

  const columns: Task[][] = []

  for (const task of list) {
    const level = levelOf(task)
    columns[level] = [...(columns[level] ?? []), task]
  }

  return columns.filter(Boolean)
}

function groupedGraph(graph: Task[]): { graph: Task[]; idOf: Map<string, string> } {
  const groups = new Map<string, { domain: string; members: Task[] }>()

  levelsOf(graph).forEach((column, level) => {
    for (const task of column) {
      const domain = task.name.includes(':') ? task.name.split(':')[0].trim() : ''
      const key = domain === '' ? `task:${task.id}` : `${level}:${domain}`
      const group = groups.get(key) ?? { domain, members: [] }
      group.members.push(task)
      groups.set(key, group)
    }
  })

  const idOf = new Map<string, string>()

  for (const [key, { members }] of groups) {
    for (const member of members) {
      idOf.set(member.id, members.length === 1 ? member.id : `group:${key}`)
    }
  }

  const merged = [...groups.values()].map(({ domain, members }) => {
    const id = idOf.get(members[0].id) ?? members[0].id
    const deps = [...new Set(members.flatMap(member => member.deps).map(dep => idOf.get(dep) ?? dep))].filter(dep => dep !== id)

    if (members.length === 1) {
      return { ...members[0], deps }
    }

    return {
      id,
      name: `${domain}: ${members.length} tasks`,
      deps,
      files: members.flatMap(member => member.files),
      isDone: members.every(member => member.isDone),
    }
  })

  return { graph: merged, idOf }
}

function layoutOf(columns: Task[][]) {
  const levelById = new Map(columns.flatMap((column, index) => column.map(task => [task.id, index] as const)))
  const nodes: Node[][] = columns.map(column => column.map(task => ({ id: task.id, isPass: false, parents: [] })))

  columns.forEach((column, level) =>
    column.forEach((task, position) => {
      for (const dep of new Set(task.deps)) {
        const depLevel = levelById.get(dep)

        if (depLevel === undefined || depLevel >= level) {
          continue
        }

        let previous = dep

        for (let passLevel = depLevel + 1; passLevel < level; passLevel += 1) {
          const id = `${dep}>${task.id}@${passLevel}`
          nodes[passLevel].push({ id, isPass: true, parents: [previous] })
          previous = id
        }

        nodes[level][position].parents.push(previous)
      }
    }),
  )

  const starts = new Map<string, number>()
  const childrenOf = new Map<string, string[]>()
  const centerOf = (ids: string[]) => {
    const positions = ids.map(id => starts.get(id) ?? 0)

    return Math.round((Math.min(...positions) + Math.max(...positions)) / 2)
  }

  nodes.flat().forEach(node =>
    node.parents.forEach(parent => childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), node.id])),
  )

  nodes.forEach(column => {
    const desiredOf = (node: Node) => {
      if (node.parents.length !== 1) {
        return node.parents.length === 0 ? 0 : centerOf(node.parents)
      }

      const siblings = childrenOf.get(node.parents[0]) ?? [node.id]

      return (starts.get(node.parents[0]) ?? 0) + 2 * siblings.indexOf(node.id) - (siblings.length - 1)
    }

    let nextFree = -Infinity

    for (const node of [...column].sort((a, b) => desiredOf(a) - desiredOf(b))) {
      const start = Math.max(desiredOf(node), nextFree)
      starts.set(node.id, start)
      nextFree = start + 2
    }
  })

  const lowest = Math.min(...starts.values())
  const startOf = (id: string) => (starts.get(id) ?? 0) - lowest
  const placed = new Map(columns.flat().map(task => [task.id, { start: startOf(task.id) }]))
  const passes = new Set(
    nodes.flatMap((column, level) => column.filter(node => node.isPass).map(node => `${level}:${startOf(node.id)}`)),
  )
  const edges: Edge[][] = nodes.slice(1).map(column =>
    column.flatMap(node =>
      node.parents.map(parent => ({ from: startOf(parent), to: startOf(node.id), isJoin: node.parents.length > 1 })),
    ),
  )
  const height = Math.max(...[...starts.keys()].map(id => startOf(id) + 1))

  return { placed, passes, edges, height }
}

function statesOf(graph: Task[]) {
  const doneIds = new Set(graph.filter(task => task.isDone).map(task => task.id))
  const known = new Set(graph.map(task => task.id))

  return (task: Task) => {
    if (task.isDone) {
      return { color: '#2f4a3a', mark: '✓' }
    }

    const isReady = task.deps.filter(dep => known.has(dep)).every(dep => doneIds.has(dep))

    return isReady ? { color: '#2f4260', mark: '●' } : { color: '#3a3a40', mark: '○' }
  }
}

function planOf(graph: Task[], idOf: Map<string, string>) {
  const columns = levelsOf(graph)

  return { graph, idOf, columns, stateOf: statesOf(graph), ...layoutOf(columns) }
}

function transposed(mask: number): number {
  return (mask & LEFT ? UP : 0) | (mask & RIGHT ? DOWN : 0) | (mask & UP ? LEFT : 0) | (mask & DOWN ? RIGHT : 0)
}

function groupOf(edge: Edge): string {
  return edge.isJoin ? `join-${edge.to}` : `split-${edge.from}`
}

function colorIntervals(
  intervals: [string, number, number][],
  firstTrack: number,
  stride: number,
  tracks: Map<string, number>,
): number {
  const trackEnds: number[] = []

  for (const [group, start, end] of [...intervals].sort((a, b) => a[1] - b[1])) {
    const free = trackEnds.findIndex(trackEnd => trackEnd < start)
    const index = free === -1 ? trackEnds.length : free
    trackEnds[index] = end
    tracks.set(group, firstTrack + index * stride)
  }

  return trackEnds.length * stride
}

function trackPlan(edges: Edge[]): { tracks: Map<string, number>; length: number } {
  const spans = new Map<string, [number, number, boolean]>()

  for (const edge of edges.filter(item => item.from !== item.to)) {
    const group = groupOf(edge)
    const [start, end] = spans.get(group) ?? [Infinity, -Infinity]
    spans.set(group, [Math.min(start, edge.from, edge.to), Math.max(end, edge.from, edge.to), edge.isJoin])
  }

  const intervalsOf = (isJoin: boolean): [string, number, number][] =>
    [...spans].filter(([, span]) => span[2] === isJoin).map(([group, [start, end]]) => [group, start, end])
  const tracks = new Map<string, number>()
  const splitCount = colorIntervals(intervalsOf(false), 0, 2, tracks)
  const joinCount = colorIntervals(intervalsOf(true), splitCount, 1, tracks)

  return { tracks, length: Math.max(1, splitCount + joinCount) }
}

function gutterLength(edges: Edge[]): number {
  return trackPlan(edges).length
}

function gutterMasks(edges: Edge[], height: number): number[][] {
  const { tracks, length } = trackPlan(edges)
  const masks = Array.from({ length: height }, () => Array<number>(length).fill(0))

  for (const { from, to, isJoin } of edges) {
    if (from === to) {
      for (let x = 0; x < length; x += 1) {
        masks[from][x] |= LEFT | RIGHT
      }

      continue
    }

    const isDown = to > from
    const toward = isDown ? DOWN : UP
    const back = isDown ? UP : DOWN
    const [top, bottom] = isDown ? [from, to] : [to, from]
    const track = tracks.get(groupOf({ from, to, isJoin })) ?? 0

    for (let x = 0; x < track; x += 1) {
      masks[from][x] |= LEFT | RIGHT
    }

    masks[from][track] |= LEFT | toward
    masks[to][track] |= back | RIGHT

    for (let row = top + 1; row < bottom; row += 1) {
      masks[row][track] |= UP | DOWN
    }

    for (let x = track + 1; x < length; x += 1) {
      masks[to][x] |= LEFT | RIGHT
    }
  }

  return masks
}

function labelWidth(task: Task): number {
  return task.name.length + 4
}

function horizontalWidthOf(plan: ReturnType<typeof planOf>): number {
  const columnsWidth = plan.columns.reduce((sum, column) => sum + Math.max(...column.map(labelWidth)), 0)

  return columnsWidth + plan.edges.reduce((sum, group) => sum + gutterLength(group), 0)
}

function verticalStepOf(plan: ReturnType<typeof planOf>, mode: Mode): { widest: number; step: number } {
  const widest = Math.max(...plan.graph.map(labelWidth))

  return { widest, step: Math.ceil((widest + 1) / (mode === 'staggered' ? 4 : 2)) }
}

function verticalWidthOf(plan: ReturnType<typeof planOf>, mode: Mode): number {
  const { widest, step } = verticalStepOf(plan, mode)

  return Math.floor(widest / 2) + (plan.height - 1) * step + Math.ceil(widest / 2)
}

export const register: Register = on => {
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

  on('tool.run', { tool: GRAPH_TOOL }, async ($, e) => {
    const input = e as Record<string, unknown>

    if (input.agentId !== undefined) {
      return { deny: "pipeline_graph : réservé à l'orchestrateur" }
    }

    const parsed = parseTasks(input.tasks)

    if (parsed === null) {
      return { deny: 'pipeline_graph : tasks doit être une liste de { id, name, deps, files? } aux identifiants uniques' }
    }

    const [current, bound, cwd] = await Promise.all([read($, tasks), read($, bindings), $.session.cwd()])
    const denial = changeDenial(parsed, current, bound, cwd)

    if (denial !== null) {
      return { deny: `pipeline_graph : ${denial}` }
    }

    const kept = new Set(parsed.map(task => task.id))
    await update($, tasks, () => parsed)
    await update($, bindings, () => Object.fromEntries(Object.entries(bound).filter(([, id]) => kept.has(id))))

    return { result: `graph set: ${parsed.length} tasks` }
  })

  on('tool.run', { tool: TASK_TOOL }, async ($, e) => {
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

    const [current, bound, cwd] = await Promise.all([read($, tasks), read($, bindings), $.session.cwd()])
    const denial = changeDenial([parsed], current, bound, cwd)

    if (denial !== null) {
      return { deny: `pipeline_task : ${denial}` }
    }

    await update($, tasks, list =>
      list.some(task => task.id === parsed.id)
        ? list.map(task => (task.id === parsed.id ? { ...parsed, isDone: task.isDone } : task))
        : [...list, parsed],
    )

    return { result: `task set: ${parsed.id}` }
  })

  on('tool.run', { tool: START_TOOL }, async ($, e) => {
    const { id, agentId } = e as { id?: unknown; agentId?: string }

    if (agentId === undefined) {
      return { deny: 'pipeline_start : réservé aux sous-agents' }
    }

    const [graph, bound, known] = await Promise.all([read($, tasks), read($, bindings), read($, agents)])
    const task = graph.find(item => item.id === id)

    if (task === undefined) {
      return { deny: `pipeline_start : tâche inconnue ${String(id)}` }
    }

    const denial = startDenial(task, agentId, graph, bound, known)

    if (denial !== null) {
      return { deny: `pipeline_start : ${denial}` }
    }

    await update($, bindings, current => ({ ...current, [agentId]: task.id }))

    return { result: `started: ${task.id}` }
  })

  on('tool.run', { tool: DONE_TOOL }, async ($, e) => {
    const { id, agentId } = e as { id?: unknown; agentId?: string }
    const [graph, bound] = await Promise.all([read($, tasks), read($, bindings)])
    const task = graph.find(item => item.id === id)

    if (task === undefined) {
      return { deny: `pipeline_done : tâche inconnue ${String(id)}` }
    }

    if (agentId !== undefined) {
      const isOthers = Object.entries(bound).some(([other, taskId]) => taskId === task.id && other !== agentId)
      const pending = pendingDeps(task, graph)

      if (isOthers) {
        return { deny: `pipeline_done : tâche ${task.id} rattachée à un autre agent` }
      }

      if (pending.length > 0) {
        return { deny: `pipeline_done : tâche ${task.id} en attente de : ${pending.join(', ')}` }
      }
    }

    await update($, tasks, current =>
      current.map(item => (item.id === task.id ? { ...item, isDone: true } : item)),
    )

    return { result: `done: ${task.id}` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      return next(e)
    }

    const type = await typeOf($, e.agentId)

    if (type === undefined) {
      return { deny: 'agent inconnu : Bash refusé' }
    }

    if (READ_ONLY_AGENTS.has(type) && !isReadOnlyCommand(e.command)) {
      return {
        deny: `${type} : Bash limité à la lecture (git diff, status, log, show, ls-files, grep, blame avec -C permis ; grep, rg, ls, find, cat, head, tail, wc, file, stat, diff), sans enchaînement ni redirection`,
      }
    }

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await writeDenial($, e.agentId, e.file_path)

    return denial === null ? next(e) : { deny: denial }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await writeDenial($, e.agentId, e.file_path)

    return denial === null ? next(e) : { deny: denial }
  })

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const denial = e.agentId === undefined ? null : await writeDenial($, e.agentId, e.notebook_path)

    return denial === null ? next(e) : { deny: denial }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, agents, list => list.filter(agent => agent.status === 'running'))

    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await update($, agents, list => [
      ...list,
      { id: e.agent_id, type: e.agent_type, status: 'running' },
    ])

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await update($, agents, list =>
      list.map(agent => (agent.id === e.agent_id ? { ...agent, status: 'done' } : agent)),
    )

    return next(e)
  })

  on('ui.scroll', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      scroll.isManual = true
      cancelScroll()

      return next(e)
    }

    if (e.origin.kind !== 'plugin' || e.origin.name !== 'agents-board') {
      return next(e)
    }

    if (scroll.request === null || scroll.isManual) {
      return { deny: 'défilement automatique arrêté' }
    }

    const distance = e.offset - scroll.offset

    if (Math.abs(distance) <= 1) {
      cancelScroll()

      return next(e)
    }

    const request = scroll.request
    scroll.offset += Math.sign(distance) * Math.ceil(Math.abs(distance) / SCROLL_EASING)
    scroll.timer = $.clock.after(SCROLL_TICK_MS, () => void $.ui.scroll(request))

    return next({ ...e, offset: scroll.offset })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    scroll.offset = e.props.scroll.offset
    const graph = await read($, tasks)
    const list = await read($, agents)

    if (e.props.hasSurvey || (graph.length === 0 && list.length === 0)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    if (graph.length === 0) {
      return (
        <Box flexDirection="column">
          {list.map(agent => (
            <Text key={agent.id}>
              {agent.status === 'running' ? '●' : '✓'} {agent.type}
            </Text>
          ))}
        </Box>
      )
    }

    const full = planOf(graph, new Map(graph.map(task => [task.id, task.id])))
    const grouped = groupedGraph(graph)
    const plans = grouped.graph.length < graph.length ? [full, planOf(grouped.graph, grouped.idOf)] : [full]
    const views = plans.flatMap(plan => [
      { plan, mode: 'horizontal' as Mode, width: horizontalWidthOf(plan) },
      { plan, mode: 'vertical' as Mode, width: verticalWidthOf(plan, 'vertical') },
      { plan, mode: 'staggered' as Mode, width: verticalWidthOf(plan, 'staggered') },
    ])
    const view =
      views.find(candidate => candidate.width <= e.props.bodyColumns) ??
      views.reduce((narrowest, candidate) => (candidate.width < narrowest.width ? candidate : narrowest))
    const { plan, mode } = view
    const { columns, placed, passes, edges, height, stateOf } = plan
    const labelOf = (task: Task) => ` ${stateOf(task).mark} ${task.name} `
    const lastIndex = columns.length - 1
    const hasParent = (level: number, slot: number) => level > 0 && edges[level - 1].some(edge => edge.to === slot)
    const hasChild = (level: number, slot: number) => level < lastIndex && edges[level].some(edge => edge.from === slot)
    const readyTasks = graph.filter(task => full.stateOf(task).mark === '●')
    const readySignature = readyTasks.map(task => task.id).join(',')

    if (readySignature !== scroll.readySignature) {
      scroll.readySignature = readySignature
      scroll.isManual = false
      const middle = readyTasks[Math.floor(readyTasks.length / 2)]

      if (middle !== undefined && !e.props.isCollapsed) {
        const id = plan.idOf.get(middle.id) ?? middle.id
        const level = columns.findIndex(column => column.some(task => task.id === id))
        const key = mode === 'horizontal' ? `row-${placed.get(id)?.start ?? 0}` : `level-${level}`
        const request = { in: e.requestId, to: { key }, block: 'center' as const }
        cancelScroll()
        scroll.request = request
        scroll.timer = $.clock.after(0, () => void $.ui.scroll(request))
      }
    }

    if (mode !== 'horizontal') {
      const { widest, step } = verticalStepOf(plan, mode)
      const anchors = Array.from({ length: height }, (_, slot) => Math.floor(widest / 2) + slot * step)
      const total = anchors[height - 1] + Math.ceil(widest / 2)
      const subRowOf = new Map<string, number>()

      for (const column of columns) {
        const ordered = [...column].sort((a, b) => (placed.get(a.id)?.start ?? 0) - (placed.get(b.id)?.start ?? 0))
        ordered.forEach((task, index) => subRowOf.set(task.id, mode === 'staggered' ? index % 2 : 0))
      }

      const levelRow = (column: Task[], level: number, subRow: number) => {
        let cursor = 0

        return anchors.flatMap((anchor, slot) => {
          const task = column.find(item => placed.get(item.id)?.start === slot)
          const isBox = task !== undefined && subRowOf.get(task.id) === subRow
          const isLine =
            task === undefined
              ? passes.has(`${level}:${slot}`)
              : !isBox && (subRow === 0 ? hasParent(level, slot) : hasChild(level, slot))

          if (!isBox && !isLine) {
            return []
          }

          const box = isBox ? task : undefined
          const text = box === undefined ? '│' : labelOf(box)
          const left = anchor - Math.floor(text.length / 2)
          const gap = ' '.repeat(Math.max(0, left - cursor))
          cursor = Math.max(cursor, left) + text.length

          return [
            <Text key={`gap-${slot}`}>{gap}</Text>,
            <Text key={`slot-${slot}`} backgroundColor={box === undefined ? undefined : stateOf(box).color}>
              {text}
            </Text>,
          ]
        })
      }
      const linkRows = (masks: number[][]) =>
        Array.from({ length: masks[0]?.length ?? 0 }, (_, y) => {
          const chars = Array<string>(total).fill(' ')

          masks.forEach((row, slot) => {
            const mask = transposed(row[y])
            chars[anchors[slot]] = glyphOf(mask)

            if (mask & RIGHT) {
              for (let x = anchors[slot] + 1; x < anchors[slot + 1]; x += 1) {
                chars[x] = '─'
              }
            }
          })

          return chars.join('')
        })

      return (
        <Box flexDirection="column">
          {columns.map((column, index) => (
            <Box key={`level-${index}`} flexDirection="column">
              {(mode === 'staggered' && column.length > 1 ? [0, 1] : [0]).map(subRow => (
                <Text key={`boxes-${subRow}`} wrap="truncate-end">
                  {levelRow(column, index, subRow)}
                </Text>
              ))}
              {index < lastIndex &&
                linkRows(gutterMasks(edges[index], height)).map((line, y) => (
                  <Text key={`link-${y}`} wrap="truncate-end">
                    {line}
                  </Text>
                ))}
            </Box>
          ))}
        </Box>
      )
    }

    const widths = columns.map(column => Math.max(...column.map(labelWidth)))
    const gutters = edges.map(group => gutterMasks(group, height))
    const cellOf = (task: Task | undefined, width: number, key: string, leftFill: string, rightFill: string, isPass: boolean) => {
      if (task === undefined) {
        return [<Text key={key}>{(isPass ? '─' : ' ').repeat(width)}</Text>]
      }

      const label = labelOf(task)
      const left = Math.floor((width - label.length) / 2)

      return [
        <Text key={`${key}-left`}>{leftFill.repeat(left)}</Text>,
        <Text key={key} backgroundColor={stateOf(task).color}>
          {label}
        </Text>,
        <Text key={`${key}-right`}>{rightFill.repeat(width - label.length - left)}</Text>,
      ]
    }

    return (
      <Box flexDirection="column">
        {Array.from({ length: height }, (_, row) => (
          <Box key={`row-${row}`}>
            <Text wrap="truncate-end">
              {columns.flatMap((column, index) => {
                const cell = cellOf(
                  column.find(item => placed.get(item.id)?.start === row),
                  widths[index],
                  `cell-${index}`,
                  hasParent(index, row) ? '─' : ' ',
                  hasChild(index, row) ? '─' : ' ',
                  passes.has(`${index}:${row}`),
                )

                if (index === lastIndex) {
                  return cell
                }

                return [...cell, <Text key={`link-${index}`}>{gutters[index][row].map(glyphOf).join('')}</Text>]
              })}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
