//go:build unix

package workload

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"testing"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/config"
	"restapi/agent/kit/jobs"
	"restapi/agent/kit/logx"
)

// TestMain — тестовый бинарь служит и нагрузкой: ALP_TEST_WORKLOAD=1.
func TestMain(m *testing.M) {
	if os.Getenv("ALP_TEST_WORKLOAD") == "1" {
		fakeWorkload()
		return
	}
	os.Exit(m.Run())
}

// fakeWorkload — нагрузка на IPC: echo-очередь; WORKLOAD_CRASH=1 — падает на задаче.
func fakeWorkload() {
	conn, err := net.FileConn(os.NewFile(3, "ipc"))
	if err != nil {
		os.Exit(2)
	}
	var mu sync.Mutex
	send := func(env alp.Envelope) {
		raw, _ := json.Marshal(env)
		mu.Lock()
		_, _ = conn.Write(append(raw, '\n'))
		mu.Unlock()
	}
	term := make(chan os.Signal, 1)
	signal.Notify(term, syscall.SIGTERM)
	go func() {
		<-term
		os.Exit(0)
	}()
	send(alp.MustNew(alp.TypeWorkloadRegister, alp.WorkloadRegister{
		Name: "echo", Version: os.Getenv("WORKLOAD_VERSION"), SDK: "test",
		Queues: []alp.QueueCapacity{{Name: "echo", Concurrency: 2}, {Name: "hidden", Concurrency: 1}},
	}))
	scanner := bufio.NewScanner(conn)
	var pending *alp.JobAssign
	for scanner.Scan() {
		var env alp.Envelope
		_ = json.Unmarshal(scanner.Bytes(), &env)
		switch env.Type {
		case alp.TypeWorkloadDrain:
			os.Exit(0)
		case alp.TypeJobAssign:
			if os.Getenv("WORKLOAD_CRASH") == "1" {
				os.Exit(1)
			}
			var a alp.JobAssign
			_ = env.Decode(&a)
			p := 0.5
			send(alp.MustNew(alp.TypeJobProgress, alp.JobProgress{JobRef: a.Ref(), Progress: &p}))
			req := alp.MustNew(alp.TypeJobURLs, alp.JobURLsRequest{JobRef: a.Ref()})
			req.ID = "u1"
			pending = &a
			send(req)
		case alp.TypeJobURLs:
			// Итог — после ответа на запрос ссылок, как в SDK.
			if env.Re == "u1" && pending != nil {
				send(alp.MustNew(alp.TypeJobComplete, alp.JobComplete{JobRef: pending.Ref(), Result: pending.Data}))
				pending = nil
			}
		}
	}
}

type recorder struct {
	mu   sync.Mutex
	msgs map[string][]any
}

func (r *recorder) add(typ string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.msgs == nil {
		r.msgs = map[string][]any{}
	}
	r.msgs[typ] = append(r.msgs[typ], data)
}
func (r *recorder) Stream(typ string, data any) { r.add(typ, data) }
func (r *recorder) Reliable(typ string, data any) error {
	r.add(typ, data)
	return nil
}
func (r *recorder) Request(_ context.Context, typ string, _ any, out any) error {
	r.add(typ, nil)
	return json.Unmarshal([]byte(`{"inputs":{},"outputs":{},"expiresAt":7}`), out)
}
func (r *recorder) count(typ string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.msgs[typ])
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("не дождались: %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func setup(t *testing.T, env map[string]string) (*Supervisor, *jobs.Manager, *recorder, context.CancelFunc) {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	env["ALP_TEST_WORKLOAD"] = "1"
	rec := &recorder{}
	manager := jobs.New(rec, logx.Discard(), func() {})
	spec := config.Workload{
		Name: "echo", Command: []string{exe}, Env: env, Replicas: 1,
		Queues: []string{"echo"}, StopTimeout: config.Duration(5 * time.Second),
	}
	sup := New([]config.Workload{spec}, manager, logx.Discard(), func() {}, "test")
	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = sup.Start(ctx) }()
	return sup, manager, rec, cancel
}

func slots(m *jobs.Manager) map[string]int {
	st := alp.Status{Slots: map[string]int{}}
	m.ContributeStatus(&st)
	return st.Slots
}

func assign(m *jobs.Manager, id string) {
	_ = m.Handle(context.Background(), alp.MustNew(alp.TypeJobAssign, alp.JobAssign{
		JobID: id, Queue: "echo", Data: json.RawMessage(`{"text":"hi"}`),
	}))
}

func TestRegisterRunAndQueueFilter(t *testing.T) {
	sup, manager, rec, cancel := setup(t, map[string]string{"WORKLOAD_VERSION": "1.0"})
	defer cancel()
	waitFor(t, "регистрация", func() bool { return slots(manager)["echo"] == 2 })
	if _, ok := slots(manager)["hidden"]; ok {
		t.Fatal("очередь вне фильтра конфигурации не должна обслуживаться")
	}

	assign(manager, "j1")
	waitFor(t, "итог задачи", func() bool { return rec.count(alp.TypeJobComplete) == 1 })
	if rec.count(alp.TypeJobProgress) != 1 || rec.count(alp.TypeJobURLs) != 1 {
		t.Fatalf("прогресс и запрос ссылок: %v", rec.msgs)
	}

	st := alp.Status{Slots: map[string]int{}}
	sup.ContributeStatus(&st)
	if len(st.Workloads) != 1 || st.Workloads[0].State != "running" || st.Workloads[0].Version != "1.0" {
		t.Fatalf("статус нагрузки: %+v", st.Workloads)
	}

	stopCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	sup.Stop(stopCtx)
}

func TestCrashFailsJobAndRestarts(t *testing.T) {
	_, manager, rec, cancel := setup(t, map[string]string{"WORKLOAD_CRASH": "1"})
	defer cancel()
	waitFor(t, "регистрация", func() bool { return slots(manager)["echo"] == 2 })
	assign(manager, "crash")
	waitFor(t, "провал задачи упавшей нагрузки", func() bool { return rec.count(alp.TypeJobFail) == 1 })
	rec.mu.Lock()
	fail := rec.msgs[alp.TypeJobFail][0].(alp.JobFail)
	rec.mu.Unlock()
	if fail.Code != alp.ErrWorkloadCrashed || !fail.Retryable {
		t.Fatalf("код: %+v", fail)
	}
	waitFor(t, "перезапуск", func() bool { return slots(manager)["echo"] == 2 })
}

func TestRestartWithoutDowntime(t *testing.T) {
	sup, manager, _, cancel := setup(t, map[string]string{})
	defer cancel()
	waitFor(t, "регистрация", func() bool { return slots(manager)["echo"] == 2 })
	ctx, stop := context.WithTimeout(context.Background(), 10*time.Second)
	defer stop()
	if err := sup.Restart(ctx, "echo"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "один исполнитель после замены", func() bool { return slots(manager)["echo"] == 2 })
	sup.mu.Lock()
	id := sup.workloads["echo"].slots[0].current.id
	sup.mu.Unlock()
	if id != "echo#2" {
		t.Fatalf("текущий экземпляр: %s", id)
	}
	if err := sup.Restart(ctx, "nope"); err != ErrUnknownWorkload {
		t.Fatalf("неизвестная нагрузка: %v", err)
	}
}
