import { createSignal, For, onMount } from 'solid-js'
import { DAEMONS } from './config/daemons'
import { DaemonColumn } from './components/DaemonColumn'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('embedder-observer.theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function App() {
  const [theme, setTheme] = createSignal<'light' | 'dark'>(getInitialTheme())

  onMount(() => {
    document.body.dataset.theme = theme()
  })

  function toggleTheme() {
    const next = theme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.body.dataset.theme = next
    try { localStorage.setItem('embedder-observer.theme', next) } catch { /* ignore */ }
  }

  return (
    <div class="app">
      <header class="app-head">
        <div class="app-head-left">
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
        <For each={DAEMONS}>
          {(d) => <DaemonColumn daemon={d} />}
        </For>
      </main>
    </div>
  )
}

export default App
