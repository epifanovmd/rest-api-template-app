package runtime

import (
	"context"
	"testing"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/logx"
)

type fakeCap struct {
	slots    map[string]int
	jobs     []alp.StatusJob
	degraded bool
	accept   bool
	handled  []string
}

func (f *fakeCap) Declare(caps *alp.Capabilities) {
	caps.Jobs = &alp.JobsCapability{Queues: []alp.QueueCapacity{{Name: "q", Concurrency: 1}}}
}
func (f *fakeCap) Handles() []string { return []string{alp.TypeJobAssign} }
func (f *fakeCap) Handle(_ context.Context, env alp.Envelope) error {
	f.handled = append(f.handled, env.Type)
	return nil
}
func (f *fakeCap) ContributeStatus(st *alp.Status) {
	for q, n := range f.slots {
		st.Slots[q] = n
	}
	st.Jobs = append(st.Jobs, f.jobs...)
	if f.degraded {
		st.State = alp.StateDegraded
	}
}
func (f *fakeCap) RunningJobs() []alp.JobRef { return []alp.JobRef{{JobID: "j", Attempt: 1}} }
func (f *fakeCap) SetAccepting(a bool)       { f.accept = a }

func TestStatusStatesAndHello(t *testing.T) {
	rt := New(Info{Name: "n", Version: "v", Labels: map[string]string{"a": "b"}}, logx.Discard())
	c := &fakeCap{slots: map[string]int{"q": 2}}
	rt.Register(c)
	rt.SetOutbox(func() int { return 3 })

	if st := rt.Status(); st.State != alp.StateIdle || st.Slots["q"] != 2 || st.Outbox != 3 {
		t.Fatalf("idle: %+v", st)
	}
	c.jobs = []alp.StatusJob{{JobID: "j"}}
	if st := rt.Status(); st.State != alp.StateBusy {
		t.Fatalf("busy: %+v", st)
	}
	c.degraded = true
	if st := rt.Status(); st.State != alp.StateDegraded {
		t.Fatalf("degraded: %+v", st)
	}
	rt.Drain()
	if st := rt.Status(); st.State != alp.StateDraining || st.Slots["q"] != 0 || c.accept {
		t.Fatalf("drain: %+v accept=%v", st, c.accept)
	}
	rt.Resume()
	rt.SetUpdating(true)
	if st := rt.Status(); st.State != alp.StateUpdating || !c.accept {
		t.Fatalf("updating: %+v", st)
	}

	h := rt.Hello()
	if h.Agent.BootID == "" || h.Capabilities.Jobs == nil || len(h.Jobs) != 1 || h.Labels["a"] != "b" || h.Protocols[0] != 1 {
		t.Fatalf("hello: %+v", h)
	}
}

func TestConfigFromWelcomeAndMessage(t *testing.T) {
	rt := New(Info{}, logx.Discard())
	rt.OnWelcome(alp.Welcome{Config: alp.SessionConfig{StatusIntervalMs: 1000, MetricsIntervalMs: 2000}})
	status, metrics := rt.intervals()
	if status.Milliseconds() != 1000 || metrics.Milliseconds() != 2000 {
		t.Fatalf("welcome.config: %v %v", status, metrics)
	}
	rt.applyConfig(alp.SessionConfig{MetricsIntervalMs: 500})
	status, metrics = rt.intervals()
	if status.Milliseconds() != 1000 || metrics.Milliseconds() != 500 {
		t.Fatalf("частичный config: %v %v", status, metrics)
	}
}
