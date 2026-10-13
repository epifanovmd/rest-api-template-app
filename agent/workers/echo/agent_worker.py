"""База воркера на Python — протокол воркер ↔ агент (github.com/epifanovmd/agent, docs/PROTOCOL.md,
§11–§17) целиком; класс воркера описывает только поведение. Python ≥ 3.8, только стандартная
библиотека. Файл переносится в другой проект как есть.

Воркер — HTTP-клиент unix-сокета агента (AGENT_SOCKET, токен AGENT_WORKER_TOKEN): регистрируется
с манифестом, держит поток GET /stream (желаемое, команды, отмена), присылает итоги, ход, события,
пульс и запросы к бэкенду.

    class Report(Worker):
        description = "Отчёты"
        settings = Config("settings", schema={...}, default={})
        events = {"report.done": {...}}          # тип → JSON Schema data

        @command("report.build", schema={...}, resumable=True)
        def build(self, call):
            for step in range(call.saved.get("step", 0) + 1, 11):
                call.sleep(1)                     # отмена — исключение Cancelled
                call.save(step=step)              # продолжение после перезапуска воркера
                call.progress(step / 10, "шаг %d" % step)
            self.emit("report.done", {"id": call.id})
            return {"ok": True}

    if __name__ == "__main__":
        Report().run()

`python3 worker.py cleanup` — уборка на узле (`./cleanup` воркера, его выполняет agent uninstall):
вызывает `cleanup()` и выходит.
"""

import http.client
import json
import os
import signal
import socket
import sys
import threading
import time
import traceback
import uuid
from collections import OrderedDict

__all__ = ["Worker", "Config", "command", "Call", "CommandError", "Cancelled", "RequestRejected",
           "AgentUnavailable"]

HEARTBEAT_SECONDS = 10
STREAM_SILENCE_SECONDS = 45
JOURNAL_SIZE = 10000


class CommandError(Exception):
    """Итог команды ok: false с кодом и текстом."""

    def __init__(self, message, code="COMMAND_FAILED"):
        super().__init__(message)
        self.code, self.message = code, message


class Cancelled(Exception):
    """Команда отменена (event: cancel) или срок истёк."""


class RequestRejected(Exception):
    """Бэкенд отказал в запросе воркера: код и текст."""

    def __init__(self, code, message):
        super().__init__("%s: %s" % (code, message))
        self.code, self.message = code, message


class AgentUnavailable(Exception):
    """Агент недоступен (перезапускается) или нет связи с бэкендом."""


class _Conn(http.client.HTTPConnection):
    def __init__(self, path, timeout):
        super().__init__("agent", timeout=timeout)
        self._path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self._path)


class Config:
    """Ключ настроек воркера: значение (`value`, без ключа — `default`) и его версия."""

    def __init__(self, key, schema=None, default=None, description=""):
        self.key, self.schema, self.default, self.description = key, schema, default, description
        self.value, self.version = default, 0


def command(type, schema=None, result=None, description="", resumable=False, busy=None):
    """Обработчик команды `type`. `resumable` — состояние (`call.save`) переживает перезапуск
    воркера, команда продолжается; `busy` — пока идёт, воркер занят (плановая замена ждёт); по
    умолчанию — для `resumable`."""

    def wrap(fn):
        fn._command = {"type": type, "schema": schema, "result": result, "description": description,
                       "resumable": resumable, "busy": resumable if busy is None else busy}
        return fn

    return wrap


class Call:
    """Команда воркеру: `id`, `type`, `args`; для внешней задачи (`{jobId, data, files}`) — `data`
    и `files` (подписанные ссылки)."""

    def __init__(self, worker, cmd, saved, meta):
        self._worker = worker
        self.meta = meta
        self.id, self.type = cmd["id"], cmd["type"]
        self.args = cmd.get("args")
        self.deadline = cmd.get("deadline")
        job = isinstance(self.args, dict) and "jobId" in self.args
        self.job_id = self.args.get("jobId") if job else None
        self.data = self.args.get("data") if job else self.args
        self.files = (self.args.get("files") or {}) if job else {}
        self.saved = saved or {}
        self.cancelled = threading.Event()

    def check(self):
        """Отмена или истёкший срок — `Cancelled`."""
        if self.cancelled.is_set():
            raise Cancelled("команда отменена")
        if self.deadline and time.time() * 1000 > self.deadline:
            raise Cancelled("срок команды истёк")

    def sleep(self, seconds):
        """Пауза с проверкой отмены."""
        if self.cancelled.wait(seconds):
            raise Cancelled("команда отменена")
        self.check()

    def progress(self, value, message=""):
        """Ход 0..1 — бэкенду событием command.progress (агент недоступен — не страшно)."""
        try:
            self._worker._post("/progress", {"re": self.id, "progress": float(value), "message": message[:200]})
        except (OSError, http.client.HTTPException):
            pass

    def save(self, **state):
        """Сохранить состояние (для `resumable`): после перезапуска — в `saved`."""
        self.saved.update(state)
        self._worker._save_call(self)


