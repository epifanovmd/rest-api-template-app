// Агент: держит связь с бэкендом по ALP, выполняет задачи нагрузками,
// команды и желаемое состояние, шлёт статус и телеметрию.
//
//	agent [run] [-config agent.yaml]   работа (по умолчанию)
//	agent version                      версия
//	agent keygen                       ключи подписи релизов (Ed25519)
//	agent boot-guard BINARY            откат версии, не дошедшей до связи (ExecStartPre)
//	agent release-manifest DIR VERSION manifest.json сборок в DIR (подпись — AGENT_SIGNING_KEY)
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"restapi/agent/kit/app"
	"restapi/agent/kit/config"
	"restapi/agent/kit/update"
)

// version — задаётся при сборке: -ldflags "-X main.version=1.2.3".
var version = "dev"

func main() {
	args := os.Args[1:]
	cmd := "run"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "run":
		err = run(args)
	case "version":
		fmt.Println(version)
	case "keygen":
		err = keygen()
	case "boot-guard":
		err = bootGuard(args)
	case "release-manifest":
		err = releaseManifest(args)
	default:
		err = fmt.Errorf("неизвестная команда %q (run | version | keygen | release-manifest)", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "agent:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	// Первым делом: новая версия, не связавшаяся с сервером за несколько
	// запусков, откатывается — даже если падает на конфигурации.
	if exe, err := os.Executable(); err == nil {
		if err := update.Boot(update.NewPaths(exe)); err != nil {
			fmt.Fprintln(os.Stderr, "agent: проверка обновления:", err)
		}
	}
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	path := fs.String("config", os.Getenv("AGENT_CONFIG"), "файл конфигурации YAML (AGENT_CONFIG)")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	agent, err := app.New(cfg, version)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	err = agent.Run(ctx)
	if errors.Is(err, app.ErrRestart) || errors.Is(err, context.Canceled) {
		// Перезапуск — дело менеджера процесса (systemd Restart=always, Docker restart).
		return nil
	}
	return err
}

// bootGuard — вызывает прежняя версия перед запуском новой (systemd
// ExecStartPre): откат работает, даже если новая падает до main.
func bootGuard(args []string) error {
	if len(args) != 1 {
		return errors.New("boot-guard BINARY")
	}
	rolledBack, err := update.Guard(update.NewPaths(args[0]))
	if rolledBack {
		fmt.Fprintln(os.Stderr, "agent: новая версия не вышла на связь — возвращена прежняя")
	}
	return err
}

func keygen() error {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return err
	}
	fmt.Printf("AGENT_SIGNING_KEY=%s\n", base64.StdEncoding.EncodeToString(priv.Seed()))
	fmt.Printf("AGENT_UPDATE_PUBLIC_KEY=%s\n", base64.StdEncoding.EncodeToString(pub))
	return nil
}

type artifact struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	File      string `json:"file"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature,omitempty"`
}

type manifest struct {
	Version   string     `json:"version"`
	Artifacts []artifact `json:"artifacts"`
}

// releaseManifest — manifest.json для сборок agent-<os>-<arch> в каталоге.
func releaseManifest(args []string) error {
	if len(args) != 2 {
		return errors.New("release-manifest DIR VERSION")
	}
	dir, ver := args[0], args[1]
	var priv ed25519.PrivateKey
	if seed := os.Getenv("AGENT_SIGNING_KEY"); seed != "" {
		raw, err := base64.StdEncoding.DecodeString(seed)
		if err != nil || len(raw) != ed25519.SeedSize {
			return errors.New("AGENT_SIGNING_KEY — base64 seed Ed25519 (agent keygen)")
		}
		priv = ed25519.NewKeyFromSeed(raw)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "agent-*-*"))
	m := manifest{Version: ver}
	for _, file := range files {
		parts := strings.Split(filepath.Base(file), "-")
		if len(parts) != 3 {
			continue
		}
		hash, err := update.FileHash(file)
		if err != nil {
			return err
		}
		a := artifact{OS: parts[1], Arch: parts[2], File: filepath.Base(file), SHA256: hash}
		if priv != nil {
			a.Signature = update.Sign(priv, hash)
		}
		m.Artifacts = append(m.Artifacts, a)
	}
	if len(m.Artifacts) == 0 {
		return fmt.Errorf("в %s нет сборок agent-<os>-<arch>", dir)
	}
	raw, _ := json.MarshalIndent(m, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), append(raw, '\n'), 0o644); err != nil {
		return err
	}
	if priv == nil {
		fmt.Fprintln(os.Stderr, "agent: AGENT_SIGNING_KEY не задан — релиз без подписи, самообновление на него не встанет")
	}
	fmt.Println(filepath.Join(dir, "manifest.json"))
	return nil
}
