package link

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"restapi/agent/kit/alp"
	"restapi/agent/kit/backoff"
	"restapi/agent/kit/logx"
	"restapi/agent/kit/outbox"
	"restapi/agent/kit/stream"
)

// fakeServer — минимальный сервер ALP: принимает WebSocket, отвечает welcome,
// подтверждает потоковые и надёжные сообщения, отвечает на job.urls.
type fakeServer struct {
	t       *testing.T
	srv     *httptest.Server
	auth    atomic.Value
	mu      sync.Mutex
	got     []alp.Envelope
	conns   atomic.Int32
	noAck   atomic.Bool
	closeWS chan int
}

func newFakeServer(t *testing.T) *fakeServer {
	f := &fakeServer{t: t, closeWS: make(chan int, 1)}
	f.auth.Store("Agent a.s")
	f.srv = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeServer) serve(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != f.auth.Load().(string) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{alp.Subprotocol}})
	if err != nil {
		return
	}
	f.conns.Add(1)
	ctx := r.Context()
	send := func(env alp.Envelope) {
		raw, _ := json.Marshal(env)
		_ = c.Write(ctx, websocket.MessageText, raw)
	}
	go func() {
		select {
		case code := <-f.closeWS:
			_ = c.Close(websocket.StatusCode(code), "test")
		case <-ctx.Done():
		}
	}()
	for {
		_, raw, err := c.Read(ctx)
		if err != nil {
			return
		}
		var env alp.Envelope
		_ = json.Unmarshal(raw, &env)
		f.mu.Lock()
		f.got = append(f.got, env)
		f.mu.Unlock()
		switch {
		case env.Type == alp.TypeHello:
			send(alp.MustNew(alp.TypeWelcome, alp.Welcome{Protocol: 1, AgentID: "a", SessionID: "s"}))
		case env.Type == alp.TypeJobURLs:
			reply := alp.MustNew(alp.TypeJobURLs, alp.JobURLs{ExpiresAt: 42})
			reply.Re = env.ID
			send(reply)
		case f.noAck.Load():
		case env.Seq > 0:
			send(alp.MustNew(alp.TypeAck, alp.Ack{Seq: env.Seq}))
		case env.ID != "":
			send(alp.MustNew(alp.TypeAck, alp.Ack{IDs: []string{env.ID}}))
		}
	}
}

func (f *fakeServer) received(typ string) []alp.Envelope {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []alp.Envelope
	for _, env := range f.got {
		if env.Type == typ {
			out = append(out, env)
		}
	}
	return out
}

type testHandler struct {
	welcomes atomic.Int32
}

func (h *testHandler) Hello() alp.Hello {
	return alp.Hello{Protocols: alp.Protocols, Agent: alp.HelloAgent{Name: "t", Version: "1", BootID: "b"}, Jobs: []alp.JobRef{}}
}
func (h *testHandler) OnWelcome(alp.Welcome)  { h.welcomes.Add(1) }
func (h *testHandler) OnMessage(alp.Envelope) {}
func (h *testHandler) OnDisconnect(error)     {}

type testAuth struct {
	value   atomic.Value
	renewed atomic.Int32
	next    string
}

func (a *testAuth) Authorization() string { return a.value.Load().(string) }
func (a *testAuth) Renew(context.Context) error {
	a.renewed.Add(1)
	a.value.Store(a.next)
	return nil
}

