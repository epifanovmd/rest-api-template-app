#!/usr/bin/env python3
"""Нагрузка очереди ``demo.echo``: возвращает текст, файлы — по желанию.

Запускает агент (``workloads`` в его конфигурации), например::

    workloads:
      - name: echo
        command: [".venv/bin/python", "-m", "examples.echo_worker"]
        dir: python

Данные задачи: ``{"text": "...", "inputKey"?: "...", "withOutput"?: true,
"sleep"?: секунд, "fail"?: "retry" | "fatal"}``.
"""

from __future__ import annotations

import logging
import os
import time

from worker_sdk import Job, JobFailed, Worker

logging.basicConfig(
    level=os.environ.get("WORKER_LOG_LEVEL", "INFO").upper(),
    format="%(levelname)s %(name)s: %(message)s",
)

worker = Worker("echo", version="2.0.0")


@worker.job("demo.echo", concurrency=int(os.environ.get("WORKER_CONCURRENCY", "2")))
def echo(job: Job) -> dict:
    data = job.data or {}
    text = str(data.get("text", ""))

    if data.get("fail") == "fatal":
        raise JobFailed("BAD_INPUT", "попросили упасть без повторов", retryable=False)
    if data.get("fail") == "retry" and job.attempt == 0:
        raise JobFailed("FLAKY", "первая попытка падает")

    steps = max(1, int(float(data.get("sleep", 0)) * 10))
    for step in range(steps):
        job.check_cancelled()
        if job.stop_requested:
            break
        job.progress((step + 1) / steps, f"шаг {step + 1} из {steps}")
        time.sleep(0.1 if data.get("sleep") else 0)
    job.log(f"эхо: {text}")
    job.event("echoed", {"length": len(text)})

    if "source" in job.inputs:
        text += " | " + job.input_path("source").read_text(encoding="utf-8")
    if "echo" in job.outputs:
        job.upload("echo", text.encode("utf-8"))

    return {"echo": text}


if __name__ == "__main__":
    worker.run()
