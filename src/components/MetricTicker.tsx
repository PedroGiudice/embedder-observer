import { createEffect, createSignal } from 'solid-js'
import './MetricTicker.css'

interface Props {
  label: string
  value: number | null
  unit?: string
  decimals?: number
}

export function MetricTicker(props: Props) {
  const [ticked, setTicked] = createSignal(false)

  createEffect(() => {
    // Acessa o value para rastrear mudanças
    void props.value
    setTicked(false)
    // micro-delay para reiniciar a animação
    requestAnimationFrame(() => setTicked(true))
  })

  const formatted = () => {
    const v = props.value
    if (v == null) return '—'
    return v.toFixed(props.decimals ?? 1)
  }

  return (
    <div class="metric">
      <div class="metric-label">{props.label}</div>
      <div class="metric-value" classList={{ ticked: ticked() }}>
        {formatted()}
      </div>
      <div class="metric-unit">{props.unit ?? 'chunks/s'}</div>
    </div>
  )
}
