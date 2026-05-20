import { createSignal, For, createEffect } from 'solid-js'
import type { SourceState } from '../hooks/useSSE'
import { EventRow } from './EventRow'
import './SourceCard.css'

interface Props {
  sourceId: string
  state: SourceState
  tint: 'blue' | 'purple'
}

function truncateSource(s: string, maxLen = 46): string {
  if (s.length <= maxLen) return s
  const tail = s.slice(s.length - (maxLen - 1))
  const slash = tail.indexOf('/')
  return '…' + (slash >= 0 ? tail.slice(slash) : tail)
}

export function SourceCard(props: Props) {
  const [collapsed, setCollapsed] = createSignal(false)
  const [pulsing, setPulsing] = createSignal(false)

  // Dispara pulse quando novo evento chega
  createEffect(() => {
    void props.state.lastEventTs  // rastrear
    if (props.state.eventCount === 0) return
    setPulsing(false)
    requestAnimationFrame(() => setPulsing(true))
    const timer = setTimeout(() => setPulsing(false), 1100)
    return () => clearTimeout(timer)
  })

  return (
    <div
      class={`src-card tint-${props.tint}`}
      classList={{ 'src-card--collapsed': collapsed() }}
    >
      <div class="src-head" onClick={() => setCollapsed(!collapsed())} title={props.sourceId}>
        <span class="src-path">{truncateSource(props.sourceId)}</span>
        <span class="src-pulse" classList={{ pulsing: pulsing() }} />
        <span class="src-count">{props.state.eventCount}</span>
        <span class="src-chev">
          <iconify-icon icon="lucide:chevron-right" width="10" height="10" />
        </span>
      </div>

      <div class="src-stream-wrap">
        <div class="src-stream">
          <For each={props.state.events}>
            {(ev) => <EventRow event={ev} />}
          </For>
        </div>
      </div>
    </div>
  )
}
