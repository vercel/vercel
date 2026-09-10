from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

pytest.importorskip("apscheduler")

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.base import BaseJobStore
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

import vercel.workers.apscheduler.app as vwa_app
from vercel.workers.apscheduler import (
    APSchedulerWorkerConfig,
    VercelQueueScheduler,
    WakeupPayload,
    seed_next_wakeup,
)
from vercel.workers.apscheduler._time import canonical_scheduled_logical_time
from vercel.workers.exceptions import DuplicateIdempotencyKeyError, MessageNotFoundError


class TestWakeupPayload:
    def test_round_trip_normalizes_logical_time_to_utc(self) -> None:
        logical_time = datetime.fromisoformat("2026-04-09T08:00:00-04:00")
        payload = WakeupPayload("scheduler-a", logical_time)

        restored = WakeupPayload.from_payload(payload.to_payload())

        assert restored.scheduler_id == "scheduler-a"
        assert restored.logical_time == datetime(2026, 4, 9, 12, 0, tzinfo=UTC)

    @pytest.mark.parametrize(
        ("payload", "message"),
        [
            ("not-an-object", "Invalid wakeup payload: expected object"),
            (
                {
                    "vercel": {"kind": "not-apscheduler", "version": 1},
                    "scheduler_id": "scheduler-a",
                    "logical_time": "2026-04-09T12:00:00+00:00",
                },
                "Invalid wakeup payload: not an APScheduler wakeup envelope",
            ),
            (
                {
                    "vercel": {"kind": "apscheduler.wakeup", "version": 2},
                    "scheduler_id": "scheduler-a",
                    "logical_time": "2026-04-09T12:00:00+00:00",
                },
                "Invalid wakeup payload: unsupported version",
            ),
            (
                {
                    "vercel": {"kind": "apscheduler.wakeup", "version": 1},
                    "logical_time": "2026-04-09T12:00:00+00:00",
                },
                "Invalid wakeup payload: missing scheduler_id",
            ),
            (
                {
                    "vercel": {"kind": "apscheduler.wakeup", "version": 1},
                    "scheduler_id": "scheduler-a",
                    "logical_time": "not-a-time",
                },
                "Invalid wakeup payload: logical_time must be ISO-8601",
            ),
            (
                {
                    "vercel": {"kind": "apscheduler.wakeup", "version": 1},
                    "scheduler_id": "scheduler-a",
                    "logical_time": "2026-04-09T12:00:00",
                },
                "logical_time must be timezone-aware",
            ),
        ],
    )
    def test_from_payload_rejects_invalid_payloads(
        self,
        payload: object,
        message: str,
    ) -> None:
        with pytest.raises(ValueError, match=message):
            WakeupPayload.from_payload(payload)


class TestTimeHelpers:
    def test_canonical_scheduled_logical_time_converges_before_same_bridge(self) -> None:
        target_run_time = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        max_delay_seconds = 7 * 24 * 60 * 60

        first = canonical_scheduled_logical_time(
            target_run_time,
            now=datetime(2026, 4, 10, 12, 0, tzinfo=UTC),
            max_delay_seconds=max_delay_seconds,
        )
        second = canonical_scheduled_logical_time(
            target_run_time,
            now=datetime(2026, 4, 11, 12, 0, tzinfo=UTC),
            max_delay_seconds=max_delay_seconds,
        )

        assert first == datetime(2026, 4, 12, 12, 0, tzinfo=UTC)
        assert second == first


