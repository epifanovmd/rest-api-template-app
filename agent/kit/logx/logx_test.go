package logx

import (
	"reflect"
	"testing"
)

func TestRingTail(t *testing.T) {
	r := NewRing(3)
	if got := r.Tail(10); len(got) != 0 {
		t.Fatalf("пустой буфер: %v", got)
	}
	r.Add("a")
	r.Add("b")
	if got := r.Tail(10); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Fatalf("неполный: %v", got)
	}
	r.Add("c")
	r.Add("d")
	if got := r.Tail(10); !reflect.DeepEqual(got, []string{"b", "c", "d"}) {
		t.Fatalf("переполненный: %v", got)
	}
	if got := r.Tail(2); !reflect.DeepEqual(got, []string{"c", "d"}) {
		t.Fatalf("хвост: %v", got)
	}
	_, _ = r.Write([]byte("e\nf\n"))
	if got := r.Tail(2); !reflect.DeepEqual(got, []string{"e", "f"}) {
		t.Fatalf("writer: %v", got)
	}
}
