"""Воркер netprobe — связность узла с целями: потери и время ответа (RTT) по ICMP или TCP. Python ≥ 3.8,
только стандартная библиотека; протокол агента — в базе agent_worker.py.

  настройка targets     {targets: [{id, host, port?, method?}], intervalSec?, count?, timeoutMs?} — цели
                          этого узла, не заданное — по умолчанию (30 с, 3 попытки, 1000 мс); неверные —
                          422 {message}; DELETE — целей нет
  GET  /metrics         итог последнего круга {at, results: […]}; кругов ещё не было — {}
  GET  /results         то же для сервера (маршрут из манифеста); кругов ещё не было — 404
  GET  /health          {ok, info: {targets}}
  задача netprobe.run   {targets?, count?, timeoutMs?} — проверка сейчас, итог сразу {at, results}: без
                          targets — цели из настроек (итог становится и последним для GET /metrics), с
                          targets — разовая проверка этих целей

Итог цели: {id, host, method, via?, sent, received, lossPct, rttMinMs?, rttAvgMs?, rttMaxMs?, error?};
via — socket (ICMP через «ping»-сокет), ping (системная команда ping) или tcp (время соединения).
Ответов нет — полей rtt*Ms нет; попыток не было — lossPct 100.

ICMP без прав root: «ping»-сокет (SOCK_DGRAM, IPPROTO_ICMP; на Linux — если группа процесса входит в
net.ipv4.ping_group_range), иначе системная команда ping, иначе TCP до порта цели. Адреса — IPv4.
"""

import copy
import ipaddress
import math
import random
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse

from agent_worker import Config, HTTPError, Worker, job, route

CONFIG_KEY = "targets"
JOB_RUN = "netprobe.run"

# Методы проверки цели.
METHOD_ICMP = "icmp"
METHOD_TCP = "tcp"

# Значения по умолчанию и пределы настроек.
DEFAULT_INTERVAL_SEC = 30
DEFAULT_COUNT = 3
DEFAULT_TIMEOUT_MS = 1000
MAX_TARGETS = 256
MAX_COUNT = 100
MAX_INTERVAL_SEC = 3600
MIN_TIMEOUT_MS = 50
MAX_TIMEOUT_MS = 30000
MAX_ID_LEN = 128
MAX_HOST_LEN = 253

# Каким путём проверена цель (поле via итога).
VIA_SOCKET = "socket"  # ICMP через «ping»-сокет
VIA_PING = "ping"  # ICMP через системную команду ping
VIA_TCP = "tcp"  # время соединения TCP до порта

# Сколько целей проверяется одновременно.
PARALLEL = 16
# Пауза между попытками к одной цели (ICMP через сокет и TCP), с.
ATTEMPT_GAP = 0.2

SCHEMA = {
    "type": "object",
    "properties": {
        "targets": {
            "type": "array",
            "maxItems": MAX_TARGETS,
            "items": {
                "type": "object",
                "required": ["id", "host"],
                "properties": {
                    "id": {"type": "string", "minLength": 1, "maxLength": MAX_ID_LEN},
                    "host": {"type": "string", "minLength": 1, "maxLength": MAX_HOST_LEN},
                    "port": {"type": "integer", "minimum": 0, "maximum": 65535},
                    "method": {"enum": [METHOD_ICMP, METHOD_TCP]},
                },
            },
        },
        "intervalSec": {"type": "integer", "minimum": 1, "maximum": MAX_INTERVAL_SEC},
        "count": {"type": "integer", "minimum": 1, "maximum": MAX_COUNT},
        "timeoutMs": {"type": "integer", "minimum": MIN_TIMEOUT_MS, "maximum": MAX_TIMEOUT_MS},
    },
}

JOB_SCHEMA = {
    "type": "object",
    "properties": {
        "targets": {"type": "array", "maxItems": MAX_TARGETS},
        "count": {"type": "integer", "minimum": 1, "maximum": MAX_COUNT},
        "timeoutMs": {"type": "integer", "minimum": MIN_TIMEOUT_MS, "maximum": MAX_TIMEOUT_MS},
    },
}

RESULTS_SCHEMA = {"type": "object", "properties": {"at": {"type": "integer"}, "results": {"type": "array"}}}


# ─── Настройки ─────────────────────────────────────────────────────────────

class SpecError(ValueError):
    """Неверные настройки или цели задачи."""


