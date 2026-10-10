"""Воркер echo — пример воркера проекта на базе agent_worker.py (agent worker new): весь протокол
агента — в базе, здесь только поведение воркера. Python ≥ 3.8, только стандартная библиотека.

  POST /echo            {"text", "repeat"?, "case"?, "reverse"?} или текст → {"text": "<префикс>ТЕКСТ"};
                          после ответа — событие echo.echoed {text, length}
  GET  /stream?n=5      ответ по частям: n строк с паузой
  GET  /bytes?n=256     двоичный ответ: байты 0, 1, …, 255, 0, …
  POST /hang            «зависнуть»: GET /health больше не отвечает (агент перезапустит воркер)
  POST /emit            {"type", "data"?} — событие как есть: ответ агента (202 или его ошибка)
  задачи                echo.quick {"text", "lookup"?} — итог сразу (lookup — префикс от сервера,
                          запрос echo.lookup); echo.long {"steps", "delayMs", "text"?, "fail"?} — ход
                          событиями, продолжается после перезапуска (WORKER_STATE_DIR); файлы —
                          files.inputs.source (текст), files.outputs.result (итог)
  настройка settings    {"prefix", "upper"}

ECHO_STATE_FILE (необязательно) — файл, куда echo пишет применённую настройку: пример того, что
воркер создаёт на узле и убирает при POST /cleanup.
"""

import json
import os
import threading
import time
import urllib.request

from agent_worker import (AgentUnavailable, Cancelled, Config, HTTPError, JobError, RequestRejected, Response,
                          Worker, job, route)

DEFAULTS = {"prefix": "", "upper": True}
MAX_PREFIX, MAX_TEXT, MAX_REPEAT = 64, 1000, 10
CASES = ("settings", "upper", "lower")
STATE_FILE = os.environ.get("ECHO_STATE_FILE", "")
TEXT_SCHEMA = {"type": "string", "maxLength": MAX_TEXT, "description": "Текст"}


def http_file(method, url, data=None):
    """Файл задачи по подписанной ссылке: GET — содержимое, PUT — загрузка (Content-Type —
    text/plain: тип входит в подпись ссылки, хранилище сверяет его)."""
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("content-type", "text/plain")
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


