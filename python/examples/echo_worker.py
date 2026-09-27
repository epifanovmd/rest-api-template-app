#!/usr/bin/env python3
"""Воркер очереди ``demo.echo``: возвращает текст, файлы — по желанию.

    WORKER_API_URL=http://localhost:8181 WORKER_API_KEY=<prefix.secret> \
        python examples/echo_worker.py

Данные задачи: ``{"text": "...", "inputKey"?: "...", "withOutput"?: true,
"sleep"?: секунд, "fail"?: "retry" | "fatal"}``.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from worker_sdk import Job, JobFailed, Worker  # noqa: E402

logging.basicConfig(
    level=os.environ.get("WORKER_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

worker = Worker(
    os.environ.get("WORKER_API_URL", "http://localhost:8181"),
    api_key=os.environ["WORKER_API_KEY"],
    concurrency=int(os.environ.get("WORKER_CONCURRENCY", "1")),
)


@worker.handler("demo.echo")
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
        job.progress((step + 1) / steps, f"шаг {step + 1} из {steps}")
        time.sleep(0.1 if data.get("sleep") else 0)
    job.log(f"эхо: {text}")

    if "source" in job.inputs:
        text += " | " + job.input_path("source").read_text(encoding="utf-8")
    if "echo" in job.outputs:
        job.upload("echo", text.encode("utf-8"))

    return {"echo": text}


if __name__ == "__main__":
    worker.run()
