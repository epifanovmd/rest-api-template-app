"""Тесты воркера netprobe (стандартная библиотека): python3 -B -m unittest -v test_netprobe.py в папке
воркера."""

import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import worker as w  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


class Listener:
    """Локальный слушатель TCP: принимает и сразу закрывает соединения."""

    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(64)
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                c, _ = self.sock.accept()
            except OSError:
                return
            c.close()

    def close(self):
        self.sock.close()


class TestParsePing(unittest.TestCase):
    CASES = [
        ("iputils", """PING example.com (192.0.2.10) 56(84) bytes of data.
64 bytes from 192.0.2.10: icmp_seq=1 ttl=56 time=11.6 ms
64 bytes from 192.0.2.10: icmp_seq=2 ttl=56 time=11.9 ms
64 bytes from 192.0.2.10: icmp_seq=3 ttl=56 time=12.1 ms

--- example.com ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 11.600/11.866/12.100/0.205 ms
""", 3, 3, 11.6, 11.866, 12.1),
        ("macos", """PING example.com (192.0.2.10): 56 data bytes
64 bytes from 192.0.2.10: icmp_seq=0 ttl=56 time=11.612 ms
Request timeout for icmp_seq 1
64 bytes from 192.0.2.10: icmp_seq=2 ttl=56 time=12.001 ms

--- example.com ping statistics ---
3 packets transmitted, 2 packets received, 33.3% packet loss
round-trip min/avg/max/stddev = 11.612/11.806/12.001/0.194 ms
""", 3, 2, 11.612, 11.806, 12.001),
        ("busybox", """PING 192.0.2.10 (192.0.2.10): 56 data bytes
64 bytes from 192.0.2.10: seq=0 ttl=64 time=0.050 ms
64 bytes from 192.0.2.10: seq=1 ttl=64 time=0.070 ms

--- 192.0.2.10 ping statistics ---
2 packets transmitted, 2 packets received, 0% packet loss
round-trip min/avg/max = 0.050/0.060/0.070 ms
""", 2, 2, 0.05, 0.06, 0.07),
        ("без строки min/avg/max", """64 bytes from 192.0.2.10: icmp_seq=1 ttl=56 time=10 ms
64 bytes from 192.0.2.10: icmp_seq=2 ttl=56 time=20 ms
2 packets transmitted, 2 received, 0% packet loss
""", 2, 2, 10, 15, 20),
        ("всё потеряно", """PING 192.0.2.10 (192.0.2.10) 56(84) bytes of data.

--- 192.0.2.10 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2050ms
""", 3, 0, 0, 0, 0),
        ("повторные ответы", """2 packets transmitted, 3 received, +1 duplicates, 0% packet loss
rtt min/avg/max/mdev = 1.0/2.0/3.0/0.5 ms
""", 2, 2, 1, 2, 3),
    ]

    def test_cases(self):
        for name, out, sent, recv, mn, avg, mx in self.CASES:
            with self.subTest(name):
                s = w.parse_ping(out)
                self.assertIsNotNone(s)
                self.assertEqual((s.sent, s.received), (sent, recv))
                self.assertAlmostEqual(s.min, mn, places=9)
                self.assertAlmostEqual(s.avg, avg, places=9)
                self.assertAlmostEqual(s.max, mx, places=9)

    def test_error_output(self):
        self.assertIsNone(w.parse_ping("ping: example.invalid: Name or service not known\n"))


class TestResult(unittest.TestCase):
    tg = {"id": "b", "host": "192.0.2.10", "port": 0, "method": "icmp"}

    def test_stats(self):
        r = w.result(self.tg, w.VIA_SOCKET, w.stats_of(3, [10.0, 20.002]))
        self.assertEqual((r["sent"], r["received"], r["lossPct"]), (3, 2, 33.3))
        self.assertEqual((r["rttMinMs"], r["rttAvgMs"], r["rttMaxMs"]), (10, 15.001, 20.002))

    def test_no_replies(self):
        # Ответов нет — полей rtt*Ms нет; попыток нет — потери 100%.
        r = w.result(self.tg, w.VIA_SOCKET, w.Stats(), RuntimeError("нет адреса"))
        self.assertEqual(json.dumps(r, ensure_ascii=False, separators=(",", ":")),
                         '{"id":"b","host":"192.0.2.10","method":"icmp","via":"socket","sent":0,"received":0,'
                         '"lossPct":100,"error":"нет адреса"}')
        r = w.result(self.tg, w.VIA_TCP, w.stats_of(4, []))
        self.assertEqual(r["lossPct"], 100)
        self.assertNotIn("rttAvgMs", r)

    def test_round(self):
        self.assertEqual(w.round_half_away(0.0005, 3), 0.001)
        self.assertEqual(w.round_half_away(66.66666, 1), 66.7)


