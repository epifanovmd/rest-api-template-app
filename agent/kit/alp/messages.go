package alp

import "encoding/json"

// Типы сообщений агент → сервер.
const (
	TypeHello        = "hello"
	TypeStatus       = "status"
	TypeMetrics      = "metrics"
	TypeJobAccept    = "job.accept"
	TypeJobReject    = "job.reject"
	TypeJobProgress  = "job.progress"
	TypeJobEvent     = "job.event"
	TypeJobURLs      = "job.urls"
	TypeJobComplete  = "job.complete"
	TypeJobFail      = "job.fail"
	TypeCmdAccept    = "cmd.accept"
	TypeCmdOutput    = "cmd.output"
	TypeCmdDone      = "cmd.done"
	TypeStateApplied = "state.applied"
)

// Типы сообщений сервер → агент.
const (
	TypeWelcome   = "welcome"
	TypeConfig    = "config"
	TypeAck       = "ack"
	TypeError     = "error"
	TypeJobAssign = "job.assign"
	TypeJobCancel = "job.cancel"
	TypeJobStop   = "job.stop"
	TypeCmdRun    = "cmd.run"
	TypeStatePut  = "state.put"
)

// Локальный протокол нагрузок (§10).
const (
	TypeWorkloadRegister = "workload.register"
	TypeWorkloadReady    = "workload.ready"
	TypeWorkloadDrain    = "workload.drain"
)

// WorkloadRegister — нагрузка объявляет себя и свои очереди.
type WorkloadRegister struct {
	Name    string          `json:"name"`
	Version string          `json:"version,omitempty"`
	SDK     string          `json:"sdk,omitempty"`
	Queues  []QueueCapacity `json:"queues"`
}

// WorkloadReady — регистрация принята.
type WorkloadReady struct {
	AgentVersion string `json:"agentVersion"`
}

// Состояния агента в status.state.
const (
	StateStarting = "starting"
	StateIdle     = "idle"
	StateBusy     = "busy"
	StateDraining = "draining"
	StateUpdating = "updating"
	StateDegraded = "degraded"
)

// Режимы обновления агента.
const (
	UpdateSelf     = "self"
	UpdateExternal = "external"
	UpdateDisabled = "disabled"
)

// ─── Сессия ────────────────────────────────────────────────────────────

type Hello struct {
	Protocols    []int             `json:"protocols"`
	Agent        HelloAgent        `json:"agent"`
	Host         Host              `json:"host"`
	Labels       map[string]string `json:"labels,omitempty"`
	Capabilities Capabilities      `json:"capabilities"`
	Jobs         []JobRef          `json:"jobs"`
}

type HelloAgent struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	SDK       string `json:"sdk,omitempty"`
	CodeHash  string `json:"codeHash,omitempty"`
	BootID    string `json:"bootId"`
	StartedAt int64  `json:"startedAt"`
}

