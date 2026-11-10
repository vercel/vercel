from __future__ import annotations

import contextlib
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import AbstractContextManager
from importlib import import_module
from typing import Any, cast

type _ASGIMessage = dict[str, Any]
type _ASGIReceive = Callable[[], Awaitable[_ASGIMessage]]
type _ASGISend = Callable[[_ASGIMessage], Awaitable[None]]
type _AcceptAndHandle = Callable[..., Awaitable[None]]
type _HeadersFromScope = Callable[[Mapping[str, Any]], dict[str, str]]
type _HeadersContext = Callable[
    [Mapping[str, str]], AbstractContextManager[None]
]

_queue_log = logging.getLogger("vercel.queue")


def is_worker_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    normalized_type = svc_type.strip().lower()
    if normalized_type == "worker":
        return True

    svc_trigger = os.environ.get("VERCEL_SERVICE_TRIGGER") or ""
    normalized_trigger = svc_trigger.strip().lower()
    return normalized_type == "job" and normalized_trigger in (
        "queue",
        "workflow",
    )


def has_worker_services() -> bool:
    value = os.environ.get("VERCEL_HAS_WORKER_SERVICES") or ""
    return value.strip().lower() in {"1", "true"}


def is_dev_queue_serving() -> bool:
    """Whether the dev server should use the vercel-queue callback adapter.

    Set by the builder's dev server for projects on the vercel-queue SDK
    generation instead of the legacy vercel-workers bootstrap.
    """
    value = os.environ.get("VERCEL_DEV_QUEUE_SERVING") or ""
    return value.strip().lower() in {"1", "true"}


def install_queue_integrations(*, queue_serving: bool) -> None:
    """Activate the queue adapter integrations required by the project.

    VERCEL_QUEUE_INTEGRATIONS carries "module:installer" or
    "module:installer:serving_activator" entries (comma separated), set by
    the builder from the project's declared dependencies. Because the
    project demonstrably depends on the adapter's upstream package, any
    activation failure is a hard error. Installers may hook future framework
    objects or retroactively register objects created before activation.

    With ``queue_serving=False`` only publish capability is activated
    (transport registration and broker defaults): consuming-side queue
    registration in a non-worker function would also start the adapter's
    embedded worker and wedge the runtime. With ``queue_serving=True``
    the optional serving activator runs after the installer to activate
    consumption (register push callbacks, start the embedded worker) for
    adapters whose installer does not do so itself."""
    spec = (os.environ.get("VERCEL_QUEUE_INTEGRATIONS") or "").strip()
    if not spec:
        return
    import inspect  # noqa: PLC0415

    for entry in spec.split(","):
        module_name, _, rest = entry.strip().partition(":")
        installer_name, _, activator_name = rest.partition(":")
        if not module_name or not installer_name:
            raise RuntimeError(
                f'Invalid VERCEL_QUEUE_INTEGRATIONS entry "{entry}": '
                'expected "module:installer[:serving_activator]"'
            )
        try:
            module = __import__(module_name, fromlist=[installer_name])
            installer = getattr(module, installer_name)
            kwargs: dict[str, Any] = {}
            if not queue_serving:
                try:
                    supports_queue_registration = (
                        "register_queues"
                        in inspect.signature(installer).parameters
                    )
                except (TypeError, ValueError):
                    supports_queue_registration = False
                if supports_queue_registration:
                    kwargs["register_queues"] = False
            installer(**kwargs)
            if queue_serving and activator_name:
                activator = getattr(module, activator_name)
                activator()
        except Exception as exc:
            raise RuntimeError(
                f"Failed to activate the {module_name} integration "
                "required by this project's dependencies"
            ) from exc


