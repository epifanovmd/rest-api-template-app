"""Исключения SDK."""

from __future__ import annotations


class Cancelled(Exception):
    """Задачу отменили или аренда потеряна: результат больше не нужен.

    Бросается из ``job.check_cancelled()``; обработчик может не ловить его —
    воркер сам прекратит задачу без ``complete``.
    """


class JobFailed(Exception):
    """Осознанная ошибка задачи с машинным кодом.

    ``retryable=False`` — повторять бессмысленно (плохие входные данные).
    """

    def __init__(self, code: str, message: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


class ApiError(Exception):
    """Ответ API с ошибкой, которую повтор не исправит (4xx)."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
