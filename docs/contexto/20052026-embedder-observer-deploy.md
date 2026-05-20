# Contexto: Embedder Observer end-to-end + deploy SSE cogmem

**Data:** 2026-05-20
**Sessao:** branches multiplas (ver tabela abaixo)
**Duracao:** sessao longa, ~1 dia uteis

---

## O que foi feito

Construido o **Embedder Observer**: dashboard real-time multi-daemon que observa
embedding pipelines locais (embedder-d e cogmem) via SSE. Backend instrumentado
nos dois daemons, frontend SolidJS standalone servindo via Vite, paridade visual
com mockup HTML iterado em 8 versoes.

### 1. Backend SSE no embedder-d (Qwen3 standalone)

Daemon HTTP em `/home/opc/embedder-d/` (Rust + axum). Endpoints adicionados:

```
GET /api/stats   -> JSON StatsSnapshot
GET /api/events  -> SSE stream de TelemetryEvent
```

`StatsSnapshot` schema:
```json
{
  "daemon_id": "embedder-d",
  "model": "qwen3-embedding-0.6b-int8",
  "dim": 1024,
  "uptime_secs": 7484,
  "total_requests": 79,
  "total_tokens": 2684,
  "throughput_now": 4.5,
  "throughput_avg": 0.01,
  "latency_p50_ms": 168,
  "latency_p95_ms": 212,
  "latency_p99_ms": 236,
  "rss_mb": 475
}
```

`TelemetryEvent` schema (1 por input embeddado):
```json
{
  "ts_ms": 1779256800123,
  "daemon_id": "embedder-d",
  "source": "libragen/case-docs",
  "tokens": 85,
  "latency_ms": 168,
  "chunk_preview": "primeiros 300 chars do input..."
}
```

Stack: `tokio-stream` (sync), `futures`, `broadcast::channel` cap 256, ring buffer
100 latencias, window throughput 10s.

### 2. Patch LibraGen: pass `source`

LibraGen client em `/home/opc/code-explore/libragen/` (TypeScript). Adicionado
campo opcional `source` no payload `/api/embed` + env var `LIBRAGEN_EMBEDDER_SOURCE`
+ config file `embedder.source`. Sem source, default `"libragen"`.

### 3. Recovery do refactor cogmem dangling

Cogmem (`/home/opc/claude-memory/cogmem/`) tinha 4 commits dangling de 17/05
que migraram embedder de TEI HTTP pra BGE-M3 ONNX in-process via crate `ort`.
Compilados ao binario em prod mas nunca chegaram a main -- estado de divergencia
perigoso (binario rodando ha 70h refletia code fora do grafo git, exposto a poda).

Recuperado via `git branch refactor/embedder-onnx <tip-dangling>` + merge --no-ff
em main. Source agora bate com binario.

### 4. Backend SSE no cogmem (BGE-M3 in-process)

Mesma infra de telemetria do embedder-d portada pra dentro do cogmem, agora
multi-tenant. Sources contextuais por tipo de operacao:

| Source | Origem |
|--------|--------|
| `cogmem/context` | handle_context (attention + auto search) |
| `cogmem/search` | handle_search (socket) + http_search (HTTP) |
| `cogmem/insert` | handle_insert (memorias manuais) |
| `cogmem/capture/<repo>` | handle_capture_turn (turns de sessao) |
| `cogmem/code-search` | handle_code_search (socket) + http_code_search (HTTP) |

Implementacao: 1 modulo novo `src/telemetry.rs` (Stats + TelemetryEvent), 1 funcao
publica `Embedder::count_tokens_bge()` (tokeniza sem inferencia, ~us), 1 helper
`AppState::embed_and_record(source, text)` consolida count+embed+record numa
chamada. 7 call sites refatorados.

Fix pos-review: `record_embedding` inline `.await` em vez de `tokio::spawn`,
elimina dessincronia stats vs events (custo us em VecDeque pequeno).

### 5. Frontend SolidJS standalone

Repo novo em `/home/opc/embedder-observer/`. Stack:

- SolidJS 1.9 + TypeScript + Vite 8
- `@iconify-icon/solid` (lucide icons)
- Google Fonts Baumans (display, no `h1`)
- Instrument Sans + ui-monospace
- EventSource nativa com auto-reconnect exponencial e demux por source
- Editorial Paper Hi-Fi tokens (light + dark via localStorage)

Estrutura reactive: `createStore` por daemon, `sources: Record<sid, {events, eventCount, lastEventTs}>` dinamico, `<For>` pra render, `createEffect` em
`lastEventTs` dispara pulse animation. SOURCE_MAX=50 rows por source.

Vite proxy: paths relativos `/proxy/embedder-d` e `/proxy/cogmem` reescritos
pra `localhost:8081` e `localhost:3939`. Header `x-accel-buffering: no` no
proxyRes pra nao bufferizar SSE.

Deploy de producao escolhido: `vite preview` via systemd. Caveat documentado:
preview NAO carrega proxy do dev -- precisa reverse-proxy externo OU mudar
`daemons.ts` pra URLs absolutas (embedder-d e cogmem ja tem
`CorsLayer::permissive()`).

### 6. Mockup HTML evolutivo (8 versoes)

Iteracao visual via teammate `frontend@embedder-observer` (Opus 4.7) com
validacao via `claude-in-chrome` MCP (tunnel CDP SSH cmr-auto -> VM). Mockup
em `/tmp/embedder-observer-mockup.html` substituido pelo SolidJS app final.
Evolucao chave: v7 -> v8 fix arquitetural cartoes fixed-height (~200px) com
scroll interno por source, em vez de sources empilhados no mesmo container
scrollavel.

---

## Estado dos arquivos

### embedder-d (`/home/opc/embedder-d/`)

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `src/main.rs` | Modificado | +235 LOC: TelemetryEvent, Stats, broadcast, http_stats, http_events, instrumentacao per-input em http_embed |
| `Cargo.toml` | Modificado | +tokio-stream (sync), +futures |

### libragen fork (`/home/opc/code-explore/libragen/`)

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `packages/core/src/http-embedder.ts` | Modificado | +42-7 LOC: `source` field em config + payload + env var + ConfigFile schema |

### claude-memory / cogmem (`/home/opc/claude-memory/cogmem/`)

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `src/telemetry.rs` | Criado | +155 LOC: Stats (ring buffer 100 + janela 10s), TelemetryEvent, StatsSnapshot, broadcast cap 256 |
| `src/embedder.rs` | Modificado | +16 LOC: `count_tokens_bge()` publico (tokeniza sem inferencia) |
| `src/main.rs` | Modificado | +109 LOC: AppState += stats+events, helper embed_and_record, 7 call sites refatorados, http_stats + http_events handlers |
| `Cargo.toml` | Modificado | +tokio-stream (sync), +futures, +ort 2.0.0-rc.12, +tokenizers 0.20, +ndarray 0.17 (recuperadas -- refactor anterior compilou contra elas mas nao foram committadas) |

### embedder-observer (`/home/opc/embedder-observer/`)

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `src/App.tsx` | Criado | Layout, theme toggle, header Baumans |
| `src/components/DaemonColumn.tsx` | Criado | 1 coluna por daemon |
| `src/components/SourceCard.tsx` | Criado | Cartao fixed-height ~200px com scroll interno |
| `src/components/EventRow.tsx` | Criado | timestamp + pill + tokens + latency + expand |
| `src/components/MetricTicker.tsx` | Criado | NOW/AVG com tick animation |
| `src/hooks/useSSE.ts` | Criado | EventSource connect + auto-reconnect exponencial + demux por source |
| `src/hooks/useStats.ts` | Criado | Poll JSON /api/stats |
| `src/styles/tokens.css` | Criado | Editorial Paper tokens (light + dark via [data-theme]) |
| `src/styles/base.css` | Criado | Reset, typography, animations |
| `src/config/daemons.ts` | Criado | [{name, url, tint, model, ...}] |
| `vite.config.ts` | Criado | Proxy /proxy/embedder-d + /proxy/cogmem, host 0.0.0.0 |
| `README.md` | Criado | Stack, run, build, deploy |