class Worker:
    """База воркера: переопределить `description`, `events`, `requests`, команды (`@command`),
    настройки (`Config`) и хуки."""

    description = ""
    events = {}
    requests = {}

    def __init__(self):
        self.socket = os.environ.get("AGENT_SOCKET", "")
        self.token = os.environ.get("AGENT_WORKER_TOKEN", "")
        self.name = os.environ.get("AGENT_WORKER_NAME", "worker")
        self.state_dir = os.environ.get("WORKER_STATE_DIR", "")
        module = sys.modules.get(type(self).__module__)
        here = os.path.dirname(os.path.abspath(getattr(module, "__file__", None) or "."))
        try:
            with open(os.path.join(here, "VERSION"), encoding="utf-8") as f:
                self.version = f.read().strip()
        except OSError:
            self.version = "0.0.0"
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._kick = threading.Event()
        self._running = {}
        self._done = OrderedDict()
        self._unsent = []
        self._started = False
        self._configs = {}
        for klass in reversed(type(self).__mro__):
            for value in vars(klass).values():
                if isinstance(value, Config):
                    self._configs[value.key] = value
        self._commands = {}
        for attr in dir(type(self)):
            meta = getattr(getattr(type(self), attr, None), "_command", None)
            if meta:
                self._commands[meta["type"]] = (getattr(self, attr), meta)

    # ── хуки ────────────────────────────────────────────────────────────

    def health(self):
        """Пульс: `{ok, busy?, message?}`; `busy` по умолчанию — идёт команда с busy."""
        return {"ok": True}

    def metrics(self):
        """Метрики воркера (в точках метрик узла)."""
        return {}

    def validate_config(self, key, data):
        """Проверить значение ключа: ошибка — исключение (итог ok: false с его текстом)."""

    def on_config(self, key, data):
        """Применить значение ключа (`None` — ключ удалён); `Config.value` уже обновлён."""

    def on_start(self):
        """Первая регистрация прошла."""

    def cleanup(self):
        """Уборка на узле перед удалением агента (`./cleanup`)."""

    # ── для класса воркера ──────────────────────────────────────────────

    def log(self, message):
        print(message, flush=True)

    def emit(self, type, data=None, wait=60):
        """Событие бэкенду: агент отвечает после записи на диск; недоступен или очередь полна —
        повтор до `wait` секунд, затем `AgentUnavailable`; отказ — `RequestRejected`."""
        event = {"id": uuid.uuid4().hex, "type": type}
        if data is not None:
            event["data"] = data
        deadline = time.time() + wait
        while True:
            try:
                status, reply = self._post("/events", [event])
                if status == 202:
                    return
                if status != 503:
                    raise RequestRejected(reply.get("code", "EVENT_REJECTED"), reply.get("message", "событие не принято"))
            except (OSError, http.client.HTTPException):
                pass
            if time.time() > deadline or self._stop.wait(1):
                raise AgentUnavailable("событие %s не отправлено: агент недоступен" % type)

    def ask(self, type, data=None, timeout_ms=10000):
        """Запрос к бэкенду: ответ `data`; отказ — `RequestRejected`, нет связи — `AgentUnavailable`."""
        try:
            status, reply = self._post("/requests", {"type": type, "data": data, "timeoutMs": timeout_ms},
                                       timeout=timeout_ms / 1000 + 5)
        except (OSError, http.client.HTTPException) as e:
            raise AgentUnavailable(str(e))
        if status != 200:
            raise RequestRejected(reply.get("code", "REQUEST_FAILED"), reply.get("message", "HTTP %d" % status))
        if not reply.get("ok"):
            err = reply.get("error") or {}
            if err.get("code") in ("AGENT_OFFLINE", "TIMEOUT"):
                raise AgentUnavailable(err.get("message", "нет связи с бэкендом"))
            raise RequestRejected(err.get("code", "REQUEST_FAILED"), err.get("message", ""))
        return reply.get("data")

    # ── запуск ──────────────────────────────────────────────────────────

    def run(self):
        if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
            self.cleanup()
            return
        if not self.socket or not self.token:
            sys.exit("%s: нет AGENT_SOCKET или AGENT_WORKER_TOKEN — воркер запускает агент" % self.name)

        def stop(*_):
            self._stop.set()
            sys.exit(0)

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        self._resume_saved()
        threading.Thread(target=self._heartbeat, daemon=True).start()
        threading.Thread(target=self._deliver, daemon=True).start()
        self.log("%s %s запущен" % (self.name, self.version))
        delay = 1
        while not self._stop.is_set():
            try:
                self._session()
                delay = 1
            except (OSError, ValueError, http.client.HTTPException) as e:
                if self._stop.is_set():
                    break
                print("связь с агентом: %s — повтор через %d с" % (e, delay), file=sys.stderr, flush=True)
                self._stop.wait(delay)
                delay = min(delay * 2, 10)

    # ── протокол ────────────────────────────────────────────────────────

    def _manifest(self):
        return {
            "description": self.description,
            "configs": [{"key": c.key, "description": c.description, **({"schema": c.schema} if c.schema else {})}
                        for c in self._configs.values()],
            "commands": [{"type": meta["type"], "description": meta["description"],
                          **({"schema": meta["schema"]} if meta["schema"] else {}),
                          **({"result": meta["result"]} if meta["result"] else {})}
                         for _, meta in self._commands.values()],
            "events": [{"type": t, **({"schema": s} if s else {})} for t, s in self.events.items()],
            "requests": [{"type": t, **spec} for t, spec in self.requests.items()],
        }

    def _request(self, method, path, body=None, timeout=30):
        conn = _Conn(self.socket, timeout)
        try:
            headers = {"Authorization": "Worker " + self.token}
            raw = None
            if body is not None:
                raw = json.dumps(body).encode()
                headers["Content-Type"] = "application/json"
            conn.request(method, path, raw, headers)
            res = conn.getresponse()
            data = res.read()
            return res.status, (json.loads(data) if data else {})
        finally:
            conn.close()

    def _post(self, path, body, timeout=30):
        return self._request("POST", path, body, timeout)

    def _session(self):
        status, reply = self._post("/register", {"version": self.version, "manifest": self._manifest()})
        if status != 200:
            raise OSError("регистрация: HTTP %d %s" % (status, reply))
        self._beat()
        if not self._started:
            self._started = True
            threading.Thread(target=self.on_start, daemon=True).start()
        conn = _Conn(self.socket, STREAM_SILENCE_SECONDS)
        try:
            conn.request("GET", "/stream", headers={"Authorization": "Worker " + self.token})
            res = conn.getresponse()
            if res.status != 200:
                raise OSError("поток: HTTP %d" % res.status)
            event, data = "", []
            while not self._stop.is_set():
                line = res.readline()
                if not line:
                    raise OSError("агент закрыл поток")
                line = line.decode("utf-8").rstrip("\r\n")
                if line.startswith(":"):
                    continue
                if line:
                    field, _, value = line.partition(":")
                    value = value[1:] if value.startswith(" ") else value
                    if field == "event":
                        event = value
                    elif field == "data":
                        data.append(value)
                    continue
                if data:
                    self._dispatch(event, json.loads("\n".join(data)))
                event, data = "", []
        finally:
            conn.close()

    def _dispatch(self, event, payload):
        if event == "desired":
            self._desired(payload.get("configs") or {})
        elif event == "command":
            self._command(payload)
        elif event == "cancel":
            with self._lock:
                call = self._running.get(payload.get("re"))
            if call:
                call.cancelled.set()

    def _desired(self, configs):
        results = []
        for key, cfg in self._configs.items():
            value = configs.get(key)
            if value is None:
                if cfg.version:
                    cfg.value, cfg.version = cfg.default, 0
                    self.on_config(key, None)
                continue
            if cfg.version == value["version"]:
                continue
            item = {"key": key, "version": value["version"], "ok": True}
            try:
                self.validate_config(key, value.get("data"))
                previous = cfg.value, cfg.version
                cfg.value, cfg.version = value.get("data"), value["version"]
                try:
                    self.on_config(key, value.get("data"))
                except Exception:
                    cfg.value, cfg.version = previous
                    raise
            except Exception as e:  # noqa: BLE001 — итог ok: false с текстом
                item.update(ok=False, error={"code": "CONFIG_REJECTED", "message": str(e)[:500]})
            results.append(item)
        if results:
            try:
                self._post("/applied", results)
            except (OSError, http.client.HTTPException) as e:
                print("итоги настроек не отправлены: %s" % e, file=sys.stderr, flush=True)

    def _command(self, cmd):
        cid = cmd.get("id")
        with self._lock:
            if cid in self._running:
                return
            if cid in self._done:
                self._unsent.append(self._done[cid])
                self._kick.set()
                return
        self._start(cmd, self._load_saved(cid))

    def _start(self, cmd, saved):
        handler, meta = self._commands.get(cmd.get("type"), (None, {}))
        call = Call(self, cmd, saved, meta)
        with self._lock:
            if call.id in self._running:
                return
            self._running[call.id] = call
        threading.Thread(target=self._execute, args=(call, handler), daemon=True).start()
        if meta.get("busy"):
            self._beat_soon()  # занятость — агенту сразу, не со следующим пульсом

    def _execute(self, call, handler):
        result = {"re": call.id, "ok": True}
        try:
            if handler is None:
                raise CommandError("команда %s не поддерживается" % call.type, "UNKNOWN_COMMAND")
            call.check()
            self._save_call(call)
            value = handler(call)
            if value is not None:
                result["result"] = value
        except Cancelled as e:
            result = {"re": call.id, "ok": False, "error": {"code": "CANCELLED", "message": str(e)}}
        except CommandError as e:
            result = {"re": call.id, "ok": False, "error": {"code": e.code, "message": e.message[:2000]}}
        except Exception as e:  # noqa: BLE001 — итог с ошибкой вместо падения воркера
            traceback.print_exc()
            result = {"re": call.id, "ok": False, "error": {"code": "COMMAND_FAILED", "message": str(e)[:2000]}}
        if self._stop.is_set():
            return  # воркер останавливается: команду агент пришлёт снова, resumable продолжится
        with self._lock:
            self._running.pop(call.id, None)
            self._done[call.id] = result
            while len(self._done) > JOURNAL_SIZE:
                self._done.popitem(last=False)
            self._unsent.append(result)
        self._forget_call(call.id)
        self._kick.set()
        if call.meta.get("busy"):
            self._beat_soon()

    def _deliver(self):
        while not self._stop.is_set():
            self._kick.wait(1)
            self._kick.clear()
            with self._lock:
                batch = list(self._unsent)
            if not batch:
                continue
            try:
                status, _ = self._post("/results", batch)
            except (OSError, http.client.HTTPException):
                continue
            if status == 200:
                with self._lock:
                    del self._unsent[: len(batch)]

    def _beat(self):
        try:
            health = dict(self.health() or {"ok": True})
            with self._lock:
                busy = any(c.meta.get("busy") for c in self._running.values())
            health.setdefault("busy", busy)
            metrics = self.metrics()
            if metrics:
                health["metrics"] = metrics
            self._post("/health", health)
        except (OSError, http.client.HTTPException):
            pass

    def _beat_soon(self):
        threading.Thread(target=self._beat, daemon=True).start()

    def _heartbeat(self):
        while not self._stop.wait(HEARTBEAT_SECONDS):
            self._beat()

    # ── продолжение после перезапуска ───────────────────────────────────

    def _calls_dir(self):
        return os.path.join(self.state_dir, "commands") if self.state_dir else ""

    def _save_call(self, call):
        d = self._calls_dir()
        if not d or not call.meta.get("resumable"):
            return
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, "%s.json" % call.id)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump({"command": {"id": call.id, "type": call.type, "args": call.args, "deadline": call.deadline},
                       "saved": call.saved}, f)
        os.replace(path + ".tmp", path)

    def _load_saved(self, cid):
        try:
            with open(os.path.join(self._calls_dir(), "%s.json" % cid), encoding="utf-8") as f:
                return json.load(f).get("saved") or {}
        except (OSError, ValueError):
            return {}

    def _forget_call(self, cid):
        d = self._calls_dir()
        if d:
            try:
                os.unlink(os.path.join(d, "%s.json" % cid))
            except OSError:
                pass

    def _resume_saved(self):
        """Команды, шедшие до перезапуска воркера, — продолжить сразу (агент пришлёт их снова,
        повтор не начнёт вторую копию)."""
        d = self._calls_dir()
        if not d or not os.path.isdir(d):
            return
        for name in os.listdir(d):
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(d, name), encoding="utf-8") as f:
                    rec = json.load(f)
                self._start(rec["command"], rec.get("saved") or {})
            except (OSError, ValueError, KeyError):
                continue
