#!/usr/bin/env bash
# shellcheck disable=SC2016 # сценарии sh и node — в одинарных кавычках, раскрываются не здесь
# Выпуск для агентов — каталог agent/release (его раздаёт API: AGENT_RELEASES_DIR, по нему
# собираются образы). Что в нём и откуда:
#
#   1. Выпуск агента той же версии, что agent-sdk в package.json (или AGENT_VERSION): программа
#      агента под платформы (agent-<os>-<arch>), install.sh и manifest.json — с GitHub Release
#      v<версия> (github.com/epifanovmd/agent). Свой каталог выпуска агента (например, локальная
#      сборка агента) — только явно: AGENT_RELEASE_SRC=/путь.
#   2. Воркер проверки сети netprobe — сборка из исходников агента той же версии
#      (examples/workers/netprobe) под каждую платформу выпуска: netprobe-<версия>-<os>-<arch>.
#   3. Воркеры проекта — каждый каталог agent/workers/<имя> с файлом VERSION и исполняемым run:
#      архив <имя>-<версия>-<os>-<arch>.tar.gz под каждую платформу из выпуска агента (содержимое
#      одно и то же — агент берёт сборку под свою ОС и процессор).
#   4. manifest.json — утилитой agent-release (`manifest DIR VERSION --worker NAME=VERSION`):
#      с AGENT_SIGNING_KEY (закрытый ключ проекта из `agent-release keygen`) весь выпуск
#      подписывается ключом проекта — тогда API нужен AGENT_UPDATE_PUBLIC_KEY (открытый ключ
#      пары, узлы проверяют им выпуск); без ключа сборки агента остаются с подписью выпуска
#      агента, воркеры проекта и netprobe — без подписи (установка сверяет только sha256,
#      обновление воркера агент не примет).
#
# Go (сборка netprobe и утилиты agent-release) — на машине, иначе в контейнере golang
# (AGENT_GO_IMAGE, по умолчанию golang:1.26-bookworm; кеш модулей и сборки — том
# agent-release-go). Утилита agent-release — AGENT_RELEASE_TOOL (готовая программа),
# agent/tools/agent-release-<os>-<arch>, иначе с Go на машине —
# `go run github.com/epifanovmd/agent/cmd/agent-release@v<версия>`, без него — сборка в
# agent/tools в контейнере.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT=agent/release
WORKERS_DIR=agent/workers
REPO=github.com/epifanovmd/agent
REPO_URL="https://$REPO"
GO_IMAGE="${AGENT_GO_IMAGE:-golang:1.26-bookworm}"
GO_VOLUME=agent-release-go

version() {
  if [ -n "${AGENT_VERSION:-}" ]; then
    echo "$AGENT_VERSION"
    return
  fi
  # agent-sdk в package.json — архив выпуска агента: …/agent-sdk-<версия>.tgz.
  node -p "(require('./package.json').dependencies['agent-sdk'].match(/agent-sdk-([^/]+)\\.tgz$/) || [])[1] || ''" | grep . ||
    if [ -f node_modules/agent-sdk/package.json ]; then
      node -p "require('./node_modules/agent-sdk/package.json').version"
    else
      echo "Не понять версию agent-sdk — укажите AGENT_VERSION=..." >&2
      exit 1
    fi
}

platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=amd64 ;; esac
  echo "$os-$arch"
}

# Поле манифеста выпуска: node -e над manifest.json.
manifest_js() {
  node -e "const m = require(process.argv[1]); $2" "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
}

# Сценарий sh с Go в корне проекта: Go на машине, иначе контейнер golang (проект — в /src,
# файлы — от пользователя машины). Переменные — аргументами NAME=VALUE.
go_sh() {
  local script="$1"
  shift
  if command -v go >/dev/null; then
    env "$@" sh -c "$script"
  elif command -v docker >/dev/null; then
    local owner e flags=()
    owner="$(id -u):$(id -g)"
    for e in "$@"; do flags+=(-e "$e"); done
    docker run --rm -v "$GO_VOLUME:/cache" "$GO_IMAGE" chown "$owner" /cache
    docker run --rm --user "$owner" -v "$ROOT:/src" -w /src -v "$GO_VOLUME:/cache" \
      -e HOME=/tmp -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build -e GOFLAGS=-modcacherw \
      "${flags[@]}" "$GO_IMAGE" sh -c "$script"
  else
    echo "Нужен Go или Docker: сборка из исходников $REPO" >&2
    return 1
  fi
}

# Исходники агента версии V в кеше модулей: печатает каталог.
SOURCE_DIR='go mod download -json "github.com/epifanovmd/agent@v$V" | grep "\"Dir\"" | cut -d"\"" -f4'

# Команда утилиты agent-release.
tool() {
  local v="$1" file
  file="agent-release-$(platform)"
  for candidate in "${AGENT_RELEASE_TOOL:-}" "agent/tools/$file"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  if command -v go >/dev/null; then
    echo "go run $REPO/cmd/agent-release@v$v"
    return
  fi
  echo "Утилита agent-release $v — сборка в agent/tools/$file" >&2
  mkdir -p agent/tools
  go_sh 'set -e; dir=$('"$SOURCE_DIR"'); GOOS=${P%-*} GOARCH=${P#*-} CGO_ENABLED=0 \
    go -C "$dir" build -trimpath -buildvcs=false -o "$(pwd)/agent/tools/agent-release-$P" ./cmd/agent-release' \
    V="$v" P="$(platform)" >&2
  echo "agent/tools/$file"
}

