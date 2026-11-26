import type { Task } from '../types'

type Node = { id: string; isPass: boolean; parents: string[] }
export type Edge = { from: number; to: number; isJoin: boolean }

export function levelsOf(list: Task[]): Task[][] {
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

export function layoutOf(columns: Task[][]) {
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