class Echo(Worker):
    description = "Эхо: текст, потоковый и двоичный ответ, быстрые и долгие задачи"
    log_requests = True

    settings = Config("settings", description="Как отвечать: префикс и верхний регистр", default=dict(DEFAULTS),
                      schema={"type": "object",
                              "properties": {"prefix": {"type": "string", "maxLength": MAX_PREFIX},
                                             "upper": {"type": "boolean"}},
                              "additionalProperties": False})

    events = {
        "echo.started": {"type": "object", "properties": {"version": {"type": "string"}, "pid": {"type": "integer"}},
                         "required": ["version", "pid"]},
        "echo.echoed": {"type": "object",
                        "properties": {"text": {"type": "string"}, "length": {"type": "integer", "minimum": 0}},
                        "required": ["text", "length"], "additionalProperties": False},
    }

    requests = {
        "echo.lookup": {"description": "Спросить у сервера префикс для текста",
                        "schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
                        "response": {"type": "object", "properties": {"prefix": {"type": "string"}},
                                     "required": ["prefix"]}},
    }

    def __init__(self):
        super().__init__()
        self.lock = threading.Lock()
        self.hung = threading.Event()
        self.last_event_error = ""
        self.counters = {"requests": 0, "echoed": 0, "streamed": 0, "jobs": 0, "events": 0, "eventErrors": 0}

    # ── Общее ─────────────────────────────────────────────────────────────

    def count(self, name, delta=1):
        with self.lock:
            self.counters[name] += delta

    def event(self, type, data):
        """Событие серверу; не дошло — видно в GET /health (ok: false)."""
        try:
            self.emit(type, data)
            self.count("events")
            self.last_event_error = ""
        except Exception as e:  # noqa: BLE001 — очередь полна или агент недоступен: событие теряется
            self.count("eventErrors")
            self.last_event_error = str(e)
            self.log("событие %s не отправлено: %s" % (type, e))

    def transform(self, text, case="settings"):
        """Префикс из настроек и регистр: settings — как в настройках (upper), upper, lower."""
        s = self.settings.value
        prefix, upper = s.get("prefix", ""), s.get("upper", True)
        if case == "lower":
            return prefix + text.lower()
        if case == "upper" or upper:
            return prefix + text.upper()
        return prefix + text

    # ── Что переопределено у базы ─────────────────────────────────────────

    def on_start(self):
        try:
            ctx = self.context()
            online = "есть" if ctx.get("online") else "нет"
            self.log("echo %s: агент %s, связь с сервером: %s" % (self.version, ctx.get("agent", {}).get("name", "?"), online))
        except Exception as e:  # noqa: BLE001
            self.log("агент не ответил на /context: %s" % e)
        self.event("echo.started", {"version": self.version, "pid": os.getpid()})

    def health(self):
        while self.hung.is_set():  # «завис»: ответа не будет, пока агент не перезапустит воркер
            time.sleep(60)
        info = {"version": self.version, "pid": os.getpid(), "settingsVersion": self.settings.version,
                "prefix": self.settings.value.get("prefix", "")}
        if self.last_event_error:
            return {"ok": False, "message": "события не доходят: " + self.last_event_error, "info": info}
        return {"ok": True, "message": "работаю", "info": info}

    def metrics(self):
        with self.lock:
            return {**self.counters, "settingsVersion": self.settings.version}

    def validate_config(self, key, data):
        if not isinstance(data, dict):
            raise ValueError("data: нужен объект {prefix, upper}")
        unknown = set(data) - set(DEFAULTS)
        if unknown:
            raise ValueError("неизвестные поля: " + ", ".join(sorted(unknown)))
        prefix = data.get("prefix", "")
        if not isinstance(prefix, str) or len(prefix) > MAX_PREFIX:
            raise ValueError("prefix: строка до %d символов" % MAX_PREFIX)
        if not isinstance(data.get("upper", True), bool):
            raise ValueError("upper: true или false")

    def on_config(self, key, data):
        self.settings.value = {**DEFAULTS, **(data or {})}
        if STATE_FILE:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump({"version": self.settings.version, "settings": self.settings.value}, f, ensure_ascii=False)
        self.log("настройки применены: версия %d, %s" % (self.settings.version, self.settings.value))

    def cleanup(self):
        self.settings.value, self.settings.version = dict(DEFAULTS), 0
        with self.lock:
            for k in self.counters:
                self.counters[k] = 0
        if STATE_FILE and os.path.exists(STATE_FILE):
            os.unlink(STATE_FILE)
        return True

    def prepare_job(self, type, data, files):
        if not isinstance(data or {}, dict) or not isinstance(files or {}, dict):
            raise HTTPError(400, "тело: {type, jobId, data, files}, data и files — объекты")
        if type == "echo.long":
            try:
                steps, delay = int((data or {}).get("steps", 5)), int((data or {}).get("delayMs", 500))
            except (ValueError, TypeError):
                raise HTTPError(400, "steps и delayMs — числа")
            if not 1 <= steps <= 100 or not 0 <= delay <= 10000:
                raise HTTPError(400, "steps — от 1 до 100, delayMs — до 10000")
        self.count("requests")

    # ── Маршруты ──────────────────────────────────────────────────────────

    @route("POST", "/echo", description="Текст с префиксом",
           request={"type": "object",
                    "properties": {"text": TEXT_SCHEMA,
                                   "repeat": {"type": "integer", "minimum": 1, "maximum": MAX_REPEAT,
                                              "description": "Сколько раз повторить"},
                                   "case": {"type": "string", "enum": list(CASES),
                                            "description": "Регистр: как в настройках, заглавные или строчные"},
                                   "reverse": {"type": "boolean", "description": "Задом наперёд"}},
                    "required": ["text"], "additionalProperties": False},
           response={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]})
    def echo(self, req):
        self.count("requests")
        try:
            body = json.loads(req.body) if req.body else {}
        except ValueError:
            body = req.body.decode(errors="replace")
        if not isinstance(body, dict):
            body = {"text": str(body)}
        text, repeat = body.get("text", ""), body.get("repeat", 1)
        case, reverse = body.get("case", "settings"), body.get("reverse", False)
        if not isinstance(text, str) or len(text) > MAX_TEXT:
            raise HTTPError(400, "text: строка до %d символов" % MAX_TEXT)
        if not isinstance(repeat, int) or isinstance(repeat, bool) or not 1 <= repeat <= MAX_REPEAT:
            raise HTTPError(400, "repeat: целое от 1 до %d" % MAX_REPEAT)
        if case not in CASES:
            raise HTTPError(400, "case: " + " | ".join(CASES))
        if not isinstance(reverse, bool):
            raise HTTPError(400, "reverse: true или false")
        out = self.transform(" ".join([text[::-1] if reverse else text] * repeat), case)
        self.count("echoed")
        threading.Thread(target=self.event, args=("echo.echoed", {"text": out, "length": len(out)}), daemon=True).start()
        return {"text": out}

    @route("GET", "/stream", description="Ответ по частям, ?n= строк")
    def stream(self, req):
        self.count("requests")
        try:
            n = max(1, min(int(req.query.get("n", "5")), 100))
        except ValueError:
            raise HTTPError(400, "n — число")
        self.count("streamed")

        def lines():
            for i in range(1, n + 1):
                yield self.transform("строка %d из %d" % (i, n)) + "\n"
                time.sleep(0.3)
        return Response(200, lines())

    @route("GET", "/bytes", description="Двоичный ответ, ?n= байт")
    def binary(self, req):
        self.count("requests")
        try:
            n = max(0, min(int(req.query.get("n", "256")), 1 << 20))
        except ValueError:
            raise HTTPError(400, "n — число")
        return Response(200, bytes(i % 256 for i in range(n)), {"content-type": "application/octet-stream"})

    @route("POST", "/hang", description="Зависнуть: GET /health больше не отвечает")
    def hang(self, req):
        self.hung.set()
        self.log("завис: GET /health больше не отвечает")
        return 202, {"hung": True}

    @route("POST", "/emit", description="Отправить событие как есть (проверка схем событий)",
           request={"type": "object", "properties": {"type": {"type": "string"}, "data": {}},
                    "required": ["type"], "additionalProperties": False})
    def emit_raw(self, req):
        body = req.json()
        if not isinstance(body, dict) or not isinstance(body.get("type"), str):
            raise HTTPError(400, "тело: {type, data?}")
        payload = {"type": body["type"], **({"data": body["data"]} if "data" in body else {})}
        try:
            status, reply = self.agent_call("POST", "/events", payload)
        except OSError as e:
            raise HTTPError(503, "агент недоступен: %s" % e)
        if status == 202:
            self.count("events")
        return status, reply or {"sent": True}

    # ── Задачи ────────────────────────────────────────────────────────────

    @job("echo.quick", quick=True, description="Текст с префиксом — итог сразу; lookup: true — префикс от сервера",
         schema={"type": "object", "properties": {"text": {"type": "string"}, "lookup": {"type": "boolean"}}})
    def quick(self, job):
        text = str((job.data or {}).get("text", ""))
        self.count("echoed")
        if not (job.data or {}).get("lookup"):
            return {"text": self.transform(text)}
        try:
            reply = self.ask("echo.lookup", {"text": text}, timeout_ms=5000) or {}
        except RequestRejected as e:  # отказ сервера — окончательный
            raise HTTPError(422, "префикс от сервера не получен: %s: %s" % (e.code, e.message))
        except (AgentUnavailable, OSError) as e:  # нет связи — повтор задачи
            raise HTTPError(503, "префикс от сервера не получен: %s" % e)
        prefix = reply.get("prefix")
        if not isinstance(prefix, str):
            raise HTTPError(503, "сервер не прислал prefix")
        return {"text": prefix + self.transform(text), "prefix": prefix}

    @job("echo.long", resumable=True, description="Долгая задача: шаги с паузой, ход — job.progress, итог — job.done",
         schema={"type": "object",
                 "properties": {"steps": {"type": "integer", "minimum": 1, "maximum": 100},
                                "delayMs": {"type": "integer", "minimum": 0, "maximum": 10000},
                                "text": {"type": "string"}, "fail": {"type": "boolean"}}})
    def long(self, job):
        data = job.data or {}
        steps, delay = int(data.get("steps", 5)), int(data.get("delayMs", 500)) / 1000
        if not job.saved:
            self.count("jobs")
        text = str(data.get("text", ""))
        try:
            source = (job.files.get("inputs") or {}).get("source")
            if source and not text:
                text = http_file("GET", source).decode("utf-8", errors="replace")
            for step in range(job.saved.get("step", 0) + 1, steps + 1):
                job.sleep(delay)
                job.save(step=step)
                job.progress(step / steps, "шаг %d из %d" % (step, steps))
            if data.get("fail"):
                raise JobError("задача упала по просьбе (fail)", code="ECHO_FAILED")
            text = self.transform(text or "готово: %d шагов" % steps)
            result = {"text": text}
            target = (job.files.get("outputs") or {}).get("result")
            if target:
                job.check()
                http_file("PUT", target, text.encode("utf-8"))
                result["output"] = "result"
            return result
        except (JobError, Cancelled):
            raise
        except Exception as e:  # noqa: BLE001 — ошибка шага или файла — итог job.failed
            raise JobError(str(e)[:500], code="ECHO_FAILED")


if __name__ == "__main__":
    Echo().run()
