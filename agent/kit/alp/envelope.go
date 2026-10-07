// Package alp — протокол ALP v1 (Agent Link Protocol): конверт сообщения и
// типы полезной нагрузки. Нормативный документ — protocol/alp/v1/README.md.
package alp

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Protocols — версии протокола, которые знает агент.
var Protocols = []int{1}

// Subprotocol — подпротокол WebSocket.
const Subprotocol = "alp.v1"

// LinkPath — путь канала WebSocket; SyncPath — запасной HTTP sync.
const (
	LinkPath   = "/api/v1/agent-link"
	SyncPath   = "/api/v1/agent-link/sync"
	EnrollPath = "/api/v1/agent-link/enroll"
)

// Коды закрытия WebSocket (§2.1).
const (
	CloseNormal       = 1000
	CloseGoingAway    = 1001
	CloseRestart      = 1012
	CloseProtocol     = 4400
	CloseUnauthorized = 4401
	CloseUnsupported  = 4409
	CloseReplaced     = 4410
	CloseOverloaded   = 4429
)

// Envelope — конверт сообщения (§4).
type Envelope struct {
	Type string          `json:"type"`
	ID   string          `json:"id,omitempty"`
	Re   string          `json:"re,omitempty"`
	Seq  int64           `json:"seq,omitempty"`
	TS   int64           `json:"ts,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

// New — конверт с полезной нагрузкой и временем создания.
func New(typ string, data any) (Envelope, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return Envelope{}, fmt.Errorf("alp: %s: %w", typ, err)
	}
	return Envelope{Type: typ, TS: time.Now().UnixMilli(), Data: raw}, nil
}

// MustNew — New для данных, которые заведомо сериализуются (структуры пакета).
func MustNew(typ string, data any) Envelope {
	env, err := New(typ, data)
	if err != nil {
		panic(err)
	}
	return env
}

// Decode — полезная нагрузка в структуру.
func (e Envelope) Decode(v any) error {
	if len(e.Data) == 0 {
		return json.Unmarshal([]byte("{}"), v)
	}
	if err := json.Unmarshal(e.Data, v); err != nil {
		return fmt.Errorf("alp: %s: %w", e.Type, err)
	}
	return nil
}

// NewID — уникальный id сообщения (128 бит, hex).
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// NewBootID — id запуска процесса: начало нумерации потока.
func NewBootID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
