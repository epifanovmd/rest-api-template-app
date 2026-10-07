//go:build unix

// Package app — сборка агента из частей kit: связь, задачи, нагрузки,
// команды, желаемое состояние, телеметрия, самообновление. Проект с
// собственными возможностями (wg) добавляет их к App до Run.
package app

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/backoff"
	"restapi/agent/kit/commands"
	"restapi/agent/kit/config"
	"restapi/agent/kit/identity"
	"restapi/agent/kit/jobs"
	"restapi/agent/kit/link"
	"restapi/agent/kit/logx"
	"restapi/agent/kit/outbox"
	"restapi/agent/kit/runtime"
	"restapi/agent/kit/state"
	"restapi/agent/kit/stream"
	"restapi/agent/kit/telemetry"
	"restapi/agent/kit/update"
	"restapi/agent/kit/workload"
)

// SDK — версия kit в hello.
const SDK = "go/1.0.0"

// streamLimit — потоковых сообщений в памяти до подтверждения.
const streamLimit = 2000

// ErrRestart — агент остановлен для перезапуска (команда или обновление):
// процесс завершается, менеджер (systemd, Docker) запускает его снова.
var ErrRestart = errors.New("agent: перезапуск")

// App — агент.
type App struct {
	cfg     config.Config
	version string
	log     *slog.Logger
	ring    *logx.Ring
	client  *http.Client

	rt        *runtime.Runtime
	link      *link.Link
	auth      *auth
	jobs      *jobs.Manager
	commands  *commands.Registry
	state     *state.Manager
	workloads *workload.Supervisor
	telemetry *telemetry.Collector
	outbox    *outbox.Outbox
	update    update.Paths
	pubKey    ed25519.PublicKey

	restart atomic.Bool
	cancel  context.CancelFunc
}

// New — агент по конфигурации.
func New(cfg config.Config, version string) (*App, error) {
	ring := logx.NewRing(5000)
	log := logx.New(os.Stderr, ring, logx.Options{Level: cfg.Log.Level, Format: cfg.Log.Format})
	if cfg.Insecure() {
		log.Warn("server.url без TLS на неlocal-адрес: секрет агента идёт открытым текстом")
	}
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, fmt.Errorf("agent: каталог данных: %w", err)
	}
	ob, err := outbox.Open(filepath.Join(cfg.DataDir, "outbox"))
	if err != nil {
		return nil, err
	}
	a := &App{
		cfg:     cfg,
		version: version,
		log:     log,
		ring:    ring,
		client:  &http.Client{Timeout: 0},
		outbox:  ob,
	}
	if cfg.Update.PublicKey != "" {
		if a.pubKey, err = update.ParsePublicKey(cfg.Update.PublicKey); err != nil {
			return nil, err
		}
	}
	if exe, err := os.Executable(); err == nil {
		a.update = update.NewPaths(exe)
	}

	ctx := context.Background()
	host := telemetry.HostInfo(ctx)
	codeHash, _ := update.FileHash(a.update.Binary)
	a.rt = runtime.New(runtime.Info{
		Name: cfg.Name, Version: version, SDK: SDK, CodeHash: codeHash,
		Labels: cfg.Labels, Host: host,
	}, log)
	a.auth = &auth{store: identity.NewStore(cfg.DataDir), cfg: cfg, client: a.client, host: host, log: log}
	a.link = link.New(link.Options{
		ServerURL:  cfg.Server.URL,
		Transport:  cfg.Server.Transport,
		Auth:       a.auth,
		Outbox:     ob,
		Stream:     stream.New(streamLimit),
		HTTPClient: a.client,
		Log:        log,
	}, a.rt)
	a.rt.SetSender(a.link)
	a.rt.SetOutbox(ob.Len)

	a.telemetry = telemetry.New(cfg.DataDir, cfg.Telemetry.GPU != "off", log)
	a.rt.SetMetrics(a.telemetry)
	a.jobs = jobs.New(a.link, log, a.rt.Changed)
	a.jobs.SetUnreported(ob.JobRefs)
	a.commands = commands.New(a.link, log)
	a.state = state.New(filepath.Join(cfg.DataDir, "state"), a.link, log)
	a.workloads = workload.New(cfg.Workloads, a.jobs, log, a.rt.Changed, version)

	a.registerBuiltins()
	a.rt.WhenWelcomed(func(alp.Welcome) {
		if a.update.Marker != "" {
			update.Healthy(a.update)
		}
	})
	return a, nil
}

