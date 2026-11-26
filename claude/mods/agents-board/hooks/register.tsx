import { atom, read, update } from 'claude-code'
import type { AgentStatus, EngineInterface, Register, Timer } from 'claude-code'

import type { Agent, Task } from '../types'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)

const GRAPH_TOOL = 'mcp__agents-board__pipeline_graph'
const TASK_TOOL = 'mcp__agents-board__pipeline_task'
const START_TOOL = 'mcp__agents-board__pipeline_start'
const DONE_TOOL = 'mcp__agents-board__pipeline_done'
const PIPELINE_TOOLS = new Set([GRAPH_TOOL, TASK_TOOL, START_TOOL, DONE_TOOL])
const FIXED_ID = /^(cadrage|recherche|conclusion|audit-[a-z-]+)(-\d+)?$|^tests(-[a-z0-9-]+)?$/
const TESTS_GROUP = 'tests:group'
const TEST_TASK = /^tests-/
const HIDDEN_STATUSES: Set<AgentStatus> = new Set(['running', 'completed', 'pending', 'waiting', 'idle'])
const EARLY_STEPS = new Set(['tests', 'audit-cadrage', 'audit-proprete', 'audit-securite'])

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
const CROSS = 16
const SCROLL_TICK_MS = 40
const SCROLL_EASING = 4
const WRITE_WAIT_MS = 15 * 60 * 1000

type Node = { id: string; isPass: boolean; parents: string[] }
type Edge = { from: number; to: number; isJoin: boolean }
type Span = { start: number; end: number; isJoin: boolean; sources: number[]; targets: number[] }
type ScrollRequest = { in: string; to: { key: string }; block: 'center' }
type Segment = [string, string | undefined]
type Step = { base: string; name: string }
type Placement = { id: string; graph: Task[]; kept: Set<string> | null }

let chain: Promise<unknown> = Promise.resolve()
const pipelineAgents = new Set<string>()
const writers = new Set<string>()
const autoPlaced = new Map<string, string>()

function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job)
  chain = run.catch(() => undefined)

  return run
}

const scroll = {
  offset: 0,
  isManual: false,
  readySignature: '',
  request: null as ScrollRequest | null,
  timer: null as Timer | null,
}

