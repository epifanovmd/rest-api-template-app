#!/usr/bin/env bash
# Go-агент: команды Go в контейнере golang — без установки Go на машину.
# Ветка Go — из agent/go.mod (1.26.0 → образ 1.26) или GO_IMAGE.
#   scripts/agent.sh test | vet | tidy | fmt
#   scripts/agent.sh build [os] [arch]   # по умолчанию — ОС и архитектура этой машины
#   scripts/agent.sh release             # linux/darwin × amd64/arm64 + manifest (подпись — AGENT_SIGNING_KEY)
#   scripts/agent.sh <любая команда>     # в контейнере с исходниками агента
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO_VERSION=$(awk '$1 == "go" { split($2, v, "."); print v[1] "." v[2]; exit }' "$ROOT/agent/go.mod")
IMAGE=${GO_IMAGE:-golang:$GO_VERSION-bookworm}
VERSION=${AGENT_VERSION:-$(cat "$ROOT/agent/VERSION")}

run() {
  docker run --rm -v "$ROOT/agent:/src" -v "$ROOT/protocol:/protocol:ro" -w /src \
    -v agent-gomod:/go/pkg/mod -v agent-gocache:/root/.cache/go-build \
    -e CGO_ENABLED=0 -e ALP_FIXTURES=/protocol/alp/v1/fixtures \
    ${AGENT_SIGNING_KEY:+-e AGENT_SIGNING_KEY} "$@"
}

host_os() { case "$(uname -s)" in Darwin) echo darwin ;; *) echo linux ;; esac; }
host_arch() { case "$(uname -m)" in arm64 | aarch64) echo arm64 ;; *) echo amd64 ;; esac; }

build() {
  local os=$1 arch=$2
  run -e GOOS="$os" -e GOARCH="$arch" "$IMAGE" \
    go build -trimpath -ldflags "-s -w -X main.version=$VERSION" \
    -o "dist/$VERSION/agent-$os-$arch" ./cmd/agent
  echo "agent/dist/$VERSION/agent-$os-$arch"
}

case "${1:-test}" in
  test) run "$IMAGE" go test ./... ;;
  race) run -e CGO_ENABLED=1 "$IMAGE" go test -race ./... ;;
  vet) run "$IMAGE" go vet ./... ;;
  tidy) run "$IMAGE" go mod tidy ;;
  fmt) run "$IMAGE" gofmt -l -w . ;;
  build) build "${2:-$(host_os)}" "${3:-$(host_arch)}" ;;
  release)
    for os in linux darwin; do for arch in amd64 arm64; do build "$os" "$arch"; done; done
    run "$IMAGE" go run ./cmd/agent release-manifest "dist/$VERSION" "$VERSION" ;;
  *) run "$IMAGE" "$@" ;;
esac