// Log — логгер агента.
func (a *App) Log() *slog.Logger { return a.log }

// Jobs — менеджер задач: обработчики на Go подключаются через jobs.NewFuncs.
func (a *App) Jobs() *jobs.Manager { return a.jobs }

// Commands — реестр команд: проект добавляет свои.
func (a *App) Commands() *commands.Registry { return a.commands }

// State — домены желаемого состояния: проект регистрирует свои Reconciler.
func (a *App) State() *state.Manager { return a.state }

// Runtime — оркестратор (подписка на события сессии, Changed).
func (a *App) Runtime() *runtime.Runtime { return a.rt }

// Register — своя возможность проекта.
func (a *App) Register(c runtime.Capability) { a.rt.Register(c) }

// Run — работать до отмены ctx (или команды перезапуска); ErrRestart —
// процесс нужно запустить снова.
func (a *App) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	a.cancel = cancel
	defer cancel()

	if err := a.auth.ensure(ctx); err != nil {
		return err
	}

	a.rt.Register(a.jobs)
	a.rt.Register(a.commands)
	a.rt.Register(a.workloads)
	if !a.state.Empty() {
		a.rt.Register(a.state)
	}
	a.rt.Register(telemetryCapability{a.telemetry})
	a.rt.Register(updateCapability{mode: a.cfg.Update.Mode})

	a.log.Info("агент запущен", "version", a.version, "name", a.cfg.Name, "server", a.cfg.Server.URL, "workloads", len(a.cfg.Workloads))
	err := a.rt.Run(ctx, a.link.Run, a.stopTimeout())
	if a.restart.Load() {
		return ErrRestart
	}
	return err
}

// stopTimeout — срок доработки при остановке: самая долгая из нагрузок.
func (a *App) stopTimeout() time.Duration {
	timeout := 30 * time.Second
	for _, w := range a.cfg.Workloads {
		timeout = max(timeout, w.StopTimeout.Std())
	}
	return timeout + 5*time.Second
}

func (a *App) requestRestart() {
	a.restart.Store(true)
	if a.cancel != nil {
		a.cancel()
	}
}

func (a *App) registerBuiltins() {
	a.commands.Register("agent.logs", func(_ context.Context, args json.RawMessage, out io.Writer) (any, error) {
		var req struct {
			Lines int `json:"lines"`
		}
		_ = json.Unmarshal(args, &req)
		if req.Lines <= 0 || req.Lines > 5000 {
			req.Lines = 500
		}
		lines := a.ring.Tail(req.Lines)
		_, _ = io.WriteString(out, strings.Join(lines, "\n")+"\n")
		return map[string]int{"lines": len(lines)}, nil
	})
	a.commands.Register("agent.drain", func(context.Context, json.RawMessage, io.Writer) (any, error) {
		a.rt.Drain()
		return a.rt.Status(), nil
	})
	a.commands.Register("agent.resume", func(context.Context, json.RawMessage, io.Writer) (any, error) {
		a.rt.Resume()
		return a.rt.Status(), nil
	})
	a.commands.Register("agent.restart", func(context.Context, json.RawMessage, io.Writer) (any, error) {
		// Ответ уходит до остановки: перезапуск — чуть позже.
		time.AfterFunc(time.Second, a.requestRestart)
		return nil, nil
	})
	if a.cfg.Update.Mode == alp.UpdateSelf {
		a.commands.Register("agent.update", a.updateCommand)
	}
	if len(a.cfg.Workloads) > 0 {
		a.commands.Register("workload.restart", func(ctx context.Context, args json.RawMessage, out io.Writer) (any, error) {
			var req struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal(args, &req)
			names := a.workloads.Names()
			if req.Name != "" {
				names = []string{req.Name}
			}
			for _, name := range names {
				fmt.Fprintf(out, "перезапуск %s…\n", name)
				if err := a.workloads.Restart(ctx, name); err != nil {
					return nil, commands.Errorf("WORKLOAD_RESTART", "%s: %v", name, err)
				}
			}
			return map[string]any{"restarted": names}, nil
		})
	}
}

