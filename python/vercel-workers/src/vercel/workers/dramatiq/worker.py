from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

from .. import callback as queue_callback
from .broker import _envelope_to_message

if TYPE_CHECKING:
    from .broker import VercelQueuesBroker

try:
    import dramatiq
    from dramatiq.message import Message
except Exception as e:
    raise RuntimeError(
        "dramatiq is required to use vercel.workers.dramatiq.worker. "
        "Install it with `pip install 'vercel-workers[dramatiq]'` or `pip install dramatiq`.",
    ) from e


__all__ = ["PollingWorker"]


class PollingWorker:
    """
    Long-lived polling worker for consuming Dramatiq tasks from Vercel Queues.

    This is intended for local development or non-serverless environments.

    Usage:
        from vercel.workers.dramatiq import VercelQueuesBroker, PollingWorker
        import dramatiq

        broker = VercelQueuesBroker()
        dramatiq.set_broker(broker)

        # Import your actors to register them
        from tasks import my_task

        worker = PollingWorker(broker, queue_name="default")
        worker.start()  # Blocks and polls indefinitely
    """

    def __init__(
        self,
        broker: VercelQueuesBroker,
        *,
        queue_name: str,
        consumer_group: str = "default",
        limit: int = 1,
        visibility_timeout_seconds: int = 60,
        poll_interval_seconds: float = 1.0,
        on_error_visibility_timeout_seconds: int | None = None,
        timeout: float | None = 10.0,
        debug: bool = False,
        crash_on_error: bool = False,
        ack_on_error: bool = False,
    ) -> None:
        self.broker = broker
        self.queue_name = queue_name
        self.consumer_group = consumer_group
        self.limit = limit
        self.visibility_timeout_seconds = visibility_timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.on_error_visibility_timeout_seconds = on_error_visibility_timeout_seconds
        self.timeout = timeout
        self.debug = debug
        self.crash_on_error = crash_on_error
        self.ack_on_error = ack_on_error
        self._stop_requested = False

    def stop(self) -> None:
        """Signal the worker to stop after the current poll cycle."""
        self._stop_requested = True

    def run_once(self) -> int:
        """
        Poll for messages and process them.

        Returns the number of messages processed.
        """
        messages = queue_callback.receive_messages(
            self.queue_name,
            self.consumer_group,
            limit=self.limit,
            visibility_timeout_seconds=self.visibility_timeout_seconds,
            timeout=self.timeout,
        )

        if not messages:
            time.sleep(max(0.0, float(self.poll_interval_seconds)))
            return 0

        processed = 0
        for msg in messages:
            self._process_message(msg)
            processed += 1
        return processed

    def start(self) -> None:
        """Start the polling loop. Blocks until stop() is called."""
        self.broker.emit_before("worker_boot", None)
        self.broker.emit_after("worker_boot", None)
        while not self._stop_requested:
            self.run_once()

    def _process_message(self, msg: queue_callback.ReceivedMessage) -> None:
        message_id = msg["messageId"]
        receipt_handle = msg["receipt_handle"]
        payload = msg["payload"]

        try:
            if self.debug:
                self._debug_log_received(msg)

            # Parse the envelope and convert to Dramatiq message
            dramatiq_message = _envelope_to_message(payload)

            # Execute the task
            outcome = self._execute_message(dramatiq_message)
            timeout_seconds = outcome.get("timeoutSeconds")

            if timeout_seconds is not None:
                queue_callback.change_visibility(
                    self.queue_name,
                    self.consumer_group,
                    message_id,
                    receipt_handle,
                    int(timeout_seconds),
                    timeout=self.timeout,
                )
            else:
                queue_callback.delete_message(
                    self.queue_name,
                    self.consumer_group,
                    message_id,
                    receipt_handle,
                    timeout=self.timeout,
                )

            if self.debug:
                print(
                    f"[dramatiq polling] completed task {dramatiq_message.actor_name} "
                    f"(message {message_id})"
                )

        except Exception:
            if self.debug:
                print(
                    "[dramatiq polling] error executing message",
                    {
                        "queue": self.queue_name,
                        "consumer": self.consumer_group,
                        "messageId": message_id,
                        "payloadType": type(payload).__name__,
                    },
                )
            if self.ack_on_error:
                # Useful in local development to avoid getting stuck on a poison message.
                try:
                    queue_callback.delete_message(
                        self.queue_name,
                        self.consumer_group,
                        message_id,
                        receipt_handle,
                        timeout=self.timeout,
                    )
                except Exception:
                    pass
                return
            # Best-effort: optionally shorten visibility to retry sooner.
            if self.on_error_visibility_timeout_seconds is not None:
                try:
                    queue_callback.change_visibility(
                        self.queue_name,
                        self.consumer_group,
                        message_id,
                        receipt_handle,
                        int(self.on_error_visibility_timeout_seconds),
                        timeout=self.timeout,
                    )
                except Exception:
                    pass
            if self.crash_on_error:
                raise

    def _execute_message(self, message: Message) -> dict[str, Any]:
        return _execute_message(self.broker, message)

    def _debug_log_received(self, msg: queue_callback.ReceivedMessage) -> None:
        """Log received message details for debugging."""
        try:
            print(
                "[dramatiq polling] received message",
                json.dumps(
                    {
                        "queue": self.queue_name,
                        "consumer": self.consumer_group,
                        "messageId": msg["messageId"],
                        "deliveryCount": msg.get("deliveryCount"),
                        "createdAt": msg.get("createdAt"),
                        "contentType": msg.get("contentType"),
                        "receipt_handle": msg["receipt_handle"],
                    },
                    indent=2,
                    default=str,
                ),
            )
        except Exception:
            print(
                "[dramatiq polling] received message (unserialisable)",
                {"messageId": msg["messageId"]},
            )


def _execute_message(broker: VercelQueuesBroker, message: Message) -> dict[str, Any]:
    """
    Execute a Dramatiq message.

    Returns:
        {"ack": True} on success
        {"timeoutSeconds": N} for retry
    """
    actor = broker.get_actor(message.actor_name)
    if actor is None:
        raise LookupError(f"Dramatiq actor not found: {message.actor_name!r}")

    proxy = dramatiq.MessageProxy(message)

    try:
        broker.emit_before("process_message", proxy)
        res = None
        if not proxy.failed:
            res = actor(*message.args, **message.kwargs)
        broker.emit_after("process_message", proxy, result=res)
        return {"ack": True}
    except dramatiq.middleware.SkipMessage as exc:
        if proxy.failed:
            proxy.stuff_exception(exc)
        broker.emit_after("skip_message", proxy)
        return {"ack": True}
    except Exception as exc:
        proxy.stuff_exception(exc)
        broker.emit_after("process_message", proxy, exception=exc)
        if isinstance(exc, dramatiq.Retry):
            delay = getattr(exc, "delay", None)
            if delay is not None:
                return {"timeoutSeconds": int(delay / 1000)}
            return {"timeoutSeconds": 60}
        raise
