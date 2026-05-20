import { createSignal, createEffect, For, Show, createMemo } from 'solid-js'
import type { DaemonConfig } from '../config/daemons'
import { useSSE } from '../hooks/useSSE'
import { useStats } from '../hooks/useStats'
import { useLiveMetrics } from '../hooks/useLiveMetrics'
import { SourceCard } from './SourceCard'
import { StatRow } from './StatRow'
import './DaemonRow.css'

/* ============================================================
   DaemonRow — one daemon as a full-width horizontal strip.

   Layout (v4 — row-per-daemon, replaces the old DaemonColumn):

   ┌────────────────────────────────────────────────────────────┐
   │ icon  embedder-d ●  qwen3-… · dim 1024 · 12,847 req · … STREAM⌄
   ├──────────────────────────────────┬─────────────────────────┤
   │ THROUGHPUT  0.1 ch/s  ╱╲╱╲       │  STREAM        N events  │
   │   avg 1.2 ch/s · 5m              │ ──────────────────────── │
   │ LATENCY     420/650/890 ms       │  source cards…           │
   │   p50 · p95 · p99                │                          │
   │ MEMORY      4194 MB              │                          │
   │   Δ +12 MB · 5m                  │                          │
   └──────────────────────────────────┴─────────────────────────┘

   All metric values use useLiveMetrics, which prefers client-side
   computation from the SSE buffer over the 2s-polled /api/stats.
   ============================================================ */

const STATS_BUFFER_MAX = 150  // 150 pts × 2s/tick = 5min sparkline window

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
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000)    return (n / 1000).toFixed(0) + 'k'
  if (n >= 1000)      return n.toLocaleString('en-US')
  return String(n)
}

function fmtDelta(n: number): string {
  if (n === 0) return '0'
  return n > 0 ? `+${Math.round(n)}` : `−${Math.abs(Math.round(n))}`
}

function pushCapped(prev: number[], v: number): number[] {
  const next = prev.concat(v)
  return next.length > STATS_BUFFER_MAX ? next.slice(next.length - STATS_BUFFER_MAX) : next
}

export function DaemonRow(props: Props) {
  const [collapsed, setCollapsed] = createSignal(false)

  const sse = useSSE(props.daemon.url)
  const { stats } = useStats(props.daemon.url)
  const live = useLiveMetrics(() => sse.liveBuffer, stats)

  const sourceIds   = createMemo(() => Object.keys(sse.sources))
  const totalEvents = createMemo(() => sse.totalEvents)

  // Sparkline buffers — independent of metric computation. Sampled at the
  // useStats poll cadence so the line has consistent x-axis pacing.
  const [throughputBuf, setThroughputBuf] = createSignal<number[]>([])
  const [p95Buf,        setP95Buf]        = createSignal<number[]>([])
  const [rssBuf,        setRssBuf]        = createSignal<number[]>([])

  createEffect(() => {
    const m = live()
    if (m.throughput_chps.value != null) setThroughputBuf((prev) => pushCapped(prev, m.throughput_chps.value!))
    if (m.p95_ms.value != null)          setP95Buf((prev) => pushCapped(prev, m.p95_ms.value!))
    if (m.rss_mb.value != null)          setRssBuf((prev) => pushCapped(prev, m.rss_mb.value!))
  })

  const tintColor = () => TINT_COLOR[props.daemon.tint]

  return (
    <section
      class="daemon-row"
      classList={{ 'daemon-row--collapsed': collapsed() }}
      data-screen-label={props.daemon.label}
    >

      {/* ─── Header strip ─────────────────────────────── */}
      <header class="daemon-head">
        <div class="daemon-name-row">
          <iconify-icon icon="lucide:activity" width="14" height="14" class="icon-activity" />
          <span class="daemon-name">{props.daemon.label}</span>
          <span class={`daemon-dot ${sse.connected ? 'up' : 'down'}`} />
          <Show when={stats()}>
            {(s) => (
              <span class="daemon-meta">
                <span>{s().model}</span>
                <span>dim <b>{s().dim}</b></span>
                <span><b>{fmtCount(s().total_requests)}</b><span class="meta-unit">req</span></span>
                <span><b>{fmtCount(s().total_tokens)}</b><span class="meta-unit">tok</span></span>
                <span><b>{fmtUptime(s().uptime_secs)}</b><span class="meta-unit">up</span></span>
              </span>
            )}
          </Show>
          <Show when={!stats() && sse.error}>
            <span class="daemon-meta daemon-meta--error">{sse.error}</span>
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

      {/* ─── Body: stat strip + stream pane ───────────── */}
      <div class="daemon-body">

        {/* ▸ Stat strip — 3 horizontal rows ─────────── */}
        <div class="stat-strip">
          <StatRow
            label="Throughput"
            value={live().throughput_chps.value}
            unit="ch/s"
            decimals={1}
            points={throughputBuf()}
            sparkColor={tintColor()}
            subElement={
              <>
                avg <b>{(stats()?.throughput_avg ?? 0).toFixed(1)}</b> ch/s · 5m
                <Show when={live().tokens_per_sec.live != null}>
                  {' · '}<b>{Math.round(live().tokens_per_sec.live!)}</b> tok/s
                </Show>
              </>
            }
          />

          <StatRow
            variant="triplet"
            label="Latency"
            unit="ms"
            values={[
              live().p50_ms.value != null ? Math.round(live().p50_ms.value!) : null,
              live().p95_ms.value != null ? Math.round(live().p95_ms.value!) : null,
              live().p99_ms.value != null ? Math.round(live().p99_ms.value!) : null,
            ]}
            subElement={<>p50 · p95 · p99</>}
            points={p95Buf()}
            sparkColor={tintColor()}
          />

          <StatRow
            label="Memory (RSS)"
            value={live().rss_mb.value}
            unit="MB"
            points={rssBuf()}
            sparkColor={tintColor()}
            sparkKind="area"
            subElement={
              <Show
                when={live().rss_delta_5m_mb != null}
                fallback={<>warming up…</>}
              >
                Δ <b class={live().rss_delta_5m_mb! > 0 ? 'delta-pos' : 'delta-neg'}>
                  {fmtDelta(live().rss_delta_5m_mb!)}
                </b> MB · 5m
              </Show>
            }
          />
        </div>

        {/* ▸ Stream pane — sources + events ───────────── */}
        <div class="stream-pane">
          <div class="stream-header">
            <span class="stream-eyebrow">Stream</span>
            <span class="stream-count">
              <Show when={totalEvents() > 0} fallback={<>0 events</>}>
                {totalEvents()} events · {sourceIds().length} {sourceIds().length === 1 ? 'source' : 'sources'}
              </Show>
            </span>
          </div>
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

      </div>
    </section>
  )
}
