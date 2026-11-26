import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { Agent } from '../types'

export type Segment = [string, string | undefined]
type Ui = Pick<Elements[RenderSurface], 'Box' | 'Text'>

export function crop(segments: Segment[], from: number, length: number): Segment[] {
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

export function agentList({ Box, Text }: Ui, list: Agent[]): RenderElement {
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

export function boardRows({ Box, Text }: Ui, height: number, visibleOf: (row: number) => Segment[]): RenderElement {
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
}
