from __future__ import annotations

APSCHEDULER_IMPORT_ERROR = (
    "apscheduler is required to use vercel.workers.apscheduler. Install it with "
    "`pip install 'vercel-workers[apscheduler]'` or `pip install 'APScheduler<4'`."
)

try:
    from apscheduler.events import (
        EVENT_JOB_ERROR,
        EVENT_JOB_EXECUTED,
        EVENT_JOB_MAX_INSTANCES,
        EVENT_JOB_MISSED,
        EVENT_JOB_SUBMITTED,
        JobExecutionEvent,
        JobSubmissionEvent,
    )
    from apscheduler.executors.base import BaseExecutor, MaxInstancesReachedError
    from apscheduler.jobstores.base import JobLookupError
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.base import (
        STATE_PAUSED,
        STATE_RUNNING,
        STATE_STOPPED,
        BaseScheduler,
    )
except Exception as exc:
    raise RuntimeError(APSCHEDULER_IMPORT_ERROR) from exc

__all__ = [
    "BaseExecutor",
    "BaseScheduler",
    "EVENT_JOB_ERROR",
    "EVENT_JOB_EXECUTED",
    "EVENT_JOB_MAX_INSTANCES",
    "EVENT_JOB_MISSED",
    "EVENT_JOB_SUBMITTED",
    "JobExecutionEvent",
    "JobLookupError",
    "JobSubmissionEvent",
    "MaxInstancesReachedError",
    "MemoryJobStore",
    "STATE_PAUSED",
    "STATE_RUNNING",
    "STATE_STOPPED",
]
