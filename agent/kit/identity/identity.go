// Package identity — учётные данные агента: регистрация по токену и
// хранение `agentId.secret` в файле с правами 0600.
package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"restapi/agent/kit/alp"
)

const fileName = "credentials.json"

// Credentials — учётные данные агента.
type Credentials struct {
	AgentID string `json:"agentId"`
	Secret  string `json:"secret"`
}

// Authorization — значение заголовка Authorization.
func (c Credentials) Authorization() string {
	return "Agent " + c.AgentID + "." + c.Secret
}

// Store — файл учётных данных в каталоге данных агента.
type Store struct{ path string }

// NewStore — хранилище в каталоге dir.
func NewStore(dir string) *Store { return &Store{path: filepath.Join(dir, fileName)} }

// Load — сохранённые учётные данные; ok=false — агент ещё не зарегистрирован.
func (s *Store) Load() (Credentials, bool, error) {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return Credentials{}, false, nil
	}
	if err != nil {
		return Credentials{}, false, fmt.Errorf("identity: %w", err)
	}
	var c Credentials
	if err := json.Unmarshal(raw, &c); err != nil || c.AgentID == "" || c.Secret == "" {
		return Credentials{}, false, fmt.Errorf("identity: файл %s повреждён", s.path)
	}
	return c, true, nil
}

// Save — записать атомарно с правами 0600.
func (s *Store) Save(c Credentials) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("identity: %w", err)
	}
	raw, _ := json.Marshal(c)
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("identity: %w", err)
	}
	return os.Rename(tmp, s.path)
}

// Forget — удалить (учётные данные отозваны).
func (s *Store) Forget() error {
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("identity: %w", err)
	}
	return nil
}

// EnrollRequest — тело регистрации.
type EnrollRequest struct {
	Token  string            `json:"token"`
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels,omitempty"`
	Host   *EnrollHost       `json:"host,omitempty"`
}

type EnrollHost struct {
	Hostname string `json:"hostname,omitempty"`
	OS       string `json:"os,omitempty"`
	Arch     string `json:"arch,omitempty"`
}

// ErrTokenRejected — токен регистрации не принят: повтор не поможет.
var ErrTokenRejected = errors.New("identity: токен регистрации отклонён")

// Enroll — обменять токен регистрации на учётные данные.
func Enroll(ctx context.Context, client *http.Client, baseURL string, req EnrollRequest) (Credentials, error) {
	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+alp.EnrollPath, bytes.NewReader(body))
	if err != nil {
		return Credentials{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(httpReq)
	if err != nil {
		return Credentials{}, fmt.Errorf("identity: регистрация: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	switch {
	case resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK:
		var c Credentials
		if err := json.Unmarshal(raw, &c); err != nil || c.AgentID == "" || c.Secret == "" {
			return Credentials{}, fmt.Errorf("identity: неожиданный ответ регистрации: %s", raw)
		}
		return c, nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusBadRequest:
		return Credentials{}, fmt.Errorf("%w: %s", ErrTokenRejected, raw)
	default:
		return Credentials{}, fmt.Errorf("identity: регистрация: HTTP %d: %s", resp.StatusCode, raw)
	}
}
