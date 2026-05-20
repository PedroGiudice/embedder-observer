import { Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { Sparkline } from './Sparkline'
import './StatRow.css'

/* ============================================================
   StatRow — a single horizontal stat cell inside DaemonRow.

   Two display modes:
   - "single"  → big number + unit + optional sub-line
   - "triplet" → three numbers (e.g. p50 / p95 / p99) with middle emphasized

   Always renders a sparkline on the right.
   ============================================================ */

export interface StatRowSingleProps {
  variant?: 'single'
  label: string
  value: number | string | null
  unit?: string
  /** Decimals when value is a number. Default 0 for ms/MB, 1 for ch/s. */
  decimals?: number
  /** JSX content for the sub-line under the label. */
  subElement?: JSX.Element
  points: number[]
  sparkColor: string
  sparkKind?: 'line' | 'area'
}

export interface StatRowTripletProps {
  variant: 'triplet'
  label: string
  unit?: string
  /** [p50, p95, p99] — any can be null. */
  values: [number | null, number | null, number | null]
  subElement?: JSX.Element
  points: number[]
  sparkColor: string
}

type Props = StatRowSingleProps | StatRowTripletProps

function fmt(v: number | string | null, decimals = 0): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  return v.toFixed(decimals)
}

export function StatRow(props: Props) {
  return (
    <div class={`stat-row ${props.variant === 'triplet' ? 'stat-row--triplet' : ''}`}>
      <div class="stat-row-text">
        <div class="stat-row-label">{props.label}</div>
        <Show when={props.subElement}>
          <div class="stat-row-sub">{props.subElement}</div>
        </Show>
      </div>

      <Show
        when={props.variant === 'triplet'}
        fallback={
          <div class="stat-row-value">
            {fmt((props as StatRowSingleProps).value, (props as StatRowSingleProps).decimals ?? 0)}
            <Show when={props.unit}><span class="stat-row-unit">{props.unit}</span></Show>
          </div>
        }
      >
        <div class="stat-row-value lat-triplet">
          <span>{fmt((props as StatRowTripletProps).values[0])}</span>
          <span class="lat-sep">/</span>
          <span class="lat-mid">{fmt((props as StatRowTripletProps).values[1])}</span>
          <span class="lat-sep">/</span>
          <span>{fmt((props as StatRowTripletProps).values[2])}</span>
          <Show when={props.unit}><span class="stat-row-unit">{props.unit}</span></Show>
        </div>
      </Show>

      <Sparkline
        points={props.points}
        color={props.sparkColor}
        kind={(props as StatRowSingleProps).sparkKind ?? 'line'}
        width={120}
        height={28}
      />
    </div>
  )
}
