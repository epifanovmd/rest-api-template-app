//go:build unix

package workload

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/config"
	"restapi/agent/kit/jobs"
)

// registerTimeout — нагрузка должна объявить очереди за это время (импорт тяжёлых библиотек).
const registerTimeout = 120 * time.Second

// ipcFD — номер унаследованного дескриптора канала (первый из ExtraFiles).
const ipcFD = 3

// instance — один процесс нагрузки; исполнитель задач для jobs.Manager.
type instance struct {
	id       string
	spec     config.Workload
	reporter jobs.Reporter
	log      *slog.Logger
	agentVer string

	cmd     *exec.Cmd
	ipc     net.Conn
	writeMu sync.Mutex

	mu       sync.Mutex
	queues   map[string]int
	version  string
	retired  atomic.Bool
	ready    chan struct{}
	exited   chan struct{}
	exitErr  error
	started  time.Time
	jobs     map[string]alp.JobRef
	stopping atomic.Bool
}

func startInstance(spec config.Workload, id string, reporter jobs.Reporter, log *slog.Logger, agentVersion string) (*instance, error) {
	fds, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		return nil, fmt.Errorf("workload %s: socketpair: %w", spec.Name, err)
	}
	parent := os.NewFile(uintptr(fds[0]), "alp-ipc")
	child := os.NewFile(uintptr(fds[1]), "alp-ipc-child")
	ipc, err := net.FileConn(parent)
	parent.Close()
	if err != nil {
		child.Close()
		return nil, fmt.Errorf("workload %s: ipc: %w", spec.Name, err)
	}

	cmd := exec.Command(spec.Command[0], spec.Command[1:]...)
	cmd.Dir = spec.Dir
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("ALP_IPC_FD=%d", ipcFD),
		"ALP_WORKLOAD="+spec.Name,
		"ALP_AGENT_VERSION="+agentVersion,
		"PYTHONUNBUFFERED=1",
	)
	for k, v := range spec.Env {
		cmd.Env = append(cmd.Env, k+"="+os.ExpandEnv(v))
	}
	cmd.ExtraFiles = []*os.File{child}
	inst := &instance{
		id:       id,
		spec:     spec,
		reporter: reporter,
		log:      log.With("workload", spec.Name, "instance", id),
		agentVer: agentVersion,
		cmd:      cmd,
		ipc:      ipc,
		ready:    make(chan struct{}),
		exited:   make(chan struct{}),
		jobs:     map[string]alp.JobRef{},
	}
	out := &lineLog{log: inst.log}
	cmd.Stdout, cmd.Stderr = out, out
	if err := cmd.Start(); err != nil {
		child.Close()
		ipc.Close()
		return nil, fmt.Errorf("workload %s: запуск: %w", spec.Name, err)
	}
	child.Close()
	inst.started = time.Now()
	inst.log.Info("нагрузка запущена", "pid", cmd.Process.Pid)

	go inst.readLoop()
	go func() {
		err := cmd.Wait()
		inst.mu.Lock()
		inst.exitErr = err
		inst.mu.Unlock()
		ipc.Close()
		out.Flush()
		close(inst.exited)
	}()
	go func() {
		select {
		case <-inst.ready:
		case <-inst.exited:
		case <-time.After(registerTimeout):
			inst.log.Error("нагрузка не зарегистрировалась вовремя — перезапуск")
			_ = cmd.Process.Kill()
		}
	}()
	return inst, nil
}

// ─── jobs.Runner ───────────────────────────────────────────────────────

func (i *instance) ID() string { return i.id }

func (i *instance) Queues() map[string]int {
	i.mu.Lock()
	defer i.mu.Unlock()
	out := make(map[string]int, len(i.queues))
	for q, n := range i.queues {
		out[q] = n
	}
	return out
}

func (i *instance) Accepting() bool {
	return !i.retired.Load() && !i.stopping.Load()
}

func (i *instance) Run(a alp.JobAssign) error {
	i.mu.Lock()
	i.jobs[a.JobID] = a.Ref()
	i.mu.Unlock()
	return i.send(alp.MustNew(alp.TypeJobAssign, a))
}

func (i *instance) Cancel(ref alp.JobRef) {
	i.forget(ref.JobID)
	_ = i.send(alp.MustNew(alp.TypeJobCancel, ref))
}

func (i *instance) Stop(ref alp.JobRef) {
	_ = i.send(alp.MustNew(alp.TypeJobStop, ref))
}

// ─── жизненный цикл ────────────────────────────────────────────────────

// retire — перестать брать задачи и завершиться после текущих (заменён новым).
func (i *instance) retire() {
	if i.retired.Swap(true) {
		return
	}
	_ = i.send(alp.MustNew(alp.TypeWorkloadDrain, struct{}{}))
}

// terminate — SIGTERM, через timeout — SIGKILL.
func (i *instance) terminate(ctx context.Context) {
	i.stopping.Store(true)
	if i.cmd.Process == nil {
		return
	}
	_ = i.cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-i.exited:
	case <-ctx.Done():
		i.log.Warn("нагрузка не завершилась вовремя — SIGKILL")
		_ = i.cmd.Process.Kill()
		<-i.exited
	}
}

