import { createSignal, createEffect, For, Show, createMemo } from 'solid-js'
import type { DaemonConfig } from '../config/daemons'
import { useSSE } from '../hooks/useSSE'
import { useStats } from '../hooks/useStats'
import { SourceCard } from './SourceCard'
import { MetricTicker } from './MetricTicker'
import { Sparkline } from './Sparkline'
import './DaemonColumn.css'

// Buffer de 150 pontos: a 1 ponto a cada 2s = 5 min de janela visual.
// Cobre warmup completo do BFCArena (~140s) com folga + ~3min de steady state.
const STATS_BUFFER_MAX = 150

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

// Helper: append a um buffer com cap em STATS_BUFFER_MAX
function pushCapped(prev: number[], v: number): number[] {
  const next = prev.concat(v)
  return next.length > STATS_BUFFER_MAX ? next.slice(next.length - STATS_BUFFER_MAX) : next
}

export function DaemonColumn(props: Props) {
  const [collapsed, setCollapsed] = createSignal(false)
  const sse  = useSSE(props.daemon.url)
  const { stats } = useStats(props.daemon.url)

  const sourceIds = createMemo(() => Object.keys(sse.sources))
  const totalEvents = createMemo(() => sse.totalEvents)

  const nowVal = createMemo(() => stats()?.throughput_now ?? null)
  const avgVal = createMemo(() => stats()?.throughput_avg ?? null)

  // 3 buffers paralelos alimentados pelo mesmo tick do poll de stats.
  // Mantém os últimos N pontos (drop por slice no head).
  const [throughputBuf, setThroughputBuf] = createSignal<number[]>([])
  const [latencyBuf,    setLatencyBuf]    = createSignal<number[]>([])
  const [rssBuf,        setRssBuf]        = createSignal<number[]>([])

  createEffect(() => {
    const s = stats()
    if (s == null) return
    setThroughputBuf((prev) => pushCapped(prev, s.throughput_now))
    setLatencyBuf((prev)    => pushCapped(prev, s.latency_p95_ms))
    setRssBuf((prev)        => pushCapped(prev, s.rss_mb))
  })

  const tintColor = () => TINT_COLOR[props.daemon.tint]
  const hasData = () => rssBuf().length >= 2

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

      {/* Charts strip — 3 chart cells em flex row.
          Buffer de 5min (150 pontos a 2s/tick) cobre warmup do BFCArena + steady. */}
      <Show when={hasData()}>
        <div class="daemon-charts">
          <ChartCell
            label="Throughput"
            value={stats()?.throughput_now?.toFixed(1) ?? '—'}
            unit="ch/s"
            points={throughputBuf()}
            color={tintColor()}
          />
          <ChartCell
            label="Lat p95"
            value={String(stats()?.latency_p95_ms ?? '—')}
            unit="ms"
            points={latencyBuf()}
            color={tintColor()}
          />
          <ChartCell
            label="RSS"
            value={String(stats()?.rss_mb ?? '—')}
            unit="MB"
            points={rssBuf()}
            color={tintColor()}
            kind="area"
          />
        </div>
      </Show>

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

// ChartCell: célula compacta com header (label + value + unit) e Sparkline.
// Componente local — só pra reduzir verbosidade no JSX do strip.
function ChartCell(p: {
  label: string
  value: string
  unit: string
  points: number[]
  color: string
  kind?: 'line' | 'area'
}) {
  return (
    <div class="chart-cell">
      <div class="chart-cell-head">
        <span class="chart-cell-label">{p.label}</span>
        <span class="chart-cell-value">
          {p.value}
          <span class="chart-cell-unit">{p.unit}</span>
        </span>
      </div>
      <Sparkline
        points={p.points}
        color={p.color}
        kind={p.kind}
        showAxes
        width={240}
        height={48}
      />
    </div>
  )
}
