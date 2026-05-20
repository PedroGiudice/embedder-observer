#!/usr/bin/env bash
# benchmark-qwen3.sh
#
# Coleta metricas estruturadas do embedder-d enquanto outra carga
# (tipicamente `libragen build`) gera trafego sustentado.
#
# Output:
#   benchmarks/<label>-<ts>.csv  -- timeseries de stats (1 linha por amostra)
#   benchmarks/<label>-<ts>.txt  -- resumo no fim (medias, std, picos)
#
# Uso:
#   ./benchmark-qwen3.sh <label> [interval_secs] [max_duration_secs]
#
# Exemplo:
#   ./benchmark-qwen3.sh stj-vec 5 3600    # amostra a cada 5s, max 1h
#
# Para parar antes: kill <pid> ou Ctrl+C (gera resumo do que tem ate aqui).

set -u
LABEL="${1:?label obrigatorio (ex: stj-vec)}"
INTERVAL="${2:-5}"
MAX_DUR="${3:-7200}"
ENDPOINT="${EMBEDDER_STATS_URL:-http://localhost:8081/api/stats}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/benchmarks"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
CSV="$OUT_DIR/${LABEL}-${TS}.csv"
TXT="$OUT_DIR/${LABEL}-${TS}.txt"

START_EPOCH="$(date +%s)"
echo "ts_iso,elapsed_secs,uptime_secs,total_requests,total_tokens,throughput_now,throughput_avg,latency_p50_ms,latency_p95_ms,latency_p99_ms,rss_mb" > "$CSV"

echo "[benchmark-qwen3] label=$LABEL interval=${INTERVAL}s max=${MAX_DUR}s endpoint=$ENDPOINT" >&2
echo "[benchmark-qwen3] csv: $CSV" >&2

cleanup() {
  echo "" >&2
  echo "[benchmark-qwen3] gerando resumo..." >&2
  python3 - "$CSV" "$TXT" <<'PY'
import csv, statistics, sys, datetime
csv_path, txt_path = sys.argv[1], sys.argv[2]
rows = []
with open(csv_path) as f:
    rd = csv.DictReader(f)
    for r in rd:
        try:
            rows.append({
                "elapsed": float(r["elapsed_secs"]),
                "req": int(r["total_requests"]),
                "tok": int(r["total_tokens"]),
                "now": float(r["throughput_now"]),
                "avg": float(r["throughput_avg"]),
                "p50": float(r["latency_p50_ms"]),
                "p95": float(r["latency_p95_ms"]),
                "p99": float(r["latency_p99_ms"]),
                "rss": float(r["rss_mb"]),
            })
        except (ValueError, KeyError):
            continue

if len(rows) < 2:
    with open(txt_path, "w") as o:
        o.write("amostras insuficientes\n")
    print("amostras insuficientes")
    sys.exit(0)

def s(key):
    vals = [r[key] for r in rows]
    return {
        "n": len(vals),
        "min": min(vals),
        "max": max(vals),
        "mean": statistics.mean(vals),
        "stdev": statistics.pstdev(vals),
    }

first, last = rows[0], rows[-1]
duration = last["elapsed"] - first["elapsed"]
delta_req = last["req"] - first["req"]
delta_tok = last["tok"] - first["tok"]
throughput_overall = delta_req / duration if duration > 0 else 0
tokens_per_sec = delta_tok / duration if duration > 0 else 0

now_stats = s("now")
p50_stats = s("p50")
p95_stats = s("p95")
p99_stats = s("p99")
rss_stats = s("rss")

report = []
report.append(f"=== benchmark resumo ({csv_path.split('/')[-1]}) ===")
report.append("")
report.append(f"duracao            : {duration:.0f}s ({duration/60:.1f}min)")
report.append(f"amostras           : {len(rows)}")
report.append(f"requests no periodo: {delta_req}")
report.append(f"tokens no periodo  : {delta_tok}")
report.append(f"throughput overall : {throughput_overall:.2f} requests/s")
report.append(f"tokens/s overall   : {tokens_per_sec:.0f} tok/s")
report.append("")
report.append("=== throughput_now (chunks/s instantaneo) ===")
report.append(f"min={now_stats['min']:.2f}  mean={now_stats['mean']:.2f}  max={now_stats['max']:.2f}  std={now_stats['stdev']:.2f}")
report.append("")
report.append("=== latency (ms) ===")
report.append(f"p50  min={p50_stats['min']:.0f}  mean={p50_stats['mean']:.0f}  max={p50_stats['max']:.0f}  std={p50_stats['stdev']:.0f}")
report.append(f"p95  min={p95_stats['min']:.0f}  mean={p95_stats['mean']:.0f}  max={p95_stats['max']:.0f}  std={p95_stats['stdev']:.0f}")
report.append(f"p99  min={p99_stats['min']:.0f}  mean={p99_stats['mean']:.0f}  max={p99_stats['max']:.0f}  std={p99_stats['stdev']:.0f}")
report.append("")
report.append("=== rss (MB) ===")
report.append(f"min={rss_stats['min']:.0f}  mean={rss_stats['mean']:.0f}  max={rss_stats['max']:.0f}  std={rss_stats['stdev']:.0f}")
report.append(f"growth ao longo da run: {last['rss'] - first['rss']:+.0f} MB")
report.append("")

txt = "\n".join(report)
with open(txt_path, "w") as o:
    o.write(txt + "\n")
print(txt)
PY
  echo "[benchmark-qwen3] resumo: $TXT" >&2
  exit 0
}
trap cleanup INT TERM EXIT

while :; do
  NOW_EPOCH="$(date +%s)"
  ELAPSED=$((NOW_EPOCH - START_EPOCH))
  if [[ $ELAPSED -gt $MAX_DUR ]]; then
    echo "[benchmark-qwen3] atingiu MAX_DUR=${MAX_DUR}s" >&2
    break
  fi
  ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  JSON="$(curl -sf --max-time 3 "$ENDPOINT" 2>/dev/null || echo '')"
  if [[ -n "$JSON" ]]; then
    LINE="$(echo "$JSON" | jq -r --arg iso "$ISO" --arg el "$ELAPSED" '
      [$iso, $el,
       (.uptime_secs|tostring),
       (.total_requests|tostring),
       (.total_tokens|tostring),
       (.throughput_now|tostring),
       (.throughput_avg|tostring),
       (.latency_p50_ms|tostring),
       (.latency_p95_ms|tostring),
       (.latency_p99_ms|tostring),
       (.rss_mb|tostring)
      ] | @csv
    ' 2>/dev/null || echo '')"
    if [[ -n "$LINE" ]]; then
      echo "$LINE" >> "$CSV"
    fi
  fi
  sleep "$INTERVAL"
done
