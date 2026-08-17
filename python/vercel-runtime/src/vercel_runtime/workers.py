from __future__ import annotations

import contextlib
import os
from typing import Any, cast


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
    """Whether the dev server should serve this worker through
    ``vercel.queue.asgi_app()`` instead of the legacy vercel-workers
    bootstrap. Set by the builder's dev server for projects on the
    vercel-queue SDK generation."""
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


def bootstrap_queue_service_app() -> object:
    """Serve the queue subscriptions registered by the already-imported
    worker module through the vercel-queue SDK's ASGI app."""
    try:
        import vercel.queue  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
    except ImportError as exc:
        raise RuntimeError(
            "Unable to bootstrap queue service because "
            '"vercel-queue" is missing. Install "vercel-queue" '
            "to serve queue subscribers."
        ) from exc
    install_queue_integrations(queue_serving=True)
    return cast(
        "object",
        vercel.queue.asgi_app(),  # pyright: ignore[reportUnknownMemberType]
    )


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
