package link

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"

	"restapi/agent/kit/alp"
)

// syncWaitSeconds — long-poll сервера, когда отправлять нечего (прокси рвут дольше 30 с).
const syncWaitSeconds = 25

type syncRequest struct {
	SessionID   *string        `json:"sessionId"`
	Messages    []alp.Envelope `json:"messages"`
	WaitSeconds int            `json:"waitSeconds"`
}

type syncResponse struct {
	SessionID string         `json:"sessionId"`
	Messages  []alp.Envelope `json:"messages"`
}

type syncError struct {
	Code string `json:"code"`
}

// syncConn — запасной транспорт: пачки конвертов через POST с long-poll.
// Исходящее копится и уходит следующим запросом; новое исходящее прерывает
// ожидание. Любой сбой обмена завершает сессию: link переподключится и
// дошлёт неподтверждённое.
type syncConn struct {
	client *http.Client
	url    string
	auth   string

	mu        sync.Mutex
	sessionID *string
	queue     []alp.Envelope
	kick      chan struct{}
	waiting   context.CancelFunc

	in     chan alp.Envelope
	done   chan struct{}
	err    error
	cancel context.CancelFunc
}

func dialSync(ctx context.Context, client *http.Client, serverURL, auth string) (conn, error) {
	loopCtx, cancel := context.WithCancel(context.Background())
	c := &syncConn{
		client: client,
		url:    strings.TrimRight(serverURL, "/") + alp.SyncPath,
		auth:   auth,
		kick:   make(chan struct{}, 1),
		in:     make(chan alp.Envelope, 1024),
		done:   make(chan struct{}),
		cancel: cancel,
	}
	go c.loop(loopCtx)
	return c, nil
}

func (c *syncConn) Mode() string { return "http" }

func (c *syncConn) Send(_ context.Context, env alp.Envelope) error {
	c.mu.Lock()
	c.queue = append(c.queue, env)
	if c.waiting != nil {
		c.waiting()
	}
	c.mu.Unlock()
	select {
	case c.kick <- struct{}{}:
	default:
	}
	return nil
}

func (c *syncConn) Recv(ctx context.Context) (alp.Envelope, error) {
	select {
	case env := <-c.in:
		return env, nil
	case <-c.done:
		select {
		case env := <-c.in:
			return env, nil
		default:
		}
		return alp.Envelope{}, c.err
	case <-ctx.Done():
		return alp.Envelope{}, ctx.Err()
	}
}

// Ping — обмен идёт запросами: их неудача и есть потеря связи.
func (c *syncConn) Ping(context.Context) error { return nil }

func (c *syncConn) Close(int, string) { c.cancel() }

func (c *syncConn) loop(ctx context.Context) {
	defer close(c.done)
	for {
		if ctx.Err() != nil {
			c.err = &CloseError{Code: alp.CloseNormal}
			return
		}
		c.mu.Lock()
		messages := c.queue
		c.queue = nil
		wait := 0
		reqCtx, cancel := context.WithCancel(ctx)
		if len(messages) == 0 {
			wait = syncWaitSeconds
			c.waiting = cancel
		}
		session := c.sessionID
		c.mu.Unlock()

		resp, err := c.exchange(reqCtx, syncRequest{SessionID: session, Messages: append([]alp.Envelope{}, messages...), WaitSeconds: wait})
		c.mu.Lock()
		c.waiting = nil
		c.mu.Unlock()
		cancel()

		if err != nil {
			// Прерванное ожидание (есть что отправить) — не сбой, если ничего не отправляли.
			if errors.Is(err, context.Canceled) && len(messages) == 0 && ctx.Err() == nil {
				continue
			}
			c.err = err
			return
		}
		c.mu.Lock()
		c.sessionID = &resp.SessionID
		c.mu.Unlock()
		for _, env := range resp.Messages {
			select {
			case c.in <- env:
			case <-ctx.Done():
				return
			}
		}
	}
}

func (c *syncConn) exchange(ctx context.Context, body syncRequest) (syncResponse, error) {
	if body.Messages == nil {
		body.Messages = []alp.Envelope{}
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(raw))
	if err != nil {
		return syncResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.auth)
	resp, err := c.client.Do(req)
	if err != nil {
		return syncResponse{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, readLimit))
	switch {
	case resp.StatusCode == http.StatusOK:
		var out syncResponse
		if err := json.Unmarshal(data, &out); err != nil {
			return syncResponse{}, err
		}
		return out, nil
	case resp.StatusCode == http.StatusUnauthorized:
		return syncResponse{}, &CloseError{Code: alp.CloseUnauthorized, Reason: "unauthorized"}
	case resp.StatusCode == http.StatusConflict:
		var e syncError
		_ = json.Unmarshal(data, &e)
		switch e.Code {
		case "AGENT_PROTOCOL_UNSUPPORTED":
			return syncResponse{}, &CloseError{Code: alp.CloseUnsupported, Reason: e.Code}
		case "AGENT_SESSION_REPLACED":
			return syncResponse{}, &CloseError{Code: alp.CloseReplaced, Reason: e.Code}
		}
		// Сессия истекла (сервер её забыл) — сразу новая с hello.
		return syncResponse{}, &CloseError{Code: alp.CloseRestart, Reason: e.Code}
	default:
		return syncResponse{}, &DialError{Status: resp.StatusCode, Err: errors.New(strings.TrimSpace(string(data)))}
	}
}
