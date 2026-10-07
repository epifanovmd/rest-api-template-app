package state

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/logx"
)

type fakeReconciler struct {
	calls atomic.Int32
	fail  atomic.Bool
	last  atomic.Int64
}

func (f *fakeReconciler) Domain() string { return "wg" }
func (f *fakeReconciler) Apply(_ context.Context, v int64, _ json.RawMessage) (any, error) {
	f.calls.Add(1)
	if f.fail.Load() {
		return nil, errors.New("не вышло")
	}
	f.last.Store(v)
	return map[string]int64{"v": v}, nil
}

type sink struct {
	mu  sync.Mutex
	got []alp.StateApplied
}

func (s *sink) Reliable(_ string, data any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.got = append(s.got, data.(alp.StateApplied))
	return nil
}
func (s *sink) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.got)
}

func put(v int64) alp.Envelope {
	return alp.MustNew(alp.TypeStatePut, alp.StatePut{Domain: "wg", Version: v, Spec: json.RawMessage(`{}`)})
}

func wait(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("не дождались")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestApplyCacheAndAutonomousStart(t *testing.T) {
	dir := t.TempDir()
	r := &fakeReconciler{}
	s := &sink{}
	m := New(dir, s, logx.Discard())
	m.Register(r)
	ctx, cancel := context.WithCancel(context.Background())
	go m.Start(ctx)

	_ = m.Handle(ctx, put(3))
	wait(t, func() bool { return s.count() == 1 && r.last.Load() == 3 })
	_ = m.Handle(ctx, put(2)) // старая версия — без применения
	_ = m.Handle(ctx, put(3)) // повтор применённой — подтверждение снова
	wait(t, func() bool { return s.count() == 2 })
	if r.calls.Load() != 1 {
		t.Fatalf("лишние применения: %d", r.calls.Load())
	}
	var caps alp.Capabilities
	m.Declare(&caps)
	if *caps.State.Domains["wg"] != 3 {
		t.Fatal("в hello — применённая версия")
	}
	cancel()

	// Рестарт без сервера: снимок применяется из кэша.
	r2 := &fakeReconciler{}
	m2 := New(dir, &sink{}, logx.Discard())
	m2.Register(r2)
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	go m2.Start(ctx2)
	wait(t, func() bool { return r2.last.Load() == 3 })
}

func TestFailureReportsError(t *testing.T) {
	r := &fakeReconciler{}
	r.fail.Store(true)
	s := &sink{}
	m := New(t.TempDir(), s, logx.Discard())
	m.Register(r)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go m.Start(ctx)
	_ = m.Handle(ctx, put(1))
	wait(t, func() bool { return s.count() == 1 })
	if s.got[0].OK || s.got[0].Error == "" {
		t.Fatalf("ошибка применения: %+v", s.got[0])
	}
}