type Host struct {
	Hostname    string `json:"hostname"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	Platform    string `json:"platform,omitempty"`
	Kernel      string `json:"kernel,omitempty"`
	CPUs        int    `json:"cpus,omitempty"`
	MemoryBytes uint64 `json:"memoryBytes,omitempty"`
}

type Capabilities struct {
	Jobs      *JobsCapability      `json:"jobs,omitempty"`
	Commands  *CommandsCapability  `json:"commands,omitempty"`
	State     *StateCapability     `json:"state,omitempty"`
	Telemetry *TelemetryCapability `json:"telemetry,omitempty"`
	Update    *UpdateCapability    `json:"update,omitempty"`
}

type JobsCapability struct {
	Queues []QueueCapacity `json:"queues"`
}

type QueueCapacity struct {
	Name        string `json:"name"`
	Concurrency int    `json:"concurrency"`
}

type CommandsCapability struct {
	Names []string `json:"names"`
}

// StateCapability — домен → применённая версия (nil — ещё не применялась).
type StateCapability struct {
	Domains map[string]*int64 `json:"domains"`
}

type TelemetryCapability struct {
	Channels []string `json:"channels"`
}

type UpdateCapability struct {
	Mode string `json:"mode"`
}

type Welcome struct {
	Protocol   int           `json:"protocol"`
	AgentID    string        `json:"agentId"`
	SessionID  string        `json:"sessionId"`
	ServerTime int64         `json:"serverTime"`
	Config     SessionConfig `json:"config"`
}

// SessionConfig — настройки сессии от сервера; в `config` — частично (нули не меняют).
type SessionConfig struct {
	StatusIntervalMs  int64 `json:"statusIntervalMs,omitempty"`
	MetricsIntervalMs int64 `json:"metricsIntervalMs,omitempty"`
}

type Ack struct {
	IDs []string `json:"ids,omitempty"`
	Seq int64    `json:"seq,omitempty"`
}

type Error struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// ─── Состояние и телеметрия ────────────────────────────────────────────

type Status struct {
	State     string           `json:"state"`
	Message   string           `json:"message,omitempty"`
	Slots     map[string]int   `json:"slots"`
	Capacity  map[string]int   `json:"capacity,omitempty"`
	Jobs      []StatusJob      `json:"jobs"`
	Workloads []StatusWorkload `json:"workloads"`
	Outbox    int              `json:"outbox"`
}

type StatusJob struct {
	JobID     string `json:"jobId"`
	Attempt   int    `json:"attempt"`
	Queue     string `json:"queue"`
	StartedAt int64  `json:"startedAt,omitempty"`
}

type StatusWorkload struct {
	Name      string `json:"name"`
	State     string `json:"state"`
	Instances int    `json:"instances"`
	Version   string `json:"version,omitempty"`
}

type Metrics struct {
	CollectedAt int64                      `json:"collectedAt"`
	Host        *HostMetrics               `json:"host,omitempty"`
	GPUs        []GPUMetrics               `json:"gpus,omitempty"`
	Channels    map[string]json.RawMessage `json:"channels,omitempty"`
}

type HostMetrics struct {
	CPUPercent     *float64 `json:"cpuPercent,omitempty"`
	Load1          *float64 `json:"load1,omitempty"`
	MemUsedBytes   *uint64  `json:"memUsedBytes,omitempty"`
	MemTotalBytes  *uint64  `json:"memTotalBytes,omitempty"`
	DiskUsedBytes  *uint64  `json:"diskUsedBytes,omitempty"`
	DiskTotalBytes *uint64  `json:"diskTotalBytes,omitempty"`
	NetRxBps       *uint64  `json:"netRxBps,omitempty"`
	NetTxBps       *uint64  `json:"netTxBps,omitempty"`
	UptimeSec      *uint64  `json:"uptimeSec,omitempty"`
}

type GPUMetrics struct {
	Index         int      `json:"index"`
	Name          string   `json:"name"`
	UtilPercent   *float64 `json:"utilPercent,omitempty"`
	MemUsedBytes  *uint64  `json:"memUsedBytes,omitempty"`
	MemTotalBytes *uint64  `json:"memTotalBytes,omitempty"`
	TemperatureC  *float64 `json:"temperatureC,omitempty"`
}

// ─── Задачи ────────────────────────────────────────────────────────────

// JobRef — задача и попытка (барьер против устаревшего исполнителя).
type JobRef struct {
	JobID   string `json:"jobId"`
	Attempt int    `json:"attempt"`
}

type JobAssign struct {
	JobID        string               `json:"jobId"`
	Attempt      int                  `json:"attempt"`
	Queue        string               `json:"queue"`
	Data         json.RawMessage      `json:"data"`
	LeaseSeconds int                  `json:"leaseSeconds"`
	Inputs       map[string]string    `json:"inputs"`
	Outputs      map[string]OutputURL `json:"outputs"`
	URLsExpireAt int64                `json:"urlsExpireAt,omitempty"`
}

// Ref — ссылка на задачу назначения.
func (a JobAssign) Ref() JobRef { return JobRef{JobID: a.JobID, Attempt: a.Attempt} }

type OutputURL struct {
	URL         string `json:"url"`
	ContentType string `json:"contentType,omitempty"`
}

type JobReject struct {
	JobRef
	Code    string `json:"code"`
	Message string `json:"message"`
}

type JobProgress struct {
	JobRef
	Progress *float64 `json:"progress,omitempty"`
	Text     *string  `json:"text,omitempty"`
	Log      []string `json:"log,omitempty"`
}

type JobEvent struct {
	JobRef
	Seq  int64           `json:"seq"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

type JobURLsRequest struct {
	JobRef
	Inputs  []string `json:"inputs,omitempty"`
	Outputs []string `json:"outputs,omitempty"`
}

type JobURLs struct {
	Inputs    map[string]string    `json:"inputs"`
	Outputs   map[string]OutputURL `json:"outputs"`
	ExpiresAt int64                `json:"expiresAt"`
}

type JobComplete struct {
	JobRef
	Result json.RawMessage `json:"result,omitempty"`
}

type JobFail struct {
	JobRef
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

// Коды ошибок задачи, которые выставляет агент.
const (
	ErrWorker          = "WORKER_ERROR"
	ErrWorkloadCrashed = "WORKLOAD_CRASHED"
	ErrQueueNotServed  = "QUEUE_NOT_SERVED"
	ErrQueueBusy       = "QUEUE_BUSY"
	ErrUploadFailed    = "UPLOAD_FAILED"
)

// ─── Команды ───────────────────────────────────────────────────────────

type CommandRun struct {
	CommandID  string          `json:"commandId"`
	Name       string          `json:"name"`
	Args       json.RawMessage `json:"args,omitempty"`
	TimeoutSec int             `json:"timeoutSec"`
}

type CommandRef struct {
	CommandID string `json:"commandId"`
}

type CommandOutput struct {
	CommandID string `json:"commandId"`
	Chunk     string `json:"chunk"`
}

type CommandDone struct {
	CommandID string          `json:"commandId"`
	OK        bool            `json:"ok"`
	ExitCode  *int            `json:"exitCode,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *CommandError   `json:"error,omitempty"`
}

type CommandError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ─── Желаемое состояние ────────────────────────────────────────────────

type StatePut struct {
	Domain  string          `json:"domain"`
	Version int64           `json:"version"`
	Spec    json.RawMessage `json:"spec"`
}

type StateApplied struct {
	Domain  string          `json:"domain"`
	Version int64           `json:"version"`
	OK      bool            `json:"ok"`
	Error   string          `json:"error,omitempty"`
	Report  json.RawMessage `json:"report,omitempty"`
}
