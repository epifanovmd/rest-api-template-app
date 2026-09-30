#!/usr/bin/env bash
# Внешний Python-воркер на этой машине к API из .env.development (`yarn dev`).
# Воркер — долгоживущий процесс: сам забирает задачи своих очередей, пока работает.
#
#   yarn worker:setup            окружение .venv (SDK python/worker_sdk)
#   yarn worker [файл]           на переднем плане (Ctrl+C — остановка); по умолчанию
#                                пример python/examples/echo_worker.py (очередь demo.echo)
#   yarn worker:start [файл]     то же в фоне
#   yarn worker:stop [--force]   остановить фоновый: текущая задача дорабатывается;
#                                --force — сразу (задача вернётся в очередь)
#   yarn worker:status           запущен ли
#   yarn worker:logs             журнал фонового воркера
#
# Ключ — WORKER_API_KEY в env-файле (scope worker:<очередь>), адрес API —
# http://localhost:$SERVER_PORT. Другой файл — ENV_FILE=..., переменные
# окружения WORKER_* имеют приоритет. В Docker — профиль python-worker
# в docker-compose.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.development}"
VENV=.venv
RUN_DIR=.worker
PID_FILE="$RUN_DIR/worker.pid"
LOG_FILE="$RUN_DIR/worker.log"
STOP_TIMEOUT="${STOP_TIMEOUT:-30}"
DEFAULT_SCRIPT=python/examples/echo_worker.py

env_value() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

running_pid() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE" || true
}

prepare() {
  if [ ! -x "$VENV/bin/python" ]; then
    echo "Нет окружения $VENV — сначала: yarn worker:setup" >&2
    exit 1
  fi

  local key="${WORKER_API_KEY:-$(env_value WORKER_API_KEY)}"
  local port
  port="$(env_value SERVER_PORT)"

  if [ -z "$key" ]; then
    echo "Нет WORKER_API_KEY в $ENV_FILE (ключ со scope worker:<очередь>)" >&2
    exit 1
  fi

  export WORKER_API_URL="${WORKER_API_URL:-http://localhost:${port:-8181}}"
  export WORKER_API_KEY="$key"
  export PYTHONPATH="python${PYTHONPATH:+:$PYTHONPATH}"
}

case "${1:-}" in
  setup)
    if [ ! -x "$VENV/bin/python" ]; then
      echo "Создаю $VENV"
      python3 -m venv "$VENV"
    fi
    "$VENV/bin/pip" install -q --upgrade pip
    "$VENV/bin/pip" install -r python/requirements.txt
    ;;
  run)
    prepare
    exec "$VENV/bin/python" "${2:-$DEFAULT_SCRIPT}"
    ;;
  start)
    if [ -n "$(running_pid)" ]; then
      echo "Уже запущен (pid $(running_pid))"
      exit 0
    fi
    prepare
    mkdir -p "$RUN_DIR"
    nohup "$VENV/bin/python" "${2:-$DEFAULT_SCRIPT}" >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    echo "Запущен (pid $!), журнал — yarn worker:logs"
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
      echo "Остановлен принудительно"
      exit 0
    fi
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 "$STOP_TIMEOUT"); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Дорабатывает задачу (pid $pid); сразу — yarn worker:stop --force"
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
    echo "использование: $0 setup | run [файл] | start [файл] | stop [--force] | status | logs" >&2
    exit 2
    ;;
esac