func (a *App) updateCommand(ctx context.Context, args json.RawMessage, out io.Writer) (any, error) {
	var rel update.Release
	if err := json.Unmarshal(args, &rel); err != nil || rel.URL == "" || rel.SHA256 == "" {
		return nil, commands.Errorf("UPDATE_ARGS", "нужны version, url, sha256, signature")
	}
	if strings.HasPrefix(rel.URL, "/") {
		rel.URL = strings.TrimRight(a.cfg.Server.URL, "/") + rel.URL
	}
	a.rt.SetUpdating(true)
	defer a.rt.SetUpdating(false)
	fmt.Fprintf(out, "загрузка %s…\n", rel.Version)
	if err := update.Install(ctx, a.client, a.auth.Authorization(), a.update, a.pubKey, rel); err != nil {
		return nil, commands.Errorf("UPDATE_FAILED", "%v", err)
	}
	fmt.Fprintln(out, "установлено, перезапуск после доработки задач")
	time.AfterFunc(time.Second, a.requestRestart)
	return map[string]string{"version": rel.Version}, nil
}

// telemetryCapability — объявление каналов телеметрии.
type telemetryCapability struct{ c *telemetry.Collector }

func (t telemetryCapability) Declare(caps *alp.Capabilities) {
	caps.Telemetry = &alp.TelemetryCapability{Channels: t.c.Channels()}
}
func (telemetryCapability) Handles() []string                          { return nil }
func (telemetryCapability) Handle(context.Context, alp.Envelope) error { return nil }

// updateCapability — режим обновления.
type updateCapability struct{ mode string }

func (u updateCapability) Declare(caps *alp.Capabilities) {
	caps.Update = &alp.UpdateCapability{Mode: u.mode}
}
func (updateCapability) Handles() []string                          { return nil }
func (updateCapability) Handle(context.Context, alp.Envelope) error { return nil }

// ─── учётные данные ────────────────────────────────────────────────────

// auth — учётные данные агента: загрузка, регистрация, повторная регистрация.
type auth struct {
	store  *identity.Store
	cfg    config.Config
	client *http.Client
	host   alp.Host
	log    *slog.Logger
	value  atomic.Value
}

func (a *auth) Authorization() string {
	if v, ok := a.value.Load().(string); ok {
		return v
	}
	return ""
}

// ensure — учётные данные есть или агент регистрируется (с повтором, пока
// сервер недоступен; отклонённый токен — ошибка запуска).
func (a *auth) ensure(ctx context.Context) error {
	creds, ok, err := a.store.Load()
	if err != nil {
		return err
	}
	if ok {
		a.value.Store(creds.Authorization())
		return nil
	}
	if a.cfg.Enroll.Token == "" {
		return errors.New("agent: не зарегистрирован — задайте enroll.token (AGENT_ENROLL_TOKEN)")
	}
	for attempt := 0; ; attempt++ {
		err := a.enroll(ctx)
		if err == nil || errors.Is(err, identity.ErrTokenRejected) {
			return err
		}
		delay := backoff.Default.Delay(attempt)
		a.log.Warn("регистрация не удалась — повтор", "err", err, "retryIn", delay.Round(time.Millisecond))
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
}

// Renew — учётные данные отозваны: регистрация заново, если есть токен.
func (a *auth) Renew(ctx context.Context) error {
	if a.cfg.Enroll.Token == "" {
		return errors.New("agent: учётные данные отозваны, токена регистрации нет")
	}
	_ = a.store.Forget()
	return a.enroll(ctx)
}

func (a *auth) enroll(ctx context.Context) error {
	creds, err := identity.Enroll(ctx, a.client, a.cfg.Server.URL, identity.EnrollRequest{
		Token:  a.cfg.Enroll.Token,
		Name:   a.cfg.Name,
		Labels: a.cfg.Labels,
		Host:   &identity.EnrollHost{Hostname: a.host.Hostname, OS: a.host.OS, Arch: a.host.Arch},
	})
	if err != nil {
		return err
	}
	if err := a.store.Save(creds); err != nil {
		return err
	}
	a.value.Store(creds.Authorization())
	a.log.Info("агент зарегистрирован", "agentId", creds.AgentID)
	return nil
}
