package stream

import (
	"testing"

	"restapi/agent/kit/alp"
)

func TestSeqAckAndOverflow(t *testing.T) {
	b := New(3)
	for range 5 {
		b.Add(alp.Envelope{Type: alp.TypeStatus})
	}
	un := b.Unacked()
	if len(un) != 3 || un[0].Seq != 3 || un[2].Seq != 5 || b.Dropped() != 2 {
		t.Fatalf("переполнение: %+v dropped=%d", un, b.Dropped())
	}
	b.Ack(4)
	if un := b.Unacked(); len(un) != 1 || un[0].Seq != 5 {
		t.Fatalf("после ack: %+v", un)
	}
	if env := b.Add(alp.Envelope{}); env.Seq != 6 {
		t.Fatalf("нумерация сквозная: %d", env.Seq)
	}
}
