from __future__ import annotations

import json
from collections.abc import Mapping

from ._internal.queue_api import (
    QueueClientConfig,
    acknowledge_message,
    acknowledge_message_async,
    change_message_visibility,
    change_message_visibility_async,
    create_client_config,
    get_queue_base_url,
    get_queue_token,
    get_queue_token_async,
    receive_message_by_id,
    receive_message_by_id_async,
    receive_messages,
    receive_messages_async,
    send_message,
    send_message_async,
)
from .types import (
    BaseUrlResolver,
    MessageMetadata,
    ReceivedMessage,
    SendMessageResult,
    WorkerJSONEncoder,
    WorkerTimeoutResult,
)

__all__ = [
    "AsyncQueueClient",
    "MessageMetadata",
    "QueueClient",
    "ReceivedMessage",
    "SendMessageResult",
    "WorkerJSONEncoder",
    "WorkerTimeoutResult",
    "get_queue_base_url",
    "get_queue_token",
    "get_queue_token_async",
    "send",
    "send_async",
]


def _build_config(
    *,
    region: str | None = None,
    token: str | None = None,
    base_url: str | None = None,
    resolve_base_url: BaseUrlResolver | None = None,
    deployment_id: str | None = None,
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> QueueClientConfig:
    return create_client_config(
        region=region,
        token=token,
        base_url=base_url,
        resolve_base_url=resolve_base_url,
        deployment_id=deployment_id,
        timeout=timeout,
        headers=headers,
        json_encoder=json_encoder,
    )


class QueueClient:
    """Synchronous Vercel Queues client."""

    def __init__(
        self,
        *,
        region: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
        resolve_base_url: BaseUrlResolver | None = None,
        deployment_id: str | None = None,
        timeout: float | None = 10.0,
        headers: dict[str, str] | None = None,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> None:
        self._config = _build_config(
            region=region,
            token=token,
            base_url=base_url,
            resolve_base_url=resolve_base_url,
            deployment_id=deployment_id,
            timeout=timeout,
            headers=headers,
            json_encoder=json_encoder,
        )

    @property
    def region(self) -> str:
        return self._config.region

    def with_region(self, region: str) -> QueueClient:
        return QueueClient(
            region=region,
            token=self._config.token,
            base_url=self._config.base_url,
            resolve_base_url=self._config.resolve_base_url,
            deployment_id=self._config.deployment_id,
            timeout=self._config.timeout,
            headers=self._config.headers,
            json_encoder=self._config.json_encoder,
        )

    def send(
        self,
        queue_name: str,
        payload: object,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        content_type: str = "application/json",
        headers: Mapping[str, str] | None = None,
    ) -> SendMessageResult:
        return send_message(
            self._config,
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            content_type=content_type,
            headers=headers,
        )

    def receive(
        self,
        queue_name: str,
        consumer_group: str,
        *,
        limit: int | None = 1,
        visibility_timeout_seconds: int | None = None,
    ) -> list[ReceivedMessage]:
        return receive_messages(
            self._config,
            queue_name,
            consumer_group,
            limit=limit,
            visibility_timeout_seconds=visibility_timeout_seconds,
        )

    def receive_by_id(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        *,
        visibility_timeout_seconds: int | None = None,
    ) -> ReceivedMessage:
        return receive_message_by_id(
            self._config,
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=visibility_timeout_seconds,
        )

    def acknowledge(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
    ) -> None:
        acknowledge_message(self._config, queue_name, consumer_group, receipt_handle)

    def change_visibility(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
        visibility_timeout_seconds: int,
    ) -> None:
        change_message_visibility(
            self._config,
            queue_name,
            consumer_group,
            receipt_handle,
            visibility_timeout_seconds,
        )


class AsyncQueueClient:
    """Asynchronous Vercel Queues client."""

    def __init__(
        self,
        *,
        region: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
        resolve_base_url: BaseUrlResolver | None = None,
        deployment_id: str | None = None,
        timeout: float | None = 10.0,
        headers: dict[str, str] | None = None,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> None:
        self._config = _build_config(
            region=region,
            token=token,
            base_url=base_url,
            resolve_base_url=resolve_base_url,
            deployment_id=deployment_id,
            timeout=timeout,
            headers=headers,
            json_encoder=json_encoder,
        )

    @property
    def region(self) -> str:
        return self._config.region

    def with_region(self, region: str) -> AsyncQueueClient:
        return AsyncQueueClient(
            region=region,
            token=self._config.token,
            base_url=self._config.base_url,
            resolve_base_url=self._config.resolve_base_url,
            deployment_id=self._config.deployment_id,
            timeout=self._config.timeout,
            headers=self._config.headers,
            json_encoder=self._config.json_encoder,
        )

    async def send(
        self,
        queue_name: str,
        payload: object,
        *,
        idempotency_key: str | None = None,
        retention_seconds: int | None = None,
        delay_seconds: int | None = None,
        content_type: str = "application/json",
        headers: Mapping[str, str] | None = None,
    ) -> SendMessageResult:
        return await send_message_async(
            self._config,
            queue_name,
            payload,
            idempotency_key=idempotency_key,
            retention_seconds=retention_seconds,
            delay_seconds=delay_seconds,
            content_type=content_type,
            headers=headers,
        )

    async def receive(
        self,
        queue_name: str,
        consumer_group: str,
        *,
        limit: int | None = 1,
        visibility_timeout_seconds: int | None = None,
    ) -> list[ReceivedMessage]:
        return await receive_messages_async(
            self._config,
            queue_name,
            consumer_group,
            limit=limit,
            visibility_timeout_seconds=visibility_timeout_seconds,
        )

    async def receive_by_id(
        self,
        queue_name: str,
        consumer_group: str,
        message_id: str,
        *,
        visibility_timeout_seconds: int | None = None,
    ) -> ReceivedMessage:
        return await receive_message_by_id_async(
            self._config,
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=visibility_timeout_seconds,
        )

    async def acknowledge(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
    ) -> None:
        await acknowledge_message_async(
            self._config,
            queue_name,
            consumer_group,
            receipt_handle,
        )

    async def change_visibility(
        self,
        queue_name: str,
        consumer_group: str,
        receipt_handle: str,
        visibility_timeout_seconds: int,
    ) -> None:
        await change_message_visibility_async(
            self._config,
            queue_name,
            consumer_group,
            receipt_handle,
            visibility_timeout_seconds,
        )


def send(
    queue_name: str,
    payload: object,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: str | None = None,
    token: str | None = None,
    base_url: str | None = None,
    resolve_base_url: BaseUrlResolver | None = None,
    region: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: Mapping[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return send_message(
        _build_config(
            region=region,
            token=token,
            base_url=base_url,
            resolve_base_url=resolve_base_url,
            deployment_id=deployment_id,
            timeout=timeout,
            json_encoder=json_encoder,
        ),
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        content_type=content_type,
        headers=headers,
    )


async def send_async(
    queue_name: str,
    payload: object,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: str | None = None,
    token: str | None = None,
    base_url: str | None = None,
    resolve_base_url: BaseUrlResolver | None = None,
    region: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: Mapping[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    return await send_message_async(
        _build_config(
            region=region,
            token=token,
            base_url=base_url,
            resolve_base_url=resolve_base_url,
            deployment_id=deployment_id,
            timeout=timeout,
            json_encoder=json_encoder,
        ),
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        content_type=content_type,
        headers=headers,
    )