func (i *instance) exitReason() string {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.exitErr == nil {
		return "exit 0"
	}
	return i.exitErr.Error()
}

func (i *instance) runningJobs() int {
	i.mu.Lock()
	defer i.mu.Unlock()
	return len(i.jobs)
}

func (i *instance) forget(jobID string) {
	i.mu.Lock()
	delete(i.jobs, jobID)
	i.mu.Unlock()
}

func (i *instance) send(env alp.Envelope) error {
	raw, err := json.Marshal(env)
	if err != nil {
		return err
	}
	i.writeMu.Lock()
	defer i.writeMu.Unlock()
	_ = i.ipc.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err = i.ipc.Write(append(raw, '\n'))
	return err
}

func (i *instance) readLoop() {
	scanner := bufio.NewScanner(i.ipc)
	scanner.Buffer(make([]byte, 64*1024), 16<<20)
	for scanner.Scan() {
		var env alp.Envelope
		if err := json.Unmarshal(scanner.Bytes(), &env); err != nil {
			i.log.Warn("нагрузка: сообщение не JSON", "err", err)
			continue
		}
		if err := i.handle(env); err != nil {
			i.log.Warn("нагрузка: сообщение не обработано", "type", env.Type, "err", err)
		}
	}
}

func (i *instance) handle(env alp.Envelope) error {
	switch env.Type {
	case alp.TypeWorkloadRegister:
		var reg alp.WorkloadRegister
		if err := env.Decode(&reg); err != nil {
			return err
		}
		i.register(reg)
		return i.send(alp.MustNew(alp.TypeWorkloadReady, alp.WorkloadReady{AgentVersion: i.agentVer}))
	case alp.TypeJobProgress:
		var p alp.JobProgress
		if err := env.Decode(&p); err != nil {
			return err
		}
		i.reporter.Progress(p)
	case alp.TypeJobEvent:
		var e alp.JobEvent
		if err := env.Decode(&e); err != nil {
			return err
		}
		i.reporter.Event(e)
	case alp.TypeJobComplete:
		var c alp.JobComplete
		if err := env.Decode(&c); err != nil {
			return err
		}
		i.forget(c.JobID)
		i.reporter.Complete(c)
	case alp.TypeJobFail:
		var f alp.JobFail
		if err := env.Decode(&f); err != nil {
			return err
		}
		i.forget(f.JobID)
		i.reporter.Fail(f)
	case alp.TypeJobURLs:
		var req alp.JobURLsRequest
		if err := env.Decode(&req); err != nil {
			return err
		}
		go i.answerURLs(env.ID, req)
	default:
		return errors.New("неизвестный тип")
	}
	return nil
}

func (i *instance) register(reg alp.WorkloadRegister) {
	allowed := map[string]bool{}
	for _, q := range i.spec.Queues {
		allowed[q] = true
	}
	queues := map[string]int{}
	for _, q := range reg.Queues {
		if q.Concurrency <= 0 || (len(allowed) > 0 && !allowed[q.Name]) {
			continue
		}
		queues[q.Name] = q.Concurrency
	}
	i.mu.Lock()
	i.queues = queues
	i.version = reg.Version
	i.mu.Unlock()
	i.log.Info("нагрузка зарегистрирована", "version", reg.Version, "sdk", reg.SDK, "queues", queues)
	select {
	case <-i.ready:
	default:
		close(i.ready)
	}
}

func (i *instance) answerURLs(id string, req alp.JobURLsRequest) {
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	urls, err := i.reporter.URLs(ctx, req)
	var reply alp.Envelope
	if err != nil {
		e := alp.Error{Code: "URLS_UNAVAILABLE", Message: err.Error(), Retryable: true}
		var ae *alp.Error
		if errors.As(err, &ae) {
			e = *ae
		}
		reply = alp.MustNew(alp.TypeError, e)
	} else {
		reply = alp.MustNew(alp.TypeJobURLs, urls)
	}
	reply.Re = id
	if err := i.send(reply); err != nil {
		i.log.Warn("нагрузка: ответ job.urls не отправлен", "err", err)
	}
}

// lineLog — вывод нагрузки построчно в лог агента.
type lineLog struct {
	log *slog.Logger
	mu  sync.Mutex
	buf strings.Builder
}

func (l *lineLog) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.buf.Write(p)
	text := l.buf.String()
	for {
		idx := strings.IndexByte(text, '\n')
		if idx < 0 {
			break
		}
		if line := strings.TrimRight(text[:idx], "\r"); line != "" {
			l.log.Info(line)
		}
		text = text[idx+1:]
	}
	l.buf.Reset()
	l.buf.WriteString(text)
	return len(p), nil
}

// Flush — недописанная последняя строка.
func (l *lineLog) Flush() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if rest := strings.TrimSpace(l.buf.String()); rest != "" {
		l.log.Info(rest)
	}
	l.buf.Reset()
}

var _ io.Writer = (*lineLog)(nil)
