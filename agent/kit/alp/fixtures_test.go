package alp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// fixturesDir — эталонные сообщения протокола (protocol/alp/v1/fixtures).
func fixturesDir(t *testing.T) string {
	if dir := os.Getenv("ALP_FIXTURES"); dir != "" {
		return dir
	}
	dir, err := filepath.Abs("../../../protocol/alp/v1/fixtures")
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

var agentToServer = map[string]func() any{
	TypeHello:        func() any { return &Hello{} },
	TypeStatus:       func() any { return &Status{} },
	TypeMetrics:      func() any { return &Metrics{} },
	TypeJobAccept:    func() any { return &JobRef{} },
	TypeJobReject:    func() any { return &JobReject{} },
	TypeJobProgress:  func() any { return &JobProgress{} },
	TypeJobEvent:     func() any { return &JobEvent{} },
	TypeJobURLs:      func() any { return &JobURLsRequest{} },
	TypeJobComplete:  func() any { return &JobComplete{} },
	TypeJobFail:      func() any { return &JobFail{} },
	TypeCmdAccept:    func() any { return &CommandRef{} },
	TypeCmdOutput:    func() any { return &CommandOutput{} },
	TypeCmdDone:      func() any { return &CommandDone{} },
	TypeStateApplied: func() any { return &StateApplied{} },
}

var serverToAgent = map[string]func() any{
	TypeWelcome:   func() any { return &Welcome{} },
	TypeConfig:    func() any { return &SessionConfig{} },
	TypeAck:       func() any { return &Ack{} },
	TypeError:     func() any { return &Error{} },
	TypeJobAssign: func() any { return &JobAssign{} },
	TypeJobURLs:   func() any { return &JobURLs{} },
	TypeJobCancel: func() any { return &JobRef{} },
	TypeJobStop:   func() any { return &JobRef{} },
	TypeCmdRun:    func() any { return &CommandRun{} },
	TypeStatePut:  func() any { return &StatePut{} },
}

func normalize(t *testing.T, raw []byte) any {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// Каждый эталон разбирается в структуру своего типа и сериализуется обратно
// без потери и искажения полей: Go-контракт совпадает со спецификацией.
func TestFixturesRoundTrip(t *testing.T) {
	for dir, types := range map[string]map[string]func() any{
		"a2s": agentToServer,
		"s2a": serverToAgent,
	} {
		files, err := filepath.Glob(filepath.Join(fixturesDir(t), dir, "*.json"))
		if err != nil || len(files) == 0 {
			t.Fatalf("нет эталонов %s: %v", dir, err)
		}
		seen := map[string]bool{}
		for _, file := range files {
			name := dir + "/" + filepath.Base(file)
			t.Run(name, func(t *testing.T) {
				raw, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				var env Envelope
				if err := json.Unmarshal(raw, &env); err != nil {
					t.Fatal(err)
				}
				factory, ok := types[env.Type]
				if !ok {
					t.Fatalf("тип %s не описан в Go", env.Type)
				}
				seen[env.Type] = true
				payload := factory()
				if err := env.Decode(payload); err != nil {
					t.Fatal(err)
				}
				again, err := json.Marshal(payload)
				if err != nil {
					t.Fatal(err)
				}
				if want, got := normalize(t, env.Data), normalize(t, again); !reflect.DeepEqual(want, got) {
					t.Fatalf("поля потеряны или искажены:\nэталон: %s\nGo:     %s", env.Data, again)
				}
				// Конверт тоже сериализуется без потерь.
				envAgain, _ := json.Marshal(env)
				if !reflect.DeepEqual(normalize(t, raw), normalize(t, envAgain)) {
					t.Fatalf("конверт искажён: %s", envAgain)
				}
			})
		}
		for typ := range types {
			if !seen[typ] && !strings.HasPrefix(typ, "_") {
				t.Errorf("нет эталона %s/%s", dir, typ)
			}
		}
	}
}