func newLink(t *testing.T, f *fakeServer, auth *testAuth, transport string) (*Link, *testHandler, *outbox.Outbox, *stream.Buffer) {
	ob, err := outbox.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if auth == nil {
		auth = &testAuth{}
		auth.value.Store("Agent a.s")
	}
	buf := stream.New(100)
	h := &testHandler{}
	l := New(Options{
		ServerURL: f.srv.URL,
		Transport: transport,
		Auth:      auth,
		Outbox:    ob,
		Stream:    buf,
		Log:       logx.Discard(),
		Backoff:   backoff.Policy{Min: 10 * time.Millisecond, Max: 50 * time.Millisecond},
	}, h)
	return l, h, ob, buf
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("не дождались: %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestHandshakeAcksAndRequest(t *testing.T) {
	f := newFakeServer(t)
	l, h, ob, buf := newLink(t, f, nil, "ws")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go l.Run(ctx)

	eventually(t, "welcome", func() bool { return h.welcomes.Load() == 1 && l.Connected() })
	if l.Mode() != "ws" {
		t.Fatalf("mode %q", l.Mode())
	}

	l.Stream(alp.TypeStatus, alp.Status{State: alp.StateIdle})
	if err := l.Reliable(alp.TypeJobComplete, alp.JobComplete{}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "ack потока и outbox", func() bool { return len(buf.Unacked()) == 0 && ob.Len() == 0 })

	var urls alp.JobURLs
	if err := l.Request(ctx, alp.TypeJobURLs, alp.JobURLsRequest{}, &urls); err != nil || urls.ExpiresAt != 42 {
		t.Fatalf("запрос: %v %+v", err, urls)
	}
}

func TestResendAfterReconnect(t *testing.T) {
	f := newFakeServer(t)
	f.noAck.Store(true)
	l, h, ob, _ := newLink(t, f, nil, "ws")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go l.Run(ctx)
	eventually(t, "welcome", func() bool { return h.welcomes.Load() == 1 })

	l.Stream(alp.TypeStatus, alp.Status{State: alp.StateBusy})
	_ = l.Reliable(alp.TypeJobFail, alp.JobFail{Code: "X"})
	eventually(t, "отправлено", func() bool { return len(f.received(alp.TypeJobFail)) == 1 })

	f.noAck.Store(false)
	f.closeWS <- alp.CloseRestart
	eventually(t, "переподключение", func() bool { return h.welcomes.Load() == 2 })
	eventually(t, "досылка", func() bool {
		return len(f.received(alp.TypeJobFail)) == 2 && len(f.received(alp.TypeStatus)) == 2 && ob.Len() == 0
	})
	statuses := f.received(alp.TypeStatus)
	if statuses[0].Seq != statuses[1].Seq {
		t.Fatalf("досылка с тем же seq: %d != %d", statuses[0].Seq, statuses[1].Seq)
	}
}

func TestUnauthorizedRenews(t *testing.T) {
	f := newFakeServer(t)
	f.auth.Store("Agent new.s")
	auth := &testAuth{next: "Agent new.s"}
	auth.value.Store("Agent old.s")
	l, h, _, _ := newLink(t, f, auth, "ws")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go l.Run(ctx)
	eventually(t, "сессия с новыми учётными данными", func() bool { return h.welcomes.Load() == 1 })
	if auth.renewed.Load() != 1 {
		t.Fatalf("renew: %d", auth.renewed.Load())
	}
}

func TestFallbackStatus(t *testing.T) {
	for status, want := range map[int]bool{404: true, 400: true, 426: true, 401: false, 403: false, 429: false, 502: false, 101: false} {
		if got := fallbackStatus(status); got != want {
			t.Errorf("%d: %v", status, got)
		}
	}
}

// fakeSyncServer — HTTP sync: hello → welcome, ack всего присланного.
func TestHTTPSync(t *testing.T) {
	var mu sync.Mutex
	var got []alp.Envelope
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req syncRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		mu.Lock()
		got = append(got, req.Messages...)
		mu.Unlock()
		var out []alp.Envelope
		var ack alp.Ack
		for _, env := range req.Messages {
			switch {
			case env.Type == alp.TypeHello:
				out = append(out, alp.MustNew(alp.TypeWelcome, alp.Welcome{Protocol: 1, SessionID: "s"}))
			case env.Seq > 0:
				ack.Seq = env.Seq
			case env.ID != "":
				ack.IDs = append(ack.IDs, env.ID)
			}
		}
		if ack.Seq > 0 || len(ack.IDs) > 0 {
			out = append(out, alp.MustNew(alp.TypeAck, ack))
		}
		if len(req.Messages) == 0 && req.WaitSeconds > 0 {
			select {
			case <-r.Context().Done():
				return
			case <-time.After(200 * time.Millisecond):
			}
		}
		_ = json.NewEncoder(w).Encode(syncResponse{SessionID: "s", Messages: out})
	}))
	defer srv.Close()

	f := &fakeServer{srv: srv}
	l, h, ob, buf := newLink(t, f, nil, "http")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go l.Run(ctx)
	eventually(t, "welcome по HTTP", func() bool { return h.welcomes.Load() == 1 && l.Mode() == "http" })

	l.Stream(alp.TypeStatus, alp.Status{State: alp.StateIdle})
	_ = l.Reliable(alp.TypeCmdDone, alp.CommandDone{OK: true})
	eventually(t, "ack по HTTP", func() bool { return len(buf.Unacked()) == 0 && ob.Len() == 0 })
}
