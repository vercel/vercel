from __future__ import annotations

import contextlib
from collections.abc import MutableMapping
from importlib.util import find_spec
from typing import TYPE_CHECKING, TypeGuard

from .client import (
    get_asgi_app as get_generic_asgi_app,
    has_subscriptions,
)

if TYPE_CHECKING:
    from celery import Celery as CeleryAppType  # type: ignore[import-untyped]

    from .dramatiq import VercelQueuesBroker as DramatiqBrokerType


def _has_module(module_name: str) -> bool:
    try:
        return find_spec(module_name) is not None
    except ModuleNotFoundError:
        return False


CELERY_AVAILABLE = _has_module("celery")
DRAMATIQ_AVAILABLE = _has_module("dramatiq")
DJANGO_TASKS_AVAILABLE = _has_module("django.tasks")


def _truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _uses_vercel_celery_broker(broker_url: str | None) -> bool:
    if broker_url is None:
        return False
    return broker_url.strip().lower().startswith("vercel://")


def _install_celery_transport_alias() -> None:
    if not CELERY_AVAILABLE:
        return

    from .celery.transport import install_kombu_transport_alias

    install_kombu_transport_alias("vercel")


def prepare_environment(environ: MutableMapping[str, str]) -> None:
    has_worker_services = _truthy(environ.get("VERCEL_HAS_WORKER_SERVICES"))
    if has_worker_services and "CELERY_BROKER_URL" not in environ:
        environ["CELERY_BROKER_URL"] = "vercel://"

    broker_url = environ.get("CELERY_BROKER_URL")
    if not has_worker_services and not _uses_vercel_celery_broker(broker_url):
        return

    _install_celery_transport_alias()


def is_celery_app(candidate: object) -> TypeGuard[CeleryAppType]:
    if not CELERY_AVAILABLE:
        return False

    from celery import Celery as CeleryApp  # type: ignore[import-untyped]

    return isinstance(candidate, CeleryApp)


def is_vercel_dramatiq_broker(
    candidate: object,
) -> TypeGuard[DramatiqBrokerType]:
    if not DRAMATIQ_AVAILABLE:
        return False

    from .dramatiq import VercelQueuesBroker

    return isinstance(candidate, VercelQueuesBroker)


def _find_celery_app(module: object) -> CeleryAppType | None:
    candidates = [
        getattr(module, "app", None),
        getattr(module, "worker", None),
        getattr(module, "celery", None),
    ]
    for candidate in candidates:
        if is_celery_app(candidate):
            return candidate
    return None


def _bootstrap_celery_worker_app(module: object) -> object | None:
    if not CELERY_AVAILABLE:
        return None

    celery_app = _find_celery_app(module)
    if celery_app is None:
        return None

    from .celery import get_asgi_app

    return get_asgi_app(celery_app)


def _bootstrap_dramatiq_worker_app(module: object) -> object | None:
    if not DRAMATIQ_AVAILABLE:
        return None

    import dramatiq

    from .dramatiq import get_asgi_app

    broker_candidates: list[object] = []
    module_broker = getattr(module, "broker", None)
    if module_broker is not None:
        broker_candidates.append(module_broker)

    with contextlib.suppress(Exception):
        broker_candidates.append(dramatiq.get_broker())

    resolved_broker: DramatiqBrokerType | None = None
    for broker in broker_candidates:
        if is_vercel_dramatiq_broker(broker):
            resolved_broker = broker
            break

    if resolved_broker is None:
        return None

    if not resolved_broker.get_declared_actors():
        raise RuntimeError(
            "Worker service did not register any Dramatiq actors. "
            "Ensure your worker entrypoint imports task modules before startup."
        )

    return get_asgi_app(resolved_broker)


def _bootstrap_django_worker_app() -> object | None:
    if not DJANGO_TASKS_AVAILABLE:
        return None

    from .django import get_asgi_app

    return get_asgi_app()


def _bootstrap_generic_worker_app() -> object | None:
    if not has_subscriptions():
        return None
    return get_generic_asgi_app()


def _resolve_worker_service_app(module: object) -> object | None:
    bootstrappers = (
        ("Celery", lambda: _bootstrap_celery_worker_app(module)),
        ("Dramatiq", lambda: _bootstrap_dramatiq_worker_app(module)),
        ("Django tasks", _bootstrap_django_worker_app),
    )

    for label, bootstrap in bootstrappers:
        try:
            app = bootstrap()
        except Exception as exc:
            raise RuntimeError(f"{label} worker bootstrap failed.") from exc
        if app is not None:
            return app

    return _bootstrap_generic_worker_app()


def maybe_bootstrap_worker_service_app(module: object) -> object | None:
    exported_names = dir(module)
    app = _resolve_worker_service_app(module)
    if app is not None:
        return app

    if "app" in exported_names:
        return None

    raise RuntimeError(
        "Unable to bootstrap worker service. "
        "Export an ASGI/WSGI app, or configure "
        "Celery/Dramatiq/Django via vercel-workers."
    )
