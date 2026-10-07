// Package config — конфигурация агента: значения по умолчанию → YAML-файл
// (с подстановкой ${ENV}) → переменные окружения AGENT_*.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Duration — длительность в YAML строкой: "30s", "10m".
type Duration time.Duration

func (d *Duration) UnmarshalYAML(node *yaml.Node) error {
	parsed, err := time.ParseDuration(node.Value)
	if err != nil {
		return fmt.Errorf("длительность %q: %w", node.Value, err)
	}
	*d = Duration(parsed)
	return nil
}

// Std — time.Duration.
func (d Duration) Std() time.Duration { return time.Duration(d) }

// Config — настройки агента.
type Config struct {
	Server    Server            `yaml:"server"`
	DataDir   string            `yaml:"dataDir"`
	Name      string            `yaml:"name"`
	Labels    map[string]string `yaml:"labels"`
	Enroll    Enroll            `yaml:"enroll"`
	Log       Log               `yaml:"log"`
	Telemetry Telemetry         `yaml:"telemetry"`
	Update    Update            `yaml:"update"`
	Workloads []Workload        `yaml:"workloads"`
}

type Server struct {
	// URL бэкенда: https://api.example.com.
	URL string `yaml:"url"`
	// Transport: auto (WebSocket, при недоступности — HTTP sync) | ws | http.
	Transport string `yaml:"transport"`
}

type Enroll struct {
	// Token — токен регистрации; нужен только до первой регистрации
	// (и для эфемерных агентов — при каждом старте).
	Token string `yaml:"token"`
}

type Log struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

type Telemetry struct {
	// GPU: auto (nvidia-smi, если есть) | off.
	GPU string `yaml:"gpu"`
}

type Update struct {
	// Mode: self (замена исполняемого файла) | external (контейнер) | disabled.
	Mode string `yaml:"mode"`
	// PublicKey — ключ проверки подписи релизов Ed25519, base64.
	PublicKey string `yaml:"publicKey"`
}

// Workload — нагрузка: дочерний процесс, выполняющий задачи (Python-воркер).
type Workload struct {
	Name    string            `yaml:"name"`
	Command []string          `yaml:"command"`
	Dir     string            `yaml:"dir"`
	Env     map[string]string `yaml:"env"`
	// Replicas — экземпляров процесса (по умолчанию 1).
	Replicas int `yaml:"replicas"`
	// Queues — ограничить очереди нагрузки (по умолчанию — все, что она объявила).
	Queues []string `yaml:"queues"`
	// StopTimeout — сколько ждать доработки задач при остановке (по умолчанию 30s).
	StopTimeout Duration `yaml:"stopTimeout"`
}

// Defaults — значения по умолчанию.
func Defaults() Config {
	host, _ := os.Hostname()
	return Config{
		Server:    Server{Transport: "auto"},
		DataDir:   "/var/lib/agent",
		Name:      host,
		Labels:    map[string]string{},
		Log:       Log{Level: "info", Format: "text"},
		Telemetry: Telemetry{GPU: "auto"},
		Update:    Update{Mode: "self"},
	}
}

// Load — конфигурация из файла path (пустой — без файла) и окружения.
func Load(path string) (Config, error) {
	cfg := Defaults()
	if path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return cfg, fmt.Errorf("config: %w", err)
		}
		if err := yaml.Unmarshal([]byte(os.ExpandEnv(string(raw))), &cfg); err != nil {
			return cfg, fmt.Errorf("config %s: %w", path, err)
		}
	}
	applyEnv(&cfg)
	return cfg, cfg.Validate()
}

func applyEnv(cfg *Config) {
	set := func(target *string, name string) {
		if v, ok := os.LookupEnv(name); ok && v != "" {
			*target = v
		}
	}
	set(&cfg.Server.URL, "AGENT_SERVER_URL")
	set(&cfg.Server.Transport, "AGENT_TRANSPORT")
	set(&cfg.DataDir, "AGENT_DATA_DIR")
	set(&cfg.Name, "AGENT_NAME")
	set(&cfg.Enroll.Token, "AGENT_ENROLL_TOKEN")
	set(&cfg.Log.Level, "AGENT_LOG_LEVEL")
	set(&cfg.Log.Format, "AGENT_LOG_FORMAT")
	set(&cfg.Telemetry.GPU, "AGENT_GPU")
	set(&cfg.Update.Mode, "AGENT_UPDATE_MODE")
	set(&cfg.Update.PublicKey, "AGENT_UPDATE_PUBLIC_KEY")
	if labels, ok := os.LookupEnv("AGENT_LABELS"); ok {
		for _, pair := range strings.Split(labels, ",") {
			if k, v, found := strings.Cut(strings.TrimSpace(pair), "="); found && k != "" {
				cfg.Labels[k] = v
			}
		}
	}
}

// Validate — обязательные поля и допустимые значения.
func (c *Config) Validate() error {
	var errs []error
	if u, err := url.Parse(c.Server.URL); err != nil || c.Server.URL == "" || (u.Scheme != "http" && u.Scheme != "https") {
		errs = append(errs, errors.New("server.url (AGENT_SERVER_URL): нужен адрес http(s)://"))
	}
	if !oneOf(c.Server.Transport, "auto", "ws", "http") {
		errs = append(errs, fmt.Errorf("server.transport: auto | ws | http, а не %q", c.Server.Transport))
	}
	if !oneOf(c.Update.Mode, "self", "external", "disabled") {
		errs = append(errs, fmt.Errorf("update.mode: self | external | disabled, а не %q", c.Update.Mode))
	}
	if c.DataDir == "" {
		errs = append(errs, errors.New("dataDir (AGENT_DATA_DIR) обязателен"))
	}
	if c.Name == "" {
		errs = append(errs, errors.New("name (AGENT_NAME) обязателен"))
	}
	names := map[string]bool{}
	for i := range c.Workloads {
		w := &c.Workloads[i]
		if w.Name == "" || len(w.Command) == 0 {
			errs = append(errs, fmt.Errorf("workloads[%d]: нужны name и command", i))
		}
		if names[w.Name] {
			errs = append(errs, fmt.Errorf("workloads: имя %q повторяется", w.Name))
		}
		names[w.Name] = true
		if w.Replicas <= 0 {
			w.Replicas = 1
		}
		if w.StopTimeout <= 0 {
			w.StopTimeout = Duration(30 * time.Second)
		}
	}
	return errors.Join(errs...)
}

// Insecure — адрес без TLS и не локальный: секрет агента идёт открытым текстом.
func (c *Config) Insecure() bool {
	u, err := url.Parse(c.Server.URL)
	if err != nil || u.Scheme == "https" {
		return false
	}
	host := u.Hostname()
	return host != "localhost" && host != "127.0.0.1" && host != "::1" && host != "host.docker.internal"
}

func oneOf(v string, options ...string) bool {
	for _, o := range options {
		if v == o {
			return true
		}
	}
	return false
}
