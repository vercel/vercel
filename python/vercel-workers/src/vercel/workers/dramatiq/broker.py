from __future__ import annotations

import json
import os
from collections.abc import Iterable
from dataclasses import dataclass, replace
from typing import Any

from ..client import send

try:
    from dramatiq.broker import Broker, Consumer, MessageProxy
    from dramatiq.common import current_millis, dq_name
    from dramatiq.message import Message
except Exception as e:
    raise RuntimeError(
        "dramatiq is required to use vercel.workers.dramatiq. "
        "Install it with `pip install 'vercel-workers[dramatiq]'` or `pip install dramatiq`.",
    ) from e


__all__ = [
    "VercelQueuesBroker",
    "VercelQueuesBrokerOptions",
    "DramatiqTaskEnvelope",
]


@dataclass(frozen=True, slots=True)
class VercelQueuesBrokerOptions:
    """
    Configuration options for the Vercel Queues broker.
    """

    # Publishing options (passed through to vercel.workers.client.send()).
    token: str | None = None
    base_url: str | None = None
    base_path: str | None = None
    retention_seconds: int | None = None
    deployment_id: str | None = None
    timeout: float | None = 10.0

    # Consumption defaults (serverless callback / local polling)
    visibility_timeout_seconds: int = 30
    visibility_refresh_interval_seconds: float = 10.0

    # Use message_id as idempotency key by default
    use_message_id_as_idempotency_key: bool = True

    @classmethod
    def from_dict(cls, options: dict[str, Any]) -> VercelQueuesBrokerOptions:
        """
        Create options from a configuration dict.
        """
        cfg = cls()

        token = options.get("token")
        if isinstance(token, str) and token:
            cfg = replace(cfg, token=token)

        base_url = options.get("base_url")
        if isinstance(base_url, str) and base_url:
            cfg = replace(cfg, base_url=base_url)

        base_path = options.get("base_path")
        if isinstance(base_path, str) and base_path:
            cfg = replace(cfg, base_path=base_path)

        retention = options.get("retention_seconds")
        if isinstance(retention, int):
            cfg = replace(cfg, retention_seconds=retention)

        deployment_id = options.get("deployment_id")
        if isinstance(deployment_id, str) and deployment_id:
            cfg = replace(cfg, deployment_id=deployment_id)

        timeout = options.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg = replace(cfg, timeout=float(timeout))

        visibility_timeout_seconds = options.get("visibility_timeout_seconds")
        if isinstance(visibility_timeout_seconds, int) and visibility_timeout_seconds >= 0:
            cfg = replace(cfg, visibility_timeout_seconds=visibility_timeout_seconds)

        refresh_interval = options.get("visibility_refresh_interval_seconds")
        if isinstance(refresh_interval, (int, float)):
            cfg = replace(cfg, visibility_refresh_interval_seconds=float(refresh_interval))

        use_msg_id = options.get("use_message_id_as_idempotency_key")
        if isinstance(use_msg_id, bool):
            cfg = replace(cfg, use_message_id_as_idempotency_key=use_msg_id)

        return cfg


class DramatiqTaskEnvelope(dict):
    """
    JSON envelope stored in Vercel Queues for Dramatiq messages.

    Schema:
        {
            "vercel": {"kind": "dramatiq", "version": 1},
            "queue_name": str,
            "actor_name": str,
            "message_id": str,
            "message_timestamp": int,
            "args": list,
            "kwargs": dict,
            "options": dict,  # Dramatiq message options (retries, etc.)
        }
    """

    pass


def _message_to_envelope(message: Message, queue_name: str) -> DramatiqTaskEnvelope:
    """
    Convert a Dramatiq Message to a Vercel Queues envelope.
    """
    return DramatiqTaskEnvelope(
        vercel={"kind": "dramatiq", "version": 1},
        queue_name=queue_name,
        actor_name=message.actor_name,
        message_id=message.message_id,
        message_timestamp=message.message_timestamp,
        args=list(message.args) if message.args else [],
        kwargs=dict(message.kwargs) if message.kwargs else {},
        options=dict(message.options) if message.options else {},
    )


def _envelope_to_message(envelope: dict[str, Any]) -> Message:
    """
    Convert a Vercel Queues envelope back to a Dramatiq Message.
    """
    vercel_info = envelope.get("vercel", {})
    if vercel_info.get("kind") != "dramatiq":
        kind = vercel_info.get("kind")
        raise ValueError(f"Invalid envelope: expected kind='dramatiq', got {kind!r}")

    return Message(
        queue_name=str(envelope.get("queue_name", "")),
        actor_name=str(envelope.get("actor_name", "")),
        args=tuple(envelope.get("args", [])),
        kwargs=dict(envelope.get("kwargs", {})),
        options=dict(envelope.get("options", {})),
        message_id=str(envelope.get("message_id", "")),
        message_timestamp=int(envelope.get("message_timestamp", current_millis())),
    )


