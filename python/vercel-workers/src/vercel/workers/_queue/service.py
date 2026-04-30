from __future__ import annotations

import json
import os
import warnings
from typing import Any
from urllib.parse import quote

import httpx

from vercel.workers._queue.types import (
    DEPLOYMENT_ID_UNSET,
    DeploymentIdOption,
    SendMessageResult,
    WorkerJSONEncoder,
)
from vercel.workers.exceptions import (
    BadRequestError,
    DuplicateIdempotencyKeyError,
    ForbiddenError,
    InternalServerError,
    TokenResolutionError,
    UnauthorizedError,
)


def in_process_mode_enabled() -> bool:
    return os.environ.get("VERCEL_WORKERS_IN_PROCESS") in {"1", "true", "TRUE", "yes", "YES"}


def _deployment_pinning_disabled_for_dev() -> bool:
    # `vercel dev` configures Python services with this local queue token. Match
    # the TypeScript SDK behavior: deployment IDs are never sent in development.
    return in_process_mode_enabled() or os.environ.get("VERCEL_QUEUE_TOKEN") == "vc-dev-token"


def resolve_deployment_id(deployment_id: DeploymentIdOption) -> str | None:
    if _deployment_pinning_disabled_for_dev():
        return None
    if deployment_id is None:
        return None
    if isinstance(deployment_id, str):
        return deployment_id
    deployment_id_env = os.environ.get("VERCEL_DEPLOYMENT_ID")
    if deployment_id_env:
        return deployment_id_env
    raise RuntimeError("No deployment ID available. Pass deployment_id=None to disable pinning.")


def get_queue_base_url() -> str:
    """
    Return the base URL for the Vercel Queue Service API.

    Mirrors the JS client behaviour:
      - VERCEL_QUEUE_BASE_URL environment variable
      - if VERCEL_REGION environment variable is set then routes to
        region specific endpoint, e.g. "https://iad1.vercel-queue.com"
      - otherwise to "https://vercel-queue.com"
    """
    base_url = os.environ.get("VERCEL_QUEUE_BASE_URL")
    if base_url:
        return base_url.rstrip("/")

    region = os.environ.get("VERCEL_REGION")
    if region:
        return f"https://{region}.vercel-queue.com"
    else:
        return "https://vercel-queue.com"


def get_queue_base_path() -> str:
    """
    Return the base path for the queue V3 API endpoints.

    Mirrors the JS client behaviour:
      - VERCEL_QUEUE_BASE_PATH environment variable
      - default to "/api/v3/topic"
    """
    base_path = os.environ.get("VERCEL_QUEUE_BASE_PATH", "/api/v3/topic")
    if not base_path.startswith("/"):
        base_path = "/" + base_path
    return base_path


def get_queue_token(explicit_token: str | None = None) -> str:
    """
    Resolve the token used to authenticate with the queue service (synchronously).

    Resolution order:
      1. An explicit ``token=...`` argument.
      2. The ``VERCEL_QUEUE_TOKEN`` environment variable.
      3. The Vercel OIDC token from ``vercel.oidc.get_vercel_oidc_token``.
    """
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    from vercel.oidc import get_vercel_oidc_token

    token = get_vercel_oidc_token()
    if token:
        return token

    msg = (
        "Failed to resolve queue token. Provide 'token' explicitly when calling send(), "
        "set the VERCEL_QUEUE_TOKEN environment variable, "
        "or ensure a Vercel OIDC token is available in this environment."
    )
    raise TokenResolutionError(msg)


async def get_queue_token_async(explicit_token: str | None = None) -> str:
    """
    Resolve the token used to authenticate with the queue service (asynchronously).

    Resolution order:
      1. An explicit ``token=...`` argument.
      2. The ``VERCEL_QUEUE_TOKEN`` environment variable.
      3. The Vercel OIDC token from ``vercel.oidc.aio.get_vercel_oidc_token``.
    """
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("VERCEL_QUEUE_TOKEN")
    if env_token:
        return env_token

    from vercel.oidc.aio import get_vercel_oidc_token as get_vercel_oidc_token_async

    token = await get_vercel_oidc_token_async()
    if token:
        return token

    msg = (
        "Failed to resolve queue token. Provide 'token' explicitly when calling send_async(), "
        "set the VERCEL_QUEUE_TOKEN environment variable, "
        "or ensure a Vercel OIDC token is available in this environment."
    )
    raise TokenResolutionError(msg)


def _serialize_payload(
    payload: Any,
    *,
    content_type: str,
    json_encoder: type[json.JSONEncoder] | None,
) -> bytes:
    if content_type == "application/json":
        return json.dumps(payload, cls=json_encoder or WorkerJSONEncoder).encode("utf-8")
    if isinstance(payload, (bytes, bytearray)):
        return bytes(payload)
    raise TypeError(
        "Non-JSON content_type requires 'payload' to be bytes or bytearray; "
        "for structured data use the default JSON content type.",
    )