class TestSpec(unittest.TestCase):
    def test_defaults(self):
        s = w.parse_spec({"targets": [{"id": "b", "host": "192.0.2.10"},
                                      {"id": "c", "host": "example.com", "port": 443, "method": "tcp"}]})
        self.assertEqual((s.interval_sec, s.count, s.timeout_ms), (30, 3, 1000))
        self.assertEqual(s.targets[0]["method"], "icmp")
        self.assertEqual(w.parse_spec(None).targets, [])

    def test_errors(self):
        cases = {
            '{"targets":[{"id":"b","host":"x","method":"tcp"}]}': "нужен port",
            '{"targets":[{"id":"b","host":"x"},{"id":"b","host":"y"}]}': "повторяется",
            '{"targets":[{"id":"b","host":"x","method":"udp"}]}': "icmp или tcp",
            '{"targets":[{"id":"b","host":"-x"}]}': "«-»",
            '{"targets":[],"count":1000}': "count",
            '{"targets":[],"timeoutMs":10}': "timeoutMs",
            '{"targets":[{"id":"","host":"x"}]}': "id",
            '{"targets":[{"id":"b","host":"x","port":70000,"method":"tcp"}]}': "port",
            '{"targets":[],"count":"3"}': "count",
            '{"targets":{}}': "targets",
            '[]': "spec",
        }
        for spec, want in cases.items():
            with self.subTest(spec):
                with self.assertRaises(w.SpecError) as cm:
                    w.parse_spec(json.loads(spec))
                self.assertIn(want, str(cm.exception))


class TestTCPProbe(unittest.TestCase):
    """TCP-проба к локальному слушателю: все соединения устанавливаются; закрытый порт — потери."""

    def test_probe(self):
        ln = Listener()
        p = w.Prober(gap=0.001)
        tg = {"id": "local", "host": "127.0.0.1", "port": ln.port, "method": "tcp"}
        r = p.probe(tg, 3, 1.0)
        self.assertEqual((r["via"], r["sent"], r["received"], r["lossPct"]), ("tcp", 3, 3, 0))
        self.assertIn("rttAvgMs", r)
        self.assertNotIn("error", r)
        ln.close()
        r = p.probe(tg, 2, 1.0)
        self.assertEqual((r["sent"], r["received"], r["lossPct"]), (2, 0, 100))
        self.assertNotIn("rttAvgMs", r)
        self.assertIn("dial tcp 127.0.0.1:%d" % ln.port, r["error"])


class TestICMPFallback(unittest.TestCase):
    """ICMP: нет сокета — команда ping, нет и её — TCP до порта, без порта — ошибка; узнав, что пути нет,
    проба больше его не пробует."""

    def test_fallback(self):
        calls = {"echo": 0, "ping": 0, "dial": 0}

        def echo(*_):
            calls["echo"] += 1
            raise w.NoSocket("нет")

        def ping(_host, count, _timeout):
            calls["ping"] += 1
            return w.Stats(count, count, 1, 2, 3), None

        def dial(*_):
            calls["dial"] += 1

        m = w.Methods(lookup=lambda h: "192.0.2.10", echo=echo, ping=ping, dial=dial)
        p = w.Prober(m, gap=0)
        tg = {"id": "b", "host": "192.0.2.10", "port": 22, "method": "icmp"}
        r = p.probe(tg, 2, 1.0)
        self.assertEqual((r["via"], r["received"], r["rttAvgMs"]), ("ping", 2, 2))
        p.probe(tg, 2, 1.0)
        self.assertEqual((calls["echo"], calls["ping"]), (1, 2))

        p.m.ping = lambda *_: (w.Stats(), w.NoPing("нет"))
        r = p.probe(tg, 2, 1.0)
        self.assertEqual((r["via"], r["received"], calls["dial"]), ("tcp", 2, 2))
        r = p.probe(dict(tg, port=0), 2, 1.0)
        self.assertNotIn("via", r)
        self.assertEqual(r["lossPct"], 100)
        self.assertIn("port", r["error"])

        # ping не смог (нет прав) — TCP, если есть порт.
        p = w.Prober(m, gap=0)
        p.no_socket = True
        p.m.ping = lambda *_: (w.Stats(), RuntimeError("ping: socket: Operation not permitted"))
        self.assertEqual(p.probe(tg, 1, 1.0)["via"], "tcp")

    def test_lookup_error(self):
        def lookup(_):
            raise OSError("lookup x: нет")
        p = w.Prober(w.Methods(lookup=lookup), gap=0)
        r = p.probe({"id": "b", "host": "x", "port": 0, "method": "icmp"}, 1, 1.0)
        self.assertEqual((r["via"], r["sent"], r["error"]), ("socket", 0, "lookup x: нет"))

    def test_ipv6_host(self):
        with self.assertRaises(ValueError):
            w.lookup_ipv4("::1")
        self.assertEqual(w.lookup_ipv4("::ffff:192.0.2.1"), "192.0.2.1")


