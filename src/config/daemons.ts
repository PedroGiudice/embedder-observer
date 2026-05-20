export interface DaemonConfig {
  id: string
  label: string
  // URL base para SSE e stats.
  // Em dev: usa paths relativos que o Vite proxy redireciona para localhost.
  // Em produção: pode ser URL absoluta ou relativa conforme deploy.
  url: string
  tint: 'blue' | 'purple'
}

// URLs absolutas: backend tem CorsLayer::permissive() habilitado.
// Antes usavamos /proxy/* via Vite, mas o proxy http-proxy-3 bufferiza
// SSE por 5-15s antes de flushar (ignora x-accel-buffering: no, que e
// header de nginx). Indo direto resolve sem dependencia de proxy.
const HOST = window.location.hostname  // mesma maquina onde o frontend e servido

export const DAEMONS: DaemonConfig[] = [
  {
    id: 'embedder-d',
    label: 'embedder-d',
    url: `http://${HOST}:8081`,
    tint: 'blue',
  },
  {
    id: 'cogmem',
    label: 'cogmem',
    url: `http://${HOST}:3939`,
    tint: 'purple',
  },
]

// Latency thresholds (ms)
// Calibrado pro Qwen3-Embedding-0.6B INT8: latencia tipica 350-630ms sob load
// sustentado. Thresholds antigos (300/600) marcavam quase tudo como SLOW/LAG.
export const LAT_WARN = 500
export const LAT_BAD  = 900

// Max events kept per source in DOM
export const SOURCE_MAX = 50