class TestVercelQueueScheduler:
    def test_constructor_accepts_explicit_queue_kwargs(self) -> None:
        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            max_delay_seconds=123,
            timeout=3.5,
            timezone=UTC,
        )

        assert scheduler.options.scheduler_id == "scheduler-a"
        assert scheduler.options.wakeup_topic == "aps-wakeups"
        assert scheduler.options.max_delay_seconds == 123
        assert scheduler.options.timeout == 3.5

    def test_constructor_still_accepts_options_for_compatibility(self) -> None:
        scheduler = VercelQueueScheduler(
            options={"scheduler_id": "scheduler-a", "wakeup_topic": "aps-wakeups"},
            timezone=UTC,
        )

        assert scheduler.options.scheduler_id == "scheduler-a"
        assert scheduler.options.wakeup_topic == "aps-wakeups"

    def test_constructor_rejects_mixed_queue_configuration_styles(self) -> None:
        with pytest.raises(TypeError, match="choose one configuration style"):
            VercelQueueScheduler(
                scheduler_id="scheduler-a",
                options={"wakeup_topic": "aps-wakeups"},
                timezone=UTC,
            )

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_start_bootstraps_initial_wakeup(self, mock_send) -> None:
        mock_send.return_value = {"messageId": "message-0"}
        run_at = datetime.now(UTC) + timedelta(minutes=5)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.add_job(
            lambda: None,
            trigger=DateTrigger(run_date=run_at, timezone=UTC),
            id="job-1",
            next_run_time=run_at,
        )

        result = scheduler.start()

        assert result is None
        mock_send.assert_called_once()
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_start_treats_duplicate_initial_wakeup_as_success(self, mock_send) -> None:
        mock_send.side_effect = DuplicateIdempotencyKeyError("Duplicate idempotency key detected")
        run_at = datetime.now(UTC) + timedelta(minutes=5)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.add_job(
            lambda: None,
            trigger=DateTrigger(run_date=run_at, timezone=UTC),
            id="job-1",
            next_run_time=run_at,
        )

        result = scheduler.start()

        assert result is None
        mock_send.assert_called_once()
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_seed_publishes_next_wakeup(self, mock_send) -> None:
        mock_send.return_value = {"messageId": "message-1"}
        run_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        now = run_at - timedelta(seconds=5)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.add_job(
            lambda: None,
            trigger=DateTrigger(run_date=run_at, timezone=UTC),
            id="job-1",
            next_run_time=run_at,
        )

        published = scheduler.seed(now=now)

        assert published is not None
        assert published.logical_time == run_at
        assert published.delay_seconds == 5
        assert published.idempotency_key == (
            "apscheduler:wakeup:scheduler-a:2026-04-09T12:00:00+00:00"
        )
        mock_send.assert_called_once()
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_publish_wakeup_rounds_delay_up_to_avoid_early_fire(self, mock_send) -> None:
        mock_send.return_value = {"messageId": "message-round"}
        now = datetime(2026, 4, 9, 12, 0, 0, tzinfo=UTC)
        run_at = now + timedelta(seconds=4, microseconds=1)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        published = scheduler.publish_wakeup(run_at, now=now)

        assert published.delay_seconds == 5
        assert mock_send.call_args.kwargs["delay_seconds"] == 5

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_publish_wakeup_uses_canonical_bridge_time_for_far_future_targets(
        self, mock_send
    ) -> None:
        mock_send.return_value = {"messageId": "message-bridge"}
        target_run_time = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        first_seed_time = datetime(2026, 4, 10, 12, 0, tzinfo=UTC)
        second_seed_time = datetime(2026, 4, 11, 12, 0, tzinfo=UTC)
        expected_bridge_time = datetime(2026, 4, 12, 12, 0, tzinfo=UTC)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            max_delay_seconds=7 * 24 * 60 * 60,
            timezone=UTC,
        )

        first = scheduler.publish_wakeup(target_run_time, now=first_seed_time)
        second = scheduler.publish_wakeup(target_run_time, now=second_seed_time)

        assert first.logical_time == expected_bridge_time
        assert second.logical_time == expected_bridge_time
        assert first.delay_seconds == 2 * 24 * 60 * 60
        assert second.delay_seconds == 24 * 60 * 60
        assert first.idempotency_key == second.idempotency_key
        assert first.idempotency_key == (
            "apscheduler:wakeup:scheduler-a:2026-04-12T12:00:00+00:00"
        )
        assert mock_send.call_count == 2

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_publish_wakeup_advances_to_next_canonical_bridge_after_boundary(
        self, mock_send
    ) -> None:
        mock_send.return_value = {"messageId": "message-bridge"}
        target_run_time = datetime(2026, 5, 10, 12, 0, tzinfo=UTC)
        bridge_time = datetime(2026, 4, 12, 12, 0, tzinfo=UTC)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            max_delay_seconds=7 * 24 * 60 * 60,
            timezone=UTC,
        )

        published = scheduler.publish_wakeup(target_run_time, now=bridge_time)

        assert published.logical_time == bridge_time + timedelta(days=7)
        assert published.delay_seconds == 7 * 24 * 60 * 60
        assert published.idempotency_key == (
            "apscheduler:wakeup:scheduler-a:2026-04-19T12:00:00+00:00"
        )
        mock_send.assert_called_once()

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_process_wakeup_runs_due_job_and_publishes_successor(self, mock_send) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        def send(*args, **kwargs):
            calls.append("published")
            return {"messageId": "message-2"}

        mock_send.side_effect = send

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
        )

        result = scheduler.process_wakeup(tick_at, now=tick_at)

        assert calls == ["ran", "published"]
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time == tick_at + timedelta(seconds=30)
        assert result.published_wakeup is not None
        assert result.published_wakeup.logical_time == tick_at + timedelta(seconds=30)
        assert result.published_wakeup.delay_seconds == 30
        assert scheduler.get_next_wakeup_time() == tick_at + timedelta(seconds=30)
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_process_wakeup_does_not_skip_due_job_when_successor_publish_fails(
        self, mock_send
    ) -> None:
        mock_send.side_effect = RuntimeError("publish failed")
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
        )

        with pytest.raises(RuntimeError, match="publish failed"):
            scheduler.process_wakeup(tick_at, now=tick_at)

        assert calls == ["ran"]
        assert scheduler.get_next_wakeup_time() == tick_at + timedelta(seconds=30)
        scheduler.shutdown(wait=True)

    def test_process_wakeup_materializes_pending_jobs_from_logical_time(self) -> None:
        tick_at = datetime.now(UTC) - timedelta(seconds=5)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
        )

        result = scheduler.process_wakeup(tick_at, publish_next=False, now=datetime.now(UTC))

        assert calls == ["ran"]
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time == tick_at + timedelta(seconds=30)
        assert result.published_wakeup is None
        assert scheduler.get_next_wakeup_time() == tick_at + timedelta(seconds=30)
        scheduler.shutdown(wait=True)

    def test_process_wakeup_coalesces_multiple_missed_runs(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
            coalesce=True,
        )

        result = scheduler.process_wakeup(
            tick_at + timedelta(seconds=90),
            publish_next=False,
            now=tick_at + timedelta(seconds=90),
        )

        assert calls == ["ran"]
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time == tick_at + timedelta(seconds=120)
        scheduler.shutdown(wait=True)

    def test_process_wakeup_uses_logical_time_for_misfire_grace_window(self) -> None:
        tick_at = datetime.now(UTC) - timedelta(seconds=5)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=DateTrigger(run_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
            misfire_grace_time=1,
        )

        result = scheduler.process_wakeup(tick_at, publish_next=False)

        assert calls == ["ran"]
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time is None
        scheduler.shutdown(wait=True)

    def test_process_wakeup_skips_job_when_logical_time_exceeds_grace_window(self) -> None:
        tick_at = datetime.now(UTC) - timedelta(seconds=10)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=DateTrigger(run_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
            misfire_grace_time=1,
        )

        result = scheduler.process_wakeup(
            tick_at + timedelta(seconds=5),
            publish_next=False,
        )

        assert calls == []
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time is None
        assert scheduler.get_job("job-1") is None
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_start_paused_does_not_seed_until_resume(self, mock_send) -> None:
        mock_send.return_value = {"messageId": "message-paused"}
        run_at = datetime.now(UTC) + timedelta(minutes=5)

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.add_job(
            lambda: None,
            trigger=DateTrigger(run_date=run_at, timezone=UTC),
            id="job-1",
            next_run_time=run_at,
        )

        scheduler.start(paused=True)

        mock_send.assert_not_called()

        scheduler.resume()

        mock_send.assert_called_once()
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_process_wakeup_treats_duplicate_successor_wakeup_as_success(self, mock_send) -> None:
        mock_send.side_effect = DuplicateIdempotencyKeyError("Duplicate idempotency key detected")
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
        )

        result = scheduler.process_wakeup(tick_at, now=tick_at)

        assert calls == ["ran"]
        assert result.due_job_ids == ("job-1",)
        assert result.next_wakeup_time == tick_at + timedelta(seconds=30)
        assert result.published_wakeup is not None
        assert result.published_wakeup.message_id is None
        assert scheduler.get_next_wakeup_time() == tick_at + timedelta(seconds=30)
        mock_send.assert_called_once()
        scheduler.shutdown(wait=True)

    def test_non_inline_executor_is_rejected(self) -> None:
        with pytest.raises(TypeError, match="VercelExecutor"):
            VercelQueueScheduler(
                scheduler_id="scheduler-a",
                wakeup_topic="aps-wakeups",
                timezone=UTC,
                executors={"default": ThreadPoolExecutor(1)},
            )

    def test_process_wakeup_runs_async_job(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        async def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=DateTrigger(run_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
        )

        result = scheduler.process_wakeup(tick_at, publish_next=False, now=tick_at)

        assert calls == ["ran"]
        assert result.due_job_ids == ("job-1",)
        scheduler.shutdown(wait=True)

    def test_process_wakeup_releases_inline_executor_slot_after_each_run(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        def task() -> None:
            calls.append("ran")

        scheduler.add_job(
            task,
            trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
            id="job-1",
            next_run_time=tick_at,
            max_instances=1,
        )

        scheduler.process_wakeup(tick_at, publish_next=False, now=tick_at)
        scheduler.process_wakeup(
            tick_at + timedelta(seconds=30),
            publish_next=False,
            now=tick_at + timedelta(seconds=30),
        )

        assert calls == ["ran", "ran"]
        scheduler.shutdown(wait=True)

    def test_running_memory_jobstore_rejects_runtime_mutation(self) -> None:
        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.start()

        with pytest.raises(RuntimeError, match="MemoryJobStore"):
            scheduler.add_job(
                lambda: None,
                trigger=DateTrigger(run_date=datetime(2026, 4, 9, 12, 0, tzinfo=UTC), timezone=UTC),
                id="job-1",
                next_run_time=datetime(2026, 4, 9, 12, 0, tzinfo=UTC),
            )
        scheduler.shutdown(wait=True)

    @patch("vercel.workers.apscheduler.scheduler.send_queue_message")
    def test_running_non_memory_jobstore_can_mutate_and_reseed(self, mock_send) -> None:
        mock_send.return_value = {"messageId": "message-3"}
        run_at = datetime.now(UTC).replace(microsecond=0) + timedelta(minutes=5)

        class FakeDurableJobStore(BaseJobStore):
            def __init__(self) -> None:
                super().__init__()
                self._delegate = MemoryJobStore()

            def start(self, scheduler, alias) -> None:
                super().start(scheduler, alias)
                self._delegate.start(scheduler, alias)

            def lookup_job(self, job_id):
                return self._delegate.lookup_job(job_id)

            def get_due_jobs(self, now):
                return self._delegate.get_due_jobs(now)

            def get_next_run_time(self):
                return self._delegate.get_next_run_time()

            def get_all_jobs(self):
                return self._delegate.get_all_jobs()

            def add_job(self, job):
                self._delegate.add_job(job)

            def update_job(self, job):
                self._delegate.update_job(job)

            def remove_job(self, job_id):
                self._delegate.remove_job(job_id)

            def remove_all_jobs(self):
                self._delegate.remove_all_jobs()

            def shutdown(self):
                self._delegate.shutdown()

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )
        scheduler.add_jobstore(FakeDurableJobStore(), "durable")
        scheduler.start()
        mock_send.assert_not_called()

        scheduler.add_job(
            lambda: None,
            trigger=DateTrigger(run_date=run_at, timezone=UTC),
            id="job-1",
            next_run_time=run_at,
            jobstore="durable",
        )

        mock_send.assert_called_once()
        assert mock_send.call_args.args[0] == "aps-wakeups"
        assert mock_send.call_args.args[1]["scheduler_id"] == "scheduler-a"
        assert mock_send.call_args.args[1]["logical_time"] == run_at.isoformat()
        assert mock_send.call_args.kwargs["idempotency_key"] == (
            f"apscheduler:wakeup:scheduler-a:{run_at.isoformat()}"
        )
        scheduler.shutdown(wait=True)

    def test_process_wakeup_retries_after_jobstore_failure(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)

        class FailingJobStore(BaseJobStore):
            def lookup_job(self, job_id):
                return None

            def get_due_jobs(self, now):
                raise RuntimeError("store unavailable")

            def get_next_run_time(self):
                return None

            def get_all_jobs(self):
                return []

            def add_job(self, job):
                raise AssertionError("unexpected add_job()")

            def update_job(self, job):
                raise AssertionError("unexpected update_job()")

            def remove_job(self, job_id):
                raise AssertionError("unexpected remove_job()")

            def remove_all_jobs(self):
                return None

            def shutdown(self):
                return None

        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
            jobstore_retry_interval=7,
        )
        scheduler.add_jobstore(FailingJobStore(), "failing")

        result = scheduler.process_wakeup(
            tick_at,
            publish_next=False,
            now=tick_at,
        )

        assert result.due_job_ids == ()
        assert result.next_wakeup_time == tick_at + timedelta(seconds=7)
        scheduler.shutdown(wait=True)


