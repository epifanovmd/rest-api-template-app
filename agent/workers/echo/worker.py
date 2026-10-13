"""Воркер echo — пример воркера проекта на базе agent_worker.py: весь протокол агента — в базе,
здесь только поведение. Python ≥ 3.8, только стандартная библиотека.

  настройка settings  {"prefix", "upper"} — как отвечать
  echo.say            {"text", "repeat"?, "case"?, "reverse"?} → {"text"}; событие echo.echoed
  echo.quick          внешняя задача {jobId, data: {"text", "lookup"?}} → {"text"}; lookup — префикс
                        от бэкенда (запрос echo.lookup)
  echo.long           внешняя задача {jobId, data: {"steps", "delayMs", "text"?, "fail"?}, files} —
                        шаги с ходом, продолжается после перезапуска воркера; файлы —
                        files.inputs.source (текст), files.outputs.result (итог)
  echo.hang           перестать присылать пульс (агент перезапустит воркер)
  echo.emit           {"type", "data"?} — событие как есть (проверка манифеста)

ECHO_STATE_FILE (необязательно) — файл, куда echo пишет применённую настройку: пример того, что
воркер создаёт на узле и убирает в `./cleanup`.
"""

import json
import os
import threading
import urllib.request

from agent_worker import AgentUnavailable, CommandError, Config, RequestRejected, Worker, command

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
    description = "Эхо: текст с префиксом, быстрые и долгие задачи, события, запрос к бэкенду"

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
        "echo.lookup": {"description": "Спросить у бэкенда префикс для текста",
                        "schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
                        "response": {"type": "object", "properties": {"prefix": {"type": "string"}},
                                     "required": ["prefix"]}},
    }

    def __init__(self):
        super().__init__()
        self.counters_lock = threading.Lock()
        self.hung = False
        self.counters = {"said": 0, "jobs": 0, "events": 0, "eventErrors": 0}

    def count(self, name, delta=1):
        with self.counters_lock:
            self.counters[name] += delta

    def event(self, type, data):
        try:
            self.emit(type, data)
            self.count("events")
        except (AgentUnavailable, RequestRejected) as e:
            self.count("eventErrors")
            self.log("событие %s не отправлено: %s" % (type, e))

    def transform(self, text, case="settings"):
        s = self.settings.value or DEFAULTS
        prefix, upper = s.get("prefix", ""), s.get("upper", True)
        if case == "lower":
            return prefix + text.lower()
        if case == "upper" or upper:
            return prefix + text.upper()
        return prefix + text

    # ── хуки ────────────────────────────────────────────────────────────

    def on_start(self):
        self.event("echo.started", {"version": self.version, "pid": os.getpid()})

    def _beat(self):
        if not self.hung:
            super()._beat()

    def metrics(self):
        with self.counters_lock:
            return {**self.counters, "settingsVersion": self.settings.version}

    def validate_config(self, key, data):
        if not isinstance(data, dict):
            raise ValueError("нужен объект {prefix, upper}")
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
        if STATE_FILE and os.path.exists(STATE_FILE):
            os.unlink(STATE_FILE)
            self.log("убран %s" % STATE_FILE)

    # ── команды ─────────────────────────────────────────────────────────

    @command("echo.say", description="Текст с префиксом; событие echo.echoed",
             schema={"type": "object",
                     "properties": {"text": TEXT_SCHEMA,
                                    "repeat": {"type": "integer", "minimum": 1, "maximum": MAX_REPEAT},
                                    "case": {"type": "string", "enum": list(CASES)},
                                    "reverse": {"type": "boolean"}},
                     "required": ["text"], "additionalProperties": False},
             result={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]})
    def say(self, call):
        body = call.data if isinstance(call.data, dict) else {"text": str(call.data or "")}
        text, repeat = body.get("text", ""), body.get("repeat", 1)
        case, reverse = body.get("case", "settings"), body.get("reverse", False)
        if not isinstance(text, str) or len(text) > MAX_TEXT:
            raise CommandError("text: строка до %d символов" % MAX_TEXT, "INVALID_ARGS")
        if not isinstance(repeat, int) or isinstance(repeat, bool) or not 1 <= repeat <= MAX_REPEAT:
            raise CommandError("repeat: целое от 1 до %d" % MAX_REPEAT, "INVALID_ARGS")
        if case not in CASES:
            raise CommandError("case: " + " | ".join(CASES), "INVALID_ARGS")
        out = self.transform(" ".join([text[::-1] if reverse else text] * repeat), case)
        self.count("said")
        threading.Thread(target=self.event, args=("echo.echoed", {"text": out, "length": len(out)}), daemon=True).start()
        return {"text": out}

    @command("echo.quick", description="Текст с префиксом — сразу; lookup: true — префикс от бэкенда",
             schema={"type": "object", "properties": {"text": {"type": "string"}, "lookup": {"type": "boolean"}}})
    def quick(self, call):
        data = call.data or {}
        text = str(data.get("text", ""))
        self.count("said")
        if not data.get("lookup"):
            return {"text": self.transform(text)}
        try:
            reply = self.ask("echo.lookup", {"text": text}, timeout_ms=5000) or {}
        except RequestRejected as e:
            raise CommandError("префикс от бэкенда не получен: %s: %s" % (e.code, e.message), "LOOKUP_REJECTED")
        except AgentUnavailable as e:
            raise CommandError("префикс от бэкенда не получен: %s" % e, "LOOKUP_UNAVAILABLE")
        prefix = reply.get("prefix")
        if not isinstance(prefix, str):
            raise CommandError("бэкенд не прислал prefix", "LOOKUP_UNAVAILABLE")
        return {"text": prefix + self.transform(text), "prefix": prefix}

    @command("echo.long", resumable=True, description="Долгая работа: шаги с паузой и ходом",
             schema={"type": "object",
                     "properties": {"steps": {"type": "integer", "minimum": 1, "maximum": 100},
                                    "delayMs": {"type": "integer", "minimum": 0, "maximum": 10000},
                                    "text": {"type": "string"}, "fail": {"type": "boolean"}}})
    def long(self, call):
        data = call.data or {}
        try:
            steps, delay = int(data.get("steps", 5)), int(data.get("delayMs", 500)) / 1000
        except (TypeError, ValueError):
            raise CommandError("steps и delayMs — числа", "INVALID_ARGS")
        if not 1 <= steps <= 100 or not 0 <= delay <= 10:
            raise CommandError("steps — от 1 до 100, delayMs — до 10000", "INVALID_ARGS")
        if not call.saved:
            self.count("jobs")
        text = str(data.get("text", ""))
        source = (call.files.get("inputs") or {}).get("source")
        if source and not text:
            text = http_file("GET", source).decode("utf-8", errors="replace")
        for step in range(call.saved.get("step", 0) + 1, steps + 1):
            call.sleep(delay)
            call.save(step=step)
            call.progress(step / steps, "шаг %d из %d" % (step, steps))
        if data.get("fail"):
            raise CommandError("задача упала по просьбе (fail)", "ECHO_FAILED")
        text = self.transform(text or "готово: %d шагов" % steps)
        result = {"text": text}
        target = (call.files.get("outputs") or {}).get("result")
        if target:
            call.check()
            http_file("PUT", target, text.encode("utf-8"))
            result["output"] = "result"
        return result

    @command("echo.hang", description="Перестать присылать пульс: агент перезапустит воркер")
    def hang(self, call):
        self.hung = True
        self.log("завис: пульса больше нет")
        return {"hung": True}

    @command("echo.emit", description="Событие как есть (проверка манифеста событий)",
             schema={"type": "object", "properties": {"type": {"type": "string"}, "data": {}}, "required": ["type"]})
    def emit_raw(self, call):
        body = call.data if isinstance(call.data, dict) else {}
        if not isinstance(body.get("type"), str):
            raise CommandError("нужен type", "INVALID_ARGS")
        try:
            self.emit(body["type"], body.get("data"), wait=5)
        except RequestRejected as e:
            raise CommandError(e.message, e.code)
        return {"sent": True}


if __name__ == "__main__":
    Echo().run()
