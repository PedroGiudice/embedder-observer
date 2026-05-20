# Retomada: Benchmark Qwen3-Embedding-0.6B INT8 para LibraGen

## Contexto rapido

O **Embedder Observer** acabou de ser deployado: dashboard real-time em
`http://100.123.73.128:5174` que mostra atividade dos dois daemons de embedding
locais (embedder-d com Qwen3 INT8, cogmem com BGE-M3 INT8) via SSE. Stats e
events estao funcionando em producao.

Agora a missao e usar esse instrumento pra fazer o **benchmark completo do
Qwen3-Embedding-0.6B INT8** rodando no embedder-d, validando se mantem a
proposta de substituir BGE-M3 no LibraGen (decisao tomada em sessao anterior
baseada em pesquisa de modelos; agora precisa validar empiricamente sob load
real).

LibraGen ja esta wired pro embedder-d (porta 8081) e ja passa o campo `source`
no payload pra granularidade do dashboard. Bibliotecar um repo grande gera
trafego sustentado que e o cenario alvo do benchmark.

## Arquivos principais

- `docs/contexto/20052026-embedder-observer-deploy.md` -- contexto completo da sessao anterior
- `/home/opc/embedder-d/src/main.rs` -- daemon Qwen3 (porta 8081)
- `/home/opc/code-explore/libragen/packages/cli/bin/run.js` -- CLI LibraGen
- `~/.config/libragen/config.json` -- aponta pro embedder-d :8081
- `http://100.123.73.128:5174` -- dashboard (validar visual via Chrome)

## Estado runtime (verificar antes de comecar)

```bash
# Daemons devem estar active
systemctl --user is-active cogmem        # active
curl -sf http://localhost:8081/api/stats | jq .uptime_secs   # > 0
curl -sf http://localhost:3939/api/stats | jq .uptime_secs   # > 0

# Frontend deve responder
curl -sf -I http://100.123.73.128:5174 | head -1   # HTTP/1.1 200 OK
```

Se algum falhar, ver `docs/contexto/20052026-embedder-observer-deploy.md` secao
"Endpoints e tooling de referencia" pra recuperar.

## Proximos passos

### 1. Definir desenho do benchmark
**Onde:** decisao de produto (TD + PD)
**O que:** acordar com PD o escopo. Dimensoes candidatas:
  - **Repos alvo**: 1 grande (~3000 chunks, ex: stj-vec ou case-docs), 1 medio (~500 chunks, libragen self-index), 1 pequeno (~100 chunks)
  - **Metricas**: throughput (chunks/s), latency p50/p95/p99, RSS sob load sustentado, taxa de erro
  - **Comparativo**: Qwen3 INT8 (atual) vs BGE-M3 ONNX in-process (hipotetico migrar pra cogmem) -- ou Qwen3 baseline only
  - **Qualidade**: amostragem de queries depois pra verificar relevance recall
**Por que:** sem escopo, benchmark vira fishing expedition.
**Verificar:** PD aprova o set de metricas e o set de repos.

### 2. Executar bibliotecar repo grande com observer aberto
**Onde:** terminal + Chrome com `http://100.123.73.128:5174` em tab dedicada
**O que:**
  ```bash
  LIBRAGEN_EMBEDDER_SOURCE=libragen/<nome-repo> \
    libragen build /path/to/repo --name <nome-repo> \
    --output /tmp/<nome>.libragen
  ```
  Observar dashboard ao vivo: NOW chunks/s, p95 latency, RSS do embedder-d.
**Por que:** primeira amostra de comportamento sob load real.
**Verificar:** dashboard mostra source `libragen/<nome-repo>` aparecendo em
cartao fixed-height na coluna esquerda; counter crescendo conforme chunks
processam.

### 3. Coletar metricas estruturadas
**Onde:** novo script `scripts/benchmark-qwen3.sh` (criar)
**O que:** wrapper que:
  - Captura `curl /api/stats | jq` a cada N segundos durante o build
  - Persiste em CSV (timestamp, throughput_now, total_requests, latency_p50, p95, p99, rss_mb)
  - Calcula medias + std deviation
  - Emite resumo final
**Por que:** numeros estruturados pra comparar runs e justificar decisao migracao.
**Verificar:** CSV gerado, resumo coerente com observacao visual no dashboard.

### 4. Avaliar viabilidade da decisao "Qwen3 in production"
**Onde:** documento de analise (criar em `/home/opc/embedder-observer/docs/contexto/`)
**O que:** comparar metricas coletadas vs:
  - Throughput minimo aceitavel (~2-5 chunks/s sustentado)
  - p95 latency maximo aceitavel (~250ms)
  - RSS maximo (~1-2GB sob load)
  - Qualidade subjetiva via queries de teste
**Por que:** decidir "manter Qwen3" vs "migrar pra outro modelo" vs "ajustar tuning (batch size, thread count)"
**Verificar:** documento com recomendacao + numeros que justificam.

### 5. Se Qwen3 aprovado: documentar e fechar
**Onde:** `rules/` em ~/.claude e CLAUDE.md raiz se relevante
**O que:** atualizar `rules/libragen.md` ou criar nova rule consolidando decisao Qwen3 + numeros do benchmark
**Por que:** evitar relitigacao em sessao futura ("por que estamos usando Qwen3?")
**Verificar:** rule ou doc commitada.

## Como verificar ambiente antes de comecar

```bash
# 1. Daemons rodando
curl -sf http://localhost:8081/api/health | jq .status
curl -sf http://localhost:3939/api/health | jq .status

# 2. SSE conectando
timeout 2 curl -sN http://localhost:8081/api/events | head -3  # vai timeout, ok

# 3. LibraGen apontando pro embedder-d
cat ~/.config/libragen/config.json | jq .embedder

# 4. Frontend acessivel
curl -sf -I http://100.123.73.128:5174 | head -3

# 5. Repos candidatos disponiveis pra bibliotecar
ls -la /home/opc/case-docs /home/opc/stj-vec /home/opc/code-explore/libragen | head -5
```

## Restricoes

- **NAO tocar no daemon cogmem mid-benchmark** -- ele tambem captura embedding
  events e contamina as metricas se reiniciado. Cogmem deve ficar idle nas
  metricas (ou seja, sem rodar capture/search).
- **NAO bibliotecar repo enquanto LibraGen ja esta indexando outro** -- serializa
  no embedder-d via Mutex. Um por vez.
- **Tunnel SSH CDP** (PID 618213) so manter vivo se for usar `claude-in-chrome`
  pra screenshots durante benchmark. Senao `kill 618213` pra economizar
  recurso.
- **Branches locais nao mergeadas/pushadas**: ver pendencias 1+2 do contexto.
  Antes de qualquer rebuild dos daemons, garantir que main reflete o code
  rodando -- senao risco de regressao.