class TestRound(unittest.TestCase):
    """Круг: итоги в порядке целей, at — время узла."""

    def test_round(self):
        def dial(_host, port, _timeout):
            if port == 2:
                raise OSError("refused")

        p = w.Prober(w.Methods(dial=dial), gap=0)
        targets = [{"id": "t%d" % i, "host": "192.0.2.10", "port": 1 + i % 2, "method": "tcp"} for i in range(40)]
        before = int(time.time() * 1000)
        rep = p.round(targets, 1, 1.0)
        self.assertGreaterEqual(rep["at"], before)
        self.assertEqual(len(rep["results"]), 40)
        for i, r in enumerate(rep["results"]):
            self.assertEqual(r["id"], targets[i]["id"])
            self.assertEqual(r["received"] == 1, i % 2 == 0)


class TestICMPSocket(unittest.TestCase):
    def test_loopback(self):
        """ICMP через «ping»-сокет к 127.0.0.1 — где сокет разрешён (macOS; Linux с ping_group_range)."""
        try:
            s, err = w.icmp_echo("127.0.0.1", 2, 1.0, 0.001, threading.Event())
        except w.NoSocket as e:
            self.skipTest(str(e))
        self.assertIsNone(err)
        self.assertEqual((s.sent, s.received), (2, 2))

    def test_packet(self):
        req = w.echo_request(0x1234, 7)
        self.assertEqual(w.checksum(req), 0)
        reply = b"\0" + req[1:]
        self.assertEqual(w.echo_reply(reply), (0x1234, 7))
        # С заголовком IP (macOS).
        self.assertEqual(w.echo_reply(b"\x45" + bytes(19) + reply), (0x1234, 7))
        self.assertIsNone(w.echo_reply(req))


class TestNetprobe(unittest.TestCase):
    """Настройки и задача netprobe.run: настройки задают цели и запускают круг; задача без targets — цели
    настроек (итог — и для GET /metrics), с targets — разовая проверка."""

    def test_apply_and_run(self):
        p = w.Prober(w.Methods(dial=lambda *_: None), gap=0)
        n = w.Netprobe(p)
        reports = []
        got = threading.Event()

        def report(r):
            reports.append(r)
            got.set()
        n.report = report
        n.start_loop()
        try:
            with self.assertRaises(w.SpecError):
                n.apply({"targets": [{"id": "x", "host": "x"}], "count": 0, "intervalSec": -1})
            n.apply({"targets": [{"id": "b", "host": "192.0.2.10", "port": 22, "method": "tcp"}],
                     "count": 2, "intervalSec": 3600})
            self.assertTrue(got.wait(5), "нет круга после настроек")
            r = reports.pop()
            self.assertEqual((len(r["results"]), r["results"][0]["id"], r["results"][0]["sent"]), (1, "b", 2))

            out = n.run_now({})
            self.assertEqual((len(out["results"]), len(reports)), (1, 1))
            reports.clear()
            out = n.run_now({"targets": [{"id": "c", "host": "192.0.2.11", "port": 80, "method": "tcp"}], "count": 1})
            self.assertEqual((out["results"][0]["id"], out["results"][0]["sent"], len(reports)), ("c", 1, 0))
            with self.assertRaises(w.SpecError):
                n.run_now({"targets": [{"id": "c", "host": "x", "method": "tcp"}]})
        finally:
            p.stop.set()
            n.changed.set()