class _QueueCallbackApp:
    """Platform-owned ASGI adapter for vercel-queue push callbacks."""

    def __init__(
        self,
        *,
        accept_and_handle: _AcceptAndHandle,
        headers_from_scope: _HeadersFromScope,
        headers_context: _HeadersContext,
        bad_request_exceptions: tuple[type[BaseException], ...],
    ) -> None:
        self._accept_and_handle = accept_and_handle
        self._headers_from_scope = headers_from_scope
        self._headers_context = headers_context
        self._bad_request_exceptions = bad_request_exceptions

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: _ASGIReceive,
        send: _ASGISend,
    ) -> None:
        scope_type = scope.get("type")
        if scope_type == "lifespan":
            await self._handle_lifespan(receive, send)
            return
        if scope_type != "http":
            raise RuntimeError(
                f"Unsupported queue callback ASGI scope type: {scope_type!r}"
            )
        if scope.get("method") != "POST":
            await _send_queue_callback_status(send, 405)
            return

        headers = self._headers_from_scope(scope)
        try:
            with self._headers_context(headers):
                await self._accept_and_handle(
                    _queue_callback_body(receive), headers
                )
        except self._bad_request_exceptions as exc:
            _queue_log.warning("Vercel Queue push callback rejected: %s", exc)
            await _send_queue_callback_status(send, 400)
        except Exception:
            _queue_log.exception("Vercel Queue push callback failed")
            await _send_queue_callback_status(send, 500)
        else:
            await _send_queue_callback_status(send, 204)

    @staticmethod
    async def _handle_lifespan(
        receive: _ASGIReceive,
        send: _ASGISend,
    ) -> None:
        while True:
            message = await receive()
            message_type = message.get("type")
            if message_type == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message_type == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return


async def _queue_callback_body(receive: _ASGIReceive) -> AsyncIterator[bytes]:
    while True:
        message = await receive()
        message_type = message.get("type")
        if message_type == "http.disconnect":
            raise ValueError("request body disconnected before completion")
        if message_type != "http.request":
            raise ValueError(f"unexpected ASGI message: {message_type!r}")
        body = cast("bytes", message.get("body", b""))
        if body:
            yield body
        if not message.get("more_body", False):
            return


async def _send_queue_callback_status(
    send: _ASGISend,
    status: int,
) -> None:
    headers = [(b"allow", b"POST")] if status == 405 else []
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": headers,
        }
    )
    await send({"type": "http.response.body", "body": b""})


def create_queue_service_app() -> object:
    """Create the platform callback adapter for registered subscriptions."""
    try:
        headers_module = cast("Any", import_module("vercel.headers"))
        queue_module = cast("Any", import_module("vercel.queue"))
        headers_context_type = headers_module.HeadersContext
        headers_from_asgi_scope = headers_module.headers_from_asgi_scope
        protocol_error = queue_module.ProtocolError
        accept_and_handle = queue_module.accept_and_handle
    except ImportError as exc:
        raise RuntimeError(
            "Unable to create queue service because "
            '"vercel-queue" is missing. Install "vercel-queue" '
            "to serve queue subscribers."
        ) from exc

    def use_headers(
        headers: Mapping[str, str],
    ) -> AbstractContextManager[None]:
        context = headers_context_type(headers).use()
        return cast("AbstractContextManager[None]", context)

    return _QueueCallbackApp(
        accept_and_handle=cast("_AcceptAndHandle", accept_and_handle),
        headers_from_scope=cast("_HeadersFromScope", headers_from_asgi_scope),
        headers_context=use_headers,
        bad_request_exceptions=(protocol_error, TypeError, ValueError),
    )


def bootstrap_queue_service_app() -> object:
    """Activate integrations and serve already-registered subscriptions."""
    install_queue_integrations(queue_serving=True)
    return create_queue_service_app()


def _load_workers_runtime() -> Any | None:
    with contextlib.suppress(ImportError):
        import vercel.workers._runtime as workers_runtime  # type: ignore[import-not-found]  # noqa: PLC0415, PLC2701  # pyright: ignore[reportMissingImports]

        return workers_runtime
    return None


def prepare_worker_environment() -> None:
    workers_runtime = _load_workers_runtime()
    if workers_runtime is None:
        return
    workers_runtime.prepare_environment(os.environ)


def maybe_bootstrap_worker_service_app(module: object) -> object | None:
    workers_runtime = _load_workers_runtime()
    if workers_runtime is None:
        raise RuntimeError(
            "Unable to bootstrap worker service because "
            '"vercel-workers" is missing. Install '
            '"vercel-workers" and configure an explicit worker integration.'
        )
    return cast(
        "object | None",
        workers_runtime.maybe_bootstrap_worker_service_app(module),
    )
