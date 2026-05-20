import { createMemo, Show } from 'solid-js'

interface Props {
  points: number[]
  width?: number
  height?: number
  color?: string         // CSS color (ex: 'var(--blue-ring)')
  strokeWidth?: number
}

/**
 * Sparkline minimalista: SVG inline com `<path>`, sem fill, sem grid, sem labels.
 *
 * - Auto-scale min→max do buffer (linha plana centrada se max===min).
 * - Renderiza null quando points.length < 2 — evita stroke degenerada.
 * - viewBox sem unidades; tamanho fixo via attrs width/height.
 *
 * Editorial Paper: stroke da cor do daemon, sem grid pra não competir
 * com o resto da hierarquia visual do header.
 */
export function Sparkline(props: Props) {
  const w  = () => props.width  ?? 120
  const h  = () => props.height ?? 24
  const sw = () => props.strokeWidth ?? 1.5

  const d = createMemo(() => {
    const pts = props.points
    if (pts.length < 2) return ''

    const innerH  = h() - sw()        // descontar largura do stroke pra ele caber
    const yOffset = sw() / 2

    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const range = max - min || 1      // evita div/0 quando linha é plana

    const stepX = w() / (pts.length - 1)

    return pts
      .map((v, i) => {
        const x = i * stepX
        // Auto-escala: min vai pro bottom, max pro top. (1 - ratio) inverte Y.
        const ratio = max === min ? 0.5 : (v - min) / range
        const y = yOffset + (1 - ratio) * innerH
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  })

  return (
    <Show when={d() !== ''}>
      <svg
        class="sparkline"
        width={w()}
        height={h()}
        viewBox={`0 0 ${w()} ${h()}`}
        aria-hidden="true"
      >
        <path
          d={d()}
          fill="none"
          stroke={props.color ?? 'currentColor'}
          stroke-width={sw()}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </Show>
  )
}
