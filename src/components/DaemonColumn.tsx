import { createSignal, createEffect, For, Show, createMemo } from 'solid-js'
import type { DaemonConfig } from '../config/daemons'
import { useSSE } from '../hooks/useSSE'
import { useStats } from '../hooks/useStats'
import { SourceCard } from './SourceCard'
import { MetricTicker } from './MetricTicker'
import { Sparkline } from './Sparkline'
import './DaemonColumn.css'

// Buffer de 60 pontos: a 1 ponto a cada 2s = 2 min de janela visual.
// Suficiente pra ver o BFCArena crescer dos ~667 MB (cold) ate ~4040 MB
// (steady) em ~140s, sem ter que persistir nada em disco.
const RSS_BUFFER_MAX = 60

// Cor por tint do daemon — combina com as outras affordances visuais
// (left-border do source card, pulse dot).
const TINT_COLOR: Record<'blue' | 'purple', string> = {
  blue:   'var(--blue-ring)',
  purple: 'var(--purple-ring)',
}

interface Props {
  daemon: DaemonConfig
}

function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  return `${h}h ${m}m`
}

export function DaemonColumn(props: Props) {
  const [collapsed, setCollapsed] = createSignal(false)
  const sse  = useSSE(props.daemon.url)
  const { stats } = useStats(props.daemon.url)

  const sourceIds = createMemo(() => Object.keys(sse.sources))
  const totalEvents = createMemo(() => sse.totalEvents)

  const nowVal = createMemo(() => stats()?.throughput_now ?? null)
  const avgVal = createMemo(() => stats()?.throughput_avg ?? null)

  // Buffer de RSS ao longo do tempo, alimentado por cada snapshot de stats.
  // Mantém os últimos N pontos (drop por slice no head).
  const [rssBuffer, setRssBuffer] = createSignal<number[]>([])
  createEffect(() => {
    const rss = stats()?.rss_mb
    if (rss == null) return
    setRssBuffer((prev) => {
      const next = prev.concat(rss)
      return next.length > RSS_BUFFER_MAX
        ? next.slice(next.length - RSS_BUFFER_MAX)
        : next
    })
  })

  return (
    <section class={`daemon-col`} classList={{ 'daemon-col--collapsed': collapsed() }}>
      {/* Header */}
      <header class="daemon-head">
        <div class="daemon-id">
          <div class="daemon-name-row">
            <iconify-icon icon="lucide:activity" width="14" height="14" class="icon-activity" />
            <span class="daemon-name">{props.daemon.label}</span>
            <span class={`daemon-dot ${sse.connected ? 'up' : 'down'}`} />
          </div>
          <Show when={stats()}>
            {(s) => (
              <>
                <div class="daemon-meta">
                  <span>{s().model}</span>
                  <span>
                    dim <b>{s().dim}</b>
                  </span>
                  <span>
                    <b>{s().rss_mb} MB</b> RSS
                  </span>
                  <span>
                    <b>{fmtUptime(s().uptime_secs)}</b> uptime
                  </span>
                </div>
                <Show when={rssBuffer().length >= 2}>
                  <div class="daemon-sparkline">
                    <Sparkline
                      points={rssBuffer()}
                      color={TINT_COLOR[props.daemon.tint]}
                    />
                  </div>
                </Show>
              </>
            )}
          </Show>
          <Show when={!stats() && sse.error}>
            <div class="daemon-meta daemon-meta--error">{sse.error}</div>
          </Show>
        </div>

        <button
          class="stream-toggle"
          type="button"
          onClick={() => setCollapsed(!collapsed())}
          aria-expanded={!collapsed()}
          aria-label={collapsed() ? 'Expand stream' : 'Collapse stream'}
        >
          <span class="stream-toggle-label">Stream</span>
          <span class="stream-toggle-chev">
            <iconify-icon icon="lucide:chevron-right" width="12" height="12" />
          </span>
        </button>
      </header>

      {/* Metrics */}
      <div class="daemon-metrics">
        <MetricTicker label="Now" value={nowVal()} />
        <MetricTicker label="Avg" value={avgVal()} />
      </div>

      {/* Collapsed hint */}
      <div
        class="stream-info"
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(false) }
        }}
      >
        <span class="stream-info-count">{totalEvents()}</span>
        <span> events streaming</span>
        <span class="stream-info-sep"> · </span>
        <span class="stream-info-expand">expand to view</span>
      </div>

      {/* Stream area */}
      <div class="daemon-stream-area">
        <div class="daemon-sources">
          <Show
            when={sourceIds().length > 0}
            fallback={
              <div class="stream-empty">
                <iconify-icon icon="lucide:radio" width="22" height="22" class="stream-empty-icon" />
                <Show
                  when={!sse.error}
                  fallback={<div class="stream-empty-hint">{sse.error}</div>}
                >
                  <div class="stream-empty-title">Awaiting SSE feed</div>
                  <div class="stream-empty-hint">
                    {sse.connected ? 'Connected · no events yet' : 'Connecting…'}
                  </div>
                </Show>
              </div>
            }
          >
            <For each={sourceIds()}>
              {(sid) => (
                <SourceCard
                  sourceId={sid}
                  state={sse.sources[sid]}
                  tint={props.daemon.tint}
                />
              )}
            </For>
          </Show>
        </div>
      </div>
    </section>
  )
}
