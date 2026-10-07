package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/logx"
)

type sent struct {
	typ  string
	data any
}

type fakeSender struct {
	mu   sync.Mutex
	msgs []sent
}

func (f *fakeSender) Stream(typ string, data any) { f.add(typ, data) }
func (f *fakeSender) Reliable(typ string, data any) error {
	f.add(typ, data)
	return nil
}
func (f *fakeSender) Request(_ context.Context, _ string, _ any, out any) error {
	return json.Unmarshal([]byte(`{"inputs":{},"outputs":{},"expiresAt":1}`), out)
}
func (f *fakeSender) add(typ string, data any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.msgs = append(f.msgs, sent{typ, data})
}
func (f *fakeSender) of(typ string) []any {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []any
	for _, m := range f.msgs {
		if m.typ == typ {
			out = append(out, m.data)
		}
	}
	return out
}

func wait(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("не дождались: %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func assign(id, queue string) alp.Envelope {
	return alp.MustNew(alp.TypeJobAssign, alp.JobAssign{JobID: id, Queue: queue, Data: json.RawMessage(`{"n":1}`)})
}

func TestAssignCompleteAndStatus(t *testing.T) {
	s := &fakeSender{}
	m := New(s, logx.Discard(), func() {})
	release := make(chan struct{})
	f := NewFuncs("go", m)
	f.Handle("echo", 2, func(ctx context.Context, job *Job) (any, error) {
		job.Progress(0.5, "половина")
		job.Event("step", map[string]int{"n": 1})
		<-release
		return map[string]string{"ok": "1"}, nil
	})
	m.Attach(f)

	st := alp.Status{Slots: map[string]int{}}
	m.ContributeStatus(&st)
	if st.Slots["echo"] != 2 {
		t.Fatalf("слоты: %v", st.Slots)
	}

	_ = m.Handle(context.Background(), assign("j1", "echo"))
	_ = m.Handle(context.Background(), assign("j1", "echo")) // повтор доставки
	wait(t, "прогресс и событие", func() bool { return len(s.of(alp.TypeJobProgress)) == 1 && len(s.of(alp.TypeJobEvent)) == 1 })

	st = alp.Status{Slots: map[string]int{}}
	m.ContributeStatus(&st)
	if st.Slots["echo"] != 1 || len(st.Jobs) != 1 || len(m.RunningJobs()) != 1 {
		t.Fatalf("занято: %+v", st)
	}
	if got := len(s.of(alp.TypeJobAccept)); got != 2 {
		t.Fatalf("accept на каждое назначение: %d", got)
	}

	close(release)
	wait(t, "complete", func() bool { return len(s.of(alp.TypeJobComplete)) == 1 })
	if len(m.RunningJobs()) != 0 {
		t.Fatal("после итога задача не числится")
	}
}

func TestRejectCancelAndCrash(t *testing.T) {
	s := &fakeSender{}
	m := New(s, logx.Discard(), func() {})
	f := NewFuncs("go", m)
	f.Handle("slow", 1, func(ctx context.Context, job *Job) (any, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	})
	f.Handle("bad", 1, func(ctx context.Context, job *Job) (any, error) {
		return nil, &Error{Code: "BAD_INPUT", Message: "нет", Retryable: false}
	})
	m.Attach(f)

	_ = m.Handle(context.Background(), assign("u1", "unknown"))
	_ = m.Handle(context.Background(), assign("s1", "slow"))
	_ = m.Handle(context.Background(), assign("s2", "slow"))
	rejects := s.of(alp.TypeJobReject)
	if len(rejects) != 2 || rejects[0].(alp.JobReject).Code != alp.ErrQueueNotServed || rejects[1].(alp.JobReject).Code != alp.ErrQueueBusy {
		t.Fatalf("отказы: %+v", rejects)
	}

	_ = m.Handle(context.Background(), alp.MustNew(alp.TypeJobCancel, alp.JobRef{JobID: "s1"}))
	time.Sleep(50 * time.Millisecond)
	if len(s.of(alp.TypeJobComplete))+len(s.of(alp.TypeJobFail)) != 0 {
		t.Fatal("итог отменённой задачи не отправляется")
	}

	_ = m.Handle(context.Background(), assign("b1", "bad"))
	wait(t, "fail", func() bool { return len(s.of(alp.TypeJobFail)) == 1 })
	if f := s.of(alp.TypeJobFail)[0].(alp.JobFail); f.Code != "BAD_INPUT" || f.Retryable {
		t.Fatalf("код ошибки: %+v", f)
	}

	_ = m.Handle(context.Background(), assign("s3", "slow"))
	m.Detach("go", "exit status 1")
	fails := s.of(alp.TypeJobFail)
	if last := fails[len(fails)-1].(alp.JobFail); last.Code != alp.ErrWorkloadCrashed || !last.Retryable || last.JobID != "s3" {
		t.Fatalf("падение исполнителя: %+v", last)
	}
}

func TestDrainAndStopWaits(t *testing.T) {
	s := &fakeSender{}
	m := New(s, logx.Discard(), func() {})
	done := make(chan struct{})
	f := NewFuncs("go", m)
	f.Handle("q", 1, func(ctx context.Context, job *Job) (any, error) {
		<-done
		return nil, nil
	})
	m.Attach(f)
	_ = m.Handle(context.Background(), assign("a", "q"))
	m.SetAccepting(false)
	st := alp.Status{Slots: map[string]int{}}
	m.ContributeStatus(&st)
	if st.Slots["q"] != 0 {
		t.Fatalf("drain: %v", st.Slots)
	}

	stopped := make(chan struct{})
	go func() {
		m.Stop(context.Background())
		close(stopped)
	}()
	select {
	case <-stopped:
		t.Fatal("Stop не дождался задачи")
	case <-time.After(50 * time.Millisecond):
	}
	close(done)
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop не завершился после задачи")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	m.Stop(ctx) // задач нет — сразу
	if errors.Is(ctx.Err(), context.DeadlineExceeded) && len(m.RunningJobs()) != 0 {
		t.Fatal("задачи остались")
	}
}
