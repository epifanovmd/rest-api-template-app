"""Цикл воркера: claim с long-poll, выполнение, complete/fail."""

from __future__ import annotations

import logging
import os
import signal
import socket
import threading
import time
import traceback
from typing import Any, Callable, Dict, List, Optional

from .client import ApiClient
from .errors import ApiError, Cancelled, JobFailed
from .job import Job

log = logging.getLogger("worker_sdk")

Handler = Callable[[Job], Any]

#: Сколько ждать задач в одном запросе claim (сервер ограничивает 25 с).
DEFAULT_WAIT_SECONDS = 20
#: Пауза после неожиданной ошибки цикла.
ERROR_PAUSE_SECONDS = 5


class Worker:
    """Воркер внешних очередей.

    >>> worker = Worker("http://api:8181", api_key="abcd1234.secret")
    >>> @worker.handler("demo.echo")
    ... def echo(job):
    ...     return {"echo": job.data["text"]}
    >>> worker.run()

    ``concurrency`` — сколько задач выполнять параллельно (потоки). SIGTERM
    и SIGINT: новые задачи не берутся, текущие дорабатывают.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        concurrency: int = 1,
        wait_seconds: int = DEFAULT_WAIT_SECONDS,
        client: Optional[ApiClient] = None,
        name: Optional[str] = None,
        meta: Optional[Dict[str, str]] = None,
    ) -> None:
        self.client = client or ApiClient(
            base_url, api_key, timeout=wait_seconds + 15
        )
        self.concurrency = max(1, concurrency)
        self.wait_seconds = wait_seconds
        self._handlers: Dict[str, Handler] = {}
        self._stopping = threading.Event()
        #: Как воркер представляется в статусе очередей.
        self.name = name or f"{socket.gethostname()}:{os.getpid()}"
        self.meta: Dict[str, str] = {"sdk": __import__("worker_sdk").__version__, **(meta or {})}

    def handler(self, queue: str) -> Callable[[Handler], Handler]:
        def register(fn: Handler) -> Handler:
            self._handlers[queue] = fn
            return fn

        return register

    def register(self, queue: str, fn: Handler) -> None:
        self._handlers[queue] = fn

    def stop(self) -> None:
        """Не брать новые задачи; текущие доработают."""
        self._stopping.set()

    def run(self, *, install_signals: bool = True) -> None:
        if not self._handlers:
            raise ValueError("нет обработчиков: worker.handler('queue')")
        if install_signals and threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, lambda *_: self.stop())
            signal.signal(signal.SIGINT, lambda *_: self.stop())

        log.info("воркер запущен: очереди %s, потоков %d", list(self._handlers), self.concurrency)
        threads = [
            threading.Thread(target=self._loop, name=f"worker-{i}", daemon=True)
            for i in range(self.concurrency)
        ]
        for thread in threads:
            thread.start()
        while any(thread.is_alive() for thread in threads):
            for thread in threads:
                thread.join(timeout=0.5)
        log.info("воркер остановлен")

    def run_once(self) -> int:
        """Взять и выполнить доступные задачи один раз (для тестов и cron)."""
        jobs = self._claim(wait_seconds=0)
        for job in jobs:
            self._execute(job)
        return len(jobs)

    # ── внутреннее ───────────────────────────────────────────────────────

    def _loop(self) -> None:
        while not self._stopping.is_set():
            try:
                for job in self._claim(self.wait_seconds):
                    self._execute(job)
            except ApiError as err:
                # 401/403/400 не пройдут сами: без паузы воркер крутил бы цикл.
                log.error("claim отклонён: %s", err)
                self._stopping.wait(ERROR_PAUSE_SECONDS * 6)
            except Exception:  # noqa: BLE001
                log.error("ошибка цикла воркера:\n%s", traceback.format_exc())
                self._stopping.wait(ERROR_PAUSE_SECONDS)

    def _claim(self, wait_seconds: int) -> List[Job]:
        payload = self.client.post(
            "/jobs/claim",
            {
                "queues": list(self._handlers),
                "max": 1,
                "waitSeconds": wait_seconds,
                "worker": {"name": self.name[:200], "meta": self.meta},
            },
        )
        return [Job(self.client, item) for item in payload or []]

    def _execute(self, job: Job) -> None:
        handler = self._handlers[job.queue]
        log.info("задача %s (%s), попытка %d", job.id, job.queue, job.attempt)
        started = time.monotonic()
        job.start()
        try:
            result = handler(job)
        except Cancelled:
            job.finish()
            log.info("задача %s отменена", job.id)
            return
        except JobFailed as err:
            job.finish()
            self._fail(job, err.code, err.message, err.retryable)
            return
        except Exception as err:  # noqa: BLE001
            job.finish()
            log.error("задача %s упала:\n%s", job.id, traceback.format_exc())
            self._fail(job, "WORKER_ERROR", f"{type(err).__name__}: {err}"[:2000], True)
            return

        job.finish()
        if job.cancelled:
            log.info("задача %s отменена — результат не отправляется", job.id)
            return
        try:
            self.client.post(
                f"/jobs/{job.id}/complete", {"attempt": job.attempt, "result": result}
            )
            log.info("задача %s выполнена за %.1f с", job.id, time.monotonic() - started)
        except ApiError as err:
            log.warning("результат задачи %s не принят: %s", job.id, err)

    def _fail(self, job: Job, code: str, message: str, retryable: bool) -> None:
        try:
            self.client.post(
                f"/jobs/{job.id}/fail",
                {"attempt": job.attempt, "code": code, "message": message, "retryable": retryable},
            )
        except ApiError as err:
            log.warning("ошибка задачи %s не принята: %s", job.id, err)
