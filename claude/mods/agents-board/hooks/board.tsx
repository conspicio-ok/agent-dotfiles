import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Agent, Task } from '../types'

import { HIDDEN_STATUSES, PIPELINE_TOOLS, SCROLL_TICK_MS, TEST_TASK, TESTS_GROUP } from './constants'
import { glyphOf, gutterLength, gutterMasks } from './gutter'
import { horizontalWidthOf, labelWidth, planOf } from './plan'
import { agentList, boardRows, crop } from './render'
import type { Segment } from './render'
import { cancelScroll, eased, followReady, stepPan } from './scroll'
import { pan, pipelineAgents, scroll } from './state'
import { runningTasks } from './tasks'

const agents = atom({ plugin: 'agents-board', key: 'agents' } as const, [] as Agent[])
const tasks = atom({ plugin: 'agents-board', key: 'tasks' } as const, [] as Task[])
const bindings = atom({ plugin: 'agents-board', key: 'bindings' } as const, {} as Record<string, string>)

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

export function registerBoard(on: On): void {
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
      return agentList({ Box, Text }, list)
    }

    const active = runningTasks(await read($, bindings), list, graph)
    const plan = planOf(graph, active)
    const { columns, placed, passes, edges, height, stateOf } = plan
    const labelOf = (task: Task) => ` ${stateOf(task).mark} ${task.name} `
    const lastIndex = columns.length - 1
    const hasParent = (level: number, slot: number) => level > 0 && edges[level - 1].some(edge => edge.to === slot)
    const hasChild = (level: number, slot: number) => level < lastIndex && edges[level].some(edge => edge.from === slot)
    const readyTasks: Task[] = []

    for (const task of plan.graph) {
      if (stateOf(task).mark === '●') {
        readyTasks.push(task)
      }
    }

    followReady($, e.requestId, readyTasks, placed, e.props.isCollapsed)

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

    return boardRows({ Box, Text }, height, visibleOf)
  })
}
