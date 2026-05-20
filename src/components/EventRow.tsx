import { createSignal, Show } from 'solid-js'
import type { EmbedEvent } from '../hooks/useSSE'
import { LAT_WARN, LAT_BAD } from '../config/daemons'
import './EventRow.css'

interface Props {
  event: EmbedEvent
}

function latBucket(ms: number): { cls: string; pill: string } {
  if (ms < LAT_WARN) return { cls: 'ok',   pill: 'OK' }
  if (ms < LAT_BAD)  return { cls: 'warn', pill: 'SLOW' }
  return                      { cls: 'bad',  pill: 'LAG' }
}

function fmtTs(d: Date): string {
  return d.toTimeString().slice(0, 8)
}

export function EventRow(props: Props) {
  const [open, setOpen] = createSignal(false)
  const b = () => latBucket(props.event.latency_ms)

  const truncated = () => {
    const p = props.event.preview
    return p.length > 320 ? p.slice(0, 320) + '…' : p
  }

  return (
    <div class={`ev-row lat-${b().cls}`} classList={{ open: open() }}>
      <div class="ev-summary" onClick={() => setOpen(!open())}>
        <span class={`ev-pill ${b().cls}`}>{b().pill}</span>
        <span class="ev-ts">{fmtTs(props.event.ts)}</span>
        <span class="ev-spacer" />
        <span class="ev-tokens">{props.event.tokens}t</span>
        <span class="ev-latency">{props.event.latency_ms}ms</span>
        <span class="ev-chev">
          <iconify-icon icon="lucide:chevron-right" width="12" height="12" />
        </span>
      </div>
      <Show when={open()}>
        <div class="ev-detail">
          <div class="ev-detail-inner">
            <div class="ev-detail-label">Chunk preview</div>
            <pre class="ev-detail-preview">{truncated()}</pre>
          </div>
        </div>
      </Show>
    </div>
  )
}
