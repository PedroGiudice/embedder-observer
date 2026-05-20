# Embedder Observer

Real-time observability UI para daemons locais de embedding. Conecta via SSE
ao [embedder-d](https://github.com/PedroGiudice/embedder-d) (Qwen3) e
cogmem (BGE-M3 in-process via `ort`), exibe stream de eventos por source em
cartões fixed-height, métricas de throughput ao vivo e estado dos daemons.

## Stack

- **SolidJS 1.9 + TypeScript + Vite 8** — reactive signals + stores
- **@iconify-icon/solid** — web component Iconify (icon set: lucide)
- **Google Fonts Baumans** — display font para "Embedder Observer"
- **Instrument Sans + ui-monospace** — texto e números/timestamps
- **EventSource nativa** — SSE com auto-reconnect e demux por source
- **Editorial Paper Hi-Fi** — tokens light + dark via `[data-theme]`

Zero dependências de UI framework (Tailwind, styled-components, etc.).
Estilos por CSS modular com tokens, importados por componente.

## Como rodar (dev)

```bash
npm install
npm run dev          # vite serve em http://localhost:5174 (host 0.0.0.0)
```

O dev server proxia automaticamente:
- `/proxy/embedder-d/*` → `http://localhost:8081/*`
- `/proxy/cogmem/*` → `http://localhost:3939/*`

Acessar localmente via `http://localhost:5174` ou da tailnet via
`http://100.123.73.128:5174`.

## Como rodar (produção)

### Build

```bash
npm run build        # vite build → dist/
```

Output: SPA estática em `dist/` (~50 kB JS gzipped, ~14 kB CSS gzipped).

### Servir

**Escolha**: `vite preview` via systemd user service.

Justificativa: o app é SPA estática <100 kB, sem SSR. `vite preview` serve
com bom default (gzip, cache headers). Adicionar Caddy/nginx seria sobre-
engenharia para o uso atual (acesso via tailnet, baixo volume). Se latência
ou cache externo virar gargalo, migrar para Caddy.

Unit file sugerido em `~/.config/systemd/user/embedder-observer.service`:

```ini
[Unit]
Description=Embedder Observer UI
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/opc/embedder-observer
ExecStart=/usr/bin/npm run preview -- --port 5175 --host 0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Ativar:
```bash
npm run build
systemctl --user daemon-reload
systemctl --user enable --now embedder-observer
```

**Atenção**: `vite preview` NÃO carrega o proxy do dev. Para produção:
- (a) reverse-proxy externo (Caddy/nginx) com regras para `/proxy/embedder-d`
  e `/proxy/cogmem`, ou
- (b) mudar `daemons.ts` para URLs absolutas (`http://localhost:8081`)
  — exige CORS nos daemons. embedder-d já faz `CorsLayer::permissive()`.

## Estrutura

```
src/
  App.tsx                  layout, theme toggle, header
  App.css                  app shell, header, main grid
  index.tsx                entrypoint (carrega iconify-icon web component)
  iconify.d.ts             type augmentation pra JSX
  components/
    DaemonColumn.tsx       1 coluna por daemon, com header/metrics/sources
    SourceCard.tsx         cartão fixed-height ~200px, scroll interno
    EventRow.tsx           ts + pill + tokens + latency + expand
    MetricTicker.tsx       NOW/AVG com tick animation
  hooks/
    useSSE.ts              EventSource + reconnect + demux por source
    useStats.ts            poll /api/stats a cada 1s
  styles/
    tokens.css             Editorial Paper light + dark
    base.css               reset, scrollbar, keyframes
  config/
    daemons.ts             [{id, label, url, tint}]
```

## Arquitetura reactive

Cada `DaemonColumn` chama `useSSE(daemon.url)` que retorna um `createStore`:

```typescript
{
  connected: boolean,
  error: string | null,
  totalEvents: number,
  sources: Record<sourceId, { events, eventCount, lastEventTs }>
}
```

Quando um evento chega via SSE:
1. `produce()` muta o store imutavelmente
2. Se o source é novo, cria entrada no map (cartão dinâmico via `<For>`)
3. `events.unshift(ev)` + trim em `SOURCE_MAX` (50)
4. `eventCount` incrementa, `lastEventTs` atualiza

`SourceCard` reage a `lastEventTs` via `createEffect` para disparar pulse dot.
`MetricTicker` reage ao valor via `createEffect` para reanimar tick.

## Endpoints consumidos

**embedder-d** (`http://localhost:8081`):
- `GET /api/stats` → JSON `{daemon_id, model, dim, uptime_secs, total_requests,
  throughput_now, throughput_avg, latency_p50_ms, rss_mb, ...}`
- `GET /api/events` → SSE stream de `{ts_ms, daemon_id, source, tokens,
  latency_ms, chunk_preview}`

**cogmem** (`http://localhost:3939`): mesmos endpoints com sources contextuais
por tipo de operação:

| Source | Origem |
|--------|--------|
| `cogmem/context` | attention + auto search |
| `cogmem/search` | search via socket ou HTTP |
| `cogmem/insert` | memórias manuais |
| `cogmem/capture/<repo>` | turns de sessão capturados |
| `cogmem/code-search` | busca em code index |

Se o daemon estiver offline, a UI gracefully degrada com "Reconnecting in Ns…"
no header e empty state no body.

## Latency thresholds

- `OK`   <  300 ms
- `SLOW` 300–599 ms
- `LAG`  ≥  600 ms

Configurar em `src/config/daemons.ts`.

## Preservado do mockup v8

- Cartões fixed-height por source (200 px expanded / 32 px collapsed)
- Rendering incremental (`unshift` + slice up to SOURCE_MAX)
- Tint azul para embedder-d, roxo para cogmem
- Pulse dot por source na chegada de evento
- Pills OK/SLOW/LAG colorizadas
- Punctuation `·` `•` `—`
- Metric tick (opacity dip no update)
- Row expand → chunk preview
- Late sources nascem dinamicamente (não precisam estar pré-configurados)
- Collapse de daemon (max-height) e de source (height)
- Dark/light toggle persistente em `localStorage`
- Editorial Paper Hi-Fi tokens

## Comandos úteis

```bash
npm run dev          # dev server :5174
npm run build        # build de produção em dist/
npm run preview      # preview do build (substitui dev em prod)
npx tsc --noEmit     # type check sem emit
```

## Documentação

- [`docs/contexto/20052026-embedder-observer-deploy.md`](docs/contexto/20052026-embedder-observer-deploy.md)
  — registro denso do deploy inicial: backend SSE em embedder-d e cogmem,
  patch LibraGen `source`, recovery de refactor dangling, frontend SolidJS,
  decisões arquiteturais, pendências.
- [`docs/prompts/20052026-benchmark-qwen3-libragen.md`](docs/prompts/20052026-benchmark-qwen3-libragen.md)
  — prompt de retomada para próxima sessão: usar este dashboard como instrumento
  pra benchmark do Qwen3-Embedding-0.6B INT8 sob load real do LibraGen.