class _VercelQueuesConsumer(Consumer):
    """
    A no-op consumer for Vercel Queues.

    In Vercel deployments, task consumption is event-driven via HTTP callbacks,
    not by polling the broker. This consumer exists to satisfy Dramatiq's interface
    but raises NotImplementedError for actual consumption.
    """

    def __init__(self, broker: VercelQueuesBroker, queue_name: str):
        self.broker = broker
        self.queue_name = queue_name

    def ack(self, message: MessageProxy) -> None:
        # In callback mode, acknowledgment is handled by the callback handler.
        pass

    def nack(self, message: MessageProxy) -> None:
        # In callback mode, nack (requeue) is handled by the callback handler.
        pass

    def requeue(self, messages: Iterable[MessageProxy]) -> None:
        # Not supported in callback mode.
        pass

    def __next__(self) -> MessageProxy | None:
        raise NotImplementedError(
            "Vercel Queues consumption is event-driven on Vercel. "
            "Deploy a queue callback route using vercel.workers.dramatiq.get_wsgi_app(broker) "
            "or get_asgi_app(broker) instead of running 'dramatiq worker' to poll."
        )


class VercelQueuesBroker(Broker):
    """
    A Dramatiq broker that uses Vercel Queues as the backend.

    This broker publishes messages to Vercel Queues. Consumption is handled
    either by:
      - Vercel Queue triggers (HTTP callbacks) in serverless deployments
      - A polling worker for local development

    Usage:
        from vercel.workers.dramatiq import VercelQueuesBroker
        import dramatiq

        broker = VercelQueuesBroker()
        dramatiq.set_broker(broker)

        @dramatiq.actor
        def my_task(x, y):
            return x + y

        my_task.send(1, 2)  # Publishes to Vercel Queues
    """

    def __init__(
        self,
        *,
        middleware: list[Any] | None = None,
        options: dict[str, Any] | None = None,
    ) -> None:
        # Must initialize _queues before super().__init__() as middleware
        # may call get_declared_queues() during initialization.
        self._queues: set[str] = set()
        self._cfg = VercelQueuesBrokerOptions.from_dict(options or {})
        super().__init__(middleware=middleware)

    @property
    def options(self) -> VercelQueuesBrokerOptions:
        """Return the broker configuration options."""
        return self._cfg

    def consume(
        self,
        queue_name: str,
        prefetch: int = 1,
        timeout: int = 30000,
    ) -> Consumer:
        """
        Create a consumer for the given queue.

        Note: In Vercel deployments, consumption is event-driven via HTTP callbacks.
        Use PollingWorker for local development or non-serverless environments.
        """
        return _VercelQueuesConsumer(self, queue_name)

    def declare_actor(self, actor: Any) -> None:
        """Declare an actor on this broker."""
        self.emit_before("declare_actor", actor)
        self.declare_queue(actor.queue_name)
        self.actors[actor.actor_name] = actor
        self.emit_after("declare_actor", actor)

    def declare_queue(self, queue_name: str) -> None:
        """
        Declare a queue on this broker.

        For Vercel Queues, this is a no-op as queues are created automatically
        or configured via the Vercel dashboard.
        """
        if queue_name not in self._queues:
            self.emit_before("declare_queue", queue_name)
            self._queues.add(queue_name)
            self.emit_after("declare_queue", queue_name)

    def enqueue(
        self,
        message: Message,
        *,
        delay: int | None = None,
    ) -> Message:
        """
        Enqueue a message to Vercel Queues.

        Args:
            message: The Dramatiq message to enqueue.
            delay: Optional delay in milliseconds before the message is delivered.
                   Note: Vercel Queues handles delays via visibility timeout on callback.

        Returns:
            The enqueued message.
        """
        queue_name = message.queue_name

        # Handle delay queues (Dramatiq uses separate delay queues)
        if delay is not None and delay > 0:
            queue_name = dq_name(queue_name)
            message = message.copy(
                queue_name=queue_name,
                options={
                    **message.options,
                    "eta": current_millis() + delay,
                },
            )

        self.emit_before("enqueue", message, delay)

        envelope = _message_to_envelope(message, queue_name)

        # Use message_id for idempotency by default
        idempotency_key = (
            message.message_id if self._cfg.use_message_id_as_idempotency_key else None
        )

        if os.environ.get("VWD_DEBUG_PUBLISH") not in {None, "", "0", "false", "FALSE"}:
            try:
                print(
                    "[vercelqueue dramatiq publish] envelope:",
                    json.dumps(envelope, indent=2, default=str),
                )
            except Exception:
                print("[vercelqueue dramatiq publish] debug print failed")

        send(
            queue_name,
            envelope,
            idempotency_key=idempotency_key,
            retention_seconds=self._cfg.retention_seconds,
            deployment_id=self._cfg.deployment_id,
            token=self._cfg.token,
            base_url=self._cfg.base_url,
            base_path=self._cfg.base_path,
            timeout=self._cfg.timeout,
        )

        self.emit_after("enqueue", message, delay)
        return message

    def flush(self, queue_name: str) -> None:
        """
        Flush all messages from a queue.

        Note: This is not supported by Vercel Queues API.
        """
        pass

    def flush_all(self) -> None:
        """
        Flush all messages from all declared queues.

        Note: This is not supported by Vercel Queues API.
        """
        pass

    def get_declared_actors(self) -> set[str]:
        """Get the set of declared actor names."""
        return set()

    def get_declared_queues(self) -> set[str]:
        """Get the set of declared queue names."""
        return self._queues.copy()

    def get_declared_delay_queues(self) -> set[str]:
        """Get the set of declared delay queue names."""
        return {dq_name(q) for q in self._queues}

    def join(self, queue_name: str, *, timeout: int | None = None) -> None:
        """
        Wait for all messages on a queue to be processed.

        Note: This is not supported in serverless mode.
        """
        raise NotImplementedError(
            "VercelQueuesBroker.join() is not supported. Vercel Queues consumption is event-driven."
        )
