from __future__ import annotations

import json
import os
from collections.abc import Callable
from typing import overload

from vercel.workers._queue.send import send, send_async
from vercel.workers._queue.subscribe import (
    Subscription,
    WorkerCallable,
    build_subscribe_decorator,
)
from vercel.workers._queue.types import (
    DEPLOYMENT_ID_UNSET,
    DeploymentIdOption,
    Duration,
    SendMessageResult,
)


class _BaseQueueClient:
    def __init__(
        self,
        *,
        region: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
        base_path: str | None = None,
        deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
        content_type: str = "application/json",
        timeout: float | None = 10.0,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> None:
        self.region: str | None = region
        self.token: str | None = token
        self.base_url: str | None = base_url
        self.base_path: str | None = base_path
        self.deployment_id: DeploymentIdOption = deployment_id
        self.headers: dict[str, str] | None = dict(headers) if headers is not None else None
        self.content_type: str = content_type
        self.timeout: float | None = timeout
        self.json_encoder: type[json.JSONEncoder] | None = json_encoder
        self._subscriptions: list[Subscription] = []

    def _resolved_base_url(self) -> str | None:
        if self.base_url is not None:
            return self.base_url
        # `vercel dev` sets VERCEL_QUEUE_BASE_URL to its local queue proxy. Let
        # that env var win even when the client has an explicit region.
        if os.environ.get("VERCEL_QUEUE_BASE_URL"):
            return None
        if self.region is not None:
            return f"https://{self.region}.vercel-queue.com"
        return None

    def _merged_headers(self, headers: dict[str, str] | None) -> dict[str, str] | None:
        if self.headers is None:
            return headers
        if headers is None:
            return dict(self.headers)
        return self.headers | headers

    @overload
    def subscribe(self, _func: WorkerCallable) -> WorkerCallable: ...

    @overload
    def subscribe(
        self,
        *,
        topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    ) -> Callable[[WorkerCallable], WorkerCallable]: ...

    def subscribe(
        self,
        _func: WorkerCallable | None = None,
        *,
        topic: str | tuple[str, Callable[[str | None], bool]] | None = None,
    ) -> Callable[[WorkerCallable], WorkerCallable] | WorkerCallable:
        decorator = build_subscribe_decorator(self._subscriptions, topic)
        if _func is not None:
            return decorator(_func)
        return decorator

    def has_subscriptions(self) -> bool:
        return bool(self._subscriptions)

    @property
    def subscriptions(self) -> list[Subscription]:
        return self._subscriptions


class QueueClient(_BaseQueueClient):
    """Configured synchronous client for publishing Vercel Queue messages."""

    def send(
        self,
        queue_name: str,
        payload: object,
        *,
        idempotency_key: str | None = None,
        retention: Duration | None = None,
        delay: Duration | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        effective_deployment_id = (
            self.deployment_id if deployment_id is DEPLOYMENT_ID_UNSET else deployment_id
        )
        return send(
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention=retention,
            delay=delay,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=effective_deployment_id,
            token=self.token,
            base_url=self._resolved_base_url(),
            base_path=self.base_path,
            content_type=self.content_type,
            timeout=self.timeout,
            headers=self._merged_headers(headers),
            json_encoder=self.json_encoder,
        )


class AsyncQueueClient(_BaseQueueClient):
    """Configured asynchronous client for publishing Vercel Queue messages."""

    async def send(
        self,
        queue_name: str,
        payload: object,
        *,
        idempotency_key: str | None = None,
        retention: Duration | None = None,
        delay: Duration | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
        headers: dict[str, str] | None = None,
    ) -> SendMessageResult:
        effective_deployment_id = (
            self.deployment_id if deployment_id is DEPLOYMENT_ID_UNSET else deployment_id
        )
        return await send_async(
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention=retention,
            delay=delay,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            deployment_id=effective_deployment_id,
            token=self.token,
            base_url=self._resolved_base_url(),
            base_path=self.base_path,
            content_type=self.content_type,
            timeout=self.timeout,
            headers=self._merged_headers(headers),
            json_encoder=self.json_encoder,
        )


__all__ = [
    "AsyncQueueClient",
    "QueueClient",
]
