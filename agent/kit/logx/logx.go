// Package logx — структурированный лог агента (slog) и кольцевой буфер
// последних строк для команды agent.logs.
package logx

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"sync"
)

// Ring — последние строки лога (агента и нагрузок).
type Ring struct {
	mu    sync.Mutex
	lines []string
	next  int
	full  bool
}

// NewRing — буфер на size строк.
func NewRing(size int) *Ring { return &Ring{lines: make([]string, size)} }

// Add — дописать строку.
func (r *Ring) Add(line string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lines[r.next] = line
	r.next = (r.next + 1) % len(r.lines)
	if r.next == 0 {
		r.full = true
	}
}

// Tail — последние n строк (не больше размера буфера), старые первыми.
func (r *Ring) Tail(n int) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	size := r.next
	if r.full {
		size = len(r.lines)
	}
	if n <= 0 || n > size {
		n = size
	}
	out := make([]string, 0, n)
	for i := size - n; i < size; i++ {
		idx := i
		if r.full {
			idx = (r.next + i) % len(r.lines)
		}
		out = append(out, r.lines[idx])
	}
	return out
}

// Write — io.Writer поверх буфера: каждая строка — запись.
func (r *Ring) Write(p []byte) (int, error) {
	for _, line := range strings.Split(strings.TrimRight(string(p), "\n"), "\n") {
		if line != "" {
			r.Add(line)
		}
	}
	return len(p), nil
}

// Options — формат и уровень.
type Options struct {
	Level  string // debug | info | warn | error
	Format string // text | json
}

// New — логгер, пишущий в out и в кольцевой буфер.
func New(out io.Writer, ring *Ring, opts Options) *slog.Logger {
	level := new(slog.LevelVar)
	level.Set(ParseLevel(opts.Level))
	handlerOpts := &slog.HandlerOptions{Level: level}
	w := io.MultiWriter(out, ring)
	var h slog.Handler
	if opts.Format == "json" {
		h = slog.NewJSONHandler(w, handlerOpts)
	} else {
		h = slog.NewTextHandler(w, handlerOpts)
	}
	return slog.New(h)
}

// ParseLevel — уровень по имени; неизвестное — info.
func ParseLevel(name string) slog.Level {
	switch strings.ToLower(name) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Discard — логгер в никуда (тесты).
func Discard() *slog.Logger { return slog.New(discardHandler{}) }

type discardHandler struct{}

func (discardHandler) Enabled(context.Context, slog.Level) bool  { return false }
func (discardHandler) Handle(context.Context, slog.Record) error { return nil }
func (h discardHandler) WithAttrs([]slog.Attr) slog.Handler      { return h }
func (h discardHandler) WithGroup(string) slog.Handler           { return h }
