// Package commands — возможность `commands`: белый список команд агента.
// Команда принимается (cmd.accept), её вывод уходит потоком (cmd.output),
// итог — надёжно (cmd.done). Повторная доставка той же команды не выполняется.
package commands

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sort"
	"sync"
	"time"

	"restapi/agent/kit/alp"
)

// Sender — канал к серверу.
type Sender interface {
	Stream(typ string, data any)
	Reliable(typ string, data any) error
}

// Handler — команда: аргументы, вывод (уходит на сервер по мере записи),
// результат или ошибка.
type Handler func(ctx context.Context, args json.RawMessage, out io.Writer) (any, error)

// Error — ошибка команды с кодом.
type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// Errorf — ошибка команды с кодом.
func Errorf(code, format string, args ...any) *Error {
	return &Error{Code: code, Message: fmt.Sprintf(format, args...)}
}

// seenTTL — сколько помнить выполненные команды (дедупликация повторной доставки).
const seenTTL = time.Hour

// outputFlush — вывод копится и уходит кусками не реже этого интервала.
const outputFlush = 250 * time.Millisecond

const chunkMax = 64 * 1024

// Registry — команды агента.
type Registry struct {
	sender   Sender
	log      *slog.Logger
	mu       sync.Mutex
	handlers map[string]Handler
	seen     map[string]time.Time
}

// New — пустой реестр.
func New(sender Sender, log *slog.Logger) *Registry {
	return &Registry{sender: sender, log: log, handlers: map[string]Handler{}, seen: map[string]time.Time{}}
}

// Register — добавить команду.
func (r *Registry) Register(name string, h Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[name] = h
}

func (r *Registry) Declare(caps *alp.Capabilities) {
	r.mu.Lock()
	defer r.mu.Unlock()
	names := make([]string, 0, len(r.handlers))
	for name := range r.handlers {
		names = append(names, name)
	}
	sort.Strings(names)
	caps.Commands = &alp.CommandsCapability{Names: names}
}

func (r *Registry) Handles() []string { return []string{alp.TypeCmdRun} }

func (r *Registry) Handle(_ context.Context, env alp.Envelope) error {
	var run alp.CommandRun
	if err := env.Decode(&run); err != nil {
		return err
	}
	r.mu.Lock()
	now := time.Now()
	for id, at := range r.seen {
		if now.Sub(at) > seenTTL {
			delete(r.seen, id)
		}
	}
	if _, dup := r.seen[run.CommandID]; dup {
		r.mu.Unlock()
		return nil
	}
	r.seen[run.CommandID] = now
	h := r.handlers[run.Name]
	r.mu.Unlock()

	r.sender.Stream(alp.TypeCmdAccept, alp.CommandRef{CommandID: run.CommandID})
	go r.execute(run, h)
	return nil
}

func (r *Registry) execute(run alp.CommandRun, h Handler) {
	timeout := time.Duration(run.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	out := newOutput(r.sender, run.CommandID)
	var result any
	var err error
	if h == nil {
		err = Errorf("COMMAND_UNKNOWN", "Команда %s не поддерживается", run.Name)
	} else {
		result, err = safe(ctx, h, run.Args, out)
	}
	out.Close()

	done := alp.CommandDone{CommandID: run.CommandID, OK: err == nil}
	if err != nil {
		var ce *Error
		switch {
		case errors.As(err, &ce):
			done.Error = &alp.CommandError{Code: ce.Code, Message: ce.Message}
		case errors.Is(err, context.DeadlineExceeded):
			done.Error = &alp.CommandError{Code: "TIMEOUT", Message: "Команда не уложилась в таймаут"}
		default:
			done.Error = &alp.CommandError{Code: "COMMAND_FAILED", Message: err.Error()}
		}
		r.log.Warn("команда завершилась ошибкой", "name", run.Name, "err", err)
	} else if result != nil {
		done.Result, _ = json.Marshal(result)
	}
	if err := r.sender.Reliable(alp.TypeCmdDone, done); err != nil {
		r.log.Error("итог команды не записан", "err", err)
	}
}

func safe(ctx context.Context, h Handler, args json.RawMessage, out io.Writer) (result any, err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("паника команды: %v", p)
		}
	}()
	return h(ctx, args, out)
}

// output — вывод команды кусками в cmd.output.
type output struct {
	sender Sender
	id     string
	mu     sync.Mutex
	buf    []byte
	timer  *time.Timer
	closed bool
}

func newOutput(sender Sender, id string) *output { return &output{sender: sender, id: id} }

func (o *output) Write(p []byte) (int, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.closed {
		return 0, io.ErrClosedPipe
	}
	o.buf = append(o.buf, p...)
	for len(o.buf) >= chunkMax {
		o.flushLocked(chunkMax)
	}
	if len(o.buf) > 0 && o.timer == nil {
		o.timer = time.AfterFunc(outputFlush, func() {
			o.mu.Lock()
			defer o.mu.Unlock()
			o.timer = nil
			o.flushLocked(len(o.buf))
		})
	}
	return len(p), nil
}

func (o *output) flushLocked(n int) {
	if n == 0 {
		return
	}
	chunk := string(o.buf[:n])
	o.buf = o.buf[n:]
	o.sender.Stream(alp.TypeCmdOutput, alp.CommandOutput{CommandID: o.id, Chunk: chunk})
}

// Close — дослать остаток до итога.
func (o *output) Close() {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.timer != nil {
		o.timer.Stop()
		o.timer = nil
	}
	o.flushLocked(len(o.buf))
	o.closed = true
}
