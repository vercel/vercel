"""Tests for vercel.workers.dramatiq adapter."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

# Skip all tests in this module if dramatiq is not installed
pytest.importorskip("dramatiq")

import dramatiq
from dramatiq.message import Message

from vercel.workers.dramatiq import (
    DramatiqWorkerConfig,
    PollingWorker,
    VercelDramatiqEncoder,
    VercelQueuesBroker,
    VercelQueuesBrokerOptions,
)
from vercel.workers.dramatiq.broker import (
    _envelope_to_message,
    _message_to_envelope,
)
from vercel.workers.dramatiq.worker import _execute_message


class TestVercelQueuesBrokerOptions:
    def test_default_options(self):
        opts = VercelQueuesBrokerOptions()
        assert opts.token is None
        assert opts.base_url is None
        assert opts.base_path is None
        assert opts.retention_seconds is None
        assert opts.deployment_id is None
        assert opts.timeout == 10.0
        assert opts.visibility_timeout_seconds == 30
        assert opts.visibility_refresh_interval_seconds == 10.0
        assert opts.use_message_id_as_idempotency_key is True

    def test_from_dict(self):
        opts = VercelQueuesBrokerOptions.from_dict(
            {
                "token": "test-token",
                "base_url": "https://example.com",
                "base_path": "/api/v3/messages",
                "retention_seconds": 3600,
                "deployment_id": "deploy-123",
                "timeout": 30.0,
                "visibility_timeout_seconds": 60,
                "visibility_refresh_interval_seconds": 15.0,
                "use_message_id_as_idempotency_key": False,
            }
        )
        assert opts.token == "test-token"
        assert opts.base_url == "https://example.com"
        assert opts.base_path == "/api/v3/messages"
        assert opts.retention_seconds == 3600
        assert opts.deployment_id == "deploy-123"
        assert opts.timeout == 30.0
        assert opts.visibility_timeout_seconds == 60
        assert opts.visibility_refresh_interval_seconds == 15.0
        assert opts.use_message_id_as_idempotency_key is False

    def test_from_dict_ignores_invalid_types(self):
        opts = VercelQueuesBrokerOptions.from_dict(
            {
                "token": 123,  # invalid type
                "visibility_timeout_seconds": "not-an-int",  # invalid type
            }
        )
        assert opts.token is None
        assert opts.visibility_timeout_seconds == 30  # default


class TestVercelQueuesBroker:
    def test_broker_initialization(self):
        broker = VercelQueuesBroker()
        assert isinstance(broker.options, VercelQueuesBrokerOptions)
        assert len(broker.get_declared_queues()) == 0

    def test_broker_with_options(self):
        broker = VercelQueuesBroker(options={"timeout": 20.0})
        assert broker.options.timeout == 20.0

    def test_declare_queue(self):
        broker = VercelQueuesBroker()
        broker.declare_queue("my-queue")
        assert "my-queue" in broker.get_declared_queues()

    def test_declare_queue_idempotent(self):
        broker = VercelQueuesBroker()
        broker.declare_queue("my-queue")
        broker.declare_queue("my-queue")
        assert list(broker.get_declared_queues()).count("my-queue") == 1

    def test_get_declared_delay_queues_empty(self):
        broker = VercelQueuesBroker()
        broker.declare_queue("my-queue")
        assert broker.get_declared_delay_queues() == set()

    def test_consume_raises_not_implemented(self):
        broker = VercelQueuesBroker()
        consumer = broker.consume("my-queue")
        with pytest.raises(NotImplementedError):
            next(consumer)

    def test_join_raises_not_implemented(self):
        broker = VercelQueuesBroker()
        with pytest.raises(NotImplementedError):
            broker.join("my-queue")

    @patch("vercel.workers.dramatiq.broker.send")
    def test_enqueue(self, mock_send: MagicMock):
        mock_send.return_value = {"messageId": "msg-123"}

        broker = VercelQueuesBroker()
        message = Message(
            queue_name="my-queue",
            actor_name="my_actor",
            args=(1, 2),
            kwargs={"key": "value"},
            options={},
        )

        result = broker.enqueue(message)

        assert result.message_id == message.message_id
        mock_send.assert_called_once()
        call_args = mock_send.call_args
        assert call_args[0][0] == "my-queue"  # queue_name
        envelope = call_args[0][1]
        assert envelope["vercel"]["kind"] == "dramatiq"
        assert envelope["actor_name"] == "my_actor"
        assert envelope["args"] == [1, 2]
        assert envelope["kwargs"] == {"key": "value"}


class TestMessageEnvelopeConversion:
    def test_message_to_envelope(self):
        message = Message(
            queue_name="test-queue",
            actor_name="test_actor",
            args=(1, "hello"),
            kwargs={"x": 10},
            options={"retries": 3},
            message_id="msg-abc-123",
            message_timestamp=1234567890,
        )

        envelope = _message_to_envelope(message, "test-queue")

        assert envelope["vercel"] == {"kind": "dramatiq", "version": 1}
        assert envelope["queue_name"] == "test-queue"
        assert envelope["actor_name"] == "test_actor"
        assert envelope["message_id"] == "msg-abc-123"
        assert envelope["message_timestamp"] == 1234567890
        assert envelope["args"] == [1, "hello"]
        assert envelope["kwargs"] == {"x": 10}
        assert envelope["options"] == {"retries": 3}

    def test_envelope_to_message(self):
        envelope = {
            "vercel": {"kind": "dramatiq", "version": 1},
            "queue_name": "test-queue",
            "actor_name": "test_actor",
            "message_id": "msg-xyz-789",
            "message_timestamp": 9876543210,
            "args": ["a", "b"],
            "kwargs": {"y": 20},
            "options": {"retries": 5},
        }

        message = _envelope_to_message(envelope)

        assert message.queue_name == "test-queue"
        assert message.actor_name == "test_actor"
        assert message.message_id == "msg-xyz-789"
        assert message.message_timestamp == 9876543210
        assert message.args == ("a", "b")
        assert message.kwargs == {"y": 20}
        assert message.options == {"retries": 5}

    def test_round_trip_conversion(self):
        original = Message(
            queue_name="round-trip-queue",
            actor_name="round_trip_actor",
            args=(42, [1, 2, 3]),
            kwargs={"nested": {"data": True}},
            options={"max_retries": 10},
        )

        envelope = _message_to_envelope(original, "round-trip-queue")
        restored = _envelope_to_message(envelope)

        assert restored.queue_name == original.queue_name
        assert restored.actor_name == original.actor_name
        assert restored.message_id == original.message_id
        assert restored.message_timestamp == original.message_timestamp
        assert restored.args == original.args
        assert restored.kwargs == original.kwargs
        assert restored.options == original.options

    def test_envelope_to_message_invalid_kind(self):
        envelope = {"vercel": {"kind": "not-dramatiq"}}
        with pytest.raises(ValueError, match="expected kind='dramatiq'"):
            _envelope_to_message(envelope)


class TestDramatiqWorkerConfig:
    def test_default_config(self):
        cfg = DramatiqWorkerConfig()
        assert cfg.visibility_timeout_seconds == 30
        assert cfg.visibility_refresh_interval_seconds == 10.0
        assert cfg.timeout == 10.0
        assert cfg.max_retries == 3
        assert cfg.retry_backoff_base_ms == 5000
        assert cfg.retry_backoff_factor == 2.0
        assert cfg.max_retry_delay_ms == 60 * 60 * 1000

    def test_from_broker_options(self):
        broker = VercelQueuesBroker(
            options={
                "visibility_timeout_seconds": 60,
                "visibility_refresh_interval_seconds": 20.0,
                "timeout": 30.0,
            }
        )
        cfg = DramatiqWorkerConfig.from_broker_options(broker)
        assert cfg.visibility_timeout_seconds == 60
        assert cfg.visibility_refresh_interval_seconds == 20.0
        assert cfg.timeout == 30.0


class TestPollingWorker:
    def test_worker_initialization(self):
        broker = VercelQueuesBroker()
        worker = PollingWorker(
            broker,
            queue_name="test-queue",
            consumer_group="test-group",
            visibility_timeout_seconds=120,
            poll_interval_seconds=2.0,
            debug=True,
        )
        assert worker.queue_name == "test-queue"
        assert worker.consumer_group == "test-group"
        assert worker.visibility_timeout_seconds == 120
        assert worker.poll_interval_seconds == 2.0
        assert worker.debug is True

    def test_worker_stop(self):
        broker = VercelQueuesBroker()
        worker = PollingWorker(broker, queue_name="test-queue")
        assert worker._stop_requested is False
        worker.stop()
        assert worker._stop_requested is True


class TestActorIntegration:
    """Integration tests for actor registration and execution."""

    def test_actor_registration(self):
        broker = VercelQueuesBroker()
        dramatiq.set_broker(broker)

        @dramatiq.actor(queue_name="integration-test", broker=broker)
        def test_registration_actor(x: int, y: int) -> int:
            return x + y

        # Verify the queue was declared
        assert "integration-test" in broker.get_declared_queues()
        # get_actor raises ActorNotFound if not registered, so we just call it
        # to verify registration - if it doesn't raise, the actor exists
        registered_actor = broker.get_actor("test_registration_actor")
        assert registered_actor.actor_name == "test_registration_actor"

    @patch("vercel.workers.dramatiq.broker.send")
    def test_actor_send(self, mock_send: MagicMock):
        mock_send.return_value = {"messageId": "msg-integration-123"}

        broker = VercelQueuesBroker()
        dramatiq.set_broker(broker)

        @dramatiq.actor(queue_name="send-test", broker=broker)
        def add_numbers_test(a: int, b: int) -> int:
            return a + b

        # Send a message
        result = add_numbers_test.send(10, 20)

        assert result.message_id is not None
        mock_send.assert_called_once()

        # Verify envelope structure
        call_args = mock_send.call_args
        envelope = call_args[0][1]
        assert envelope["vercel"]["kind"] == "dramatiq"
        assert envelope["actor_name"] == "add_numbers_test"
        assert envelope["args"] == [10, 20]


class TestMiddlewarePipeline:
    def test_middleware_called_on_success(self):
        mw = MagicMock(spec=dramatiq.Middleware)
        mw.actor_options = set()
        mw.ephemeral_options = set()
        broker = VercelQueuesBroker(middleware=[mw])

        @dramatiq.actor(broker=broker, queue_name="test-mw")
        def mw_test_actor(x):
            return x * 2

        message = Message(
            queue_name="test-mw",
            actor_name="mw_test_actor",
            args=(5,),
            kwargs={},
            options={},
        )

        result = _execute_message(broker, message)
        assert result == {"ack": True}

        mw.before_process_message.assert_called_once()
        mw.after_process_message.assert_called_once()

        call_kwargs = mw.after_process_message.call_args
        assert call_kwargs.kwargs["result"] == 10
        assert "exception" not in call_kwargs.kwargs

    def test_middleware_called_on_failure(self):
        mw = MagicMock(spec=dramatiq.Middleware)
        mw.actor_options = set()
        mw.ephemeral_options = set()
        broker = VercelQueuesBroker(middleware=[mw])

        @dramatiq.actor(broker=broker, queue_name="test-mw")
        def failing_actor():
            raise RuntimeError("test")

        message = Message(
            queue_name="test-mw",
            actor_name="failing_actor",
            args=(),
            kwargs={},
            options={},
        )

        with pytest.raises(RuntimeError, match="test"):
            _execute_message(broker, message)

        mw.before_process_message.assert_called_once()
        mw.after_process_message.assert_called_once()

        call_kwargs = mw.after_process_message.call_args
        assert isinstance(call_kwargs.kwargs["exception"], RuntimeError)

    def test_middleware_skip_message(self):
        mw = MagicMock(spec=dramatiq.Middleware)
        mw.actor_options = set()
        mw.ephemeral_options = set()
        mw.before_process_message.side_effect = dramatiq.middleware.SkipMessage()
        broker = VercelQueuesBroker(middleware=[mw])

        @dramatiq.actor(broker=broker, queue_name="test-mw")
        def skippable_actor():
            raise AssertionError("should not be called")

        message = Message(
            queue_name="test-mw",
            actor_name="skippable_actor",
            args=(),
            kwargs={},
            options={},
        )

        result = _execute_message(broker, message)

        assert result == {"ack": True}
        mw.before_process_message.assert_called_once()
        mw.after_skip_message.assert_called_once()
        mw.after_process_message.assert_not_called()

    def test_middleware_called_on_retry(self):
        mw = MagicMock(spec=dramatiq.Middleware)
        mw.actor_options = set()
        mw.ephemeral_options = set()
        broker = VercelQueuesBroker(middleware=[mw])

        @dramatiq.actor(broker=broker, queue_name="test-mw")
        def retrying_actor():
            raise dramatiq.Retry(delay=5000)

        message = Message(
            queue_name="test-mw",
            actor_name="retrying_actor",
            args=(),
            kwargs={},
            options={},
        )

        result = _execute_message(broker, message)

        assert result == {"timeoutSeconds": 5}
        mw.before_process_message.assert_called_once()
        mw.after_process_message.assert_called_once()
        call_kwargs = mw.after_process_message.call_args
        assert isinstance(call_kwargs.kwargs["exception"], dramatiq.Retry)


class TestEncoderIntegration:
    def test_envelope_uses_global_encoder(self):
        message = Message(
            queue_name="test-q",
            actor_name="test_actor",
            args=(1, "hello"),
            kwargs={"x": 10},
            options={"retries": 3},
        )

        envelope = _message_to_envelope(message, "test-q")

        assert envelope["vercel"] == {"kind": "dramatiq", "version": 1}
        assert envelope["queue_name"] == "test-q"
        assert envelope["actor_name"] == "test_actor"
        assert envelope["args"] == [1, "hello"]
        assert envelope["kwargs"] == {"x": 10}
        assert envelope["options"]["retries"] == 3

    def test_default_encoder_handles_uuid_datetime_decimal(self):
        broker = VercelQueuesBroker()

        uid = uuid4()
        dt = datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)
        dec = Decimal("3.14")

        message = Message(
            queue_name="test-q",
            actor_name="test_actor",
            args=({"request_id": uid, "ts": dt, "price": dec},),
            kwargs={},
            options={},
        )

        envelope = _message_to_envelope(message, "test-q", encoder=broker.encoder)

        payload = envelope["args"][0]
        assert payload["request_id"] == str(uid)
        assert payload["ts"] == dt.isoformat()
        assert payload["price"] == float(dec)

    def test_custom_encoder_strips_options(self):
        original_encoder = dramatiq.get_encoder()

        class StrippingEncoder(dramatiq.JSONEncoder):
            def encode(self, data):
                if "options" in data:
                    data = {
                        **data,
                        "options": {
                            k: v for k, v in data["options"].items() if k != "ephemeral_thing"
                        },
                    }
                return super().encode(data)

        dramatiq.set_encoder(StrippingEncoder())
        try:
            message = Message(
                queue_name="test-q",
                actor_name="test_actor",
                args=(),
                kwargs={},
                options={"ephemeral_thing": "secret", "retries": 1},
            )

            envelope = _message_to_envelope(message, "test-q")

            assert "ephemeral_thing" not in envelope["options"]
            assert envelope["options"]["retries"] == 1
        finally:
            dramatiq.set_encoder(original_encoder)

    def test_broker_accepts_custom_encoder_option(self):
        calls = []

        class TrackingEncoder(VercelDramatiqEncoder):
            def encode(self, data):
                calls.append("encode")
                return super().encode(data)

        encoder = TrackingEncoder()
        broker = VercelQueuesBroker(options={"encoder": encoder})
        assert broker.encoder is encoder

        message = Message(
            queue_name="test-q",
            actor_name="test_actor",
            args=(1,),
            kwargs={},
            options={},
        )
        _message_to_envelope(message, "test-q", encoder=broker.encoder)
        assert "encode" in calls

    @patch("vercel.workers.dramatiq.broker.send")
    def test_enqueue_uses_encoder(self, mock_send):
        mock_send.return_value = {"messageId": "msg-123"}

        broker = VercelQueuesBroker()

        @dramatiq.actor(broker=broker, queue_name="test-q")
        def my_actor():
            pass

        message = Message(
            queue_name="test-q",
            actor_name="my_actor",
            args=(42,),
            kwargs={},
            options={},
        )

        broker.enqueue(message)

        call_args = mock_send.call_args
        envelope = call_args[0][1]
        assert envelope["vercel"]["kind"] == "dramatiq"
        assert envelope["args"] == [42]


class TestAsyncActors:
    @pytest.fixture()
    def async_broker(self):
        broker = VercelQueuesBroker(middleware=[dramatiq.middleware.AsyncIO()])
        broker.emit_before("worker_boot", None)
        broker.emit_after("worker_boot", None)
        yield broker
        broker.emit_before("worker_shutdown", None)
        broker.emit_after("worker_shutdown", None)

    def test_async_actor_executes(self, async_broker):
        @dramatiq.actor(broker=async_broker, queue_name="test-async")
        async def async_add(a, b):
            return a + b

        message = Message(
            queue_name="test-async",
            actor_name="async_add",
            args=(3, 4),
            kwargs={},
            options={},
        )

        result = _execute_message(async_broker, message)
        assert result == {"ack": True}

    def test_async_actor_exception_propagates(self, async_broker):
        @dramatiq.actor(broker=async_broker, queue_name="test-async")
        async def async_fail():
            raise RuntimeError("test")

        message = Message(
            queue_name="test-async",
            actor_name="async_fail",
            args=(),
            kwargs={},
            options={},
        )

        with pytest.raises(RuntimeError, match="test"):
            _execute_message(async_broker, message)
