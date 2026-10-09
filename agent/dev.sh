#!/usr/bin/env bash
# Агент на этой машине к API из .env.development (`yarn dev`): связь, воркеры, настройки и
# метрики держит агент (github.com/epifanovmd/agent). Настройки — agent/local/agent.yaml:
# воркер проекта echo (из исходников agent/workers/echo) и netprobe (проверка сети, сборка из
# выпуска agent/release). Выпуск для узлов собирает agent/release.sh (yarn agent:release).
#
#   yarn agent                  агент на переднем плане (Ctrl+C — остановка агента и воркеров)
#   yarn agent:start            то же в фоне
#   yarn agent:stop [--force]   остановить агента и воркеры; --force — сразу (SIGKILL)
#   yarn agent:status           запущен ли
#   yarn agent:logs             журнал фонового агента
#
# Программа агента — AGENT_BIN, иначе <AGENT_DIR>/bin/agent или agent/release/agent-<os>-<arch>
# (выпуск бэкенда, yarn agent:release). Воркер netprobe — NETPROBE_BIN, <AGENT_DIR>/bin/netprobe
# или сборка из выпуска (netprobe-<версия>-<os>-<arch> по manifest.json); сборки нет — агент
# запускается без него.
#
# Регистрация — AGENT_BOOTSTRAP_TOKEN из env-файла (тот же, что у API), адрес API —
# http://localhost:$SERVER_PORT. Другой env-файл — ENV_FILE=..., другие настройки агента —
# AGENT_CONFIG=..., второй агент — AGENT_DIR=.agent-2 AGENT_NAME=dev-2 (свой ключ, данные,
# журнал). Данные агента (ключ, очередь важных сообщений, настройки воркеров) —
# <AGENT_DIR>/data; удалить их — агент зарегистрируется заново.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.development}"
RUN_DIR="${AGENT_DIR:-.agent}"
case "$RUN_DIR" in /*) ;; *) RUN_DIR="$ROOT/$RUN_DIR" ;; esac
PID_FILE="$RUN_DIR/agent.pid"
LOG_FILE="$RUN_DIR/agent.log"
STOP_TIMEOUT="${STOP_TIMEOUT:-60}"
RELEASE_DIR=agent/release

env_value() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

running_pid() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE" || true
}

platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=amd64 ;; esac
  echo "$os-$arch"
}

# Программа агента: первая найденная; нет — подсказка, где взять.
binary() {
  local file candidate
  file="agent-$(platform)"
  for candidate in "${AGENT_BIN:-}" "$RUN_DIR/bin/agent" "$RELEASE_DIR/$file"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  cat >&2 <<HINT
Нет программы агента для $(platform): yarn agent:release (выпуск в $RELEASE_DIR)
или укажите свою: AGENT_BIN=/путь/к/agent yarn agent
HINT
  exit 1
}

# Воркер netprobe из выпуска (release: true в agent/local/agent.yaml): сборка ставится в
# <dataDir>/workers/netprobe, как это делает `agent install --worker netprobe`. Сборки нет —
# блок между метками netprobe:begin/end убирается из своей копии настроек.
netprobe() {
  local v="" file="" candidate dir="$AGENT_DATA_DIR/workers/netprobe"
  if [ -f "$RELEASE_DIR/manifest.json" ]; then
    read -r v file < <(node -e '
      const [os, arch] = process.argv[2].split("-");
      const w = (require(process.argv[1]).workers || []).find(w => w.name === "netprobe" && w.os === os && w.arch === arch);
      if (w) console.log(w.version, w.file);' "$ROOT/$RELEASE_DIR/manifest.json" "$(platform)") || true
  fi
  for candidate in "${NETPROBE_BIN:-}" "$RUN_DIR/bin/netprobe" "${file:+$RELEASE_DIR/$file}"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      mkdir -p "$dir"
      if ! cmp -s "$candidate" "$dir/current"; then
        cp "$candidate" "$dir/current.new" && mv "$dir/current.new" "$dir/current"
      fi
      # Своя сборка (NETPROBE_BIN) — версия как у agent-sdk.
      [ -n "$v" ] || v="$(node -p "require('./node_modules/agent-sdk/package.json').version")"
      echo "$v" >"$dir/version"
      return
    fi
  done
  if grep -q "netprobe:begin" "$AGENT_CONFIG"; then
    echo "Нет сборки netprobe для $(platform) — агент без него (yarn agent:release или NETPROBE_BIN=...)" >&2
    sed '/netprobe:begin/,/netprobe:end/d' "$AGENT_CONFIG" >"$RUN_DIR/agent.yaml"
    export AGENT_CONFIG="$RUN_DIR/agent.yaml"
  fi
}

prepare() {
  BIN="$(binary)"
  command -v python3 >/dev/null || {
    echo "Нужен python3 ≥ 3.10 для воркера echo" >&2
    exit 1
  }
  local token="${AGENT_BOOTSTRAP_TOKEN:-$(env_value AGENT_BOOTSTRAP_TOKEN)}"
  if [ -z "$token" ]; then
    echo "Нет AGENT_BOOTSTRAP_TOKEN в $ENV_FILE (не короче 32 символов; тот же — у API)" >&2
    exit 1
  fi
  mkdir -p "$RUN_DIR/data"
  export AGENT_BOOTSTRAP_TOKEN="$token"
  export SERVER_PORT="${SERVER_PORT:-$(env_value SERVER_PORT)}"
  export SERVER_PORT="${SERVER_PORT:-8181}"
  export AGENT_ROOT="$ROOT"
  export AGENT_DATA_DIR="$RUN_DIR/data"
  export AGENT_NAME="${AGENT_NAME:-dev-${USER:-dev}}"
  export AGENT_CONFIG="${AGENT_CONFIG:-agent/local/agent.yaml}"
  netprobe
}

# Воркеры переживают остановку агента (lifecycle.onAgentStop: keep) — здесь их тоже останавливаем.
stop_workers() {
  "$BIN" stop-workers -config "$AGENT_CONFIG" || true
}

case "${1:-}" in
  run)
    prepare
    trap 'kill -TERM "$child" 2>/dev/null || true' INT TERM
    "$BIN" run &
    child=$!
    wait "$child" || true
    wait "$child" 2>/dev/null || true
    stop_workers
    ;;
  start)
    if [ -n "$(running_pid)" ]; then
      echo "Уже запущен (pid $(running_pid))"
      exit 0
    fi
    prepare
    nohup "$BIN" run >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    echo "Запущен (pid $!), журнал — yarn agent:logs"
    ;;
  stop)
    prepare
    pid="$(running_pid)"
    if [ -n "$pid" ]; then
      if [ "${2:-}" = "--force" ]; then
        kill -KILL "$pid" 2>/dev/null || true
      else
        kill -TERM "$pid" 2>/dev/null || true
        for _ in $(seq 1 "$STOP_TIMEOUT"); do
          kill -0 "$pid" 2>/dev/null || break
          sleep 1
        done
      fi
    fi
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Агент ещё останавливается (pid $pid); сразу — yarn agent:stop --force"
      exit 1
    fi
    rm -f "$PID_FILE"
    stop_workers
    echo "Остановлен"
    ;;
  status)
    pid="$(running_pid)"
    if [ -n "$pid" ]; then echo "Работает (pid $pid)"; else echo "Не запущен"; fi
    ;;
  logs)
    mkdir -p "$RUN_DIR"
    touch "$LOG_FILE"
    exec tail -n 200 -f "$LOG_FILE"
    ;;
  *)
    echo "использование: $0 run | start | stop [--force] | status | logs" >&2
    exit 2
    ;;
esac
