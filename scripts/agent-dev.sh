#!/usr/bin/env bash
# Агент на этой машине к API из .env.development (`yarn dev`): Go-агент держит
# связь и запускает нагрузки (Python-воркеры) из agent/agent.dev.yaml.
#
#   yarn agent:setup            сборка агента под эту машину + Python-окружение .venv
#   yarn agent                  на переднем плане (Ctrl+C — штатная остановка)
#   yarn agent:start            то же в фоне
#   yarn agent:stop [--force]   остановить: задачи дорабатываются; --force — сразу
#   yarn agent:status           запущен ли
#   yarn agent:logs             журнал фонового агента
#
# Регистрация — AGENT_BOOTSTRAP_TOKEN из env-файла (тот же, что у API), адрес
# API — http://localhost:$SERVER_PORT. Другой файл — ENV_FILE=..., другой
# конфиг агента — AGENT_CONFIG=... Данные агента (учётные данные, outbox) —
# .agent/data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.development}"
RUN_DIR=.agent
PID_FILE="$RUN_DIR/agent.pid"
LOG_FILE="$RUN_DIR/agent.log"
STOP_TIMEOUT="${STOP_TIMEOUT:-60}"
VERSION="$(cat agent/VERSION)"

env_value() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

running_pid() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE" || true
}

binary() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=amd64 ;; esac
  echo "agent/dist/$VERSION/agent-$os-$arch"
}

prepare() {
  BIN="$(binary)"
  if [ ! -x "$BIN" ]; then
    echo "Нет сборки $BIN — сначала: yarn agent:setup" >&2
    exit 1
  fi
  if [ ! -x .venv/bin/python ]; then
    echo "Нет окружения .venv — сначала: yarn agent:setup" >&2
    exit 1
  fi
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
  export AGENT_CONFIG="${AGENT_CONFIG:-agent/agent.dev.yaml}"
}

case "${1:-}" in
  setup)
    scripts/agent.sh build
    if [ ! -x .venv/bin/python ]; then
      echo "Создаю .venv"
      python3 -m venv .venv
    fi
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r python/requirements.txt
    echo "Готово: yarn agent"
    ;;
  run)
    prepare
    exec "$BIN" run
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
    pid="$(running_pid)"
    if [ -z "$pid" ]; then
      rm -f "$PID_FILE"
      echo "Не запущен"
      exit 0
    fi
    if [ "${2:-}" = "--force" ]; then
      kill -KILL "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "Остановлен принудительно (задачи вернутся в очередь по аренде)"
      exit 0
    fi
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 "$STOP_TIMEOUT"); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Дорабатывает задачи (pid $pid); сразу — yarn agent:stop --force"
    else
      rm -f "$PID_FILE"
      echo "Остановлен"
    fi
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
    echo "использование: $0 setup | run | start | stop [--force] | status | logs" >&2
    exit 2
    ;;
esac
