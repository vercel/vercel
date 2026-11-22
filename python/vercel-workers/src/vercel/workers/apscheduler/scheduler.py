from __future__ import annotations

import math
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any, override

from vercel.workers.apscheduler.executor import VercelExecutor

from ..client import send as send_queue_message
from ..exceptions import DuplicateIdempotencyKeyError
from ._imports import (
    EVENT_JOB_MAX_INSTANCES,
    EVENT_JOB_SUBMITTED,
    STATE_PAUSED,
    STATE_RUNNING,
    STATE_STOPPED,
    BaseScheduler,
    JobLookupError,
    JobSubmissionEvent,
    MaxInstancesReachedError,
    MemoryJobStore,
)
from ._time import (
    as_utc,
    canonical_scheduled_logical_time,
    earliest,
    require_aware_datetime,
)

WAKEUP_KIND = "apscheduler.wakeup"
WAKEUP_VERSION = 1

__all__ = [
    "PublishedWakeup",
    "VercelQueueScheduler",
    "VercelQueueSchedulerOptions",
    "WakeupPayload",
    "WakeupProcessingResult",
]


@dataclass(frozen=True, slots=True)
class WakeupPayload:
    scheduler_id: str
    logical_time: datetime

    def __post_init__(self) -> None:
        object.__setattr__(self, "logical_time", as_utc(self.logical_time, name="logical_time"))

    def to_payload(self) -> dict[str, Any]:
        return {
            "vercel": {"kind": WAKEUP_KIND, "version": WAKEUP_VERSION},
            "scheduler_id": self.scheduler_id,
            "logical_time": self.logical_time.isoformat(),
        }

    @classmethod
    def from_payload(cls, payload: Any) -> WakeupPayload:
        if not isinstance(payload, dict):
            raise ValueError("Invalid wakeup payload: expected object")

        vercel_info = payload.get("vercel")
        if not isinstance(vercel_info, dict) or vercel_info.get("kind") != WAKEUP_KIND:
            raise ValueError("Invalid wakeup payload: not an APScheduler wakeup envelope")

        if int(vercel_info.get("version", 0)) != WAKEUP_VERSION:
            raise ValueError("Invalid wakeup payload: unsupported version")

        scheduler_id = payload.get("scheduler_id")
        if not isinstance(scheduler_id, str) or not scheduler_id:
            raise ValueError("Invalid wakeup payload: missing scheduler_id")

        logical_time_raw = payload.get("logical_time")
        if not isinstance(logical_time_raw, str) or not logical_time_raw:
            raise ValueError("Invalid wakeup payload: missing logical_time")

        try:
            logical_time = datetime.fromisoformat(logical_time_raw)
        except ValueError as exc:
            raise ValueError("Invalid wakeup payload: logical_time must be ISO-8601") from exc

        return cls(scheduler_id=scheduler_id, logical_time=logical_time)


@dataclass(frozen=True, slots=True)
class PublishedWakeup:
    logical_time: datetime
    delay_seconds: int
    idempotency_key: str
    message_id: str | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "logical_time", as_utc(self.logical_time, name="logical_time"))


@dataclass(frozen=True, slots=True)
class WakeupProcessingResult:
    logical_time: datetime
    due_job_ids: tuple[str, ...]
    next_wakeup_time: datetime | None
    published_wakeup: PublishedWakeup | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "logical_time", as_utc(self.logical_time, name="logical_time"))
        if self.next_wakeup_time is not None:
            object.__setattr__(
                self,
                "next_wakeup_time",
                as_utc(self.next_wakeup_time, name="next_wakeup_time"),
            )


