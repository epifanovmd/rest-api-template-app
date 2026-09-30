#!/usr/bin/env bash
# Внешний Python-воркер на этой машине к API из .env.development (`yarn dev`).
#
#   yarn worker:setup   окружение .venv (SDK python/worker_sdk)
#   yarn worker         пример python/examples/echo_worker.py (очередь demo.echo)
#   yarn worker <файл>  свой обработчик, путь от корня репозитория
#
# Ключ — WORKER_API_KEY в env-файле (scope worker:<очередь>), адрес API —
# http://localhost:$SERVER_PORT. Другой файл — ENV_FILE=..., переменные
# окружения WORKER_* имеют приоритет. В Docker — профиль python-worker
# в docker-compose.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.development}"
VENV=.venv

env_value() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
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
    script="${2:-python/examples/echo_worker.py}"

    if [ ! -x "$VENV/bin/python" ]; then
      echo "Нет окружения $VENV — сначала: yarn worker:setup" >&2
      exit 1
    fi

    key="${WORKER_API_KEY:-$(env_value WORKER_API_KEY)}"
    port="$(env_value SERVER_PORT)"

    if [ -z "$key" ]; then
      echo "Нет WORKER_API_KEY в $ENV_FILE (ключ со scope worker:<очередь>)" >&2
      exit 1
    fi

    WORKER_API_URL="${WORKER_API_URL:-http://localhost:${port:-8181}}" \
      WORKER_API_KEY="$key" \
      PYTHONPATH="python${PYTHONPATH:+:$PYTHONPATH}" \
      exec "$VENV/bin/python" "$script"
    ;;
  *)
    echo "использование: $0 setup | run [файл]" >&2
    exit 2
    ;;
esac