class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=30)
        self._path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self._path)


class TestHandler(unittest.TestCase):
    """HTTP воркера на unix-сокете (процесс как у агента): PUT /config/targets, GET /health, GET /metrics,
    GET /results, GET /manifest, POST /jobs, служебные ошибки."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="np", dir="/tmp")
        self.sock = os.path.join(self.dir, "w.sock")
        env = dict(os.environ, AGENT_WORKER_SOCKET=self.sock, AGENT_WORKER="netprobe", PYTHONDONTWRITEBYTECODE="1")
        env.pop("AGENT_WORKER_VERSION", None)
        self.proc = subprocess.Popen([sys.executable, os.path.join(HERE, "worker.py")], env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        deadline = time.time() + 10
        while not os.path.exists(self.sock):
            if time.time() > deadline or self.proc.poll() is not None:
                self.fail("воркер не запустился: %s" % self.proc.stderr.read())
            time.sleep(0.05)
        self.ln = Listener()

    def tearDown(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc.stderr.close()
        self.ln.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def call(self, method, path, body=None):
        c = UnixHTTP(self.sock)
        try:
            c.request(method, path, body=None if body is None else json.dumps(body),
                      headers={"content-type": "application/json"})
            r = c.getresponse()
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
        finally:
            c.close()

    def test_http(self):
        self.assertEqual(self.call("GET", "/results")[0], 404)
        self.assertEqual(self.call("GET", "/metrics"), (200, {}))
        code, body = self.call("PUT", "/config/targets",
                               {"version": 1, "data": {"targets": [{"id": "x", "host": "x"}], "intervalSec": -1}})
        self.assertEqual(code, 422)
        self.assertIn("intervalSec", body["message"])
        self.assertEqual(self.call("PUT", "/config/other", {"version": 1, "data": {}})[0], 404)
        target = {"id": "b", "host": "127.0.0.1", "port": self.ln.port, "method": "tcp"}
        self.assertEqual(self.call("PUT", "/config/targets",
                                   {"version": 2, "data": {"targets": [target], "count": 1}})[0], 204)
        deadline = time.time() + 5
        while True:
            code, rep = self.call("GET", "/metrics")
            if rep.get("results"):
                break
            if time.time() > deadline:
                self.fail("нет итога в GET /metrics")
            time.sleep(0.02)
        self.assertEqual(sorted(rep), ["at", "results"])
        self.assertEqual(rep["results"][0]["via"], "tcp")
        self.assertEqual(rep["results"][0]["received"], 1)
        self.assertEqual(self.call("GET", "/results"), (200, rep))
        self.assertEqual(self.call("GET", "/health"), (200, {"ok": True, "info": {"targets": 1}}))

        code, m = self.call("GET", "/manifest")
        self.assertEqual(code, 200)
        with open(os.path.join(HERE, "VERSION")) as f:
            self.assertEqual(m["version"], f.read().strip())
        self.assertEqual([c["key"] for c in m["configs"]], ["targets"])
        self.assertEqual(m["configs"][0]["schema"], w.SCHEMA)
        self.assertEqual([j["type"] for j in m["jobs"]], ["netprobe.run"])
        self.assertTrue(m["jobs"][0]["schema"])
        self.assertEqual([(r["method"], r["path"]) for r in m["routes"]], [("GET", "/results")])
        self.assertNotIn("events", m)

        # Задача netprobe.run — итог сразу; неверные цели и другой тип — 400.
        code, body = self.call("POST", "/jobs", {"type": "netprobe.run", "jobId": "j1", "data": {"count": 1}})
        self.assertEqual(code, 200)
        self.assertEqual(sorted(body["result"]), ["at", "results"])
        code, _ = self.call("POST", "/jobs", {"type": "netprobe.run", "jobId": "j2",
                                              "data": {"targets": [{"id": "c", "host": "x", "method": "tcp"}]}})
        self.assertEqual(code, 400)
        self.assertEqual(self.call("POST", "/jobs", {"type": "netprobe.other", "jobId": "j3"})[0], 400)

        self.assertEqual(self.call("DELETE", "/config/targets")[0], 204)
        self.assertEqual(self.call("GET", "/health"), (200, {"ok": True, "info": {"targets": 0}}))


if __name__ == "__main__":
    unittest.main()