---

## Commits desta sessao

### embedder-d (branch main, sem remote)
```
4932a1b feat(telemetry): SSE /api/events + JSON /api/stats endpoints
```

### libragen fork (branch main, sem permissao push upstream)
```
ab15908 feat(http-embedder): pass `source` to /api/embed for telemetry
```
(Tambem ja existem 3 commits anteriores ahead de upstream nao relacionados a esta sessao.)

### claude-memory (branch feat/sse-stats-cogmem, NAO mergeada em main ainda)
```
a0dc96f fix(cogmem): record_embedding inline async em vez de spawn
973a343 feat(cogmem): SSE /api/events + JSON /api/stats endpoints
```
+ merge `dc6ba5f` em main (refactor BGE-M3 ONNX in-process recuperado dos dangling).

### embedder-observer (branch main, repo novo)
```
0de53f9 init: Embedder Observer — SolidJS + TS + Vite com SSE real
cc26477 chore: remove src/index.css do scaffold (não usado)
```

---

## Decisoes tomadas

- **SSE em vez de Prometheus**: real-time, sem peso, sem complexidade. Push HTTP unidirectional via `broadcast::channel` + axum SSE. Descartado: Prometheus + grafana (overhead, polling, infra extra pra um dashboard local).
- **1 UI multi-daemon vs 1 UI por daemon**: paridade de schema (`StatsSnapshot`/`TelemetryEvent` identicos cross-daemon) permite frontend tratar daemons uniformemente. Cada daemon emite seu DAEMON_ID.
- **Frontend SolidJS standalone vs Tauri**: web nativo, build estatico <100kB, acesso via tailnet. Tauri seria sobre-engenharia (sem necessidade de native APIs).
- **Editorial Paper Hi-Fi como DS**: light cream + dark, Instrument Sans + ui-monospace, hairlines 1px, semantic colors raras. Decisao do PD baseada no design system do extractor-lab/rustify-player.
- **Cartoes fixed-height ~200px por source**: empilhados verticalmente com scroll interno por cartao. Descartado: v7 com sources empilhados dentro de scroll unico (sources se empurravam fora da viewport).
- **Vite proxy vs URLs absolutas**: dev usa proxy pra evitar CORS issues e simplificar config. Producao requer escolha: reverse-proxy externo OU mudar pra URLs absolutas (daemons ja tem CorsLayer permissive).
- **Iconify (Lucide) + Baumans no h1**: pedido explicito do PD. Iconify via `@iconify-icon/solid` (web component, lazy load).
- **Recovery refactor cogmem em vez de re-implementar**: 4 commits dangling tinham 717 inserts ja testados (binario rodando ha 70h). Recovery via branch + merge --no-ff preserva history.
- **Cogmem record_embedding inline em vez de spawn**: review do rust-reviewer apontou janela de dessincronia stats vs events. Custo us em VecDeque pequeno e desprezivel; spawn nao trazia beneficio.
- **Helper `embed_and_record(source, text)` em vez de inline em cada call site**: 7 call sites com mesmo padrao = abstracao justificada. Source contextual via parametro string.
- **NAO instrumentar http_embed no cogmem**: zero consumers ativos hoje (grep confirmado em todos os repos). Backlog se aparecer caller real.
- **Frontend Baumans no h1 + Instrument Sans no resto**: tested via `document.fonts`. Decisao: nao aplicar Baumans em metricas NOW/AVG (conflitava com hierarquia Editorial Paper).
- **3 branches locais sem push**: embedder-d (sem remote), libragen fork (sem permissao upstream), claude-memory (origin existe mas pattern eh local-only no momento). Pode push depois quando definir destinos.

---

## Metricas

### Estado runtime no momento do handoff

| Daemon | PID | Uptime | RSS | Requests totais | Tokens totais | NOW chunks/s | latency p50 / p95 / p99 |
|--------|-----|--------|-----|-----------------|---------------|--------------|--------------------------|
| embedder-d | (systemd) | 2h05m | 475 MB | 79 | 2684 | 4.5 | 168 / 212 / 236 ms |
| cogmem | 872834 | 6m (recem restart) | 1442 MB | 17 | 143 | 0.1 | 22 / 42 / 63 ms |

