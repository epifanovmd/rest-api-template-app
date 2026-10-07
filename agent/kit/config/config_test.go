package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadFileEnvAndDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.yaml")
	t.Setenv("PY", "/opt/venv/bin/python")
	_ = os.WriteFile(path, []byte(`
server:
  url: https://api.example.com
dataDir: `+dir+`
labels: { zone: eu }
workloads:
  - name: echo
    command: ["${PY}", "-m", "examples.echo_worker"]
    stopTimeout: 10m
`), 0o600)
	t.Setenv("AGENT_LABELS", "gpu=rtx, pool=a")
	t.Setenv("AGENT_LOG_LEVEL", "debug")

	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Transport != "auto" || cfg.Update.Mode != "self" || cfg.Log.Level != "debug" {
		t.Fatalf("умолчания или env: %+v", cfg)
	}
	if cfg.Labels["zone"] != "eu" || cfg.Labels["gpu"] != "rtx" || cfg.Labels["pool"] != "a" {
		t.Fatalf("метки: %v", cfg.Labels)
	}
	w := cfg.Workloads[0]
	if w.Command[0] != "/opt/venv/bin/python" || w.Replicas != 1 || w.StopTimeout.Std() != 10*time.Minute {
		t.Fatalf("нагрузка: %+v", w)
	}
}

func TestValidate(t *testing.T) {
	cfg := Defaults()
	cfg.Server.URL = "ftp://x"
	cfg.Server.Transport = "pigeon"
	cfg.Workloads = []Workload{{Name: "a"}, {Name: "a", Command: []string{"x"}}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("ожидались ошибки")
	}
	ok := Defaults()
	ok.Server.URL = "http://10.0.0.1:8181"
	if err := ok.Validate(); err != nil || !ok.Insecure() {
		t.Fatalf("валидный http на чужой адрес — небезопасен: %v", err)
	}
	ok.Server.URL = "http://localhost:8181"
	if ok.Insecure() {
		t.Fatal("localhost — не предупреждаем")
	}
}
