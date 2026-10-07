"""SDK нагрузки: протокол с агентом по socketpair (фейковый агент)."""

from __future__ import annotations

import json
import socket
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional

from worker_sdk import Cancelled, Job, JobFailed, Worker
from worker_sdk.channel import Channel
from worker_sdk import job as job_module


class FakeAgent:
    """Сторона агента: читает сообщения нагрузки, отвечает на запросы."""

    def __init__(self, sock: socket.socket) -> None:
        self.sock = sock
        self.reader = sock.makefile("rb")
        self.got: List[Dict[str, Any]] = []
        self.cond = threading.Condition()
        self.urls_reply: Optional[Dict[str, Any]] = None
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        for raw in self.reader:
            message = json.loads(raw)
            if message["type"] == "job.urls" and message.get("id"):
                self.send("job.urls", self.urls_reply or {"inputs": {}, "outputs": {}, "expiresAt": 0},
                          re=message["id"])
            with self.cond:
                self.got.append(message)
                self.cond.notify_all()

    def send(self, type: str, data: Any = None, re: Optional[str] = None) -> None:
        envelope: Dict[str, Any] = {"type": type, "data": data or {}}
        if re:
            envelope["re"] = re
        self.sock.sendall(json.dumps(envelope).encode() + b"\n")

    def wait(self, type: str, count: int = 1, timeout: float = 5.0) -> List[Dict[str, Any]]:
        deadline = time.monotonic() + timeout
        with self.cond:
            while True:
                found = [m for m in self.got if m["type"] == type]
                if len(found) >= count:
                    return found
                left = deadline - time.monotonic()
                if left <= 0:
                    raise AssertionError(f"нет {count}× {type}: {self.got}")
                self.cond.wait(left)


def assign(job_id: str, queue: str = "demo.echo", **extra: Any) -> Dict[str, Any]:
    return {"jobId": job_id, "attempt": 0, "queue": queue, "data": {"text": "hi"},
            "leaseSeconds": 60, "inputs": {}, "outputs": {}, **extra}


