export interface DaemonConfig {
  id: string
  label: string
  // URL base para SSE e stats.
  // Em dev: usa paths relativos que o Vite proxy redireciona para localhost.
  // Em produção: pode ser URL absoluta ou relativa conforme deploy.
  url: string
  tint: 'blue' | 'purple'
}

export const DAEMONS: DaemonConfig[] = [
  {
    id: 'embedder-d',
    label: 'embedder-d',
    url: '/proxy/embedder-d',   // Vite proxy → localhost:8081
    tint: 'blue',
  },
  {
    id: 'cogmem',
    label: 'cogmem',
    url: '/proxy/cogmem',       // Vite proxy → localhost:3939
    tint: 'purple',
  },
]

// Latency thresholds (ms)
export const LAT_WARN = 300
export const LAT_BAD  = 600

// Max events kept per source in DOM
export const SOURCE_MAX = 50
