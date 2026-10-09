#!/usr/bin/env bash
# shellcheck disable=SC2016 # сценарий sh для контейнера — в одинарных кавычках, раскрывается там
# Сборки воркеров проекта — каталог agent/release (его раздаёт API: AGENT_RELEASES_DIR). Агента
# и netprobe здесь нет: бэкенд берёт их из релизов GitHub сам (AGENT_RELEASES_*).
#
#   1. Каждый каталог agent/workers/<имя> с файлом VERSION и исполняемым run упаковывается в
#      архив <имя>-<версия>-<os>-<arch>.tar.gz под каждую платформу AGENT_PLATFORMS (по
#      умолчанию linux и darwin × amd64 и arm64; содержимое одно и то же — агент берёт сборку
#      под свою ОС и процессор).
#   2. manifest.json — утилитой agent-release (`manifest DIR VERSION --worker NAME=VERSION`):
#      сборок агента нет (artifacts: []), версия сборок — версия проекта из package.json. С
#      AGENT_SIGNING_KEY (закрытый ключ проекта из `agent-release keygen`) воркеры подписаны —
#      API нужен открытый ключ пары AGENT_UPDATE_PUBLIC_KEY; без ключа подписи нет (установка
#      сверяет только sha256, обновление воркера агент не примет).
#
# Каталог — AGENT_RELEASE_OUT (по умолчанию agent/release). Утилита agent-release той же версии,
# что agent-sdk в package.json (или AGENT_RELEASE_VERSION): AGENT_RELEASE_TOOL (готовая
# программа), agent/tools/agent-release-<версия>-<os>-<arch>, с Go на машине —
# `go run github.com/epifanovmd/agent/cmd/agent-release@v<версия>`, без него — сборка в agent/tools
# в контейнере golang (AGENT_GO_IMAGE; кеш — том agent-release-go).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${AGENT_RELEASE_OUT:-agent/release}"
WORKERS_DIR=agent/workers
PLATFORMS="${AGENT_PLATFORMS:-linux-amd64 linux-arm64 darwin-amd64 darwin-arm64}"
MODULE=github.com/epifanovmd/agent
GO_IMAGE="${AGENT_GO_IMAGE:-golang:1.26-alpine}"
GO_VOLUME=agent-release-go

# Значение из package.json по выражению sed.
package_value() {
  sed -n "$1" package.json | head -1
}

# Версия утилиты agent-release: как у agent-sdk (…/agent-sdk-<версия>.tgz).
tool_version() {
  local v="${AGENT_RELEASE_VERSION:-$(package_value 's#.*"agent-sdk": *".*/agent-sdk-\([^/"]*\)\.tgz".*#\1#p')}"
  [ -n "$v" ] || {
    echo "Не понять версию agent-sdk — укажите AGENT_RELEASE_VERSION=..." >&2
    exit 1
  }
  echo "$v"
}

platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=amd64 ;; esac
  echo "$os-$arch"
}

# Команда утилиты agent-release версии $1.
tool() {
  local v="$1" file owner
  file="agent/tools/agent-release-$v-$(platform)"
  if [ -n "${AGENT_RELEASE_TOOL:-}" ]; then
    echo "$AGENT_RELEASE_TOOL"
  elif [ -x "$file" ]; then
    echo "$file"
  elif command -v go >/dev/null; then
    echo "go run $MODULE/cmd/agent-release@v$v"
  elif command -v docker >/dev/null; then
    echo "Утилита agent-release $v — сборка в $file (контейнер $GO_IMAGE)" >&2
    mkdir -p agent/tools
    owner="$(id -u):$(id -g)"
    docker run --rm -v "$GO_VOLUME:/cache" "$GO_IMAGE" chown "$owner" /cache >&2
    docker run --rm --user "$owner" -v "$ROOT/agent/tools:/out" -v "$GO_VOLUME:/cache" \
      -e HOME=/tmp -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build -e GOFLAGS=-modcacherw \
      -e CGO_ENABLED=0 -e V="$v" -e P="$(platform)" -e M="$MODULE" "$GO_IMAGE" sh -c '
        set -e
        dir=$(cd /tmp && go mod download -json "$M@v$V" | sed -n "s/.*\"Dir\": \"\(.*\)\",/\1/p")
        GOOS=${P%-*} GOARCH=${P#*-} go -C "$dir" build -trimpath -buildvcs=false \
          -o "/out/agent-release-$V-$P" ./cmd/agent-release' >&2
    echo "$file"
  else
    echo "Нужен Go или Docker: утилита agent-release ($MODULE)" >&2
    exit 1
  fi
}

# Архивы воркеров проекта в каталоге $1; печатает флаги --worker.
pack_workers() {
  local dst="$1" dir name wv p
  for dir in "$WORKERS_DIR"/*/; do
    dir="${dir%/}"
    name="$(basename "$dir")"
    [ -f "$dir/VERSION" ] || {
      echo "$dir: нет файла VERSION — воркер не упакован" >&2
      continue
    }
    [ -x "$dir/run" ] || {
      echo "$dir: нет исполняемого run — агент запускает его в каталоге сборки" >&2
      exit 1
    }
    wv="$(tr -d '[:space:]' <"$dir/VERSION")"
    COPYFILE_DISABLE=1 tar -C "$dir" --exclude __pycache__ --exclude '*.pyc' -czf "$dst/$name-$wv.tar.gz" .
    for p in $PLATFORMS; do
      cp "$dst/$name-$wv.tar.gz" "$dst/$name-$wv-$p.tar.gz"
    done
    rm "$dst/$name-$wv.tar.gz"
    echo "Воркер $name $wv: $PLATFORMS" >&2
    echo "--worker=$name=$wv"
  done
}

main() {
  local version tool_cmd packed flags=()
  version="$(package_value 's/^  "version": *"\([^"]*\)".*/\1/p')"
  [ -n "$version" ] || {
    echo "Нет version в package.json" >&2
    exit 1
  }
  tool_cmd="$(tool "$(tool_version)")"
  rm -rf "$OUT.new"
  mkdir -p "$OUT.new"
  packed="$(pack_workers "$OUT.new")"
  while IFS= read -r flag; do [ -n "$flag" ] && flags+=("$flag"); done <<<"$packed"
  [ "${#flags[@]}" -gt 0 ] || {
    echo "В $WORKERS_DIR нет воркеров" >&2
    exit 1
  }
  # shellcheck disable=SC2086 # tool_cmd — команда с аргументами (go run …)
  $tool_cmd manifest "$OUT.new" "$version" "${flags[@]}" >/dev/null
  rm -rf "$OUT"
  mv "$OUT.new" "$OUT"
  if [ -n "${AGENT_SIGNING_KEY:-}" ]; then
    echo "Воркеры подписаны ключом проекта: API нужен AGENT_UPDATE_PUBLIC_KEY этой пары" >&2
  else
    echo "Без AGENT_SIGNING_KEY: воркеры проекта собраны без подписи" >&2
  fi
  echo "Сборки воркеров проекта $version — в $OUT (AGENT_RELEASES_DIR для API)"
}

main "$@"
