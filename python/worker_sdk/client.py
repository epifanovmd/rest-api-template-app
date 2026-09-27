"""HTTP-клиент API воркеров: ключ, повторы сети с backoff."""

from __future__ import annotations

import logging
import random
import time
from typing import Any, Optional

import requests

from .errors import ApiError

log = logging.getLogger("worker_sdk")

#: Статусы, которые стоит повторить: сервер перегружен или перезапускается.
RETRY_STATUSES = {429, 502, 503, 504}


class ApiClient:
    """Запросы к ``/api/v1/worker``.

    Сетевые ошибки и 429/5xx повторяются с экспоненциальной задержкой и
    джиттером; 4xx — сразу ``ApiError``.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout: float = 30.0,
        max_retries: int = 5,
        backoff_base: float = 0.5,
        backoff_max: float = 30.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.session = session or requests.Session()
        self.session.headers.update(
            {"X-Api-Key": api_key, "Content-Type": "application/json"}
        )

    def post(
        self,
        path: str,
        body: dict,
        *,
        timeout: Optional[float] = None,
        retries: Optional[int] = None,
    ) -> Any:
        url = f"{self.base_url}/api/v1/worker{path}"
        attempts = self.max_retries if retries is None else retries

        for attempt in range(attempts + 1):
            try:
                response = self.session.post(
                    url, json=body, timeout=timeout or self.timeout
                )
            except requests.RequestException as err:
                if attempt >= attempts:
                    raise
                self._sleep(attempt, f"сеть: {err}")
                continue

            if response.status_code in RETRY_STATUSES or response.status_code >= 500:
                if attempt >= attempts:
                    self._raise(response)
                self._sleep(attempt, f"HTTP {response.status_code}")
                continue

            if response.status_code >= 400:
                self._raise(response)

            if response.status_code == 204 or not response.content:
                return None
            return response.json()

        raise RuntimeError("unreachable")

    def _sleep(self, attempt: int, reason: str) -> None:
        delay = min(self.backoff_max, self.backoff_base * 2**attempt)
        delay *= 0.5 + random.random() / 2
        log.warning("повтор запроса через %.1f с (%s)", delay, reason)
        time.sleep(delay)

    @staticmethod
    def _raise(response: requests.Response) -> None:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        raise ApiError(
            response.status_code,
            str(payload.get("code", "HTTP_ERROR")),
            str(payload.get("message", response.text[:200])),
        )
