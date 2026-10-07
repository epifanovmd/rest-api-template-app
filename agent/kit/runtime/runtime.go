// Package runtime — оркестратор агента: собирает возможности (задачи,
// команды, состояние, нагрузки), держит связь, шлёт status и metrics,
// управляет режимами (работа, drain, обновление) и штатной остановкой.
// Связь продолжает работать во время остановки: итоги задач успевают уйти.
package runtime

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"restapi/agent/kit/alp"
)

// Sender — чем возможности говорят с сервером (реализует link.Link).
type Sender interface {
	Stream(typ string, data any)
	Reliable(typ string, data any) error
	Request(ctx context.Context, typ string, data any, out any) error
	Connected() bool
}

// Capability — модуль агента: объявляет себя в hello и обрабатывает
// сообщения сервера своих типов. Handle не должен блокироваться надолго:
// сообщения обрабатываются по порядку одной горутиной.
type Capability interface {
	Declare(caps *alp.Capabilities)
	Handles() []string
	Handle(ctx context.Context, env alp.Envelope) error
}

// StatusContributor — вклад в status: слоты, задачи, нагрузки, деградация.
type StatusContributor interface {
	ContributeStatus(st *alp.Status)
}

// JobsReporter — задачи, выполняемые сейчас (для hello: сверка на сервере).
type JobsReporter interface {
	RunningJobs() []alp.JobRef
}

// Starter — фоновая работа возможности на время жизни агента.
type Starter interface {
	Start(ctx context.Context) error
}

// Stopper — штатная остановка: перестать брать работу, доработать текущую.
type Stopper interface {
	Stop(ctx context.Context)
}

// Drainer — перестать брать новую работу (drain) или снова брать (resume).
type Drainer interface {
	SetAccepting(accepting bool)
}

// MetricsSource — телеметрия агента.
type MetricsSource interface {
	Collect(ctx context.Context) alp.Metrics
}

// Info — сведения об агенте для hello.
type Info struct {
	Name     string
	Version  string
	SDK      string
	CodeHash string
	Labels   map[string]string
	Host     alp.Host
}

// Runtime — агент.
type Runtime struct {
	info    Info
	log     *slog.Logger
	sender  Sender
	metrics MetricsSource
	outbox  func() int
	bootID  string
	started time.Time

	mu       sync.Mutex
	caps     []Capability
	handlers map[string]Capability
	cfg      alp.SessionConfig

	draining  atomic.Bool
	updating  atomic.Bool
	changed   chan struct{}
	inbox     chan alp.Envelope
	welcomed  chan alp.Welcome
	onWelcome []func(alp.Welcome)
}

// New — агент; связь (Sender) подключается SetSender до Run.
func New(info Info, log *slog.Logger) *Runtime {
	return &Runtime{
		info:     info,
		log:      log,
		bootID:   alp.NewBootID(),
		started:  time.Now(),
		handlers: map[string]Capability{},
		cfg:      alp.SessionConfig{StatusIntervalMs: 15_000, MetricsIntervalMs: 15_000},
		changed:  make(chan struct{}, 1),
		inbox:    make(chan alp.Envelope, 256),
		welcomed: make(chan alp.Welcome, 1),
		outbox:   func() int { return 0 },
	}
}

// SetOutbox — число неподтверждённых надёжных сообщений (в status).
func (r *Runtime) SetOutbox(count func() int) { r.outbox = count }

// SetSender — канал к серверу.
func (r *Runtime) SetSender(s Sender) { r.sender = s }

// SetMetrics — источник телеметрии.
func (r *Runtime) SetMetrics(m MetricsSource) { r.metrics = m }

// Register — добавить возможность.
func (r *Runtime) Register(c Capability) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.caps = append(r.caps, c)
	for _, t := range c.Handles() {
		r.handlers[t] = c
	}
}

// WhenWelcomed — вызывать fn при каждом открытии сессии.
func (r *Runtime) WhenWelcomed(fn func(alp.Welcome)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onWelcome = append(r.onWelcome, fn)
}

// Changed — состояние изменилось: отправить status вне очереди.
func (r *Runtime) Changed() {
	select {
	case r.changed <- struct{}{}:
	default:
	}
}

// Drain — перестать брать новую работу; текущая дорабатывается.
func (r *Runtime) Drain() { r.setAccepting(false) }

// Resume — снова брать работу.
func (r *Runtime) Resume() { r.setAccepting(true) }

// Draining — агент не берёт новую работу.
func (r *Runtime) Draining() bool { return r.draining.Load() }

// SetUpdating — идёт самообновление (status.state = updating).
func (r *Runtime) SetUpdating(v bool) {
	r.updating.Store(v)
	r.Changed()
}

func (r *Runtime) setAccepting(accepting bool) {
	r.draining.Store(!accepting)
	r.each(func(c Capability) {
		if d, ok := c.(Drainer); ok {
			d.SetAccepting(accepting)
		}
	})
	r.Changed()
}

func (r *Runtime) each(fn func(Capability)) {
	r.mu.Lock()
	caps := append([]Capability(nil), r.caps...)
	r.mu.Unlock()
	for _, c := range caps {
		fn(c)
	}
}

// ─── link.Handler ──────────────────────────────────────────────────────

// Hello — приветствие сессии: возможности и выполняющиеся задачи на сейчас.
func (r *Runtime) Hello() alp.Hello {
	h := alp.Hello{
		Protocols: alp.Protocols,
		Agent: alp.HelloAgent{
			Name:      r.info.Name,
			Version:   r.info.Version,
			SDK:       r.info.SDK,
			CodeHash:  r.info.CodeHash,
			BootID:    r.bootID,
			StartedAt: r.started.UnixMilli(),
		},
		Host:   r.info.Host,
		Labels: r.info.Labels,
		Jobs:   []alp.JobRef{},
	}
	r.each(func(c Capability) {
		c.Declare(&h.Capabilities)
		if j, ok := c.(JobsReporter); ok {
			h.Jobs = append(h.Jobs, j.RunningJobs()...)
		}
	})
	return h
}