class FakeVisibilityExtender:
    def __init__(self, *args, **kwargs) -> None:
        self.started = False
        self.finalized = False
        self.stopped = False

    def start(self) -> None:
        self.started = True

    def finalize(self, fn) -> None:
        self.finalized = True
        fn()

    def stop(self) -> None:
        self.stopped = True


class TestAPSchedulerWorkerCallback:
    def test_handle_queue_callback_executes_due_jobs_and_acknowledges(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        calls: list[str] = []
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"aps-wakeups","consumerGroup":"aps","messageId":"message-1"}}'
        )

        def scheduler_factory() -> VercelQueueScheduler:
            scheduler = VercelQueueScheduler(
                scheduler_id="scheduler-a",
                wakeup_topic="aps-wakeups",
                timezone=UTC,
            )

            def task() -> None:
                calls.append("ran")

            scheduler.add_job(
                task,
                trigger=IntervalTrigger(seconds=30, start_date=tick_at, timezone=UTC),
                id="job-1",
                next_run_time=tick_at,
            )
            return scheduler

        payload = WakeupPayload("scheduler-a", tick_at).to_payload()

        with patch.object(
            vwa_app.queue_callback,
            "parse_cloudevent",
            return_value=("aps-wakeups", "aps", "message-1"),
        ):
            with patch.object(
                vwa_app.queue_callback,
                "receive_message_by_id",
                return_value=(payload, 1, "created-at", "receipt-handle"),
            ):
                with patch.object(
                    vwa_app.queue_callback,
                    "VisibilityExtender",
                    FakeVisibilityExtender,
                ):
                    with patch.object(vwa_app.queue_callback, "delete_message") as delete_message:
                        with patch(
                            "vercel.workers.apscheduler.scheduler.send_queue_message",
                            return_value={"messageId": "message-2"},
                        ):
                            status_code, headers, body = vwa_app.handle_queue_callback(
                                scheduler_factory,
                                raw_body,
                                config=APSchedulerWorkerConfig(),
                            )

        assert status_code == 200
        assert ("Content-Type", "application/json") in headers
        parsed = json.loads(body.decode("utf-8"))
        assert parsed["ok"] is True
        assert parsed["schedulerId"] == "scheduler-a"
        assert parsed["dueJobIds"] == ["job-1"]
        assert parsed["nextWakeupTime"] == "2026-04-09T12:00:30+00:00"
        assert parsed["publishedWakeup"]["messageId"] == "message-2"
        assert calls == ["ran"]
        delete_message.assert_called_once_with(
            "aps-wakeups",
            "aps",
            "message-1",
            "receipt-handle",
            timeout=10.0,
        )

    def test_handle_queue_callback_ignores_invalid_wakeup_payload_and_acknowledges(self) -> None:
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"aps-wakeups","consumerGroup":"aps","messageId":"message-1"}}'
        )

        with patch.object(
            vwa_app.queue_callback,
            "parse_cloudevent",
            return_value=("aps-wakeups", "aps", "message-1"),
        ):
            with patch.object(
                vwa_app.queue_callback,
                "receive_message_by_id",
                return_value=("not-an-object", 1, "created-at", "receipt-handle"),
            ):
                with patch.object(
                    vwa_app.queue_callback,
                    "VisibilityExtender",
                    FakeVisibilityExtender,
                ):
                    with patch.object(vwa_app.queue_callback, "delete_message") as delete_message:
                        def should_not_load() -> VercelQueueScheduler:
                            raise AssertionError("scheduler should not load")

                        status_code, headers, body = vwa_app.handle_queue_callback(
                            should_not_load,
                            raw_body,
                            config=APSchedulerWorkerConfig(),
                        )

        assert status_code == 200
        assert ("Content-Type", "application/json") in headers
        parsed = json.loads(body.decode("utf-8"))
        assert parsed["ok"] is True
        assert parsed["ignored"] is True
        assert parsed["ignoredReason"] == "Invalid wakeup payload: expected object"
        delete_message.assert_called_once_with(
            "aps-wakeups",
            "aps",
            "message-1",
            "receipt-handle",
            timeout=10.0,
        )

    def test_handle_queue_callback_ignores_foreign_scheduler_id_and_acknowledges(self) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"aps-wakeups","consumerGroup":"aps","messageId":"message-1"}}'
        )
        payload = WakeupPayload("scheduler-a", tick_at).to_payload()

        def scheduler_factory() -> VercelQueueScheduler:
            return VercelQueueScheduler(
                scheduler_id="scheduler-b",
                wakeup_topic="aps-wakeups",
                timezone=UTC,
            )

        with patch.object(
            vwa_app.queue_callback,
            "parse_cloudevent",
            return_value=("aps-wakeups", "aps", "message-1"),
        ):
            with patch.object(
                vwa_app.queue_callback,
                "receive_message_by_id",
                return_value=(payload, 1, "created-at", "receipt-handle"),
            ):
                with patch.object(
                    vwa_app.queue_callback,
                    "VisibilityExtender",
                    FakeVisibilityExtender,
                ):
                    with patch.object(vwa_app.queue_callback, "delete_message") as delete_message:
                        status_code, headers, body = vwa_app.handle_queue_callback(
                            scheduler_factory,
                            raw_body,
                            config=APSchedulerWorkerConfig(),
                        )

        assert status_code == 200
        assert ("Content-Type", "application/json") in headers
        parsed = json.loads(body.decode("utf-8"))
        assert parsed["ok"] is True
        assert parsed["ignored"] is True
        assert parsed["ignoredReason"] == (
            "Wakeup payload targeted scheduler 'scheduler-a', expected 'scheduler-b'"
        )
        delete_message.assert_called_once_with(
            "aps-wakeups",
            "aps",
            "message-1",
            "receipt-handle",
            timeout=10.0,
        )

    def test_handle_queue_callback_returns_500_without_ack_on_processing_failure(
        self,
    ) -> None:
        tick_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"aps-wakeups","consumerGroup":"aps","messageId":"message-1"}}'
        )
        payload = WakeupPayload("scheduler-a", tick_at).to_payload()
        extenders: list[FakeVisibilityExtender] = []
        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        class TrackingVisibilityExtender(FakeVisibilityExtender):
            def __init__(self, *args, **kwargs) -> None:
                super().__init__(*args, **kwargs)
                extenders.append(self)

        with patch.object(
            vwa_app.queue_callback,
            "parse_cloudevent",
            return_value=("aps-wakeups", "aps", "message-1"),
        ):
            with patch.object(
                vwa_app.queue_callback,
                "receive_message_by_id",
                return_value=(payload, 1, "created-at", "receipt-handle"),
            ):
                with patch.object(
                    vwa_app.queue_callback,
                    "VisibilityExtender",
                    TrackingVisibilityExtender,
                ):
                    with patch.object(vwa_app.queue_callback, "delete_message") as delete_message:
                        with patch.object(
                            scheduler,
                            "process_wakeup",
                            side_effect=RuntimeError("boom"),
                        ):
                            with patch.object(scheduler, "shutdown") as shutdown:
                                status_code, headers, body = vwa_app.handle_queue_callback(
                                    lambda: scheduler,
                                    raw_body,
                                    config=APSchedulerWorkerConfig(),
                                )

        assert status_code == 500
        assert ("Content-Type", "application/json") in headers
        assert json.loads(body.decode("utf-8")) == {"error": "internal"}
        delete_message.assert_not_called()
        shutdown.assert_called_once_with(wait=True)
        assert len(extenders) == 1
        assert extenders[0].started is True
        assert extenders[0].finalized is False
        assert extenders[0].stopped is True

    def test_handle_queue_callback_returns_retryable_queue_errors(self) -> None:
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"aps-wakeups","consumerGroup":"aps","messageId":"message-1"}}'
        )

        with patch.object(
            vwa_app.queue_callback,
            "parse_cloudevent",
            return_value=("aps-wakeups", "aps", "message-1"),
        ):
            with patch.object(
                vwa_app.queue_callback,
                "receive_message_by_id",
                side_effect=MessageNotFoundError("message-1"),
            ):
                with patch.object(vwa_app.queue_callback, "delete_message") as delete_message:
                    status_code, headers, body = vwa_app.handle_queue_callback(
                        lambda: (_ for _ in ()).throw(AssertionError("scheduler should not load")),
                        raw_body,
                        config=APSchedulerWorkerConfig(),
                    )

        assert status_code == 404
        assert ("Content-Type", "application/json") in headers
        parsed = json.loads(body.decode("utf-8"))
        assert parsed["type"] == "MessageNotFoundError"
        delete_message.assert_not_called()

    def test_seed_next_wakeup_shuts_down_scheduler_on_error(self) -> None:
        run_at = datetime(2026, 4, 9, 12, 0, tzinfo=UTC)
        scheduler = VercelQueueScheduler(
            scheduler_id="scheduler-a",
            wakeup_topic="aps-wakeups",
            timezone=UTC,
        )

        with patch.object(scheduler, "seed", side_effect=RuntimeError("boom")):
            with patch.object(scheduler, "shutdown") as shutdown:
                with pytest.raises(RuntimeError, match="boom"):
                    seed_next_wakeup(lambda: scheduler, now=run_at)

        shutdown.assert_called_once_with(wait=True)
