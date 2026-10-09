#!/usr/bin/env bash
# Выпуск для агентов — каталог agent/release (его раздаёт API: AGENT_RELEASES_DIR, по нему
# собираются образы). Что в нём и откуда:
#
#   1. Выпуск агента той же версии, что agent-sdk: программа агента под платформы
#      (agent-<os>-<arch>), её воркеры (netprobe), install.sh и manifest.json. Источник —
#      AGENT_RELEASE_SRC, иначе ../alp-agent/dist/<версия>, иначе GitHub Release v<версия>.
#   2. Воркеры проекта — каждый каталог agent/workers/<имя> с файлом VERSION и исполняемым run:
#      архив <имя>-<версия>-<os>-<arch>.tar.gz под каждую платформу из выпуска агента (содержимое
#      одно и то же — агент берёт сборку под свою ОС и процессор).
#   3. manifest.json — утилитой agent-release (`manifest DIR VERSION --worker NAME=VERSION`):
#      с AGENT_SIGNING_KEY (закрытый ключ проекта из `agent-release keygen`) весь выпуск
#      подписывается ключом проекта — тогда API нужен AGENT_PUBLIC_KEY (открытый ключ пары);
#      без ключа сборки агента и его воркеров остаются как в выпуске агента, воркеры проекта —
#      без подписи (установка сверяет только sha256, обновление воркера агент не примет).
#
# Утилита agent-release — AGENT_RELEASE_TOOL, agent/tools/agent-release-<os>-<arch> или
# `go run github.com/epifanovmd/agent/cmd/agent-release@v<версия>` (нужен Go).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT=agent/release
WORKERS_DIR=agent/workers
REPO=github.com/epifanovmd/agent
REPO_URL="https://$REPO"

version() {
  if [ -n "${AGENT_VERSION:-}" ]; then
    echo "$AGENT_VERSION"
  elif [ -f node_modules/agent-sdk/package.json ]; then
    node -p "require('./node_modules/agent-sdk/package.json').version"
  else
    # Архив SDK в package.json: file:vendor/agent-sdk-<версия>.tgz.
    node -p "(require('./package.json').dependencies['agent-sdk'].match(/agent-sdk-(.+)\\.tgz$/) || [])[1] || process.exit(1)" || {
      echo "Не понять версию agent-sdk — укажите AGENT_VERSION=..." >&2
      exit 1
    }
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
  cat >&2 <<HINT
Нет утилиты agent-release: положите agent/tools/$file (сборка из репозитория агента:
go build -o agent/tools/$file ./cmd/agent-release), укажите AGENT_RELEASE_TOOL=/путь
или поставьте Go — тогда утилита соберётся из $REPO@v$v.
HINT
  exit 1
}

# 1. Выпуск агента — в каталог $1.
fetch_agent_release() {
  local v="$1" dst="$2" src file
  src="${AGENT_RELEASE_SRC:-../alp-agent/dist/$v}"
  if [ -f "$src/manifest.json" ]; then
    echo "Выпуск агента $v — из $src" >&2
    cp "$src/manifest.json" "$src/install.sh" "$dst/"
    for file in $(manifest_js "$src/manifest.json" 'for (const a of [...m.artifacts, ...(m.workers || [])]) console.log(a.file)'); do
      cp "$src/$file" "$dst/"
    done
  else
    local base="$REPO_URL/releases/download/v$v"
    echo "Выпуск агента $v — из $base" >&2
    curl -fsSL "$base/manifest.json" -o "$dst/manifest.json"
    curl -fsSL "$base/install.sh" -o "$dst/install.sh"
    for file in $(manifest_js "$dst/manifest.json" 'for (const a of [...m.artifacts, ...(m.workers || [])]) console.log(a.file)'); do
      curl -fsSL "$base/$file" -o "$dst/$file"
    done
  fi
  [ "$(manifest_js "$dst/manifest.json" 'console.log(m.version)')" = "$v" ] || {
    echo "Выпуск агента не версии $v" >&2
    exit 1
  }
  chmod +x "$dst"/agent-* "$dst/install.sh"
}

# 2. Архивы воркеров проекта под платформы выпуска; печатает флаги --worker.
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

# 3. manifest.json: agent-release в отдельном каталоге (ссылки на сборки), затем сборка
# итогового манифеста — с ключом целиком из утилиты, без ключа — подписи выпуска агента как есть.
write_manifest() {
  local v="$1" dst="$2" tool_cmd="$3"
  shift 3
  local work="$dst/.manifest" file flags=("$@") upstream
  mkdir -p "$work"
  for file in "$dst"/agent-* "$dst"/*-*-*-*; do
    [ -f "$file" ] && ln -sf "$(cd "$(dirname "$file")" && pwd)/$(basename "$file")" "$work/"
  done
  # Воркеры выпуска агента — теми же флагами (с command и stopTimeout).
  while IFS= read -r upstream; do
    [ -n "$upstream" ] && flags+=("--worker=$upstream")
  done < <(manifest_js "$dst/manifest.json" '
    const seen = new Set();
    for (const w of m.workers || []) {
      if (seen.has(w.name)) continue;
      seen.add(w.name);
      console.log([`${w.name}=${w.version}`, w.command && `command=${w.command}`, w.stopTimeout && `stopTimeout=${w.stopTimeout}`].filter(Boolean).join(","));
    }')
  # shellcheck disable=SC2086
  $tool_cmd manifest "$work" "$v" "${flags[@]}" >/dev/null
  node - "$dst/manifest.json" "$work/manifest.json" "${AGENT_SIGNING_KEY:+signed}" <<'JS'
const { readFileSync, writeFileSync } = require("fs");
const [upstreamFile, builtFile, signed] = process.argv.slice(2);
const upstream = JSON.parse(readFileSync(upstreamFile, "utf8"));
const built = JSON.parse(readFileSync(builtFile, "utf8"));
const own = new Set((upstream.workers || []).map(w => w.name));
const result = signed
  ? built
  : { ...upstream, workers: [...(upstream.workers || []), ...(built.workers || []).filter(w => !own.has(w.name))] };
writeFileSync(upstreamFile, JSON.stringify(result, null, 2) + "\n");
JS
  rm -rf "$work"
}

main() {
  local v tool_cmd flags=()
  v="$(version)"
  tool_cmd="$(tool "$v")"
  rm -rf "$OUT.new"
  mkdir -p "$OUT.new"
  fetch_agent_release "$v" "$OUT.new"
  while IFS= read -r flag; do flags+=("$flag"); done < <(pack_workers "$OUT.new")
  write_manifest "$v" "$OUT.new" "$tool_cmd" "${flags[@]}"
  rm -rf "$OUT"
  mv "$OUT.new" "$OUT"
  [ -n "${AGENT_SIGNING_KEY:-}" ] || echo "Без AGENT_SIGNING_KEY: воркеры проекта в выпуске без подписи" >&2
  echo "Выпуск $v — в $OUT (AGENT_RELEASES_DIR для API, источник для образов)"
}

main "$@"
