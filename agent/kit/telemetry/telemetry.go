// Package telemetry — сведения о хосте для hello и метрики для metrics:
// CPU, нагрузка, память, диск, сеть, аптайм, GPU (nvidia-smi).
package telemetry

import (
	"bufio"
	"bytes"
	"context"
	"log/slog"
	"os/exec"
	goruntime "runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"

	"restapi/agent/kit/alp"
)

// HostInfo — сведения о хосте для hello.
func HostInfo(ctx context.Context) alp.Host {
	h := alp.Host{OS: goruntime.GOOS, Arch: goruntime.GOARCH, CPUs: goruntime.NumCPU()}
	if info, err := host.InfoWithContext(ctx); err == nil {
		h.Hostname = info.Hostname
		h.Platform = strings.TrimSpace(info.Platform + " " + info.PlatformVersion)
		h.Kernel = info.KernelVersion
	}
	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		h.MemoryBytes = vm.Total
	}
	return h
}

// Collector — метрики хоста и GPU.
type Collector struct {
	diskPath string
	gpu      bool
	log      *slog.Logger

	mu     sync.Mutex
	prevRx uint64
	prevTx uint64
	prevAt time.Time
}

// New — сборщик: diskPath — раздел для метрик диска (каталог данных),
// gpu — опрашивать nvidia-smi (если есть в PATH).
func New(diskPath string, gpu bool, log *slog.Logger) *Collector {
	if gpu {
		if _, err := exec.LookPath("nvidia-smi"); err != nil {
			gpu = false
		}
	}
	return &Collector{diskPath: diskPath, gpu: gpu, log: log}
}

// Channels — каналы телеметрии для hello.
func (c *Collector) Channels() []string {
	if c.gpu {
		return []string{"host", "gpu"}
	}
	return []string{"host"}
}

// Collect — снимок метрик; недоступные значения пропускаются.
func (c *Collector) Collect(ctx context.Context) alp.Metrics {
	m := alp.Metrics{CollectedAt: time.Now().UnixMilli(), Host: &alp.HostMetrics{}}
	if pct, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(pct) > 0 {
		m.Host.CPUPercent = &pct[0]
	}
	if avg, err := load.AvgWithContext(ctx); err == nil {
		m.Host.Load1 = &avg.Load1
	}
	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		m.Host.MemUsedBytes, m.Host.MemTotalBytes = &vm.Used, &vm.Total
	}
	if du, err := disk.UsageWithContext(ctx, c.diskPath); err == nil {
		m.Host.DiskUsedBytes, m.Host.DiskTotalBytes = &du.Used, &du.Total
	}
	if up, err := host.UptimeWithContext(ctx); err == nil {
		m.Host.UptimeSec = &up
	}
	c.network(ctx, m.Host)
	if c.gpu {
		m.GPUs = c.gpus(ctx)
	}
	return m
}

// network — скорость сети по разнице счётчиков с прошлого сбора.
func (c *Collector) network(ctx context.Context, h *alp.HostMetrics) {
	counters, err := net.IOCountersWithContext(ctx, false)
	if err != nil || len(counters) == 0 {
		return
	}
	rx, tx, now := counters[0].BytesRecv, counters[0].BytesSent, time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.prevAt.IsZero() && rx >= c.prevRx && tx >= c.prevTx {
		secs := now.Sub(c.prevAt).Seconds()
		if secs > 0 {
			rxBps, txBps := uint64(float64(rx-c.prevRx)/secs), uint64(float64(tx-c.prevTx)/secs)
			h.NetRxBps, h.NetTxBps = &rxBps, &txBps
		}
	}
	c.prevRx, c.prevTx, c.prevAt = rx, tx, now
}

func (c *Collector) gpus(ctx context.Context) []alp.GPUMetrics {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
		"--format=csv,noheader,nounits").Output()
	if err != nil {
		c.log.Debug("telemetry: nvidia-smi", "err", err)
		return nil
	}
	return ParseNvidiaSMI(out)
}

// ParseNvidiaSMI — строки CSV nvidia-smi в метрики (память — МиБ → байты).
func ParseNvidiaSMI(out []byte) []alp.GPUMetrics {
	var gpus []alp.GPUMetrics
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), ",")
		if len(fields) < 6 {
			continue
		}
		for i := range fields {
			fields[i] = strings.TrimSpace(fields[i])
		}
		index, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		g := alp.GPUMetrics{Index: index, Name: fields[1]}
		if v, err := strconv.ParseFloat(fields[2], 64); err == nil {
			g.UtilPercent = &v
		}
		if v, err := strconv.ParseUint(fields[3], 10, 64); err == nil {
			b := v << 20
			g.MemUsedBytes = &b
		}
		if v, err := strconv.ParseUint(fields[4], 10, 64); err == nil {
			b := v << 20
			g.MemTotalBytes = &b
		}
		if v, err := strconv.ParseFloat(fields[5], 64); err == nil {
			g.TemperatureC = &v
		}
		gpus = append(gpus, g)
	}
	return gpus
}
