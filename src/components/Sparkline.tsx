import { createMemo, Show } from 'solid-js'

interface Props {
  points: number[]
  width?: number
  height?: number
  color?: string         // CSS color (e.g. 'var(--blue-ring)')
  strokeWidth?: number
  kind?: 'line' | 'area'
  showAxes?: boolean
}

/**
 * Minimal SVG sparkline.
 *
 * - Auto-scales to min/max of the buffer (flat line centered if min===max).
 * - Renders nothing when points.length < 2 (avoids degenerate stroke).
 * - viewBox = `0 0 width height`; svg scales via CSS, vector-effect keeps
 *   stroke width constant under non-uniform scaling.
 *
 * Editorial Paper note: stroke uses the daemon's tint color, no grid,
 * no labels — the value is in the StatRow head, the line is just texture.
 */
export function Sparkline(props: Props) {
  const w  = () => props.width  ?? 120
  const h  = () => props.height ?? 28
  const sw = () => props.strokeWidth ?? 1.5
  const kind = () => props.kind ?? 'line'

  const geom = createMemo(() => {
    const pts = props.points
    if (pts.length < 2) return null

    const innerH  = h() - sw()
    const yOffset = sw() / 2
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const range = max - min || 1
    const stepX = w() / (pts.length - 1)

    const coords = pts.map((v, i) => {
      const x = i * stepX
      const ratio = max === min ? 0.5 : (v - min) / range
      const y = yOffset + (1 - ratio) * innerH
      return { x, y }
    })

    const linePath = coords
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')

    const areaPath =
      linePath +
      ` L ${coords[coords.length - 1].x.toFixed(1)} ${h()}` +
      ` L 0 ${h()} Z`

    return { linePath, areaPath }
  })

  return (
    <Show when={geom() != null}>
      <svg
        class="sparkline"
        width={w()}
        height={h()}
        viewBox={`0 0 ${w()} ${h()}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <Show when={props.showAxes}>
          <line x1="0" y1="0.5" x2={w()} y2="0.5"
                stroke="var(--line-2)" stroke-width="1" vector-effect="non-scaling-stroke" />
          <line x1="0" y1={h() - 0.5} x2={w()} y2={h() - 0.5}
                stroke="var(--line-2)" stroke-width="1" vector-effect="non-scaling-stroke" />
        </Show>

        <Show when={kind() === 'area'}>
          <path
            d={geom()!.areaPath}
            fill={props.color ?? 'currentColor'}
            fill-opacity="0.12"
            stroke="none"
          />
        </Show>

        <path
          d={geom()!.linePath}
          fill="none"
          stroke={props.color ?? 'currentColor'}
          stroke-width={sw()}
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </Show>
  )
}