class WorkerProtocolTest(unittest.TestCase):
    def setUp(self) -> None:
        job_module.PROGRESS_MIN_INTERVAL = 0.05
        job_module.UPLOAD_RETRY_SECONDS = 0
        ours, theirs = socket.socketpair()
        self.agent = FakeAgent(theirs)
        self.worker = Worker("test", version="9.9", channel=Channel(ours))
        self.release = threading.Event()
        self.started = threading.Event()

        @self.worker.job("demo.echo", concurrency=2)
        def echo(job: Job) -> dict:
            job.progress(0.5, "половина")
            job.log("строка")
            job.event("step", {"n": 1})
            if job.data.get("fail") == "fatal":
                raise JobFailed("BAD_INPUT", "нет", retryable=False)
            if job.data.get("fail") == "boom":
                raise ValueError("сломалось")
            if job.data.get("wait"):
                self.started.set()
                while not self.release.wait(0.01):
                    job.check_cancelled()
                    if job.stop_requested:
                        return {"stopped": True}
            return {"echo": job.data["text"]}

        self.thread = threading.Thread(target=self.worker.run, kwargs={"install_signals": False}, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.worker.drain()
        self.release.set()
        self.thread.join(5)

    def test_register_complete_progress_event(self) -> None:
        register = self.agent.wait("workload.register")[0]["data"]
        self.assertEqual(register["queues"], [{"name": "demo.echo", "concurrency": 2}])
        self.assertEqual(register["version"], "9.9")
        self.assertTrue(register["sdk"].startswith("python/"))

        self.agent.send("workload.ready", {"agentVersion": "1"})
        self.agent.send("job.assign", assign("j1"))
        complete = self.agent.wait("job.complete")[0]["data"]
        self.assertEqual(complete, {"jobId": "j1", "attempt": 0, "result": {"echo": "hi"}})

        event = self.agent.wait("job.event")[0]["data"]
        self.assertEqual((event["seq"], event["type"]), (1, "step"))
        progress = self.agent.wait("job.progress")
        self.assertTrue(any(p["data"].get("progress") == 0.5 for p in progress))
        self.assertTrue(any("строка" in p["data"].get("log", []) for p in progress))
        # Прогресс до события — порядок сохранён.
        types = [m["type"] for m in self.agent.got if m["type"] in ("job.progress", "job.event")]
        self.assertEqual(types[0], "job.progress")

    def test_failures(self) -> None:
        self.agent.send("job.assign", assign("f1", data={"text": "x", "fail": "fatal"}))
        self.agent.send("job.assign", assign("f2", data={"text": "x", "fail": "boom"}))
        self.agent.send("job.assign", assign("f3", queue="unknown"))
        fails = {m["data"]["jobId"]: m["data"] for m in self.agent.wait("job.fail", 3)}
        self.assertEqual((fails["f1"]["code"], fails["f1"]["retryable"]), ("BAD_INPUT", False))
        self.assertEqual((fails["f2"]["code"], fails["f2"]["retryable"]), ("WORKER_ERROR", True))
        self.assertIn("ValueError", fails["f2"]["message"])
        self.assertEqual(fails["f3"]["code"], "WORKLOAD_STOPPING")

    def test_cancel_sends_nothing_and_stop_completes(self) -> None:
        self.agent.send("job.assign", assign("c1", data={"text": "x", "wait": True}))
        self.assertTrue(self.started.wait(5))
        self.agent.send("job.cancel", {"jobId": "c1", "attempt": 0})
        time.sleep(0.2)
        self.assertFalse([m for m in self.agent.got if m["type"] in ("job.complete", "job.fail")])

        self.started.clear()
        self.agent.send("job.assign", assign("s1", data={"text": "x", "wait": True}))
        self.assertTrue(self.started.wait(5))
        self.agent.send("job.stop", {"jobId": "s1", "attempt": 0})
        complete = self.agent.wait("job.complete")[0]["data"]
        self.assertEqual(complete["result"], {"stopped": True})

    def test_drain_finishes_current_and_exits(self) -> None:
        self.agent.send("job.assign", assign("d1", data={"text": "x", "wait": True}))
        self.assertTrue(self.started.wait(5))
        self.agent.send("workload.drain")
        time.sleep(0.2)
        self.assertTrue(self.thread.is_alive(), "текущая задача дорабатывается")
        self.agent.send("job.assign", assign("d2"))
        self.assertEqual(self.agent.wait("job.fail")[0]["data"]["code"], "WORKLOAD_STOPPING")
        self.release.set()
        self.agent.wait("job.complete")
        self.thread.join(5)
        self.assertFalse(self.thread.is_alive(), "после текущих задач нагрузка завершилась")


class _Uploads(BaseHTTPRequestHandler):
    received: List[bytes] = []

    def do_PUT(self) -> None:  # noqa: N802
        body = self.rfile.read(int(self.headers["Content-Length"]))
        if self.path.startswith("/expired"):
            self.send_response(403)
        else:
            _Uploads.received.append(body)
            self.send_response(200)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"input-bytes")

    def log_message(self, *args: Any) -> None:
        pass


class FilesTest(unittest.TestCase):
    def test_upload_retries_with_fresh_url_and_download(self) -> None:
        job_module.UPLOAD_RETRY_SECONDS = 0
        server = HTTPServer(("127.0.0.1", 0), _Uploads)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}"
        ours, theirs = socket.socketpair()
        agent = FakeAgent(theirs)
        agent.urls_reply = {"inputs": {}, "outputs": {"out": {"url": f"{base}/fresh", "contentType": "text/plain"}},
                            "expiresAt": int(time.time() * 1000) + 3_600_000}
        channel = Channel(ours)
        threading.Thread(target=lambda: list(channel.messages()), daemon=True).start()
        job = Job(channel, assign("u1", inputs={"src": f"{base}/in"},
                                  outputs={"out": {"url": f"{base}/expired", "contentType": "text/plain"}}))

        job.upload("out", b"result")
        self.assertEqual(_Uploads.received, [b"result"])
        self.assertEqual(len(agent.wait("job.urls")), 1)
        self.assertEqual(job.input_path("src").read_bytes(), b"input-bytes")
        with self.assertRaises(Cancelled):
            job.cancel()
            job.check_cancelled()
        job.close()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    unittest.main()
