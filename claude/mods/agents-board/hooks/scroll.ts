import type { EngineInterface } from 'claude-code'

import type { Task } from '../types'

import { SCROLL_EASING, SCROLL_TICK_MS } from './constants'
import { pan, scroll } from './state'

export function cancelScroll(): void {
  scroll.timer?.cancel()
  scroll.timer = null
  scroll.request = null
}

export function eased(offset: number, target: number): number {
  const distance = target - offset

  return offset + Math.sign(distance) * Math.ceil(Math.abs(distance) / SCROLL_EASING)
}

export function stepPan($: EngineInterface): void {
  if (pan.target === pan.offset) {
    pan.timer = null

    return
  }

  pan.offset = eased(pan.offset, pan.target)
  pan.timer = $.clock.after(SCROLL_TICK_MS, () => stepPan($))
  $.ui.invalidate('ui.render')
}

export function followReady(
  $: EngineInterface,
  requestId: string,
  readyTasks: Task[],
  placed: Map<string, { start: number }>,
  isCollapsed: boolean,
): void {
  const readySignature = readyTasks.map(task => task.id).join(',')

  if (readySignature !== scroll.readySignature) {
    scroll.readySignature = readySignature
    scroll.isManual = false
    const middle = readyTasks[Math.floor(readyTasks.length / 2)]

    if (middle !== undefined && !isCollapsed) {
      const key = `row-${placed.get(middle.id)?.start ?? 0}`
      const request = { in: requestId, to: { key }, block: 'center' as const }
      cancelScroll()
      scroll.request = request
      scroll.timer = $.clock.after(0, () => void $.ui.scroll(request))
    }
  }
}
