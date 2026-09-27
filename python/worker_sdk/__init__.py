"""SDK внешнего воркера очереди задач (протокол — python/README.md)."""

from .client import ApiClient
from .errors import ApiError, Cancelled, JobFailed
from .job import Job
from .worker import Worker

__all__ = ["ApiClient", "ApiError", "Cancelled", "Job", "JobFailed", "Worker"]
__version__ = "1.0.0"
