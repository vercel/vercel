from __future__ import annotations

import asyncio
import logging
import sys
import threading
from collections.abc import Awaitable
from datetime import UTC, datetime, timedelta
from inspect import isawaitable
from traceback import format_tb
from typing import Any, override

from ._imports import (
    EVENT_JOB_ERROR,
    EVENT_JOB_EXECUTED,
    EVENT_JOB_MISSED,
    BaseExecutor,
    JobExecutionEvent,
    MaxInstancesReachedError,
)
from ._time import as_utc

__all__ = ["VercelExecutor"]


_MISSING = object()


async def _await_result(value: Awaitable[object]) -> object:
    return await value


def _run_awaitable(value: Awaitable[object]) -> object:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(_await_result(value))

    raise RuntimeError(
        "cannot run APScheduler async jobs from a running event loop; "
        "call this scheduler from a synchronous worker context instead"
    )


def _run_job_at_reference_time(
    job: Any,
    jobstore_alias: str,
    run_times: list[datetime],
    logger_name: str,
    reference_time: datetime | None,
) -> list[JobExecutionEvent]:
    events: list[JobExecutionEvent] = []
    logger = logging.getLogger(logger_name)
    # Evaluate misfires against the scheduler wakeup's logical time, not the worker's wall clock.
    # Example: if a 12:00 wakeup message is delivered at 12:00:07, APScheduler should still ask
    # "was the 12:00 run late relative to the 12:00 wakeup?" rather than treating transport lag as
    # part of the job's lateness budget.
    effective_reference_time = (
        as_utc(reference_time, name="reference_time")
        if reference_time is not None
        else datetime.now(UTC)
    )

    for run_time in run_times:
        if job.misfire_grace_time is not None:
            # Compare in UTC so "12:00 Europe/Berlin" and "11:00 UTC" are treated as the same
            # instant when deciding whether the logical wakeup missed its grace window.
            difference = effective_reference_time - as_utc(run_time, name="run_time")
            grace_time = timedelta(seconds=job.misfire_grace_time)
            if difference > grace_time:
                events.append(
                    JobExecutionEvent(EVENT_JOB_MISSED, job.id, jobstore_alias, run_time),
                )
                logger.warning('Run time of job "%s" was missed by %s', job, difference)
                continue

        logger.info('Running job "%s" (scheduled at %s)', job, run_time)
        try:
            retval = job.func(*job.args, **job.kwargs)
            if isawaitable(retval):
                retval = _run_awaitable(retval)
        except BaseException:
            exc, tb = sys.exc_info()[1:]
            formatted_tb = "".join(format_tb(tb))
            events.append(
                JobExecutionEvent(
                    EVENT_JOB_ERROR,
                    job.id,
                    jobstore_alias,
                    run_time,
                    exception=exc,
                    traceback=formatted_tb,
                )
            )
            logger.exception('Job "%s" raised an exception', job)
        else:
            events.append(
                JobExecutionEvent(
                    EVENT_JOB_EXECUTED,
                    job.id,
                    jobstore_alias,
                    run_time,
                    retval=retval,
                )
            )
            logger.info('Job "%s" executed successfully', job)

    return events


class VercelExecutor(BaseExecutor):
    """
    Inline executor that evaluates misfires against the scheduler wakeup's logical time.
    """

    def __init__(self) -> None:
        super().__init__()
        self._reference_time: datetime | None = None

    def set_reference_time(self, reference_time: datetime) -> None:
        self._reference_time = reference_time

    @override
    def submit_job(self, job: Any, run_times: list[datetime]) -> None:
        assert self._lock is not None, "This executor has not been started yet"
        with self._lock:
            if self._instances[job.id] >= job.max_instances:
                raise MaxInstancesReachedError(job)

            self._instances[job.id] += 1

        self._run_inline_job(job, run_times)

    def _run_inline_job(self, job: Any, run_times: list[datetime]) -> None:
        try:
            events = _run_job_at_reference_time(
                job,
                job._jobstore_alias,
                run_times,
                self._logger.name,
                self._reference_time,
            )
        except BaseException:
            self._run_job_error(job.id, *sys.exc_info()[1:])
        else:
            self._run_job_success(job.id, events)
        finally:
            self._reference_time = None

    @override
    def _do_submit_job(self, job: Any, run_times: list[datetime]) -> None:
        self._run_inline_job(job, run_times)