def _int(obj, name, where):
    """Целое поле JSON: нет или null — 0."""
    v = obj.get(name)
    if v is None:
        return 0
    if isinstance(v, bool) or not isinstance(v, int):
        raise SpecError("%s: %s — целое число" % (where, name))
    return v


def _str(obj, name, where):
    """Строковое поле JSON: нет или null — пустая строка."""
    v = obj.get(name)
    if v is None:
        return ""
    if not isinstance(v, str):
        raise SpecError("%s: %s — строка" % (where, name))
    return v


def parse_targets(raw, where):
    """Список целей из JSON: [{id, host, port?, method?}]; неизвестные поля не мешают."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SpecError("%s: targets — массив" % where)
    out = []
    for i, item in enumerate(raw):
        if item is None:
            item = {}
        if not isinstance(item, dict):
            raise SpecError("%s: targets[%d] — объект" % (where, i))
        out.append({"id": _str(item, "id", where), "host": _str(item, "host", where),
                    "port": _int(item, "port", where), "method": _str(item, "method", where)})
    return out


class Spec:
    """Настройки netprobe (ключ targets)."""

    def __init__(self, targets=None, interval_sec=0, count=0, timeout_ms=0):
        self.targets = targets or []
        self.interval_sec, self.count, self.timeout_ms = interval_sec, count, timeout_ms

    @property
    def timeout(self):
        return self.timeout_ms / 1000

    def normalize(self):
        """Значения по умолчанию и проверка пределов; ошибки — с указанием цели."""
        if self.interval_sec == 0:
            self.interval_sec = DEFAULT_INTERVAL_SEC
        if self.count == 0:
            self.count = DEFAULT_COUNT
        if self.timeout_ms == 0:
            self.timeout_ms = DEFAULT_TIMEOUT_MS
        if not 1 <= self.interval_sec <= MAX_INTERVAL_SEC:
            raise SpecError("intervalSec — от 1 до %d" % MAX_INTERVAL_SEC)
        if not 1 <= self.count <= MAX_COUNT:
            raise SpecError("count — от 1 до %d" % MAX_COUNT)
        if not MIN_TIMEOUT_MS <= self.timeout_ms <= MAX_TIMEOUT_MS:
            raise SpecError("timeoutMs — от %d до %d" % (MIN_TIMEOUT_MS, MAX_TIMEOUT_MS))
        if len(self.targets) > MAX_TARGETS:
            raise SpecError("targets — не больше %d" % MAX_TARGETS)
        seen = set()
        for i, t in enumerate(self.targets):
            if not t["method"]:
                t["method"] = METHOD_ICMP
            try:
                check_target(t)
            except SpecError as e:
                raise SpecError("targets[%d]: %s" % (i, e))
            if t["id"] in seen:
                raise SpecError('targets[%d]: id "%s" повторяется' % (i, t["id"]))
            seen.add(t["id"])


def check_target(t):
    id_len, host_len = len(t["id"].encode()), len(t["host"].encode())
    if id_len == 0 or id_len > MAX_ID_LEN:
        raise SpecError("id — от 1 до %d символов" % MAX_ID_LEN)
    if host_len == 0 or host_len > MAX_HOST_LEN:
        raise SpecError("host — от 1 до %d символов" % MAX_HOST_LEN)
    if t["host"].startswith("-"):
        raise SpecError("host не может начинаться с «-»")
    if t["port"] < 0 or t["port"] > 65535:
        raise SpecError("port — от 1 до 65535")
    if t["method"] not in (METHOD_ICMP, METHOD_TCP):
        raise SpecError('method "%s" — icmp или tcp' % t["method"])
    if t["method"] == METHOD_TCP and t["port"] == 0:
        raise SpecError("для method tcp нужен port")


def parse_spec(raw):
    """Настройки из JSON (data ключа targets): null — целей нет, значения по умолчанию."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise SpecError("spec: нужен объект {targets, intervalSec?, count?, timeoutMs?}")
    s = Spec(parse_targets(raw.get("targets"), "spec"), _int(raw, "intervalSec", "spec"),
             _int(raw, "count", "spec"), _int(raw, "timeoutMs", "spec"))
    s.normalize()
    return s


# ─── Итог проверки ─────────────────────────────────────────────────────────

