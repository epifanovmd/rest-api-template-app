#!/bin/sh
# Установка агента как службы systemd (Linux): исполняемый файл, конфигурация,
# каталог данных, служба. Повторный запуск обновляет файл и конфигурацию службы,
# не трогая учётные данные агента.
#
#   sudo sh install.sh --binary ./agent-linux-amd64 --server https://api.example.com \
#     --token <токен регистрации> [--public-key <ключ релизов>] [--name gpu-01] \
#     [--config agent.yaml] [--user agent|root] [--stop-timeout 15min]
#   sudo sh install.sh --uninstall [--purge]
#
# Нагрузки (Python-воркеры) описываются в /etc/agent/agent.yaml (workloads);
# их окружение (venv, код) ставится отдельно. Токен регистрации нужен только
# до первой регистрации и хранится в /etc/agent/agent.env (0600).
set -eu

BINARY="" SERVER="" TOKEN="" PUBLIC_KEY="" NAME="" CONFIG="" USER_NAME="agent" STOP_TIMEOUT="15min"
UNINSTALL="" PURGE=""
DIR="$(cd "$(dirname "$0")" && pwd)"

die() { echo "install.sh: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --binary) BINARY="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --public-key) PUBLIC_KEY="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --config) CONFIG="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --stop-timeout) STOP_TIMEOUT="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    *) die "неизвестный аргумент $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "нужен root (sudo)"
command -v systemctl >/dev/null || die "нужен systemd"

if [ -n "$UNINSTALL" ]; then
  systemctl disable --now agent.service 2>/dev/null || true
  rm -f /etc/systemd/system/agent.service
  systemctl daemon-reload
  rm -rf /opt/agent
  if [ -n "$PURGE" ]; then
    rm -rf /etc/agent /var/lib/agent
    id agent >/dev/null 2>&1 && userdel agent || true
  fi
  echo "Агент удалён${PURGE:+ вместе с конфигурацией и данными}"
  exit 0
fi

[ -n "$BINARY" ] && [ -f "$BINARY" ] || die "--binary: путь к сборке agent-linux-<arch>"
[ -n "$SERVER" ] || [ -f /etc/agent/agent.yaml ] || die "--server: адрес API"

if [ "$USER_NAME" != "root" ] && ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/agent --shell /usr/sbin/nologin "$USER_NAME"
fi

# Исполняемый файл — в каталоге, доступном агенту на запись: самообновление
# кладёт рядом новую версию (.new), копию прежней (.prev) и отметку.
install -d -m 0755 -o "$USER_NAME" /opt/agent /opt/agent/bin
install -m 0755 -o "$USER_NAME" "$BINARY" /opt/agent/bin/agent.new
mv -f /opt/agent/bin/agent.new /opt/agent/bin/agent

install -d -m 0700 -o "$USER_NAME" /var/lib/agent
install -d -m 0755 /etc/agent

if [ -n "$CONFIG" ]; then
  install -m 0644 "$CONFIG" /etc/agent/agent.yaml
elif [ ! -f /etc/agent/agent.yaml ]; then
  cat >/etc/agent/agent.yaml <<YAML
server:
  url: ${SERVER}
dataDir: /var/lib/agent
${NAME:+name: ${NAME}
}update:
  mode: self
  # Ключ проверки подписи релизов (agent keygen → AGENT_UPDATE_PUBLIC_KEY).
  publicKey: \${AGENT_UPDATE_PUBLIC_KEY}
log:
  format: json
# Нагрузки: дочерние процессы, выполняющие задачи очередей.
workloads: []
YAML
fi

# Секреты — в agent.env (0600): переданные заменяют прежние, остальные сохраняются.
set_env() {
  touch /etc/agent/agent.env
  grep -v "^$1=" /etc/agent/agent.env >/etc/agent/agent.env.tmp || true
  printf '%s=%s\n' "$1" "$2" >>/etc/agent/agent.env.tmp
  mv /etc/agent/agent.env.tmp /etc/agent/agent.env
}
umask 077
[ -z "$TOKEN" ] || set_env AGENT_ENROLL_TOKEN "$TOKEN"
[ -z "$PUBLIC_KEY" ] || set_env AGENT_UPDATE_PUBLIC_KEY "$PUBLIC_KEY"
if [ -f /etc/agent/agent.env ]; then
  chmod 0600 /etc/agent/agent.env
  chown "$USER_NAME" /etc/agent/agent.env
fi
umask 022

sed -e "s/__USER__/$USER_NAME/" -e "s/__STOP_TIMEOUT__/$STOP_TIMEOUT/" \
  "$DIR/agent.service" >/etc/systemd/system/agent.service
systemctl daemon-reload
systemctl enable agent.service >/dev/null
systemctl restart agent.service

echo "Агент $(/opt/agent/bin/agent version) установлен: systemctl status agent, journalctl -u agent -f"
