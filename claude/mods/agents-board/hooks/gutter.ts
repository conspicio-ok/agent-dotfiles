import { CROSS, DOWN, LEFT, RIGHT, UP } from './constants'
import type { Edge } from './layout'

type Span = { start: number; end: number; isJoin: boolean; sources: number[]; targets: number[] }

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

export function glyphOf(mask: number): string {
  if (mask === 0) {
    return ' '
  }

  return GLYPHS[mask] ?? (mask & (UP | DOWN) ? '│' : '─')
}

function groupOf(edge: Edge): string {
  return edge.isJoin ? `join-${edge.to}` : `split-${edge.from}`
}

function isBetween(row: number, span: Span): boolean {
  return row > span.start && row < span.end
}

function mustPrecede(left: Span, right: Span): boolean {
  for (const row of right.targets) {
    if (isBetween(row, left)) {
      return true
    }
  }

  for (const row of left.sources) {
    if (isBetween(row, right)) {
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

export function gutterLength(edges: Edge[]): number {
  return trackPlan(edges).length
}

export function gutterMasks(edges: Edge[], height: number): number[][] {
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
