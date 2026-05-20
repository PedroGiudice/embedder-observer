import { createMemo, Show } from 'solid-js'

interface Props {
  points: number[]
  width?: number
  height?: number
  color?: string         // CSS color (ex: 'var(--blue-ring)')
  strokeWidth?: number
  /** 'line' (default) ou 'area' — preenche embaixo da linha */
  kind?: 'line' | 'area'
  /** Adiciona linha hairline no topo e base do chart (eixos básicos) */
  showAxes?: boolean
}

/**
 * Sparkline minimalista: SVG inline com `<path>`, sem grid, sem labels.
 *
 * - Auto-scale min→max do buffer (linha plana centrada se max===min).
 * - Renderiza null quando points.length < 2 — evita stroke degenerada.
 * - viewBox = `0 0 width height`; svg escala via CSS (vector-effect mantém stroke).
 *
 * Editorial Paper: stroke da cor do daemon, sem grid pra não competir
 * com o resto da hierarquia visual.
 */
export function Sparkline(props: Props) {
  const w  = () => props.width  ?? 240
  const h  = () => props.height ?? 56
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

    // Area: linha + fecha pra bottom + back to start
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
