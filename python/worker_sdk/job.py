"""Задача в руках обработчика: данные, файлы, прогресс, отмена."""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Union

import requests

from .errors import ApiError, Cancelled

if TYPE_CHECKING:
    from .client import ApiClient

log = logging.getLogger("worker_sdk")

#: Прогресс уходит на сервер не чаще этого (сервер тоже троттлит).
PROGRESS_MIN_INTERVAL = 0.5
#: Long-poll сигналов задачи: сколько сервер держит запрос (не больше 25 с).
SIGNAL_WAIT_SECONDS = 25
#: Пауза перед повтором ожидания сигналов после сбоя сети.
SIGNAL_RETRY_SECONDS = 3
#: Задача не найдена на сервере — её больше нет, работу прекратить.
JOB_NOT_FOUND = "JOB_NOT_FOUND"
#: Размер блока при скачивании и загрузке файлов.
CHUNK = 1024 * 1024


class Job:
    """Задача, выданная воркеру.

    Heartbeat идёт из фонового потока: продлевает аренду и отправляет
    накопленный прогресс, лог и события. Если сервер ответил ``cancel: true``,
    ``job.cancelled`` становится ``True`` и ``check_cancelled()`` бросает
    ``Cancelled``. ``stop: true`` — просьба завершиться досрочно, но штатно:
    ``job.stop_requested`` становится ``True``, обработчик доводит шаг и
    возвращает результат как обычно.

    Отмену и остановку второй поток узнаёт сразу — long-poll сигналов задачи;
    heartbeat остаётся запасным каналом (сервер без long-poll сигналов).
    """

    def __init__(self, client: "ApiClient", payload: Dict[str, Any]) -> None:
        self._client = client
        self.id: str = payload["jobId"]
        self.queue: str = payload["queue"]
        self.data: Any = payload.get("data")
        self.attempt: int = payload.get("attempt", 0)
        self.lease_seconds: int = payload.get("leaseSeconds", 60)
        self._inputs: Dict[str, str] = payload.get("inputs") or {}
        self._outputs: Dict[str, str] = payload.get("outputs") or {}
        self._output_types: Dict[str, str] = payload.get("outputContentTypes") or {}

        self._lock = threading.Lock()
        self._progress: Optional[float] = None
        self._text: Optional[str] = None
        self._log: List[str] = []
        self._events: List[Dict[str, Any]] = []
        #: Номер последнего события: сервер по нему отбрасывает повторы.
        self._event_seq = 0
        self._cancelled = threading.Event()
        self._stop_requested = threading.Event()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._tmp = Path(tempfile.mkdtemp(prefix=f"job-{self.id[:8]}-"))
        self._thread = threading.Thread(
            target=self._heartbeat_loop, name=f"heartbeat-{self.id[:8]}", daemon=True
        )
        self._signal_thread = threading.Thread(
            target=self._signal_loop, name=f"signal-{self.id[:8]}", daemon=True
        )

    # ── для обработчика ─────────────────────────────────────────────────

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    @property
    def stop_requested(self) -> bool:
        """Попросили завершиться досрочно: довести шаг и вернуть результат."""
        return self._stop_requested.is_set()

    def check_cancelled(self) -> None:
        """Бросить ``Cancelled``, если задачу отменили."""
        if self._cancelled.is_set():
            raise Cancelled(self.id)

    def progress(self, value: float, text: Optional[str] = None) -> None:
        """Прогресс 0..1 и что делается сейчас."""
        with self._lock:
            self._progress = max(0.0, min(1.0, float(value)))
            if text is not None:
                self._text = text[:200]
        self._wake.set()

    def log(self, line: str) -> None:
        with self._lock:
            self._log.append(line[:1000])
        self._wake.set()

    def event(self, type: str, data: Any = None) -> None:
        """Событие для хука очереди на сервере (``onEvent``): метрики эпохи и т. п.

        События уходят с ближайшим heartbeat по порядку и остаются в очереди
        до подтверждения сервером: сбой сети их не теряет, повтор сервер
        отбрасывает по номеру ``seq``.
        """
        with self._lock:
            self._event_seq += 1
            self._events.append({"seq": self._event_seq, "type": type[:50], "data": data})
        self._wake.set()

    @property
    def inputs(self) -> List[str]:
        return list(self._inputs)

    @property
    def outputs(self) -> List[str]:
        return list(self._outputs)

    def input_path(self, name: str) -> Path:
        """Скачать входной файл во временный каталог задачи (один раз)."""
        target = self._tmp / "inputs" / name
        if target.exists():
            return target
        url = self._inputs.get(name)
        if url is None:
            raise KeyError(f"нет входного файла {name!r}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with requests.get(url, stream=True, timeout=self._client.timeout) as response:
            response.raise_for_status()
            with open(target, "wb") as file:
                for chunk in response.iter_content(CHUNK):
                    file.write(chunk)
        return target

    def download(self, name: str, target: Union[str, Path]) -> Path:
        """Скачать входной файл в указанное место (постоянный кэш и т. п.).

        Запись атомарна: файл появляется целиком или не появляется, так что
        прерванная загрузка не оставит битый кэш.
        """
        url = self._inputs.get(name)
        if url is None:
            raise KeyError(f"нет входного файла {name!r}")
        target = Path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(f".{target.name}.{self.id[:8]}.part")
        try:
            with requests.get(url, stream=True, timeout=self._client.timeout) as response:
                response.raise_for_status()
                with open(partial, "wb") as file:
                    for chunk in response.iter_content(CHUNK):
                        file.write(chunk)
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)
        return target

    def upload(self, name: str, source: Union[str, Path, bytes]) -> None:
        """Загрузить выходной файл по подписанной ссылке (PUT)."""
        url = self._outputs.get(name)
        if url is None:
            raise KeyError(f"нет выходного файла {name!r}")
        headers = {}
        if name in self._output_types:
            headers["Content-Type"] = self._output_types[name]
        if isinstance(source, bytes):
            response = requests.put(url, data=source, headers=headers, timeout=300)
        else:
            with open(source, "rb") as file:
                response = requests.put(url, data=file, headers=headers, timeout=300)
        response.raise_for_status()

    # ── жизненный цикл (вызывает Worker) ────────────────────────────────

    def start(self) -> None:
        self._thread.start()
        self._signal_thread.start()

    def finish(self) -> None:
        """Остановить heartbeat и отправить последний прогресс."""
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=self._client.timeout + 5)
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _heartbeat_loop(self) -> None:
        interval = max(1.0, self.lease_seconds / 3)
        last_sent = 0.0
        while not self._stop.is_set():
            woke = self._wake.wait(timeout=max(0.0, last_sent + interval - time.monotonic()))
            if self._stop.is_set():
                break
            self._wake.clear()
            now = time.monotonic()
            # Прогресс — не чаще PROGRESS_MIN_INTERVAL, продление — по интервалу.
            if woke and now - last_sent < PROGRESS_MIN_INTERVAL:
                time.sleep(PROGRESS_MIN_INTERVAL - (now - last_sent))
            if now - last_sent < interval and not self._has_pending():
                continue
            self._send_heartbeat()
            last_sent = time.monotonic()
        if self._has_pending() and not self._cancelled.is_set():
            self._send_heartbeat()

    def _signal_loop(self) -> None:
        while not self._stop.is_set() and self._poll_signal():
            pass

    def _poll_signal(self) -> bool:
        """Один long-poll сигналов задачи; ``False`` — дальше не ждать."""
        try:
            answer = self._client.post(
                f"/jobs/{self.id}/signal",
                {"attempt": self.attempt, "waitSeconds": SIGNAL_WAIT_SECONDS},
                timeout=SIGNAL_WAIT_SECONDS + 10,
                retries=0,
            )
        except ApiError as err:
            if err.code == JOB_NOT_FOUND:
                self._cancelled.set()
            elif err.status != 404:
                log.warning("сигналы задачи %s: %s", self.id, err)
            # 404 без кода задачи — сервер без long-poll сигналов: остаётся heartbeat.
            return False
        except Exception as err:  # noqa: BLE001 — сеть: подождать и спросить снова
            log.debug("сигналы задачи %s: %s", self.id, err)
            return not self._stop.wait(SIGNAL_RETRY_SECONDS)
        # Задача уже сдана: сервер разбудил ожидание её завершением.
        if self._stop.is_set():
            return False
        if answer and answer.get("cancel"):
            if not self._cancelled.is_set():
                log.info("задача %s отменена сервером", self.id)
            self._cancelled.set()
            return False
        if answer and answer.get("stop"):
            if not self._stop_requested.is_set():
                log.info("задачу %s просят завершить досрочно", self.id)
            self._stop_requested.set()
            return False
        return True

    def _has_pending(self) -> bool:
        with self._lock:
            return (
                self._progress is not None
                or self._text is not None
                or bool(self._log)
                or bool(self._events)
            )

    def _send_heartbeat(self) -> None:
        # Отправленное убирается из буферов только после ответа сервера:
        # при сбое сети оно уйдёт со следующим heartbeat.
        with self._lock:
            body: Dict[str, Any] = {"attempt": self.attempt}
            progress, text = self._progress, self._text
            if progress is not None:
                body["progress"] = progress
            if text is not None:
                body["text"] = text
            log_lines = self._log[:100]
            events = self._events[:100]
            if log_lines:
                body["log"] = log_lines
            if events:
                body["events"] = events
        try:
            answer = self._client.post(f"/jobs/{self.id}/heartbeat", body, retries=2)
        except ApiError as err:
            log.warning("heartbeat %s отклонён: %s — задача прекращается", self.id, err)
            self._cancelled.set()
            return
        except Exception as err:  # noqa: BLE001 — сеть: отправится со следующим heartbeat
            log.warning("heartbeat %s не дошёл: %s", self.id, err)
            return
        with self._lock:
            # Новые значения, записанные во время запроса, не затираются.
            if self._progress == progress:
                self._progress = None
            if self._text == text:
                self._text = None
            self._log = self._log[len(log_lines):]
            if events:
                sent = events[-1]["seq"]
                self._events = [event for event in self._events if event["seq"] > sent]
        if answer and answer.get("cancel"):
            if not self._cancelled.is_set():
                log.info("задача %s отменена сервером", self.id)
            self._cancelled.set()
        if answer and answer.get("stop") and not self._stop_requested.is_set():
            log.info("задачу %s просят завершить досрочно", self.id)
            self._stop_requested.set()