class Stats:
    """Попытки и время ответа одной проверки, мс."""

    def __init__(self, sent=0, received=0, min=0.0, avg=0.0, max=0.0):  # noqa: A002 — как в итоге ping
        self.sent, self.received, self.min, self.avg, self.max = sent, received, min, avg, max

    def __repr__(self):
        return "Stats(sent=%d, received=%d, min=%r, avg=%r, max=%r)" % (
            self.sent, self.received, self.min, self.avg, self.max)


def stats_of(sent, rtts):
    """Попытки и время ответов (rtts — мс)."""
    s = Stats(sent, len(rtts))
    if rtts:
        s.min, s.max, s.avg = min(rtts), max(rtts), sum(rtts) / len(rtts)
    return s


def round_half_away(v, digits):
    """Округление до digits знаков, половина — от нуля."""
    p = 10.0 ** digits
    x = v * p
    t = math.trunc(x)
    if abs(x - t) >= 0.5:
        t += math.copysign(1, x)
    return t / p


def _num(v):
    """Число для JSON: целое значение — без «.0»."""
    return int(v) if float(v).is_integer() else v


def result(t, via, s, err=None):
    """Итог цели: потери в процентах (одна цифра после запятой), время — до микросекунд. Попыток не
    было — потери 100%."""
    r = {"id": t["id"], "host": t["host"], "method": t["method"]}
    if via:
        r["via"] = via
    r["sent"], r["received"] = s.sent, s.received
    loss = 100.0
    if s.sent > 0:
        loss = round_half_away(100 * (s.sent - s.received) / s.sent, 1)
    r["lossPct"] = _num(loss)
    if s.received > 0:
        r["rttMinMs"] = _num(round_half_away(s.min, 3))
        r["rttAvgMs"] = _num(round_half_away(s.avg, 3))
        r["rttMaxMs"] = _num(round_half_away(s.max, 3))
    msg = error_text(err) if err is not None else ""
    if msg:
        r["error"] = msg
    return r


def error_text(err):
    if isinstance(err, socket.timeout):
        return "i/o timeout"
    if isinstance(err, OSError) and err.strerror:
        return err.strerror[:1].lower() + err.strerror[1:]
    return str(err) or type(err).__name__


# ─── Пути проверки ─────────────────────────────────────────────────────────

class NoSocket(Exception):
    """«ping»-сокета на узле нет — пробуется следующий путь."""


class NoPing(Exception):
    """Команды ping на узле нет — пробуется следующий путь."""


def lookup_ipv4(host):
    """Первый адрес IPv4 узла."""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if ip.version == 4:
            return str(ip)
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        raise SpecError("%s: нужен адрес IPv4" % host)
    try:
        infos = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise OSError("lookup %s: %s" % (host, e.strerror or e))
    if not infos:
        raise OSError("%s: нет адреса IPv4" % host)
    return infos[0][4][0]


def dial_tcp(host, port, timeout):
    """Одно соединение TCP; ошибка — исключение."""
    try:
        socket.create_connection((host, port), timeout=timeout).close()
    except socket.timeout:
        raise OSError("dial tcp %s: i/o timeout" % join_host_port(host, port))
    except socket.gaierror as e:
        raise OSError("dial tcp %s: lookup %s: %s" % (join_host_port(host, port), host, e.strerror or e))
    except OSError as e:
        raise OSError("dial tcp %s: %s" % (join_host_port(host, port), error_text(e)))


def join_host_port(host, port):
    return "[%s]:%d" % (host, port) if ":" in host else "%s:%d" % (host, port)