# 1. Выпуск агента — в каталог $1: GitHub Release, свой каталог — только AGENT_RELEASE_SRC.
fetch_agent_release() {
  local v="$1" dst="$2" src="${AGENT_RELEASE_SRC:-}" file
  if [ -n "$src" ]; then
    [ -f "$src/manifest.json" ] || {
      echo "AGENT_RELEASE_SRC=$src: нет manifest.json" >&2
      exit 1
    }
    echo "Выпуск агента $v — из $src" >&2
    cp "$src/manifest.json" "$src/install.sh" "$dst/"
    for file in $(manifest_js "$src/manifest.json" 'for (const a of m.artifacts) console.log(a.file)'); do
      cp "$src/$file" "$dst/"
    done
  else
    local base="$REPO_URL/releases/download/v$v"
    echo "Выпуск агента $v — из $base" >&2
    curl -fsSL "$base/manifest.json" -o "$dst/manifest.json"
    curl -fsSL "$base/install.sh" -o "$dst/install.sh"
    for file in $(manifest_js "$dst/manifest.json" 'for (const a of m.artifacts) console.log(a.file)'); do
      curl -fsSL "$base/$file" -o "$dst/$file"
    done
  fi
  [ "$(manifest_js "$dst/manifest.json" 'console.log(m.version)')" = "$v" ] || {
    echo "Выпуск агента не версии $v" >&2
    exit 1
  }
  # В выпуске проекта — только программа агента; воркеры — шаги 2 и 3.
  manifest_js "$dst/manifest.json" '
    delete m.workers;
    require("fs").writeFileSync(process.argv[1], JSON.stringify(m, null, 2) + "\n");'
  chmod +x "$dst"/agent-* "$dst/install.sh"
}

# 2. netprobe из исходников агента версии $1 под платформы выпуска; печатает флаг --worker.
build_netprobe() {
  local v="$1" dst="$2" platforms nv
  platforms="$(manifest_js "$dst/manifest.json" 'console.log(m.artifacts.map(a => `${a.os}-${a.arch}`).join(" "))')"
  nv="$(go_sh 'set -e; dir=$('"$SOURCE_DIR"')
    nv=$(sed -n "s/^const version = \"\(.*\)\"$/\1/p" "$dir/examples/workers/netprobe/manifest.go")
    for p in $PLATFORMS; do
      GOOS=${p%-*} GOARCH=${p#*-} CGO_ENABLED=0 go -C "$dir" build -trimpath -buildvcs=false \
        -ldflags="-s -w" -o "$(pwd)/$DST/netprobe-$nv-$p" ./examples/workers/netprobe
    done
    echo "$nv"' V="$v" DST="$dst" PLATFORMS="$platforms")"
  [ -n "$nv" ] || {
    echo "netprobe: не собран" >&2
    exit 1
  }
  echo "Воркер netprobe $nv (из $REPO@v$v): $platforms" >&2
  echo "--worker=netprobe=$nv"
}

# 3. Архивы воркеров проекта под платформы выпуска; печатает флаги --worker.
pack_workers() {
  local dst="$1" dir name wv platforms p
  platforms="$(manifest_js "$dst/manifest.json" 'for (const a of m.artifacts) console.log(`${a.os}-${a.arch}`)')"
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
    for p in $platforms; do
      cp "$dst/$name-$wv.tar.gz" "$dst/$name-$wv-$p.tar.gz"
    done
    rm "$dst/$name-$wv.tar.gz"
    echo "Воркер $name $wv: $(echo "$platforms" | tr '\n' ' ')" >&2
    echo "--worker=$name=$wv"
  done
}

# 4. manifest.json: agent-release в отдельном каталоге (ссылки на сборки), затем итоговый
# манифест — с ключом целиком из утилиты, без ключа — сборки агента с подписью его выпуска.
write_manifest() {
  local v="$1" dst="$2" tool_cmd="$3"
  shift 3
  local work="$dst/.manifest" file
  mkdir -p "$work"
  for file in "$dst"/agent-* "$dst"/*-*-*-*; do
    [ -f "$file" ] && ln -sf "$(cd "$(dirname "$file")" && pwd)/$(basename "$file")" "$work/"
  done
  # shellcheck disable=SC2086
  $tool_cmd manifest "$work" "$v" "$@" >/dev/null
  node - "$dst/manifest.json" "$work/manifest.json" "${AGENT_SIGNING_KEY:+signed}" <<'JS'
const { readFileSync, writeFileSync } = require("fs");
const [upstreamFile, builtFile, signed] = process.argv.slice(2);
const upstream = JSON.parse(readFileSync(upstreamFile, "utf8"));
const built = JSON.parse(readFileSync(builtFile, "utf8"));
const result = signed ? built : { ...upstream, workers: built.workers || [] };
writeFileSync(upstreamFile, JSON.stringify(result, null, 2) + "\n");
JS
  rm -rf "$work"
}

main() {
  local v tool_cmd probe flags=()
  v="$(version)"
  tool_cmd="$(tool "$v")"
  rm -rf "$OUT.new"
  mkdir -p "$OUT.new"
  fetch_agent_release "$v" "$OUT.new"
  probe="$(build_netprobe "$v" "$OUT.new")"
  flags+=("$probe")
  while IFS= read -r flag; do flags+=("$flag"); done < <(pack_workers "$OUT.new")
  write_manifest "$v" "$OUT.new" "$tool_cmd" "${flags[@]}"
  rm -rf "$OUT"
  mv "$OUT.new" "$OUT"
  if [ -n "${AGENT_SIGNING_KEY:-}" ]; then
    echo "Выпуск подписан ключом проекта: API нужен AGENT_UPDATE_PUBLIC_KEY этой пары" >&2
  else
    echo "Без AGENT_SIGNING_KEY: воркеры проекта и netprobe в выпуске без подписи" >&2
  fi
  echo "Выпуск $v — в $OUT (AGENT_RELEASES_DIR для API, источник для образов)"
}

main "$@"
