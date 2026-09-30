"""Heartbeat задачи: события, отмена и штатная остановка."""

import unittest
from typing import Any, Dict, List

from worker_sdk.job import Job


class FakeClient:
    timeout = 5

    def __init__(self, answers: List[Any]) -> None:
        self.answers = answers
        self.sent: List[Dict[str, Any]] = []

    def post(self, path: str, body: Dict[str, Any], retries: int = 0) -> Dict[str, Any]:
        self.sent.append({"path": path, "body": body})
        answer = self.answers.pop(0) if self.answers else {"cancel": False, "stop": False}
        if isinstance(answer, Exception):
            raise answer
        return answer


def make_job(client: FakeClient) -> Job:
    return Job(client, {"jobId": "job-1", "queue": "ml.train", "attempt": 2, "leaseSeconds": 30})


class HeartbeatTest(unittest.TestCase):
    def test_events_go_with_heartbeat_in_order(self) -> None:
        client = FakeClient([])
        job = make_job(client)

        job.progress(0.5, "эпоха 1")
        job.event("epoch", {"epoch": 1})
        job.event("epoch", {"epoch": 2})
        job._send_heartbeat()

        body = client.sent[0]["body"]
        self.assertEqual(client.sent[0]["path"], "/jobs/job-1/heartbeat")
        self.assertEqual(body["attempt"], 2)
        self.assertEqual(body["progress"], 0.5)
        self.assertEqual(
            body["events"],
            [
                {"seq": 1, "type": "epoch", "data": {"epoch": 1}},
                {"seq": 2, "type": "epoch", "data": {"epoch": 2}},
            ],
        )
        self.assertFalse(job._has_pending())

    def test_network_failure_keeps_events_log_and_progress_for_next_heartbeat(self) -> None:
        client = FakeClient([ConnectionError("сеть")])
        job = make_job(client)

        job.progress(0.3, "эпоха 1")
        job.log("строка 1")
        job.event("epoch", {"epoch": 1})
        job._send_heartbeat()  # не дошёл

        job.event("epoch", {"epoch": 2})
        job._send_heartbeat()  # дошёл

        retry = client.sent[1]["body"]
        self.assertEqual([e["seq"] for e in retry["events"]], [1, 2])
        self.assertEqual(retry["log"], ["строка 1"])
        self.assertEqual(retry["progress"], 0.3)
        self.assertFalse(job._has_pending())

    def test_newer_progress_wins_over_unsent(self) -> None:
        client = FakeClient([ConnectionError("сеть")])
        job = make_job(client)

        job.progress(0.3, "эпоха 1")
        job._send_heartbeat()  # не дошёл
        job.progress(0.6, "эпоха 2")
        job._send_heartbeat()

        self.assertEqual(client.sent[1]["body"]["progress"], 0.6)
        self.assertEqual(client.sent[1]["body"]["text"], "эпоха 2")

    def test_stop_sets_flag_without_cancelling(self) -> None:
        job = make_job(FakeClient([{"cancel": False, "stop": True}]))

        job._send_heartbeat()

        self.assertTrue(job.stop_requested)
        self.assertFalse(job.cancelled)
        job.check_cancelled()

    def test_cancel_marks_job_cancelled(self) -> None:
        job = make_job(FakeClient([{"cancel": True, "stop": False}]))

        job._send_heartbeat()

        self.assertTrue(job.cancelled)


class DownloadTest(unittest.TestCase):
    def test_download_is_atomic_and_leaves_no_partial_file(self) -> None:
        import tempfile
        from pathlib import Path
        from unittest import mock

        job = Job(FakeClient([]), {"jobId": "job-1", "queue": "q", "inputs": {"weights": "http://x/w"}})

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def raise_for_status(self):
                return None

            def iter_content(self, _size):
                yield b"abc"
                yield b"def"

        with tempfile.TemporaryDirectory() as tmp, mock.patch("worker_sdk.job.requests.get", return_value=Response()):
            target = Path(tmp) / "cache" / "w.pt"
            self.assertEqual(job.download("weights", target), target)
            self.assertEqual(target.read_bytes(), b"abcdef")
            self.assertEqual([p.name for p in target.parent.iterdir()], ["w.pt"])

        with self.assertRaises(KeyError):
            job.download("missing", "x")


class WorkerTest(unittest.TestCase):
    def test_claim_introduces_worker(self) -> None:
        from worker_sdk.worker import Worker

        client = FakeClient([])
        client.post = lambda path, body, retries=0: client.sent.append({"path": path, "body": body}) or []  # type: ignore
        worker = Worker("http://api", "k.s", client=client, name="gpu-1", meta={"device": "cuda:0"})
        worker.register("ml.predict", lambda job: None)
        worker.run_once()

        body = client.sent[0]["body"]
        self.assertEqual(body["worker"]["name"], "gpu-1")
        self.assertEqual(body["worker"]["meta"]["device"], "cuda:0")
        self.assertIn("sdk", body["worker"]["meta"])


if __name__ == "__main__":
    unittest.main()