def checksum(b):
    """Контрольная сумма ICMP (RFC 1071)."""
    if len(b) % 2:
        b = b + b"\0"
    s = sum(struct.unpack("!%dH" % (len(b) // 2), b))
    while s >> 16:
        s = (s & 0xFFFF) + (s >> 16)
    return ~s & 0xFFFF


def echo_request(id, seq):  # noqa: A002
    """ICMP Echo Request (тип 8) с контрольной суммой."""
    b = bytearray(struct.pack("!BBHHH", 8, 0, 0, id, seq) + b"netprobe........")
    struct.pack_into("!H", b, 2, checksum(bytes(b)))
    return bytes(b)


def echo_reply(b):
    """(идентификатор, номер) ICMP Echo Reply (тип 0) или None. macOS отдаёт пакет с заголовком IP —
    он пропускается."""
    if len(b) >= 20 and b[0] >> 4 == 4:
        hl = (b[0] & 0x0F) * 4
        if len(b) < hl:
            return None
        b = b[hl:]
    if len(b) < 8 or b[0] != 0 or b[1] != 0:
        return None
    return struct.unpack("!HH", b[4:8])


def icmp_socket():
    """«ping»-сокет (SOCK_DGRAM, IPPROTO_ICMP): эхо-запросы без прав root. На Linux он есть, если группа
    процесса входит в net.ipv4.ping_group_range; на macOS — всегда. Нет сокета — NoSocket."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_ICMP)
    except OSError as e:
        raise NoSocket("ping-сокет недоступен: %s" % error_text(e))
    try:
        s.bind(("0.0.0.0", 0))
    except OSError as e:
        s.close()
        raise NoSocket("ping-сокет недоступен: %s" % error_text(e))
    return s


def icmp_echo(ip, count, timeout, gap, stop):
    """count эхо-запросов к ip с паузой gap; ответ ждётся не дольше timeout → (Stats, ошибка или None).
    Сокета нет — NoSocket."""
    sock = icmp_socket()
    # Linux сам ставит идентификатор сокета и отдаёт ему только его ответы; на других системах
    # ответ узнаётся по идентификатору.
    ident = random.getrandbits(16)
    check_id = not sys.platform.startswith("linux")
    rtts, last, sent = [], None, 0
    try:
        for seq in range(1, count + 1):
            if stop.is_set() or (seq > 1 and stop.wait(gap)):
                break
            start = time.monotonic()
            sent += 1
            try:
                sock.sendto(echo_request(ident, seq), (ip, 0))
            except OSError as e:
                last = e
                continue
            deadline = start + timeout
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    break  # срок ответа истёк — попытка потеряна
                sock.settimeout(left)
                try:
                    data, _ = sock.recvfrom(1500)
                except OSError:
                    break
                reply = echo_reply(data)
                if reply and reply[1] == seq and (not check_id or reply[0] == ident):
                    rtts.append((time.monotonic() - start) * 1000)
                    break
    finally:
        sock.close()
    return stats_of(sent, rtts), last


# «3 packets transmitted, 2 received» (iputils), «… 2 packets received» (macOS, busybox).
PING_SUMMARY = re.compile(r"(\d+) packets transmitted, (\d+) (?:packets )?received")
# «rtt min/avg/max/mdev = 11.6/11.9/12.1/0.2 ms», «round-trip min/avg/max = …».
PING_RTT = re.compile(r"min/avg/max[^=]*= *([\d.]+)/([\d.]+)/([\d.]+)")
# «… icmp_seq=1 ttl=56 time=11.6 ms».
PING_TIME = re.compile(r"time[=<]([\d.]+) ?ms")


def _float(s):
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_ping(out):
    """Разбор вывода ping (iputils, macOS, busybox): запросы и ответы — из итоговой строки, время — из
    строки min/avg/max, без неё — по строкам ответов. Нет итоговой строки — None."""
    m = PING_SUMMARY.search(out)
    if not m:
        return None
    s = Stats(int(m.group(1)), int(m.group(2)))
    s.received = min(s.received, s.sent)  # повторные ответы (duplicates) не считаются
    if s.received == 0:
        return s
    r = PING_RTT.search(out)
    if r:
        s.min, s.avg, s.max = _float(r.group(1)), _float(r.group(2)), _float(r.group(3))
        return s
    rtts = []
    for v in PING_TIME.findall(out):
        try:
            rtts.append(float(v))
        except ValueError:
            pass
    if rtts:
        t = stats_of(len(rtts), rtts)
        s.min, s.avg, s.max = t.min, t.avg, t.max
    return s


def first_line(s):
    return s.strip().split("\n", 1)[0][:200]


def ping_command(host, count, timeout):
    """Системная команда ping: count запросов, ответ ждётся не дольше timeout → (Stats, ошибка или None).
    Команды нет — NoPing; вывод без итоговой строки — ошибка с его началом."""
    path = shutil.which("ping")
    if not path:
        return Stats(), NoPing("команды ping нет")
    # -W: на macOS — миллисекунды, на Linux (iputils, busybox) — секунды.
    if sys.platform == "darwin":
        wait = str(int(timeout * 1000))
    else:
        wait = str(max(1, math.ceil(timeout)))
    # Запросы — раз в секунду: весь вызов — не дольше count × (1 с + timeout) + 2 с.
    limit = count * (1 + timeout) + 2
    run_err = None
    try:
        p = subprocess.run([path, "-n", "-c", str(count), "-W", wait, host], stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=limit)
        out = p.stdout or b""
        if p.returncode != 0:
            run_err = "exit status %d" % p.returncode
    except subprocess.TimeoutExpired as e:
        out, run_err = e.output or b"", "signal: killed"
    except OSError as e:
        out, run_err = b"", error_text(e)
    text = out.decode("utf-8", errors="replace")
    s = parse_ping(text)
    if s is None:
        msg = first_line(text) or run_err or ""
        return Stats(), RuntimeError("ping: " + msg)
    return s, None


class Methods:
    """Пути проверки; в тестах подменяются.

    lookup(host) → ip; echo(ip, count, timeout, gap, stop) → (Stats, ошибка), NoSocket (ошибкой или
    исключением) — сокета нет;
    ping(host, count, timeout) → (Stats, ошибка), NoPing — команды нет; dial(host, port, timeout) —
    одно соединение TCP, ошибка — исключение."""

    def __init__(self, lookup=lookup_ipv4, echo=icmp_echo, ping=ping_command, dial=dial_tcp):
        self.lookup, self.echo, self.ping, self.dial = lookup, echo, ping, dial


class Prober:
    """Проверка целей; помнит, каких путей на узле нет."""

    def __init__(self, methods=None, gap=ATTEMPT_GAP):
        self.m = methods or Methods()
        self.gap = gap
        self.no_socket = False
        self.no_ping = False
        self.stop = threading.Event()

    def round(self, targets, count, timeout):
        """Круг проверок: цели параллельно (не больше PARALLEL), итоги — в порядке целей."""
        results = [None] * len(targets)
        sem = threading.BoundedSemaphore(PARALLEL)
        threads = []

        def work(i, t):
            try:
                results[i] = self.probe(t, count, timeout)
            except Exception as e:  # noqa: BLE001 — сбой проверки — итог цели с ошибкой
                results[i] = result(t, "", Stats(), e)
            finally:
                sem.release()

        for i, t in enumerate(targets):
            sem.acquire()
            th = threading.Thread(target=work, args=(i, t), daemon=True)
            th.start()
            threads.append(th)
        for th in threads:
            th.join()
        return {"at": int(time.time() * 1000), "results": results}

    def probe(self, t, count, timeout):
        """Одна цель: tcp — соединения до порта; icmp — сокет, иначе команда ping, иначе TCP (если у цели
        есть port)."""
        if t["method"] == METHOD_TCP:
            return self.tcp(t, count, timeout)
        if not self.no_socket:
            try:
                ip = self.m.lookup(t["host"])
            except Exception as e:  # noqa: BLE001
                return result(t, VIA_SOCKET, Stats(), e)
            try:
                s, err = self.m.echo(ip, count, timeout, self.gap, self.stop)
            except NoSocket as e:
                s, err = Stats(), e
            if not isinstance(err, NoSocket):
                return result(t, VIA_SOCKET, s, err)
            self.no_socket = True
        ping_err = None
        if not self.no_ping:
            s, err = self.m.ping(t["host"], count, timeout)
            if isinstance(err, NoPing):
                self.no_ping = True
            elif err is None or s.sent > 0 or t["port"] == 0:
                return result(t, VIA_PING, s, err)
            else:
                ping_err = err  # ping не смог (например, нет прав) — пробуем TCP
        if t["port"] > 0:
            return self.tcp(t, count, timeout)
        if ping_err is None:
            ping_err = RuntimeError("ICMP недоступен (нет ping-сокета и команды ping), а port для TCP не задан")
        return result(t, "", Stats(), ping_err)

    def tcp(self, t, count, timeout):
        """count соединений до host:port; время — до установки соединения."""
        rtts, last, sent = [], None, 0
        for i in range(count):
            if self.stop.is_set() or (i > 0 and self.stop.wait(self.gap)):
                break
            start = time.monotonic()
            sent += 1
            try:
                self.m.dial(t["host"], t["port"], timeout)
            except Exception as e:  # noqa: BLE001 — любая ошибка соединения — попытка потеряна
                last = e
                continue
            rtts.append((time.monotonic() - start) * 1000)
        return result(t, VIA_TCP, stats_of(sent, rtts), last)


# ─── Воркер ────────────────────────────────────────────────────────────────

class Netprobe(Worker):
    description = "Связность узла с целями: потери и время ответа по ICMP или TCP"

    targets = Config(CONFIG_KEY, description="Цели проверки и частота; не заданное — по умолчанию", schema=SCHEMA)

    def __init__(self, prober=None):
        super().__init__()
        self.prober = prober or Prober()
        self.lock = threading.Lock()
        self.spec = None  # None — целей ещё нет
        self.last = None
        self.changed = threading.Event()  # новые цели: начать круг сразу
        self.report = self.set_last
        self._pending = threading.local()
        self._loop = None

    # ── Состояние ─────────────────────────────────────────────────────────

    def set_last(self, rep):
        with self.lock:
            self.last = rep

    def current(self):
        with self.lock:
            return self.spec

    def apply(self, raw):
        """Новые настройки: проверить, запомнить, начать новый круг."""
        spec = parse_spec(raw)
        with self.lock:
            self.spec = spec
        self.changed.set()

    def start_loop(self):
        if self._loop is None:
            self._loop = threading.Thread(target=self.loop, daemon=True)
            self._loop.start()

    def loop(self):
        """Круг проверок раз в intervalSec (круг дольше интервала — следующий сразу после него)."""
        stop, wait = self.prober.stop, None
        while not stop.is_set():
            self.changed.wait(wait)
            self.changed.clear()
            if stop.is_set():
                return
            spec = self.current()
            if spec is None:
                wait = None
                continue
            start = time.monotonic()
            rep = self.prober.round(spec.targets, spec.count, spec.timeout)
            if stop.is_set():
                return
            self.report(rep)
            wait = max(spec.interval_sec - (time.monotonic() - start), 0)

    def run_now(self, data):
        """Задача netprobe.run: проверка сейчас. Без targets — цели из настроек (итог становится и
        последним для GET /metrics), с targets — разовая проверка этих целей (count и timeoutMs — из
        тела или настроек)."""
        if data is None:
            data = {}
        if not isinstance(data, dict):
            raise SpecError("тело: data — объект {targets?, count?, timeoutMs?}")
        count, timeout_ms = _int(data, "count", "тело"), _int(data, "timeoutMs", "тело")
        cur = self.current()
        if cur is not None:
            base = Spec(copy.deepcopy(cur.targets), cur.interval_sec, cur.count, cur.timeout_ms)
        else:
            base = Spec([], DEFAULT_INTERVAL_SEC, DEFAULT_COUNT, DEFAULT_TIMEOUT_MS)
        own = data.get("targets") is None
        if not own:
            base.targets = parse_targets(data["targets"], "targets")
        if count != 0:
            base.count = count
        if timeout_ms != 0:
            base.timeout_ms = timeout_ms
        base.normalize()
        rep = self.prober.round(base.targets, base.count, base.timeout)
        if own:
            self.report(rep)
        return rep

    # ── Что переопределено у базы ─────────────────────────────────────────

    def on_start(self):
        self.start_loop()

    def health(self):
        spec = self.current()
        return {"ok": True, "info": {"targets": len(spec.targets) if spec else 0}}

    def metrics(self):
        with self.lock:
            return self.last or {}

    def _dispatch(self, method, raw_path, headers, body):
        # GET /metrics — только итог последнего круга {at, results} (без счётчиков базы): его агент
        # кладёт в metrics.workers.netprobe.
        if method == "GET" and urlparse(raw_path).path == "/metrics":
            return 200, self.metrics()
        return super()._dispatch(method, raw_path, headers, body)

    def validate_config(self, key, data):
        try:
            self._pending.spec = parse_spec(data)
        except SpecError as e:
            raise HTTPError(422, str(e))

    def on_config(self, key, data):
        spec, self._pending.spec = getattr(self._pending, "spec", None), None
        with self.lock:
            self.spec = spec  # None — DELETE: целей нет
        if spec is not None:
            self.changed.set()

    # ── Маршруты и задачи ─────────────────────────────────────────────────

    @route("GET", "/results", description="Итог последнего круга проверок", response=RESULTS_SCHEMA)
    def results(self, req):
        with self.lock:
            last = self.last
        if last is None:
            return 404, {"message": "проверок ещё не было"}
        return last

    @job(JOB_RUN, quick=True, schema=JOB_SCHEMA,
         description="Проверка сейчас: цели из настроек или из data {targets?, count?, timeoutMs?}")
    def run_job(self, job):
        try:
            return self.run_now(job.data)
        except SpecError as e:
            raise HTTPError(400, str(e))


if __name__ == "__main__":
    Netprobe().run()