def _build_send_request(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None,
    retention_seconds: int | None,
    delay_seconds: int | None,
    deployment_id: DeploymentIdOption,
    token: str | None,
    base_url: str | None,
    base_path: str | None,
    content_type: str,
    headers: dict[str, str] | None,
    json_encoder: type[json.JSONEncoder] | None,
) -> tuple[str, bytes, dict[str, str]]:
    resolved_base_url = (base_url or get_queue_base_url()).rstrip("/")
    resolved_base_path = base_path or get_queue_base_path()

    auth_token = get_queue_token(token)

    request_headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": content_type,
    } | (headers or {})

    resolved_deployment_id = resolve_deployment_id(deployment_id)
    if resolved_deployment_id:
        request_headers["Vqs-Deployment-Id"] = resolved_deployment_id

    if idempotency_key:
        request_headers["Vqs-Idempotency-Key"] = idempotency_key

    if retention_seconds is not None:
        request_headers["Vqs-Retention-Seconds"] = str(retention_seconds)

    if delay_seconds is not None:
        request_headers["Vqs-Delay-Seconds"] = str(delay_seconds)

    body = _serialize_payload(
        payload,
        content_type=content_type,
        json_encoder=json_encoder,
    )
    url = f"{resolved_base_url}{resolved_base_path}/{quote(queue_name, safe='')}"
    return url, body, request_headers


async def _build_send_request_async(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None,
    retention_seconds: int | None,
    delay_seconds: int | None,
    deployment_id: DeploymentIdOption,
    token: str | None,
    base_url: str | None,
    base_path: str | None,
    content_type: str,
    headers: dict[str, str] | None,
    json_encoder: type[json.JSONEncoder] | None,
) -> tuple[str, bytes, dict[str, str]]:
    resolved_base_url = (base_url or get_queue_base_url()).rstrip("/")
    resolved_base_path = base_path or get_queue_base_path()

    auth_token = await get_queue_token_async(token)

    request_headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": content_type,
    } | (headers or {})

    resolved_deployment_id = resolve_deployment_id(deployment_id)
    if resolved_deployment_id:
        request_headers["Vqs-Deployment-Id"] = resolved_deployment_id

    if idempotency_key:
        request_headers["Vqs-Idempotency-Key"] = idempotency_key

    if retention_seconds is not None:
        request_headers["Vqs-Retention-Seconds"] = str(retention_seconds)

    if delay_seconds is not None:
        request_headers["Vqs-Delay-Seconds"] = str(delay_seconds)

    body = _serialize_payload(
        payload,
        content_type=content_type,
        json_encoder=json_encoder,
    )
    url = f"{resolved_base_url}{resolved_base_path}/{quote(queue_name, safe='')}"
    return url, body, request_headers


def _handle_send_response(response: httpx.Response) -> SendMessageResult:
    if response.status_code == 400:
        raise BadRequestError(response.text or "Invalid parameters")
    if response.status_code == 401:
        raise UnauthorizedError()
    if response.status_code == 403:
        raise ForbiddenError()
    if response.status_code == 409:
        raise DuplicateIdempotencyKeyError("Duplicate idempotency key detected")
    if response.status_code >= 500:
        msg = response.text or f"Server error: {response.status_code} {response.reason_phrase}"
        raise InternalServerError(msg)

    if response.status_code not in {201, 202}:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - defensive
            raise RuntimeError(
                f"Failed to send message: {exc.response.status_code} {exc.response.reason_phrase}",
            ) from exc

    if response.status_code == 202:
        warnings.warn(
            "message was accepted but delivery is deferred (202 Accepted). "
            "This usually means the queue is configured with a delay or the "
            "message is pending consumer discovery.",
            stacklevel=2,
        )
        return {"messageId": None}

    data = response.json()
    if not isinstance(data, dict) or "messageId" not in data:
        raise RuntimeError("Queue API returned an unexpected response: missing 'messageId'")

    return {"messageId": str(data["messageId"])}


def send_message(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    url, body, request_headers = _build_send_request(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        deployment_id=deployment_id,
        token=token,
        base_url=base_url,
        base_path=base_path,
        content_type=content_type,
        headers=headers,
        json_encoder=json_encoder,
    )

    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, content=body, headers=request_headers)

    return _handle_send_response(response)


async def send_message_async(
    queue_name: str,
    payload: Any,
    *,
    idempotency_key: str | None = None,
    retention_seconds: int | None = None,
    delay_seconds: int | None = None,
    deployment_id: DeploymentIdOption = DEPLOYMENT_ID_UNSET,
    token: str | None = None,
    base_url: str | None = None,
    base_path: str | None = None,
    content_type: str = "application/json",
    timeout: float | None = 10.0,
    headers: dict[str, str] | None = None,
    json_encoder: type[json.JSONEncoder] | None = None,
) -> SendMessageResult:
    url, body, request_headers = await _build_send_request_async(
        queue_name,
        payload,
        idempotency_key=idempotency_key,
        retention_seconds=retention_seconds,
        delay_seconds=delay_seconds,
        deployment_id=deployment_id,
        token=token,
        base_url=base_url,
        base_path=base_path,
        content_type=content_type,
        headers=headers,
        json_encoder=json_encoder,
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, content=body, headers=request_headers)

    return _handle_send_response(response)


__all__ = [
    "get_queue_base_path",
    "get_queue_base_url",
    "get_queue_token",
    "get_queue_token_async",
    "in_process_mode_enabled",
    "send_message",
    "send_message_async",
]