// OnWelcome — сессия открыта: настройки сервера, немедленный status.
func (r *Runtime) OnWelcome(w alp.Welcome) {
	r.applyConfig(w.Config)
	r.mu.Lock()
	hooks := append([]func(alp.Welcome){}, r.onWelcome...)
	r.mu.Unlock()
	for _, fn := range hooks {
		fn(w)
	}
	select {
	case r.welcomed <- w:
	default:
	}
	r.Changed()
}

// OnMessage — сообщение сервера: по порядку, в горутину обработки.
func (r *Runtime) OnMessage(env alp.Envelope) {
	r.inbox <- env
}

// OnDisconnect — связь потеряна: работа продолжается автономно.
func (r *Runtime) OnDisconnect(error) {}

func (r *Runtime) applyConfig(c alp.SessionConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c.StatusIntervalMs > 0 {
		r.cfg.StatusIntervalMs = c.StatusIntervalMs
	}
	if c.MetricsIntervalMs > 0 {
		r.cfg.MetricsIntervalMs = c.MetricsIntervalMs
	}
}

func (r *Runtime) intervals() (status, metrics time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return time.Duration(r.cfg.StatusIntervalMs) * time.Millisecond,
		time.Duration(r.cfg.MetricsIntervalMs) * time.Millisecond
}

// ─── Работа ────────────────────────────────────────────────────────────

// Run — фоновая работа возможностей, связь (link), обработка сообщений,
// status и metrics до отмены ctx; затем штатная остановка возможностей не
// дольше stopTimeout и досылка итогов.
func (r *Runtime) Run(ctx context.Context, link func(ctx context.Context) error, stopTimeout time.Duration) error {
	var wg sync.WaitGroup
	r.each(func(c Capability) {
		if s, ok := c.(Starter); ok {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := s.Start(ctx); err != nil && ctx.Err() == nil {
					r.log.Error("агент: возможность остановилась с ошибкой", "err", err)
				}
			}()
		}
	})

	linkCtx, stopLink := context.WithCancel(context.Background())
	linkDone := make(chan struct{})
	go func() {
		defer close(linkDone)
		_ = link(linkCtx)
	}()
	go r.dispatch(linkCtx)
	go r.statusLoop(linkCtx)
	go r.metricsLoop(linkCtx)

	<-ctx.Done()
	r.log.Info("агент: остановка — новая работа не берётся, текущая дорабатывается", "timeout", stopTimeout)
	r.Drain()
	stopCtx, cancel := context.WithTimeout(context.Background(), stopTimeout)
	defer cancel()
	r.each(func(c Capability) {
		if s, ok := c.(Stopper); ok {
			s.Stop(stopCtx)
		}
	})
	wg.Wait()
	// Последний status и досылка итогов, пока связь есть.
	r.sendStatus()
	flushUntil := time.Now().Add(3 * time.Second)
	for time.Now().Before(flushUntil) && r.outbox() > 0 && r.sender.Connected() {
		time.Sleep(100 * time.Millisecond)
	}
	stopLink()
	<-linkDone
	return nil
}

func (r *Runtime) dispatch(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case env := <-r.inbox:
			r.mu.Lock()
			c := r.handlers[env.Type]
			r.mu.Unlock()
			if c == nil {
				if env.Type != alp.TypeConfig {
					r.log.Debug("агент: сообщение без обработчика", "type", env.Type)
					continue
				}
				var cfg alp.SessionConfig
				if env.Decode(&cfg) == nil {
					r.applyConfig(cfg)
				}
				continue
			}
			if err := c.Handle(ctx, env); err != nil {
				r.log.Warn("агент: сообщение сервера не обработано", "type", env.Type, "err", err)
			}
		}
	}
}

func (r *Runtime) statusLoop(ctx context.Context) {
	for {
		interval, _ := r.intervals()
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		case <-r.changed:
			timer.Stop()
			// Несколько изменений подряд — один status.
			time.Sleep(50 * time.Millisecond)
		}
		r.sendStatus()
	}
}

func (r *Runtime) metricsLoop(ctx context.Context) {
	if r.metrics == nil {
		return
	}
	for {
		_, interval := r.intervals()
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}
		if r.sender.Connected() {
			r.sender.Stream(alp.TypeMetrics, r.metrics.Collect(ctx))
		}
	}
}

func (r *Runtime) buildStatus() alp.Status {
	st := alp.Status{Slots: map[string]int{}, Jobs: []alp.StatusJob{}, Workloads: []alp.StatusWorkload{}, Outbox: r.outbox()}
	r.each(func(c Capability) {
		if s, ok := c.(StatusContributor); ok {
			s.ContributeStatus(&st)
		}
	})
	switch {
	case r.updating.Load():
		st.State = alp.StateUpdating
	case r.draining.Load():
		st.State = alp.StateDraining
		for q := range st.Slots {
			st.Slots[q] = 0
		}
	case st.State != "":
	case len(st.Jobs) > 0:
		st.State = alp.StateBusy
	default:
		st.State = alp.StateIdle
	}
	return st
}

func (r *Runtime) sendStatus() {
	if r.sender == nil {
		return
	}
	r.sender.Stream(alp.TypeStatus, r.buildStatus())
}

// Status — текущий status (для команд и тестов).
func (r *Runtime) Status() alp.Status { return r.buildStatus() }

// Welcomed — канал первого welcome (снятие отметки обновления).
func (r *Runtime) Welcomed() <-chan alp.Welcome { return r.welcomed }