### Trafego durante sessao (sample)

| Endpoint | Latencia tipica (BGE-M3 search) |
|----------|----------------------------------|
| `GET :3939/api/search?q=...` | 26-44 ms |
| `GET :3939/api/stats` | <5 ms |

### Frontend

| Item | Valor |
|------|-------|
| Dev server | `http://100.123.73.128:5174` (host 0.0.0.0) |
| Bundle estimado | <100 kB (SPA estatica) |
| SOURCE_MAX no DOM | 50 rows |
| SSE keep-alive | default axum (~15s) |

---

## Pendencias identificadas

### Alta prioridade

1. **Merge `feat/sse-stats-cogmem` em main do claude-memory**
   Branch local com 2 commits validados em prod. Sem isso, prox build do cogmem pode regredir.

2. **Decidir destino de push das 3 branches locais**
   embedder-d (sem remote), libragen fork (sem permissao upstream), claude-memory. Opcoes: criar `PedroGiudice/embedder-d` no GitHub, fork `PedroGiudice/libragen`, ou manter tudo local.

### Media prioridade

3. **Deploy producao do frontend**
   `vite preview` via systemd OU refactor `daemons.ts` pra URLs absolutas + Tailscale Serve. Caveat ja documentado em `embedder-observer/README.md`. Hoje so dev server roda.

4. **Limpeza tunnel SSH CDP**
   PID 618213 (ssh -L 9222 cmr-auto) ainda vivo. Necessario apenas se sessao seguinte continuar usando `claude-in-chrome` MCP pra validar UI. Caso contrario, `kill 618213`.

### Baixa prioridade (backlog)

5. **`http_embed` sem telemetria no cogmem** (Medium 2 da review)
   Zero consumers ativos hoje. Instrumentar quando aparecer caller real.

6. **Lag event sintetico no SSE** (Low 1 da review)
   `BroadcastStreamRecvError::Lagged(n)` silenciosamente dropado. Pode emitir `SseEvent::default().event("lag").data(n)` pro cliente saber.

7. **Stats de erro de embed** (Low 2 da review)
   Embed que falha nao gera stats/event. Metrica de erro fica invisivel no dashboard.

---

## Endpoints e tooling de referencia

### Producao

- embedder-d: `http://localhost:8081/api/{health,stats,events,embed}`
- cogmem HTTP: `http://localhost:3939/api/{health,stats,events,search,sessions,orient,index,code-search,embed,...}`
- cogmem socket: `/tmp/claude-cogmem.sock` (Unix)
- frontend dev: `http://100.123.73.128:5174` (Vite, host 0.0.0.0)

### Backups disponiveis

- `/tmp/cogmem.bin.preview-deploy-backup` (34.1M) -- binario cogmem novo
  pre-restart. Util se precisar reverter sem rebuildar.

### Branches por repo

| Repo | Branch atual | Branches relevantes |
|------|--------------|---------------------|
| `/home/opc/embedder-d/` | `main` | (sem remote) |
| `/home/opc/code-explore/libragen/` | `main` (4 commits ahead origin) | -- |
| `/home/opc/claude-memory/` | `feat/sse-stats-cogmem` | `main` (com merge refactor dc6ba5f) |
| `/home/opc/embedder-observer/` | `main` | -- |

### Smoke tests

```bash
# Backend health
curl -sf http://localhost:8081/api/health
curl -sf http://localhost:3939/api/health

# Stats (novo endpoint nos 2 daemons)
curl -sf http://localhost:8081/api/stats | jq
curl -sf http://localhost:3939/api/stats | jq

# SSE stream (Ctrl+C pra sair)
curl -N http://localhost:8081/api/events
curl -N http://localhost:3939/api/events

# Forcar traffic no cogmem
for q in "test1" "test2" "test3"; do
  curl -s "http://localhost:3939/api/search?q=$q&limit=2" -o /dev/null
done

# Cogmem systemd
systemctl --user is-active cogmem
systemctl --user status cogmem
```