const pan = {
  offset: 0,
  target: 0,
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
  [CROSS]: '│',
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

function eased(offset: number, target: number): number {
  const distance = target - offset

  return offset + Math.sign(distance) * Math.ceil(Math.abs(distance) / SCROLL_EASING)
}

function stepPan($: EngineInterface): void {
  if (pan.target === pan.offset) {
    pan.timer = null

    return
  }

  pan.offset = eased(pan.offset, pan.target)
  pan.timer = $.clock.after(SCROLL_TICK_MS, () => stepPan($))
  $.ui.invalidate('ui.render')
}

function crop(segments: Segment[], from: number, length: number): Segment[] {
  const result: Segment[] = []
  let cursor = 0

  for (const [text, color] of segments) {
    const start = Math.max(from - cursor, 0)
    const end = Math.min(from + length - cursor, text.length)

    if (start < end) {
      result.push([text.slice(start, end), color])
    }

    cursor += text.length
  }

  return result
}

function isActive(agentId: string, taskId: string, known: Agent[], graph: Task[]): boolean {
  return (
    known.some(agent => agent.id === agentId && agent.status === 'running') &&
    graph.some(task => task.id === taskId && !task.isDone)
  )
}

function runningTasks(bound: Record<string, string>, known: Agent[], graph: Task[]): Set<string> {
  const held = new Set<string>()

  for (const [agent, id] of Object.entries(bound)) {
    if (isActive(agent, id, known, graph)) {
      held.add(id)
    }
  }

  return held
}

function stepOf(type: string): Step | null {
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

function depsOf(base: string, graph: Task[]): string[] {
  const idsWhere = (test: (root: string) => boolean) => {
    const ids: string[] = []

    for (const task of graph) {
      if (FIXED_ID.test(task.id) && test(rootOf(task.id))) {
        ids.push(task.id)
      }
    }

    return ids
  }

  if (base === 'cadrage') {
    return []
  }

  if (base === 'recherche') {
    return idsWhere(root => root === 'cadrage').slice(-1)
  }

  if (base === 'conclusion') {
    return idsWhere(root => root === 'tests' || root.startsWith('audit-'))
  }

  if (base.startsWith('audit-asserts-') || base === 'audit-execution') {
    return idsWhere(root => EARLY_STEPS.has(root))
  }

  const free: string[] = []

  for (const task of graph) {
    if (!FIXED_ID.test(task.id)) {
      free.push(task.id)
    }
  }

  return free.length > 0 ? free : idsWhere(root => root === 'recherche')
}

function placeStep(step: Step, graph: Task[], held: Set<string>): { id: string; graph: Task[] } {
  let id = step.base

  for (let index = 2; held.has(id) && index < graph.length + 2; index += 1) {
    id = `${step.base}-${index}`
  }

  const existing = graph.find(task => task.id === id)

  if (existing === undefined) {
    return {
      id,
      graph: [...graph, { id, name: step.name, deps: depsOf(step.base, graph), files: [], isDone: false }],
    }
  }

  if (!existing.isDone) {
    return { id, graph }
  }

  return { id, graph: marked(graph, id, false) }
}

function marked(graph: Task[], id: string | undefined, isDone: boolean): Task[] {
  const result: Task[] = []

  for (const task of graph) {
    result.push(task.id === id ? { ...task, isDone } : task)
  }

  return result
}

function pruned(graph: Task[], kept: Set<string>): Task[] {
  let list = graph

  for (let pass = 0; pass < graph.length + 1; pass += 1) {
    const next: Task[] = []

    for (const task of list) {
      if (!task.isDone || kept.has(task.id) || list.some(item => !item.isDone && item.deps.includes(task.id))) {
        next.push(task)
      }
    }

    if (next.length === list.length) {
      break
    }

    list = next
  }

  return list
}

function placementOf(step: Step, graph: Task[], bound: Record<string, string>, known: Agent[]): Placement {
  if (graph.every(task => task.isDone)) {
    return {
      id: step.base,
      graph: [{ id: step.base, name: step.name, deps: [], files: [], isDone: false }],
      kept: new Set(),
    }
  }

  const held = runningTasks(bound, known, graph)

  if (step.base === 'tests') {
    const free = graph.find(
      task => TEST_TASK.test(task.id) && !task.isDone && !held.has(task.id) && pendingDeps(task, graph).length === 0,
    )

    if (free !== undefined) {
      return { id: free.id, graph, kept: null }
    }
  }

  if (step.base !== 'cadrage') {
    return { ...placeStep(step, graph, held), kept: null }
  }

  const kept = new Set<string>()

  for (const [agent, id] of Object.entries(bound)) {
    if (held.has(id)) {
      kept.add(agent)
    }
  }

  const placed = placeStep(step, graph, held)

  return { id: placed.id, graph: pruned(placed.graph, new Set([...held, 'cadrage', placed.id])), kept }
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

function pendingDenial(task: Task, graph: Task[]): string | null {
  const pending = pendingDeps(task, graph)

  return pending.length > 0 ? `tâche ${task.id} en attente de : ${pending.join(', ')}` : null
}

function changeDenial(
  next: Task[],
  current: Task[],
  bound: Record<string, string>,
  cwd: string,
  held: Set<string>,
): string | null {
  const removed = [...held].find(id => current.some(task => task.id === id) && !next.some(task => task.id === id))

  if (removed !== undefined) {
    return `tâche ${removed} en cours : elle ne peut pas être retirée`
  }

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

function startDenial(
  task: Task,
  agentId: string,
  graph: Task[],
  bound: Record<string, string>,
  known: Agent[],
  hasWritten: boolean,
): string | null {
  if (task.isDone) {
    return `tâche ${task.id} déjà faite`
  }

  const pending = pendingDenial(task, graph)

  if (pending !== null) {
    return pending
  }

  const current = bound[agentId]

  if (hasWritten && current !== undefined && current !== task.id && graph.some(item => item.id === current && !item.isDone)) {
    return `déjà rattaché à la tâche ${current}`
  }

  const isTaken = Object.entries(bound).some(
    ([other, id]) => id === task.id && other !== agentId && isActive(other, id, known, graph),
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

async function holderOf($: EngineInterface, agentId: string, target: string): Promise<string | null> {
  const [graph, bound, known, cwd] = await Promise.all([
    read($, tasks),
    read($, bindings),
    read($, agents),
    $.session.cwd(),
  ])
  const path = absolute(cwd, target)
  const own = graph.findIndex(task => task.id === bound[agentId])

  for (const task of graph.slice(0, own === -1 ? graph.length : own)) {
    const isHeld = Object.entries(bound).some(
      ([other, id]) => other !== agentId && id === task.id && isActive(other, id, known, graph),
    )

    if (isHeld && task.files.some(file => absolute(cwd, file) === path)) {
      return task.id
    }
  }

  return null
}

async function guarded($: EngineInterface, agentId: string, path: string, signal: AbortSignal): Promise<string | null> {
  const denial = await writeDenial($, agentId, path)

  if (denial !== null) {
    return denial
  }

  const deadline = (await $.clock.now()) + WRITE_WAIT_MS

  for (let holder = await holderOf($, agentId, path); holder !== null; holder = await holderOf($, agentId, path)) {
    if (signal.aborted || (await $.clock.now()) >= deadline) {
      return `fichier ${path} tenu par la tâche ${holder}`
    }

    await $.process.run(['sleep', '2'])
  }

  writers.add(agentId)

  return null
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

function layoutOf(columns: Task[][]) {
  const levelById = new Map(columns.flatMap((column, index) => column.map(task => [task.id, index] as const)))
  const nodes: Node[][] = columns.map(column => column.map(task => ({ id: task.id, isPass: false, parents: [] })))
  const passSource = new Map<string, string>()

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
          passSource.set(id, dep)
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
    const realNodes: Node[] = []
    const passNodes: Node[] = []

    for (const node of column) {
      if (node.isPass) {
        passNodes.push(node)
        continue
      }

      realNodes.push(node)
    }

    const taken: number[] = []

    for (const node of realNodes.sort((a, b) => desiredOf(a) - desiredOf(b))) {
      const start = Math.max(desiredOf(node), nextFree)
      starts.set(node.id, start)
      taken.push(start)
      nextFree = start + 2
    }

    const sourceRowOf = (node: Node) => starts.get(passSource.get(node.id) ?? '') ?? 0
    const isFree = (row: number) => taken.every(start => Math.abs(start - row) >= 2)

    for (const node of passNodes.sort((a, b) => sourceRowOf(a) - sourceRowOf(b))) {
      const row = sourceRowOf(node)
      let start = row

      for (let offset = 0; offset <= 2 * taken.length + 2; offset += 1) {
        if (isFree(row + offset)) {
          start = row + offset
          break
        }

        if (isFree(row - offset)) {
          start = row - offset
          break
        }
      }

      starts.set(node.id, start)
      taken.push(start)
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

const DONE_STATE = { color: '#2f4a3a', mark: '✓' }
const READY_STATE = { color: '#2f4260', mark: '●' }
const WAITING_STATE = { color: '#3a3a40', mark: '○' }

function statesOf(graph: Task[]) {
  const doneIds = new Set(graph.filter(task => task.isDone).map(task => task.id))
  const known = new Set(graph.map(task => task.id))

  return (task: Task) => {
    if (task.isDone) {
      return DONE_STATE
    }

    const isReady = task.deps.filter(dep => known.has(dep)).every(dep => doneIds.has(dep))

    return isReady ? READY_STATE : WAITING_STATE
  }
}

function planOf(graph: Task[], active: Set<string>) {
  const members: Task[] = []

  for (const task of graph) {
    if (TEST_TASK.test(task.id)) {
      members.push(task)
    }
  }

  if (members.length < 3) {
    const columns = levelsOf(graph)

    return { graph, columns, stateOf: statesOf(graph), ...layoutOf(columns) }
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

  const group: Task = { id: TESTS_GROUP, name: 'Tests', deps: [...groupDeps], files: [], isDone: members.every(task => task.isDone) }
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

  const memberStateOf = statesOf(graph)
  const isGroupReady = members.some(member => memberStateOf(member) === READY_STATE || active.has(member.id))
  const shownStateOf = statesOf(shown)
  const stateOf = (task: Task) => {
    if (task.id !== TESTS_GROUP) {
      return shownStateOf(task)
    }

    return group.isDone ? DONE_STATE : isGroupReady ? READY_STATE : WAITING_STATE
  }
  const columns = levelsOf(shown)

  return { graph: shown, columns, stateOf, ...layoutOf(columns) }
}

function groupOf(edge: Edge): string {
  return edge.isJoin ? `join-${edge.to}` : `split-${edge.from}`
}

function isInside(row: number, span: Span): boolean {
  return row > span.start && row < span.end
}

function mustPrecede(left: Span, right: Span): boolean {
  for (const row of right.targets) {
    if (isInside(row, left)) {
      return true
    }
  }

  for (const row of left.sources) {
    if (isInside(row, right)) {
      return true
    }
  }

  return false
}

function colorIntervals(
  intervals: [string, Span][],
  firstTrack: number,
  stride: number,
  tracks: Map<string, number>,
): number {
  const ordered = [...intervals].sort((a, b) => a[1].start - b[1].start)
  const placed: [Span, number][] = []
  const done = new Set<string>()
  let count = 0

  for (let round = 0; round < ordered.length; round += 1) {
    let chosen: [string, Span] | undefined
    let fallback: [string, Span] | undefined

    for (const entry of ordered) {
      if (done.has(entry[0])) {
        continue
      }

      fallback ??= entry

      if (ordered.some(other => other !== entry && !done.has(other[0]) && mustPrecede(other[1], entry[1]))) {
        continue
      }

      chosen = entry
      break
    }

    const pick = chosen ?? fallback

    if (pick === undefined) {
      break
    }

    const [group, span] = pick
    let index = 0

    for (const [other, track] of placed) {
      if (mustPrecede(other, span)) {
        index = Math.max(index, track + 1)
      }
    }

    for (const [other, track] of [...placed].sort((a, b) => a[1] - b[1])) {
      if (track === index && other.start <= span.end && span.start <= other.end) {
        index += 1
      }
    }

    done.add(group)
    placed.push([span, index])
    count = Math.max(count, index + 1)
    tracks.set(group, firstTrack + index * stride)
  }

  return count * stride
}

function trackPlan(edges: Edge[]): { tracks: Map<string, number>; length: number } {
  const spans = new Map<string, Span>()

  for (const edge of edges.filter(item => item.from !== item.to)) {
    const group = groupOf(edge)
    const span = spans.get(group) ?? { start: Infinity, end: -Infinity, isJoin: edge.isJoin, sources: [], targets: [] }
    span.start = Math.min(span.start, edge.from, edge.to)
    span.end = Math.max(span.end, edge.from, edge.to)
    span.sources.push(edge.from)
    span.targets.push(edge.to)
    spans.set(group, span)
  }

  const intervalsOf = (isJoin: boolean) => {
    const intervals: [string, Span][] = []

    for (const entry of spans) {
      if (entry[1].isJoin === isJoin) {
        intervals.push(entry)
      }
    }

    return intervals
  }
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
  const cells: Map<string, number>[][] = []

  for (let row = 0; row < height; row += 1) {
    const line: Map<string, number>[] = []

    for (let x = 0; x < length; x += 1) {
      line.push(new Map())
    }

    cells.push(line)
  }

  const mark = (row: number, x: number, group: string, mask: number) => {
    cells[row][x].set(group, (cells[row][x].get(group) ?? 0) | mask)
  }

  for (const { from, to, isJoin } of edges) {
    if (from === to) {
      for (let x = 0; x < length; x += 1) {
        mark(from, x, `straight-${from}`, LEFT | RIGHT)
      }

      continue
    }

    const isDown = to > from
    const toward = isDown ? DOWN : UP
    const back = isDown ? UP : DOWN
    const [top, bottom] = isDown ? [from, to] : [to, from]
    const group = groupOf({ from, to, isJoin })
    const track = tracks.get(group) ?? 0

    for (let x = 0; x < track; x += 1) {
      mark(from, x, group, LEFT | RIGHT)
    }

    mark(from, track, group, LEFT | toward)
    mark(to, track, group, back | RIGHT)

    for (let row = top + 1; row < bottom; row += 1) {
      mark(row, track, group, UP | DOWN)
    }

    for (let x = track + 1; x < length; x += 1) {
      mark(to, x, group, LEFT | RIGHT)
    }
  }

  const masks: number[][] = []

  for (const line of cells) {
    const row: number[] = []

    for (const cell of line) {
      let mask = 0
      let hasHorizontal = false
      let hasVertical = false

      for (const value of cell.values()) {
        mask |= value
        hasHorizontal ||= value === (LEFT | RIGHT)
        hasVertical ||= value === (UP | DOWN)
      }

      row.push(hasHorizontal && hasVertical ? CROSS : mask)
    }

    masks.push(row)
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

async function isQuietCall(
  $: EngineInterface,
  props: { tool: string; isExpanded?: boolean; isErrored: boolean; output?: unknown },
): Promise<boolean> {
  if (props.isExpanded || props.isErrored) {
    return false
  }

  if (PIPELINE_TOOLS.has(props.tool)) {
    return true
  }

  const output = props.output as { status?: unknown; agentId?: unknown } | undefined

  if (props.tool !== 'Agent' || output?.status !== 'async_launched' || typeof output.agentId !== 'string') {
    return false
  }

  return (await read($, bindings))[output.agentId] !== undefined
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

      const [current, bound, cwd, known] = await Promise.all([
        read($, tasks),
        read($, bindings),
        $.session.cwd(),
        read($, agents),
      ])
      const denial = changeDenial(parsed, current, bound, cwd, runningTasks(bound, known, current))

      if (denial !== null) {
        return { deny: `pipeline_graph : ${denial}` }
      }

      const kept = new Set(parsed.map(task => task.id))
      await update($, tasks, () => parsed)
      await update($, bindings, list => Object.fromEntries(Object.entries(list).filter(([, id]) => kept.has(id))))

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

      const [current, bound, cwd] = await Promise.all([read($, tasks), read($, bindings), $.session.cwd()])
      const denial = changeDenial([parsed], current, bound, cwd, new Set())

      if (denial !== null) {
        return { deny: `pipeline_task : ${denial}` }
      }

      await update($, tasks, list =>
        list.some(task => task.id === parsed.id)
          ? list.map(task => (task.id === parsed.id ? { ...parsed, isDone: task.isDone } : task))
          : [...list, parsed],
      )

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

      await update($, tasks, current => marked(current, task.id, true))

      return { result: `done: ${task.id}` }
    }),
  )

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

  on('prompt.submit', async ($, e, next) => {
    await serial(() => update($, agents, list => list.filter(agent => agent.status === 'running')))

    return next(e)
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

        return resumed
      }

      if (step === null) {
        return null
      }

      let placed: Placement = { id: step.base, graph: [], kept: null }
      let isCreated = false

      await update($, tasks, current => {
        placed = placementOf(step, current, bound, known)
        isCreated = current.every(task => task.isDone) || !current.some(task => task.id === placed.id)

        return placed.graph
      })

      if (isCreated) {
        autoPlaced.set(e.agent_id, placed.id)
      }

      await update($, bindings, current => {
        if (placed.kept === null) {
          return { ...current, [e.agent_id]: placed.id }
        }

        const rebound: Record<string, string> = {}

        for (const [agent, id] of Object.entries(current)) {
          if (placed.kept.has(agent) && placed.graph.some(task => task.id === id)) {
            rebound[agent] = id
          }
        }

        rebound[e.agent_id] = placed.id

        return rebound
      })

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

      if (e.agent_type !== 'cadrage') {
        return
      }

      const taskId = (await read($, bindings))[e.agent_id]

      await update($, tasks, current => marked(current, taskId, true))
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

    if (Math.abs(e.offset - scroll.offset) <= 1) {
      cancelScroll()

      return next(e)
    }

    const request = scroll.request
    scroll.offset = eased(scroll.offset, e.offset)
    scroll.timer = $.clock.after(SCROLL_TICK_MS, () => void $.ui.scroll(request))

    return next({ ...e, offset: scroll.offset })
  })

  on('ui.render', { component: ['ToolUse', 'ToolResult'] }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)

    return (await isQuietCall($, e.props)) ? <Box /> : next(e)
  })

  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    const bound = await read($, bindings)
    const isPiped = bound[e.props.id] !== undefined || pipelineAgents.has(e.props.id)

    return next({ ...e, props: { ...e.props, isHidden: e.props.isHidden || (isPiped && HIDDEN_STATUSES.has(e.props.status)) } })
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

    const active = runningTasks(await read($, bindings), list, graph)
    const plan = planOf(graph, active)
    const { columns, placed, passes, edges, height, stateOf } = plan
    const labelOf = (task: Task) => ` ${stateOf(task).mark} ${task.name} `
    const lastIndex = columns.length - 1
    const hasParent = (level: number, slot: number) => level > 0 && edges[level - 1].some(edge => edge.to === slot)
    const hasChild = (level: number, slot: number) => level < lastIndex && edges[level].some(edge => edge.from === slot)
    const readyTasks: Task[] = []
    const readyIds: string[] = []

    for (const task of plan.graph) {
      if (stateOf(task).mark === '●') {
        readyTasks.push(task)
        readyIds.push(task.id)
      }
    }

    const readySignature = readyIds.join(',')

    if (readySignature !== scroll.readySignature) {
      scroll.readySignature = readySignature
      scroll.isManual = false
      const middle = readyTasks[Math.floor(readyTasks.length / 2)]

      if (middle !== undefined && !e.props.isCollapsed) {
        const key = `row-${placed.get(middle.id)?.start ?? 0}`
        const request = { in: e.requestId, to: { key }, block: 'center' as const }
        cancelScroll()
        scroll.request = request
        scroll.timer = $.clock.after(0, () => void $.ui.scroll(request))
      }
    }

    const widths = columns.map(column => Math.max(...column.map(labelWidth)))
    const gutters = edges.map(group => gutterMasks(group, height))
    const colStart: number[] = []
    let cursor = 0

    for (let index = 0; index < columns.length; index += 1) {
      colStart.push(cursor)
      cursor += widths[index] + (index < lastIndex ? gutterLength(edges[index]) : 0)
    }

    const total = horizontalWidthOf(plan)
    const { bodyColumns } = e.props
    const max = total - (bodyColumns - 1)
    const isGroupActive = [...active].some(id => TEST_TASK.test(id))
    const runningColumn = columns.findIndex(column =>
      column.some(task => active.has(task.id) || (task.id === TESTS_GROUP && isGroupActive)),
    )
    const readyColumn = columns.findIndex(column => column.some(task => stateOf(task).mark === '●'))

    if (total <= bodyColumns) {
      pan.timer?.cancel()
      pan.timer = null
      pan.target = 0
      pan.offset = 0
    } else {
      const start =
        runningColumn !== -1
          ? (colStart[runningColumn] ?? 0)
          : readyColumn !== -1
            ? (colStart[readyColumn] ?? 0)
            : graph.every(task => task.isDone)
              ? max
              : 0
      pan.target = start <= max ? start : (colStart.find(value => value >= max) ?? colStart[lastIndex] ?? 0)

      if (pan.offset !== pan.target && pan.timer === null) {
        pan.timer = $.clock.after(SCROLL_TICK_MS, () => stepPan($))
      }
    }

    const cellOf = (task: Task | undefined, width: number, leftFill: string, rightFill: string, isPass: boolean): Segment[] => {
      if (task === undefined) {
        return [[(isPass ? '─' : ' ').repeat(width), undefined]]
      }

      const label = labelOf(task)
      const left = Math.floor((width - label.length) / 2)

      return [
        [leftFill.repeat(left), undefined],
        [label, stateOf(task).color],
        [rightFill.repeat(width - label.length - left), undefined],
      ]
    }
    const segmentsOf = (row: number): Segment[] => {
      const segments: Segment[] = []

      for (const [index, column] of columns.entries()) {
        segments.push(
          ...cellOf(
            column.find(item => placed.get(item.id)?.start === row),
            widths[index] ?? 0,
            hasParent(index, row) ? '─' : ' ',
            hasChild(index, row) ? '─' : ' ',
            passes.has(`${index}:${row}`),
          ),
        )

        const gutter = gutters[index]?.[row]

        if (index < lastIndex && gutter !== undefined) {
          segments.push([gutter.map(glyphOf).join(''), undefined])
        }
      }

      return segments
    }

    let leftColumn = 0

    for (const [index, value] of colStart.entries()) {
      if (value <= pan.offset) {
        leftColumn = index
      }
    }

    const visibleOf = (row: number): Segment[] =>
      pan.offset > 0
        ? [[hasParent(leftColumn, row) ? '─' : ' ', undefined], ...crop(segmentsOf(row), pan.offset, bodyColumns - 1)]
        : crop(segmentsOf(row), 0, bodyColumns)

    return (
      <Box flexDirection="column">
        {Array.from({ length: height }, (_, row) => (
          <Box key={`row-${row}`}>
            <Text wrap="truncate-end">
              {visibleOf(row).map(([text, color], index) => (
                <Text key={`segment-${index}`} backgroundColor={color}>
                  {text}
                </Text>
              ))}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
