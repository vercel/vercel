from __future__ import annotations

import contextlib
import os
from collections.abc import Mapping
from importlib import import_module
from importlib.util import find_spec
from typing import Callable, cast


def _has_module(module_name: str) -> bool:
    try:
        return find_spec(module_name) is not None
    except ModuleNotFoundError:
        return False


def _import_optional_module(module_name: str) -> object | None:
    with contextlib.suppress(Exception):
        return import_module(module_name)
    return None


CELERY_AVAILABLE = _has_module("celery")
DRAMATIQ_AVAILABLE = _has_module("dramatiq")
VERCEL_WORKERS_AVAILABLE = _has_module("vercel.workers")


def is_worker_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    return svc_type.strip().lower() == "worker"


def is_celery_app(candidate: object) -> bool:
    if candidate is None:
        return False
    module_name = getattr(candidate.__class__, "__module__", "")
    if isinstance(module_name, str) and module_name.startswith("celery"):
        return True
    return (
        hasattr(candidate, "conf")
        and callable(getattr(candidate, "send_task", None))
        and callable(getattr(candidate, "task", None))
    )


def _find_celery_app(module: object) -> object | None:
    candidates = [
        getattr(module, "app", None),
        getattr(module, "celery_app", None),
        getattr(module, "worker_app", None),
        getattr(module, "worker", None),
        getattr(module, "celery", None),
    ]
    for candidate in candidates:
        if is_celery_app(candidate):
            return candidate
    return None


def _bootstrap_dramatiq_worker_app(module: object) -> object | None:
    if not DRAMATIQ_AVAILABLE:
        return None

    dramatiq_mod = _import_optional_module("dramatiq")
    vercel_dramatiq = _import_optional_module("vercel.workers.dramatiq")
    if dramatiq_mod is None or vercel_dramatiq is None:
        if not VERCEL_WORKERS_AVAILABLE:
            raise RuntimeError(
                "Dramatiq worker service detected, but "
                '"vercel-workers" is not installed. '
                'Install "vercel-workers==0.0.10" and '
                "configure "
                '"from vercel.workers.dramatiq import '
                'VercelQueuesBroker".'
            )
        raise RuntimeError(
            "Failed to import Dramatiq worker adapter from vercel-workers."
        )

    broker_candidates: list[object] = []
    module_broker = getattr(module, "broker", None)
    if module_broker is not None:
        broker_candidates.append(module_broker)
    get_broker = getattr(dramatiq_mod, "get_broker", None)
    if callable(get_broker):
        with contextlib.suppress(Exception):
            get_broker_fn = cast(Callable[[], object], get_broker)
            broker_candidates.append(get_broker_fn())

    resolved_broker: object | None = None
    broker_type = getattr(vercel_dramatiq, "VercelQueuesBroker", None)
    if isinstance(broker_type, type):
        for broker in broker_candidates:
            if isinstance(broker, broker_type):
                resolved_broker = broker
                break

    if resolved_broker is None:
        return None

    # Users must import task modules from the entrypoint.
    actors = getattr(resolved_broker, "actors", None)
    actors_mapping: Mapping[object, object] | None = None
    if isinstance(actors, dict):
        actors_mapping = cast(Mapping[object, object], actors)
    if actors_mapping is None or len(actors_mapping) == 0:
        raise RuntimeError(
            "Worker service did not register any Dramatiq "
            "actors. Ensure your worker entrypoint imports "
            "task modules before startup."
        )

    get_asgi_app = getattr(vercel_dramatiq, "get_asgi_app", None)
    if not callable(get_asgi_app):
        raise RuntimeError(
            "Failed to resolve Dramatiq ASGI adapter from vercel-workers."
        )
    get_asgi_app_fn = cast(Callable[[object], object], get_asgi_app)
    return get_asgi_app_fn(resolved_broker)


def _bootstrap_celery_worker_app(module: object) -> object | None:
    if not CELERY_AVAILABLE:
        return None

    celery_app = _find_celery_app(module)
    if celery_app is None:
        return None

    get_asgi_app = getattr(celery_app, "get_asgi_app", None)
    if callable(get_asgi_app):
        with contextlib.suppress(Exception):
            get_asgi_app_fn = cast(Callable[[], object], get_asgi_app)
            wrapped_app = get_asgi_app_fn()
            if wrapped_app is not None:
                return wrapped_app

    vercel_celery = _import_optional_module("vercel.workers.celery")
    if vercel_celery is None:
        if not VERCEL_WORKERS_AVAILABLE:
            raise RuntimeError(
                "Celery worker service detected, but "
                '"vercel-workers" is not installed. '
                'Install "vercel-workers==0.0.10" and use '
                '"from vercel.workers.celery import Celery"'
                ", or expose "
                '"app = vercel.workers.celery'
                '.get_asgi_app(celery_app)".'
            )
        raise RuntimeError(
            "Failed to import Celery worker adapter from vercel-workers."
        )

    get_adapter_app = getattr(vercel_celery, "get_asgi_app", None)
    if not callable(get_adapter_app):
        raise RuntimeError(
            "Failed to resolve Celery ASGI adapter from vercel-workers."
        )
    get_adapter_app_fn = cast(Callable[[object], object], get_adapter_app)
    return get_adapter_app_fn(celery_app)


def _bootstrap_generic_worker_app() -> object | None:
    if not VERCEL_WORKERS_AVAILABLE:
        return None

    vercel_workers = _import_optional_module("vercel.workers")
    if vercel_workers is None:
        return None

    has_subscriptions = getattr(vercel_workers, "has_subscriptions", None)
    get_asgi_app = getattr(vercel_workers, "get_asgi_app", None)
    if not callable(has_subscriptions) or not callable(get_asgi_app):
        return None

    with contextlib.suppress(Exception):
        has_subscriptions_fn = cast(Callable[[], bool], has_subscriptions)
        if not has_subscriptions_fn():
            return None

        get_asgi_app_fn = cast(Callable[[], object], get_asgi_app)
        return get_asgi_app_fn()

    return None


def bootstrap_worker_service_app(module: object) -> object:
    if _find_celery_app(module) is not None:
        try:
            app = _bootstrap_celery_worker_app(module)
            if app is not None:
                return app
        except Exception as exc:
            raise RuntimeError("Celery worker bootstrap failed.") from exc

    if DRAMATIQ_AVAILABLE:
        try:
            app = _bootstrap_dramatiq_worker_app(module)
            if app is not None:
                return app
        except Exception as exc:
            raise RuntimeError("Dramatiq worker bootstrap failed.") from exc

    app = _bootstrap_generic_worker_app()
    if app is not None:
        return app

    if not VERCEL_WORKERS_AVAILABLE:
        raise RuntimeError(
            "Unable to bootstrap worker service because "
            '"vercel-workers" is missing. Install '
            '"vercel-workers==0.0.10" and configure an '
            "explicit worker integration."
        )

    raise RuntimeError(
        "Unable to bootstrap worker service. "
        "Export an ASGI/WSGI app, or configure "
        "Celery/Dramatiq via vercel-workers."
    )
