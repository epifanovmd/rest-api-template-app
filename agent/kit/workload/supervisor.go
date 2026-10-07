//go:build unix

// Package workload — нагрузки агента: дочерние процессы (Python-воркеры и
// др.), связанные с агентом локальным IPC (§10 протокола). Супервизор держит
// заданное число экземпляров, перезапускает упавшие с backoff, заменяет
// экземпляры без простоя (новый рядом, старый дорабатывает задачи).
package workload

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/backoff"
	"restapi/agent/kit/config"
	"restapi/agent/kit/jobs"
)

// healthyAfter — проработал дольше — счётчик неудач сбрасывается.
const healthyAfter = time.Minute

var restartPolicy = backoff.Policy{Min: time.Second, Max: 30 * time.Second}

// slot — место одного экземпляра: текущий процесс и история неудач.
type slot struct {
	current  *instance
	failures int
	state    string // starting | running | backoff | stopped
}

type workload struct {
	spec       config.Workload
	slots      []*slot
	generation int
}

// Supervisor — нагрузки агента.
type Supervisor struct {
	jobs      *jobs.Manager
	log       *slog.Logger
	changed   func()
	agentVer  string
	workloads map[string]*workload

	mu       sync.Mutex
	ctx      context.Context
	stopping bool
	wg       sync.WaitGroup
}

// New — супервизор нагрузок из конфигурации.
func New(specs []config.Workload, manager *jobs.Manager, log *slog.Logger, changed func(), agentVersion string) *Supervisor {
	s := &Supervisor{jobs: manager, log: log, changed: changed, agentVer: agentVersion, workloads: map[string]*workload{}}
	for _, spec := range specs {
		w := &workload{spec: spec}
		for range spec.Replicas {
			w.slots = append(w.slots, &slot{state: "starting"})
		}
		s.workloads[spec.Name] = w
	}
	return s
}

// ─── runtime: Capability, Starter, Stopper, StatusContributor ─────────

func (s *Supervisor) Declare(*alp.Capabilities) {}
func (s *Supervisor) Handles() []string         { return nil }
func (s *Supervisor) Handle(context.Context, alp.Envelope) error {
	return nil
}

// Start — запустить все экземпляры и держать их до отмены ctx.
func (s *Supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	s.ctx = ctx
	s.mu.Unlock()
	for _, w := range s.workloads {
		for _, sl := range w.slots {
			s.wg.Add(1)
			go s.keep(ctx, w, sl)
		}
	}
	<-ctx.Done()
	return nil
}

// Stop — SIGTERM всем экземплярам, доработка задач до срока ctx, затем SIGKILL.
func (s *Supervisor) Stop(ctx context.Context) {
	s.mu.Lock()
	s.stopping = true
	var all []*instance
	for _, w := range s.workloads {
		for _, sl := range w.slots {
			if sl.current != nil {
				all = append(all, sl.current)
			}
		}
	}
	s.mu.Unlock()
	var wg sync.WaitGroup
	for _, inst := range all {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stopCtx, cancel := context.WithTimeout(ctx, inst.spec.StopTimeout.Std())
			defer cancel()
			inst.terminate(stopCtx)
		}()
	}
	wg.Wait()
	s.wg.Wait()
}

// ContributeStatus — состояние нагрузок; упавшая (backoff) — агент degraded.
func (s *Supervisor) ContributeStatus(st *alp.Status) {
	s.mu.Lock()
	defer s.mu.Unlock()
	names := make([]string, 0, len(s.workloads))
	for name := range s.workloads {
		names = append(names, name)
	}
	sort.Strings(names)
	var degraded []string
	for _, name := range names {
		w := s.workloads[name]
		item := alp.StatusWorkload{Name: name, State: "running"}
		for _, sl := range w.slots {
			if sl.state == "running" {
				item.Instances++
				if sl.current != nil {
					sl.current.mu.Lock()
					item.Version = sl.current.version
					sl.current.mu.Unlock()
				}
			}
		}
		switch {
		case item.Instances == len(w.slots):
		case anyState(w.slots, "backoff"):
			item.State = "backoff"
			degraded = append(degraded, name)
		case anyState(w.slots, "starting"):
			item.State = "starting"
		default:
			item.State = "stopped"
		}
		st.Workloads = append(st.Workloads, item)
	}
	if len(degraded) > 0 && st.State == "" {
		st.State = alp.StateDegraded
		st.Message = fmt.Sprintf("нагрузки перезапускаются: %v", degraded)
	}
}

