import { createSignal, createEffect, For, onMount } from 'solid-js'
import { DAEMONS } from './config/daemons'
import { DaemonRow } from './components/DaemonRow'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

const ORDER_KEY = 'embedder-observer.daemon-order'
const HEIGHTS_KEY = 'embedder-observer.daemon-heights'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('embedder-observer.theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Reads saved order from localStorage and reconciles with current DAEMONS.
 * - Ids not present in DAEMONS are dropped (daemon removed from config).
 * - Ids present in DAEMONS but absent from saved order are appended at the end.
 */
function getInitialOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) {
      const saved: unknown = JSON.parse(raw)
      if (Array.isArray(saved) && saved.every((x) => typeof x === 'string')) {
        const known = new Set(DAEMONS.map((d) => d.id))
        const valid = (saved as string[]).filter((id) => known.has(id))
        // Append any daemon that is in DAEMONS but missing from saved order.
        const inSaved = new Set(valid)
        for (const d of DAEMONS) {
          if (!inSaved.has(d.id)) valid.push(d.id)
        }
        return valid
      }
    }
  } catch { /* ignore */ }
  return DAEMONS.map((d) => d.id)
}

/**
 * Reads saved row heights from localStorage and reconciles with current DAEMONS.
 * - Ids not present in DAEMONS are dropped (daemon removed from config).
 * - Values outside reasonable bounds are dropped (corrupted data).
 */
function getInitialHeights(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HEIGHTS_KEY)
    if (raw) {
      const saved: unknown = JSON.parse(raw)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const known = new Set(DAEMONS.map((d) => d.id))
        const out: Record<string, number> = {}
        for (const [id, h] of Object.entries(saved as Record<string, unknown>)) {
          if (known.has(id) && typeof h === 'number' && h >= 100 && h <= 5000) {
            out[id] = h
          }
        }
        return out
      }
    }
  } catch { /* ignore */ }
  return {}
}

export function App() {
  const [theme, setTheme] = createSignal<'light' | 'dark'>(getInitialTheme())
  const [order, setOrder] = createSignal<string[]>(getInitialOrder())
  const [heights, setHeights] = createSignal<Record<string, number>>(getInitialHeights())
  const [draggingId, setDraggingId] = createSignal<string | null>(null)
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null)

  // Persist order whenever it changes.
  createEffect(() => {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order())) } catch { /* ignore */ }
  })

  // Persist heights whenever they change.
  createEffect(() => {
    try { localStorage.setItem(HEIGHTS_KEY, JSON.stringify(heights())) } catch { /* ignore */ }
  })

  function handleResize(id: string, height: number) {
    setHeights((prev) => ({ ...prev, [id]: height }))
  }

  onMount(() => {
    document.body.dataset.theme = theme()
  })

  function toggleTheme() {
    const next = theme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.body.dataset.theme = next
    try { localStorage.setItem('embedder-observer.theme', next) } catch { /* ignore */ }
  }

  // Build an ordered list of DaemonConfig objects from the current order signal.
  const orderedDaemons = () => {
    const byId = Object.fromEntries(DAEMONS.map((d) => [d.id, d]))
    return order().map((id) => byId[id]).filter(Boolean)
  }

  function moveUp(id: string) {
    setOrder((prev) => {
      const idx = prev.indexOf(id)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(id: string) {
    setOrder((prev) => {
      const idx = prev.indexOf(id)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function handleDragStart(id: string) {
    setDraggingId(id)
  }

  function handleDragOver(id: string) {
    if (id !== draggingId()) setDropTargetId(id)
  }

  function handleDrop(targetId: string) {
    const srcId = draggingId()
    if (!srcId || srcId === targetId) {
      setDraggingId(null)
      setDropTargetId(null)
      return
    }
    setOrder((prev) => {
      const next = [...prev]
      const srcIdx = next.indexOf(srcId)
      const tgtIdx = next.indexOf(targetId)
      if (srcIdx < 0 || tgtIdx < 0) return prev
      next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, srcId)
      return next
    })
    setDraggingId(null)
    setDropTargetId(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTargetId(null)
  }

  return (
    <div class="app">
      <header class="app-head">
        <div class="app-head-left">
          <div class="app-eyebrow">
            <span>Observability</span>
            <span class="em-dash">—</span>
            <span class="mono-mini">{DAEMONS.length} daemons · sse</span>
          </div>
          <h1 class="app-title">Embedder Observer</h1>
          <p class="app-hint">Real-time observability for local embedding daemons</p>
        </div>
        <div class="app-head-right">
          <div class="daemon-chips">
            <For each={DAEMONS}>
              {(d) => (
                <div class="header-chip">
                  <span class="chip-dot up" />
                  <span class="chip-name">{d.id}</span>
                </div>
              )}
            </For>
          </div>
          <button
            class="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme() === 'dark'
              ? <iconify-icon icon="lucide:sun"  width="16" height="16" />
              : <iconify-icon icon="lucide:moon" width="16" height="16" />
            }
          </button>
        </div>
      </header>

      <main class="app-main">
        <For each={orderedDaemons()}>
          {(d, idx) => (
            <DaemonRow
              daemon={d}
              isDragging={draggingId() === d.id}
              isDropTarget={dropTargetId() === d.id}
              canMoveUp={idx() > 0}
              canMoveDown={idx() < orderedDaemons().length - 1}
              initialHeight={heights()[d.id]}
              onResize={handleResize}
              onDragStart={() => handleDragStart(d.id)}
              onDragOver={() => handleDragOver(d.id)}
              onDrop={() => handleDrop(d.id)}
              onDragEnd={handleDragEnd}
              onMoveUp={() => moveUp(d.id)}
              onMoveDown={() => moveDown(d.id)}
            />
          )}
        </For>
      </main>
    </div>
  )
}

export default App
