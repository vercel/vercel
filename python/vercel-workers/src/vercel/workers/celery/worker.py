from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING

from .. import callback as queue_callback
from .utils import _execute_envelope

if TYPE_CHECKING:
    from celery import Celery as CeleryApp  # type: ignore[import-untyped]


class PollingWorker:
    """
    Long-lived polling worker for consuming tasks from Vercel Queues.

    This is intended for local development or non-serverless environments.
    """

    def __init__(
        self,
        celery_app: CeleryApp,
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
        self.celery_app = celery_app
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
        self._stop_requested = True

    def run_once(self) -> int:
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
        while not self._stop_requested:
            self.run_once()

    def _process_message(self, msg: queue_callback.ReceivedMessage) -> None:
        message_id = msg["messageId"]
        receipt_handle = msg["receipt_handle"]
        payload = msg["payload"]

        try:
            if self.debug:
                try:
                    print(
                        "[vercel polling] received message",
                        json.dumps(
                            {
                                "queue": self.queue_name,
                                "consumer": self.consumer_group,
                                "messageId": message_id,
                                "deliveryCount": msg.get("deliveryCount"),
                                "createdAt": msg.get("createdAt"),
                                "contentType": msg.get("contentType"),
                                "receipt_handle": receipt_handle,
                                "payload": payload,
                            },
                            indent=2,
                            default=str,
                        ),
                    )
                except Exception:
                    print(
                        "[vercel polling] received message (unserialisable payload)",
                        {
                            "queue": self.queue_name,
                            "consumer": self.consumer_group,
                            "messageId": message_id,
                            "contentType": msg.get("contentType"),
                            "payloadType": type(payload).__name__,
                        },
                    )

            outcome = _execute_envelope(self.celery_app, payload)
            timeout_seconds = outcome.get("timeoutSeconds")

            if timeout_seconds is not None:
                queue_callback.change_visibility(
                    self.queue_name,
                    self.consumer_group,
                    message_id,
                    receipt_handle,
                    int(timeout_seconds),
                )
            else:
                queue_callback.delete_message(
                    self.queue_name,
                    self.consumer_group,
                    message_id,
                    receipt_handle,
                )
        except Exception:
            if self.debug:
                print(
                    "[vercel polling] error executing message",
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
                    )
                except Exception:
                    pass
            if self.crash_on_error:
                raise
