package telemetry

import (
	"context"
	"testing"

	"restapi/agent/kit/logx"
)

func TestParseNvidiaSMI(t *testing.T) {
	gpus := ParseNvidiaSMI([]byte("0, NVIDIA GeForce RTX 4090, 97, 20000, 24564, 71\n1, A100, [N/A], 1, 2, 40\nmusor\n"))
	if len(gpus) != 2 || gpus[0].Name != "NVIDIA GeForce RTX 4090" || *gpus[0].UtilPercent != 97 || *gpus[0].MemUsedBytes != 20000<<20 || *gpus[0].TemperatureC != 71 {
		t.Fatalf("%+v", gpus)
	}
	if gpus[1].UtilPercent != nil {
		t.Fatal("[N/A] — пропуск")
	}
}

func TestCollectHost(t *testing.T) {
	c := New(t.TempDir(), false, logx.Discard())
	m := c.Collect(context.Background())
	if m.Host == nil || m.Host.MemTotalBytes == nil || *m.Host.MemTotalBytes == 0 || m.CollectedAt == 0 {
		t.Fatalf("метрики хоста: %+v", m.Host)
	}
	if h := HostInfo(context.Background()); h.OS == "" || h.CPUs == 0 {
		t.Fatalf("хост: %+v", h)
	}
}