func anyState(slots []*slot, state string) bool {
	for _, sl := range slots {
		if sl.state == state {
			return true
		}
	}
	return false
}

// ─── управление ────────────────────────────────────────────────────────

// Names — имена нагрузок.
func (s *Supervisor) Names() []string {
	names := make([]string, 0, len(s.workloads))
	for name := range s.workloads {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// ErrUnknownWorkload — нагрузки с таким именем нет.
var ErrUnknownWorkload = errors.New("workload: нет такой нагрузки")

// Restart — заменить экземпляры нагрузки без простоя: новый поднимается
// рядом, после регистрации старый перестаёт брать задачи и завершается
// после текущих.
func (s *Supervisor) Restart(ctx context.Context, name string) error {
	s.mu.Lock()
	w, ok := s.workloads[name]
	stopping := s.stopping
	s.mu.Unlock()
	if !ok {
		return ErrUnknownWorkload
	}
	if stopping {
		return errors.New("workload: агент останавливается")
	}
	for idx, sl := range w.slots {
		next, err := s.spawn(w)
		if err != nil {
			return err
		}
		select {
		case <-next.ready:
		case <-next.exited:
			return fmt.Errorf("workload %s: новый экземпляр завершился до регистрации: %s", name, next.exitReason())
		case <-ctx.Done():
			next.terminate(context.Background())
			return ctx.Err()
		}
		s.jobs.Attach(next)
		s.mu.Lock()
		old := sl.current
		sl.current = next
		sl.state = "running"
		s.mu.Unlock()
		if old != nil {
			old.retire()
		}
		s.log.Info("нагрузка заменена", "workload", name, "slot", idx, "instance", next.id)
		s.changed()
	}
	return nil
}

func (s *Supervisor) spawn(w *workload) (*instance, error) {
	s.mu.Lock()
	w.generation++
	id := fmt.Sprintf("%s#%d", w.spec.Name, w.generation)
	s.mu.Unlock()
	return startInstance(w.spec, id, s.jobs, s.log, s.agentVer)
}

// keep — держать слот занятым: запуск, ожидание выхода, перезапуск с backoff.
func (s *Supervisor) keep(ctx context.Context, w *workload, sl *slot) {
	defer s.wg.Done()
	for {
		s.mu.Lock()
		inst := sl.current
		stopping := s.stopping
		s.mu.Unlock()
		if stopping || ctx.Err() != nil {
			return
		}

		if inst == nil {
			s.setState(sl, "starting")
			next, err := s.spawn(w)
			if err != nil {
				s.log.Error("нагрузка не запустилась", "workload", w.spec.Name, "err", err)
				if !s.pause(ctx, sl) {
					return
				}
				continue
			}
			s.mu.Lock()
			sl.current = next
			s.mu.Unlock()
			inst = next
			go func() {
				select {
				case <-inst.ready:
					s.jobs.Attach(inst)
					s.setState(sl, "running")
				case <-inst.exited:
				}
			}()
		}

		<-inst.exited
		reason := inst.exitReason()
		retired := inst.retired.Load()
		if retired && inst.runningJobs() == 0 {
			reason = ""
		}
		s.jobs.Detach(inst.id, reason)

		s.mu.Lock()
		if sl.current == inst {
			sl.current = nil
		}
		replaced := sl.current != nil
		stopping = s.stopping
		s.mu.Unlock()
		if retired && replaced {
			s.log.Info("старый экземпляр нагрузки завершился", "instance", inst.id)
			continue
		}
		if stopping || ctx.Err() != nil {
			s.setState(sl, "stopped")
			return
		}
		s.log.Warn("нагрузка завершилась — перезапуск", "instance", inst.id, "reason", reason)
		if time.Since(inst.started) > healthyAfter {
			sl.failures = 0
		}
		if !s.pause(ctx, sl) {
			return
		}
	}
}

func (s *Supervisor) pause(ctx context.Context, sl *slot) bool {
	s.setState(sl, "backoff")
	delay := restartPolicy.Delay(sl.failures)
	sl.failures++
	select {
	case <-ctx.Done():
		return false
	case <-time.After(delay):
		return true
	}
}

func (s *Supervisor) setState(sl *slot, state string) {
	s.mu.Lock()
	sl.state = state
	s.mu.Unlock()
	s.changed()
}
