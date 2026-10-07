// Package state — возможность `state`: желаемое состояние доменов (полный
// снимок с монотонной версией). Снимок сохраняется на диск и применяется
// идемпотентно; после рестарта — из кэша, без сервера; при ошибке — повтор.
package state

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"restapi/agent/kit/alp"
)

// Reconciler — приведение хоста к снимку домена. Apply идемпотентен.
type Reconciler interface {
	Domain() string
	Apply(ctx context.Context, version int64, spec json.RawMessage) (report any, err error)
}

// Sender — канал к серверу.
type Sender interface {
	Reliable(typ string, data any) error
}

// retryEvery — повтор применения после ошибки.
const retryEvery = 30 * time.Second

type cached struct {
	Version int64           `json:"version"`
	Spec    json.RawMessage `json:"spec"`
	Applied bool            `json:"applied"`
}

type domain struct {
	r       Reconciler
	mu      sync.Mutex
	latest  *cached
	applied *int64
	wake    chan struct{}
}

// Manager — домены желаемого состояния.
type Manager struct {
	dir     string
	sender  Sender
	log     *slog.Logger
	domains map[string]*domain
}

// New — менеджер; снимки — в dir.
func New(dir string, sender Sender, log *slog.Logger) *Manager {
	return &Manager{dir: dir, sender: sender, log: log, domains: map[string]*domain{}}
}

// Register — домен.
func (m *Manager) Register(r Reconciler) {
	m.domains[r.Domain()] = &domain{r: r, wake: make(chan struct{}, 1)}
}

// Empty — нет доменов (возможность не объявляется).
func (m *Manager) Empty() bool { return len(m.domains) == 0 }

func (m *Manager) Declare(caps *alp.Capabilities) {
	if m.Empty() {
		return
	}
	domains := map[string]*int64{}
	for name, d := range m.domains {
		d.mu.Lock()
		domains[name] = d.applied
		d.mu.Unlock()
	}
	caps.State = &alp.StateCapability{Domains: domains}
}

func (m *Manager) Handles() []string { return []string{alp.TypeStatePut} }

func (m *Manager) Handle(_ context.Context, env alp.Envelope) error {
	var put alp.StatePut
	if err := env.Decode(&put); err != nil {
		return err
	}
	d, ok := m.domains[put.Domain]
	if !ok {
		return fmt.Errorf("state: домен %s не поддерживается", put.Domain)
	}
	d.mu.Lock()
	if d.latest != nil && put.Version <= d.latest.Version {
		// Устаревший снимок — мимо; та же версия, уже применённая, — сервер
		// не знает о применении (ack потерялся): сообщить снова.
		applied := put.Version == d.latest.Version && d.applied != nil && *d.applied == put.Version
		d.mu.Unlock()
		if applied {
			return m.sender.Reliable(alp.TypeStateApplied, alp.StateApplied{Domain: put.Domain, Version: put.Version, OK: true})
		}
		return nil
	}
	d.latest = &cached{Version: put.Version, Spec: put.Spec}
	snapshot := *d.latest
	d.mu.Unlock()
	if err := m.save(put.Domain, snapshot); err != nil {
		m.log.Error("state: снимок не сохранён", "domain", put.Domain, "err", err)
	}
	select {
	case d.wake <- struct{}{}:
	default:
	}
	return nil
}

// Start — применить кэш (автономный старт) и обслуживать новые снимки.
func (m *Manager) Start(ctx context.Context) error {
	var wg sync.WaitGroup
	for name, d := range m.domains {
		if c, err := m.load(name); err == nil && c != nil {
			d.latest = c
			if c.Applied {
				v := c.Version
				d.applied = &v
			}
			select {
			case d.wake <- struct{}{}:
			default:
			}
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.loop(ctx, name, d)
		}()
	}
	wg.Wait()
	return nil
}

func (m *Manager) loop(ctx context.Context, name string, d *domain) {
	var retry <-chan time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-d.wake:
		case <-retry:
		}
		retry = nil
		d.mu.Lock()
		if d.latest == nil {
			d.mu.Unlock()
			continue
		}
		snapshot := *d.latest
		d.mu.Unlock()

		report, err := d.r.Apply(ctx, snapshot.Version, snapshot.Spec)
		applied := alp.StateApplied{Domain: name, Version: snapshot.Version, OK: err == nil}
		if report != nil {
			applied.Report, _ = json.Marshal(report)
		}
		if err != nil {
			applied.Error = err.Error()
			m.log.Error("state: применение не удалось — повтор", "domain", name, "version", snapshot.Version, "err", err)
			retry = time.After(retryEvery)
		} else {
			d.mu.Lock()
			v := snapshot.Version
			d.applied = &v
			if d.latest.Version == v {
				d.latest.Applied = true
			}
			saved := *d.latest
			d.mu.Unlock()
			_ = m.save(name, saved)
			m.log.Info("state: применено", "domain", name, "version", v)
		}
		if err := m.sender.Reliable(alp.TypeStateApplied, applied); err != nil {
			m.log.Error("state: итог не записан", "err", err)
		}
	}
}

func (m *Manager) path(name string) string { return filepath.Join(m.dir, name+".json") }

func (m *Manager) save(name string, c cached) error {
	if err := os.MkdirAll(m.dir, 0o700); err != nil {
		return err
	}
	raw, _ := json.Marshal(c)
	tmp := m.path(name) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, m.path(name))
}

func (m *Manager) load(name string) (*cached, error) {
	raw, err := os.ReadFile(m.path(name))
	if err != nil {
		return nil, err
	}
	var c cached
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	return &c, nil
}
