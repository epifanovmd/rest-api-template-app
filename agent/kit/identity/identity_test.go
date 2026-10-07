package identity

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"restapi/agent/kit/alp"
)

func TestStoreRoundTripAndPermissions(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if _, ok, err := s.Load(); ok || err != nil {
		t.Fatalf("пусто: ok=%v err=%v", ok, err)
	}
	want := Credentials{AgentID: "a", Secret: "s"}
	if err := s.Save(want); err != nil {
		t.Fatal(err)
	}
	got, ok, err := s.Load()
	if err != nil || !ok || got != want {
		t.Fatalf("%v %v %v", got, ok, err)
	}
	info, _ := os.Stat(filepath.Join(dir, fileName))
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("права: %v", info.Mode().Perm())
	}
	if want.Authorization() != "Agent a.s" {
		t.Fatal(want.Authorization())
	}
	_ = s.Forget()
	if _, ok, _ := s.Load(); ok {
		t.Fatal("после Forget — пусто")
	}
}

func TestEnroll(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req EnrollRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if r.URL.Path != alp.EnrollPath || req.Token != "good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"agentId":"id-1","secret":"sec"}`))
	}))
	defer srv.Close()

	c, err := Enroll(context.Background(), srv.Client(), srv.URL, EnrollRequest{Token: "good", Name: "n"})
	if err != nil || c.AgentID != "id-1" {
		t.Fatalf("%v %v", c, err)
	}
	if _, err := Enroll(context.Background(), srv.Client(), srv.URL, EnrollRequest{Token: "bad"}); !errors.Is(err, ErrTokenRejected) {
		t.Fatalf("плохой токен: %v", err)
	}
}
