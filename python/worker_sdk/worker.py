"""Нагрузка агента: регистрирует очереди, выполняет задачи в потоках."""

from __future__ import annotations

import logging
import os
import signal
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional

from . import __version__
from .channel import Channel
from .errors import Cancelled, JobFailed
from .job import Job

log = logging.getLogger("worker_sdk")

Handler = Callable[[Job], Any]


class Worker:
    """Нагрузка: обработчики очередей и цикл приёма задач от агента.

    Запускает её агент (``workloads`` в конфигурации агента) и передаёт канал
    IPC. Сеть, повторы, досылка итогов после обрыва связи, учётные данные и
    обновление — забота агента; нагрузка только выполняет задачи::

        worker = Worker("echo", version="1.0.0")

        @worker.job("demo.echo", concurrency=2)
        def echo(job: Job) -> dict:
            job.progress(0.5)
            return {"echo": job.data["text"]}

        worker.run()

    Остановка — SIGTERM (агент): новые задачи не берутся, текущие
    дорабатываются. ``workload.drain`` (замена без простоя) — то же.
    """

    def __init__(self, name: Optional[str] = None, *, version: str = "0.0.0",
                 channel: Optional[Channel] = None) -> None:
        self.name = name or os.environ.get("ALP_WORKLOAD") or "worker"
        self.version = version
        self._channel = channel
        self._handlers: Dict[str, Handler] = {}
        self._concurrency: Dict[str, int] = {}
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._draining = threading.Event()
        self._done = threading.Event()

    def job(self, queue: str, concurrency: int = 1) -> Callable[[Handler], Handler]:
        """Декоратор обработчика очереди; ``concurrency`` — задач одновременно."""

        def decorator(fn: Handler) -> Handler:
            self.register(queue, fn, concurrency)
            return fn

        return decorator

    def register(self, queue: str, fn: Handler, concurrency: int = 1) -> None:
        if concurrency < 1:
            raise ValueError("concurrency — не меньше 1")
        self._handlers[queue] = fn
        self._concurrency[queue] = concurrency

    def run(self, install_signals: bool = True) -> None:
        """Зарегистрироваться у агента и выполнять задачи до остановки."""
        if not self._handlers:
            raise RuntimeError("нет обработчиков: зарегистрируйте хотя бы одну очередь")
        channel = self._channel or Channel.from_env()
        self._channel = channel
        if install_signals:
            signal.signal(signal.SIGTERM, lambda *_: self.drain())
            signal.signal(signal.SIGINT, lambda *_: self.drain())

        pool = ThreadPoolExecutor(
            max_workers=sum(self._concurrency.values()), thread_name_prefix=f"{self.name}-job"
        )
        channel.send("workload.register", {
            "name": self.name,
            "version": self.version,
            "sdk": f"python/{__version__}",
            "queues": [{"name": q, "concurrency": n} for q, n in self._concurrency.items()],
        })
        reader = threading.Thread(target=self._read, args=(channel, pool), name="alp-ipc", daemon=True)
        reader.start()
        try:
            while not self._done.wait(0.5):
                if self._draining.is_set() and self._idle():
                    break
        finally:
            pool.shutdown(wait=True)
            channel.close()
        log.info("нагрузка %s остановлена", self.name)

    def drain(self) -> None:
        """Не брать новых задач; завершиться после текущих."""
        if not self._draining.is_set():
            log.info("нагрузка %s дорабатывает задачи и завершается", self.name)
        self._draining.set()

    # ── внутреннее ──────────────────────────────────────────────────────

    def _idle(self) -> bool:
        with self._lock:
            return not self._jobs

    def _read(self, channel: Channel, pool: ThreadPoolExecutor) -> None:
        for message in channel.messages():
            kind, data = message.get("type"), message.get("data") or {}
            if kind == "workload.ready":
                log.info("нагрузка %s зарегистрирована у агента %s", self.name, data.get("agentVersion"))
            elif kind == "job.assign":
                self._assign(channel, pool, data)
            elif kind in ("job.cancel", "job.stop"):
                with self._lock:
                    job = self._jobs.get(data.get("jobId"))
                if job and job.attempt == data.get("attempt"):
                    if kind == "job.cancel":
                        job.cancel()
                    else:
                        job.request_stop()
            elif kind == "workload.drain":
                self.drain()
        # Канал закрыт: агента нет — текущие задачи прервать, итоги некому отдать.
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            job.cancel()
        self._done.set()

    def _assign(self, channel: Channel, pool: ThreadPoolExecutor, data: Dict[str, Any]) -> None:
        job = Job(channel, data)
        if self._draining.is_set() or job.queue not in self._handlers:
            channel.send("job.fail", {
                **job.ref, "code": "WORKLOAD_STOPPING", "retryable": True,
                "message": f"Нагрузка {self.name} не берёт задачу очереди {job.queue}",
            })
            job.close()
            return
        with self._lock:
            self._jobs[job.id] = job
        pool.submit(self._execute, channel, job)

    def _execute(self, channel: Channel, job: Job) -> None:
        handler = self._handlers[job.queue]
        try:
            result = handler(job)
            if job.cancelled:
                return
            job.flush()
            channel.send("job.complete", {**job.ref, "result": result})
        except Cancelled:
            pass
        except JobFailed as err:
            if not job.cancelled:
                job.flush()
                channel.send("job.fail", {
                    **job.ref, "code": err.code, "message": err.message[:2000], "retryable": err.retryable,
                })
        except Exception as err:  # noqa: BLE001 — любая ошибка обработчика — провал попытки
            log.exception("задача %s упала", job.id)
            if not job.cancelled:
                job.flush()
                channel.send("job.fail", {
                    **job.ref, "code": "WORKER_ERROR",
                    "message": f"{type(err).__name__}: {err}"[:2000], "retryable": True,
                })
        finally:
            job.close()
            with self._lock:
                self._jobs.pop(job.id, None)