@dataclass(frozen=True, slots=True)
class VercelQueueSchedulerOptions:
    wakeup_topic: str = "aps-wakeups"
    scheduler_id: str = "default"
    max_delay_seconds: int = 7 * 24 * 60 * 60
    token: str | None = None
    base_url: str | None = None
    base_path: str | None = None
    deployment_id: str | None = None
    retention_seconds: int | None = None
    timeout: float | None = 10.0

    @classmethod
    def from_dict(cls, options: dict[str, Any]) -> VercelQueueSchedulerOptions:
        cfg = cls()

        wakeup_topic = options.get("wakeup_topic")
        if isinstance(wakeup_topic, str) and wakeup_topic:
            cfg = replace(cfg, wakeup_topic=wakeup_topic)

        scheduler_id = options.get("scheduler_id")
        if isinstance(scheduler_id, str) and scheduler_id:
            cfg = replace(cfg, scheduler_id=scheduler_id)

        max_delay_seconds = options.get("max_delay_seconds")
        if isinstance(max_delay_seconds, int) and max_delay_seconds > 0:
            cfg = replace(cfg, max_delay_seconds=max_delay_seconds)

        token = options.get("token")
        if isinstance(token, str) and token:
            cfg = replace(cfg, token=token)

        base_url = options.get("base_url")
        if isinstance(base_url, str) and base_url:
            cfg = replace(cfg, base_url=base_url)

        base_path = options.get("base_path")
        if isinstance(base_path, str) and base_path:
            cfg = replace(cfg, base_path=base_path)

        deployment_id = options.get("deployment_id")
        if isinstance(deployment_id, str):
            cfg = replace(cfg, deployment_id=deployment_id)

        retention_seconds = options.get("retention_seconds")
        if isinstance(retention_seconds, int) and retention_seconds >= 0:
            cfg = replace(cfg, retention_seconds=retention_seconds)

        timeout = options.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg = replace(cfg, timeout=float(timeout))

        return cfg


@dataclass(slots=True)
class _DueJobPlan:
    job: Any
    jobstore_alias: str
    run_times: list[datetime]
    next_run_time: datetime | None


