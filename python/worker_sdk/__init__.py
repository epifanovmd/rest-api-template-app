"""SDK нагрузки агента: обработчики очередей задач на Python.

Нагрузку запускает агент (Go) и связывает с собой каналом IPC (протокол ALP,
§10): связь с сервером, повторы, учётные данные и обновление — его забота.
"""

__version__ = "2.0.0"

from .errors import AgentError, Cancelled, JobFailed  # noqa: E402
from .job import Job  # noqa: E402
from .worker import Worker  # noqa: E402

__all__ = ["AgentError", "Cancelled", "Job", "JobFailed", "Worker", "__version__"]
