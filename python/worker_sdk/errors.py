"""Исключения SDK нагрузки."""

from __future__ import annotations


class Cancelled(Exception):
    """Задачу отменили: работу прекратить, результат не нужен."""


class JobFailed(Exception):
    """Задача провалена с кодом; ``retryable=False`` — без повторов."""

    def __init__(self, code: str, message: str, retryable: bool = True) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.retryable = retryable


class AgentError(Exception):
    """Агент или сервер отклонили запрос нагрузки (ответ ``error``)."""

    def __init__(self, code: str, message: str, retryable: bool = True) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.retryable = retryable