class VercelQueueScheduler(BaseScheduler):
    """
    APScheduler 3 scheduler that uses Vercel Queues for exact delayed wakeups.

    The scheduler itself is rebuilt per invocation. `start()` materializes the configured
    job stores/executors, while `seed()` / `process_wakeup()` handle wakeup publication and
    due-job dispatch explicitly.

    Behavior depends on the configured job store:
      - `MemoryJobStore`: code-defined schedules rebuilt on each invocation
      - durable job stores: persisted APScheduler-managed schedules
    """

    def __init__(
        self,
        *,
        wakeup_topic: str = "aps-wakeups",
        scheduler_id: str = "default",
        max_delay_seconds: int = 7 * 24 * 60 * 60,
        token: str | None = None,
        base_url: str | None = None,
        base_path: str | None = None,
        deployment_id: str | None = None,
        retention_seconds: int | None = None,
        timeout: float | None = 10.0,
        options: VercelQueueSchedulerOptions | dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        explicit_options = VercelQueueSchedulerOptions(
            wakeup_topic=wakeup_topic,
            scheduler_id=scheduler_id,
            max_delay_seconds=max_delay_seconds,
            token=token,
            base_url=base_url,
            base_path=base_path,
            deployment_id=deployment_id,
            retention_seconds=retention_seconds,
            timeout=timeout,
        )
        if options is not None:
            if explicit_options != VercelQueueSchedulerOptions():
                raise TypeError(
                    'cannot pass explicit Vercel queue settings together with "options"; '
                    "choose one configuration style"
                )
            self.options = (
                options
                if isinstance(options, VercelQueueSchedulerOptions)
                else VercelQueueSchedulerOptions.from_dict(options)
            )
        else:
            self.options = explicit_options
        super().__init__(**kwargs)
        self._pending_jobs_reference_time: datetime | None = None

    def _create_default_executor(self) -> VercelExecutor:
        return VercelExecutor()

    def _validate_executor(self, executor: Any, *, alias: str) -> None:
        if not isinstance(executor, VercelExecutor):
            raise TypeError(
                f'executor "{alias}" must be a VercelExecutor instance because '
                "VercelQueueScheduler only supports inline job execution",
            )

    def _start_scheduler(
        self,
        paused: bool = False,
        *,
        pending_jobs_reference_time: datetime | None = None,
    ) -> None:
        self._pending_jobs_reference_time = (
            require_aware_datetime(
                pending_jobs_reference_time,
                name="pending_jobs_reference_time",
            ).astimezone(self.timezone)
            if pending_jobs_reference_time is not None
            else None
        )
        try:
            super().start(paused)
        finally:
            self._pending_jobs_reference_time = None

    def _real_add_job(self, job: Any, jobstore_alias: str, replace_existing: bool) -> None:
        if self._pending_jobs_reference_time is not None and not hasattr(job, "next_run_time"):
            # Memory-backed jobs are rebuilt on each invocation, so recompute their first
            # next_run_time from the wakeup's logical scheduler time instead of the worker's wall
            # clock. Example: if the 12:00 wakeup arrives at 12:00:07, the rebuilt schedule still
            # needs to materialize the 12:00 fire rather than skipping ahead as if it were created
            # at 12:00:07.
            job._modify(
                next_run_time=job.trigger.get_next_fire_time(
                    None,
                    self._pending_jobs_reference_time,
                )
            )
        super()._real_add_job(job, jobstore_alias, replace_existing)

    def start(self, paused: bool = False) -> None:
        self._start_scheduler(paused)
        if paused:
            return
        self.seed()

    def wakeup(self) -> None:
        return None

    def shutdown(self, wait: bool = True) -> None:
        if self.state != STATE_STOPPED:
            super().shutdown(wait)

    def ensure_started(self, *, pending_jobs_reference_time: datetime | None = None) -> None:
        if self.state == STATE_STOPPED:
            self._start_scheduler(
                pending_jobs_reference_time=pending_jobs_reference_time,
            )

    @override
    def resume(self) -> None:
        was_paused = self.state == STATE_PAUSED
        super().resume()
        if was_paused and self.state == STATE_RUNNING:
            self.seed()

    def build_wakeup_idempotency_key(self, logical_time: datetime) -> str:
        logical_time_utc = as_utc(logical_time, name="logical_time")
        return f"apscheduler:wakeup:{self.options.scheduler_id}:{logical_time_utc.isoformat()}"

    def add_executor(self, executor: Any, alias: str = "default", **executor_opts: Any) -> None:
        self._validate_executor(executor, alias=alias)
        super().add_executor(executor, alias=alias, **executor_opts)

    def publish_wakeup(
        self,
        logical_time: datetime,
        *,
        now: datetime | None = None,
    ) -> PublishedWakeup:
        # The queue delay is measured from the real publish moment, but the payload carries a
        # logical scheduler time. Keep both in UTC so DST/local timezone differences do not change
        # which bridge time or idempotency key we pick for the same underlying instant.
        now_utc = as_utc(now or datetime.now(UTC), name="now")
        # Derive bridge wakeups from the final target time so repeated seed() calls before a
        # bridge fires converge on the same intermediate logical time and idempotency key.
        scheduled_logical_time = canonical_scheduled_logical_time(
            logical_time,
            now=now_utc,
            max_delay_seconds=self.options.max_delay_seconds,
        )
        # Round up so a wakeup 4.1 seconds away requests a 5 second queue delay instead of 4 and
        # never fires early.
        delay_seconds = max(0, int(math.ceil((scheduled_logical_time - now_utc).total_seconds())))
        idempotency_key = self.build_wakeup_idempotency_key(scheduled_logical_time)
        payload = WakeupPayload(
            scheduler_id=self.options.scheduler_id,
            logical_time=scheduled_logical_time,
        ).to_payload()
        try:
            result = send_queue_message(
                self.options.wakeup_topic,
                payload,
                idempotency_key=idempotency_key,
                retention_seconds=self.options.retention_seconds,
                delay_seconds=delay_seconds,
                deployment_id=self.options.deployment_id,
                token=self.options.token,
                base_url=self.options.base_url,
                base_path=self.options.base_path,
                timeout=self.options.timeout,
            )
        except DuplicateIdempotencyKeyError:
            self._logger.info(
                'Wakeup "%s" is already scheduled via idempotency key "%s"',
                scheduled_logical_time,
                idempotency_key,
            )
            result = {"messageId": None}
        return PublishedWakeup(
            logical_time=scheduled_logical_time,
            delay_seconds=delay_seconds,
            idempotency_key=idempotency_key,
            message_id=result["messageId"],
        )

    def _get_next_wakeup_time_unchecked(self) -> datetime | None:
        next_wakeup_time: datetime | None = None
        with self._jobstores_lock:
            for jobstore in self._jobstores.values():
                next_run_time = jobstore.get_next_run_time()
                if next_run_time is not None:
                    next_wakeup_time = earliest(
                        next_wakeup_time,
                        next_run_time.astimezone(self.timezone),
                    )
        return next_wakeup_time

    def get_next_wakeup_time(self) -> datetime | None:
        self.ensure_started()
        return self._get_next_wakeup_time_unchecked()

    def seed(self, *, now: datetime | None = None) -> PublishedWakeup | None:
        self.ensure_started()
        if self.state != STATE_RUNNING:
            return None

        next_wakeup_time = self._get_next_wakeup_time_unchecked()
        if next_wakeup_time is None:
            return None
        return self.publish_wakeup(next_wakeup_time, now=now)

    def process_wakeup(
        self,
        logical_time: datetime,
        *,
        publish_next: bool = True,
        now: datetime | None = None,
    ) -> WakeupProcessingResult:
        effective_logical_time = require_aware_datetime(
            logical_time,
            name="logical_time",
        ).astimezone(self.timezone)
        self.ensure_started(
            pending_jobs_reference_time=effective_logical_time,
        )
        if self.state != STATE_RUNNING:
            return WakeupProcessingResult(
                logical_time=effective_logical_time,
                due_job_ids=(),
                next_wakeup_time=self._get_next_wakeup_time_unchecked(),
                published_wakeup=None,
            )

        due_jobs, retry_wakeup_time = self._plan_due_jobs(effective_logical_time)
        self._submit_due_jobs(due_jobs, logical_time=effective_logical_time)
        next_wakeup_time = earliest(
            retry_wakeup_time,
            self._get_next_wakeup_time_unchecked(),
        )
        published_wakeup = (
            self.publish_wakeup(next_wakeup_time, now=now)
            if publish_next and next_wakeup_time is not None
            else None
        )
        return WakeupProcessingResult(
            logical_time=effective_logical_time,
            due_job_ids=tuple(plan.job.id for plan in due_jobs),
            next_wakeup_time=next_wakeup_time,
            published_wakeup=published_wakeup,
        )

    def _plan_due_jobs(
        self,
        logical_time: datetime,
    ) -> tuple[list[_DueJobPlan], datetime | None]:
        due_jobs: list[_DueJobPlan] = []
        retry_wakeup_time: datetime | None = None
        with self._jobstores_lock:
            for jobstore_alias, jobstore in self._jobstores.items():
                try:
                    due_store_jobs = jobstore.get_due_jobs(logical_time)
                except Exception as exc:
                    self._logger.warning(
                        'Error getting due jobs from job store "%s": %s',
                        jobstore_alias,
                        exc,
                    )
                    retry_wakeup_time = earliest(
                        retry_wakeup_time,
                        logical_time + timedelta(seconds=self.jobstore_retry_interval),
                    )
                    continue

                for job in due_store_jobs:
                    run_times = job._get_run_times(logical_time)
                    if run_times and job.coalesce:
                        run_times = run_times[-1:]

                    if not run_times:
                        continue

                    next_run_time = job.trigger.get_next_fire_time(run_times[-1], logical_time)
                    due_jobs.append(
                        _DueJobPlan(
                            job=job,
                            jobstore_alias=jobstore_alias,
                            run_times=list(run_times),
                            next_run_time=next_run_time,
                        )
                    )

        return due_jobs, retry_wakeup_time

    def _submit_due_jobs(
        self,
        due_jobs: list[_DueJobPlan],
        *,
        logical_time: datetime,
    ) -> None:
        events = []
        with self._jobstores_lock:
            for plan in due_jobs:
                try:
                    executor = self._lookup_executor(plan.job.executor)
                except BaseException:
                    self._logger.error(
                        'Executor lookup ("%s") failed for job "%s" -- removing it from '
                        "the job store",
                        plan.job.executor,
                        plan.job,
                    )
                    super().remove_job(plan.job.id, plan.jobstore_alias)
                    continue

                try:
                    if hasattr(executor, "set_reference_time"):
                        executor.set_reference_time(logical_time)
                    executor.submit_job(plan.job, plan.run_times)
                except MaxInstancesReachedError:
                    self._logger.warning(
                        'Execution of job "%s" skipped: maximum number of running '
                        "instances reached (%d)",
                        plan.job,
                        plan.job.max_instances,
                    )
                    events.append(
                        JobSubmissionEvent(
                            EVENT_JOB_MAX_INSTANCES,
                            plan.job.id,
                            plan.jobstore_alias,
                            plan.run_times,
                        )
                    )
                except BaseException:
                    self._logger.exception(
                        'Error submitting job "%s" to executor "%s"',
                        plan.job,
                        plan.job.executor,
                    )
                else:
                    events.append(
                        JobSubmissionEvent(
                            EVENT_JOB_SUBMITTED,
                            plan.job.id,
                            plan.jobstore_alias,
                            plan.run_times,
                        )
                    )

                if plan.next_run_time is not None:
                    plan.job._modify(next_run_time=plan.next_run_time)
                    self._lookup_jobstore(plan.jobstore_alias).update_job(plan.job)
                else:
                    super().remove_job(plan.job.id, plan.jobstore_alias)

        for event in events:
            self._dispatch_event(event)

    def _reseed_if_running(self) -> PublishedWakeup | None:
        if self.state == STATE_RUNNING:
            return self.seed()
        return None

    def _assert_runtime_mutation_supported_by_alias(
        self,
        jobstore_alias: str | None,
        *,
        operation: str,
    ) -> None:
        if self.state != STATE_RUNNING or jobstore_alias is None:
            return

        try:
            jobstore = self._lookup_jobstore(jobstore_alias)
        except KeyError:
            return

        if isinstance(jobstore, MemoryJobStore):
            raise RuntimeError(
                f"{operation} is not supported for jobs stored in MemoryJobStore on a running "
                "VercelQueueScheduler. Define memory-backed jobs during scheduler setup on each "
                "invocation, or use a durable job store for runtime mutations.",
            )

    def _assert_runtime_mutation_supported_for_job(
        self,
        job_id: str,
        *,
        requested_jobstore: str | None,
        operation: str,
    ) -> None:
        if self.state != STATE_RUNNING:
            return

        try:
            with self._jobstores_lock:
                _, resolved_jobstore_alias = self._lookup_job(job_id, requested_jobstore)
        except JobLookupError:
            return

        self._assert_runtime_mutation_supported_by_alias(
            resolved_jobstore_alias,
            operation=operation,
        )

    def add_job(self, *args: Any, **kwargs: Any) -> Any:
        jobstore_alias = kwargs.get("jobstore", args[10] if len(args) > 10 else "default")
        self._assert_runtime_mutation_supported_by_alias(jobstore_alias, operation="add_job()")
        job = super().add_job(*args, **kwargs)
        self._reseed_if_running()
        return job

    def modify_job(self, *args: Any, **kwargs: Any) -> Any:
        job_id = kwargs.get("job_id", args[0])
        requested_jobstore = kwargs.get("jobstore", args[1] if len(args) > 1 else None)
        self._assert_runtime_mutation_supported_for_job(
            job_id,
            requested_jobstore=requested_jobstore,
            operation="modify_job()",
        )
        job = super().modify_job(*args, **kwargs)
        self._reseed_if_running()
        return job

    def reschedule_job(self, *args: Any, **kwargs: Any) -> Any:
        job_id = kwargs.get("job_id", args[0])
        requested_jobstore = kwargs.get("jobstore", args[1] if len(args) > 1 else None)
        self._assert_runtime_mutation_supported_for_job(
            job_id,
            requested_jobstore=requested_jobstore,
            operation="reschedule_job()",
        )
        job = super().reschedule_job(*args, **kwargs)
        self._reseed_if_running()
        return job

    def pause_job(self, *args: Any, **kwargs: Any) -> Any:
        job_id = kwargs.get("job_id", args[0])
        requested_jobstore = kwargs.get("jobstore", args[1] if len(args) > 1 else None)
        self._assert_runtime_mutation_supported_for_job(
            job_id,
            requested_jobstore=requested_jobstore,
            operation="pause_job()",
        )
        job = super().pause_job(*args, **kwargs)
        self._reseed_if_running()
        return job

    def resume_job(self, *args: Any, **kwargs: Any) -> Any:
        job_id = kwargs.get("job_id", args[0])
        requested_jobstore = kwargs.get("jobstore", args[1] if len(args) > 1 else None)
        self._assert_runtime_mutation_supported_for_job(
            job_id,
            requested_jobstore=requested_jobstore,
            operation="resume_job()",
        )
        job = super().resume_job(*args, **kwargs)
        self._reseed_if_running()
        return job

    def remove_job(self, *args: Any, **kwargs: Any) -> None:
        job_id = kwargs.get("job_id", args[0])
        requested_jobstore = kwargs.get("jobstore", args[1] if len(args) > 1 else None)
        self._assert_runtime_mutation_supported_for_job(
            job_id,
            requested_jobstore=requested_jobstore,
            operation="remove_job()",
        )
        super().remove_job(*args, **kwargs)
        self._reseed_if_running()

    def remove_all_jobs(self, *args: Any, **kwargs: Any) -> None:
        requested_jobstore = kwargs.get("jobstore", args[0] if args else None)
        if requested_jobstore is None and self.state == STATE_RUNNING:
            with self._jobstores_lock:
                aliases = tuple(self._jobstores.keys())
            for alias in aliases:
                self._assert_runtime_mutation_supported_by_alias(
                    alias,
                    operation="remove_all_jobs()",
                )
        else:
            self._assert_runtime_mutation_supported_by_alias(
                requested_jobstore,
                operation="remove_all_jobs()",
            )
        super().remove_all_jobs(*args, **kwargs)
        self._reseed_if_running()
