package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/logx"
)

type rec struct {
	mu   sync.Mutex
	msgs []alp.Envelope
}

func (r *rec) Stream(typ string, data any) { r.add(typ, data) }
func (r *rec) Reliable(typ string, data any) error {
	r.add(typ, data)
	return nil
}
func (r *rec) add(typ string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.msgs = append(r.msgs, alp.MustNew(typ, data))
}
func (r *rec) all(typ string) []alp.Envelope {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []alp.Envelope
	for _, m := range r.msgs {
		if m.Type == typ {
			out = append(out, m)
		}
	}
	return out
}

func run(id, name string, args string) alp.Envelope {
	return alp.MustNew(alp.TypeCmdRun, alp.CommandRun{CommandID: id, Name: name, Args: json.RawMessage(args), TimeoutSec: 5})
}

func waitDone(t *testing.T, r *rec, n int) []alp.Envelope {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for len(r.all(alp.TypeCmdDone)) < n {
		if time.Now().After(deadline) {
			t.Fatal("нет cmd.done")
		}
		time.Sleep(5 * time.Millisecond)
	}
	return r.all(alp.TypeCmdDone)
}

func TestRunOutputDoneAndDedup(t *testing.T) {
	r := &rec{}
	reg := New(r, logx.Discard())
	reg.Register("echo", func(_ context.Context, args json.RawMessage, out io.Writer) (any, error) {
		fmt.Fprintln(out, "строка")
		return map[string]string{"args": string(args)}, nil
	})
	reg.Register("boom", func(context.Context, json.RawMessage, io.Writer) (any, error) {
		return nil, Errorf("BAD", "плохо")
	})
	var caps alp.Capabilities
	reg.Declare(&caps)
	if fmt.Sprint(caps.Commands.Names) != "[boom echo]" {
		t.Fatalf("белый список: %v", caps.Commands.Names)
	}

	_ = reg.Handle(context.Background(), run("c1", "echo", `{"x":1}`))
	_ = reg.Handle(context.Background(), run("c1", "echo", `{"x":1}`)) // повтор доставки
	_ = reg.Handle(context.Background(), run("c2", "boom", `{}`))
	_ = reg.Handle(context.Background(), run("c3", "nope", `{}`))

	dones := waitDone(t, r, 3)
	time.Sleep(50 * time.Millisecond)
	if len(r.all(alp.TypeCmdDone)) != 3 || len(r.all(alp.TypeCmdAccept)) != 3 {
		t.Fatal("повторная доставка выполнилась")
	}
	byID := map[string]alp.CommandDone{}
	for _, env := range dones {
		var d alp.CommandDone
		_ = env.Decode(&d)
		byID[d.CommandID] = d
	}
	if !byID["c1"].OK || byID["c2"].Error.Code != "BAD" || byID["c3"].Error.Code != "COMMAND_UNKNOWN" {
		t.Fatalf("итоги: %+v", byID)
	}
	var out alp.CommandOutput
	_ = r.all(alp.TypeCmdOutput)[0].Decode(&out)
	if out.Chunk != "строка\n" {
		t.Fatalf("вывод: %q", out.Chunk)
	}
}
