from __future__ import annotations

import contextlib
import os
from importlib.util import find_spec


def _has_module(module_name: str) -> bool:
    try:
        return find_spec(module_name) is not None
    except ModuleNotFoundError:
        return False


CELERY_AVAILABLE = _has_module('celery')
DRAMATIQ_AVAILABLE = _has_module('dramatiq')
VERCEL_WORKERS_AVAILABLE = _has_module('vercel.workers')


def is_worker_service() -> bool:
    return (os.environ.get('VERCEL_SERVICE_TYPE') or '').strip().lower() == 'worker'


def is_celery_app(candidate: object) -> bool:
    if candidate is None:
        return False
    module_name = getattr(candidate.__class__, '__module__', '')
    if isinstance(module_name, str) and module_name.startswith('celery'):
        return True
    return (
        hasattr(candidate, 'conf')
        and callable(getattr(candidate, 'send_task', None))
        and callable(getattr(candidate, 'task', None))
    )


def _find_celery_app(module: object):
    candidates = [
        getattr(module, 'app', None),
        getattr(module, 'celery_app', None),
        getattr(module, 'worker_app', None),
        getattr(module, 'worker', None),
        getattr(module, 'celery', None),
    ]
    for candidate in candidates:
        if is_celery_app(candidate):
            return candidate
    return None


def _bootstrap_dramatiq_worker_app(module: object):
    if not DRAMATIQ_AVAILABLE:
        return None

    try:
        import dramatiq as dramatiq_mod  # type: ignore[import-untyped]
        from vercel.workers import dramatiq as vercel_dramatiq  # type: ignore[import-not-found]
    except Exception as exc:
        if not VERCEL_WORKERS_AVAILABLE:
            raise RuntimeError(
                'Dramatiq worker service detected, but "vercel-workers" is not installed. '
                'Install "vercel-workers==0.0.10" and configure '
                '"from vercel.workers.dramatiq import VercelQueuesBroker".'
            ) from exc
        raise RuntimeError('Failed to import Dramatiq worker adapter from vercel-workers.') from exc

    broker_candidates = []
    module_broker = getattr(module, 'broker', None)
    if module_broker is not None:
        broker_candidates.append(module_broker)
    with contextlib.suppress(Exception):
        broker_candidates.append(dramatiq_mod.get_broker())

    resolved_broker = None
    for broker in broker_candidates:
        if isinstance(broker, vercel_dramatiq.VercelQueuesBroker):
            resolved_broker = broker
            break

    if resolved_broker is None:
        # No auto-patching: only bootstrap when user explicitly configured
        # the vercel-workers broker.
        return None

    # Fail fast with an explicit message so users know they must import tasks from entrypoint.
    actors = getattr(resolved_broker, 'actors', None)
    if not isinstance(actors, dict) or len(actors) == 0:
        raise RuntimeError(
            'Worker service did not register any Dramatiq actors. '
            'Ensure your worker entrypoint imports task modules before startup.'
        )

    return vercel_dramatiq.get_asgi_app(resolved_broker)


def _bootstrap_celery_worker_app(module: object):
    if not CELERY_AVAILABLE:
        return None

    celery_app = _find_celery_app(module)
    if celery_app is None:
        return None

    get_asgi_app = getattr(celery_app, 'get_asgi_app', None)
    if callable(get_asgi_app):
        with contextlib.suppress(Exception):
            wrapped_app = get_asgi_app()
            if wrapped_app is not None:
                return wrapped_app

    try:
        from vercel.workers import celery as vercel_celery  # type: ignore[import-not-found]
    except Exception as exc:
        if not VERCEL_WORKERS_AVAILABLE:
            raise RuntimeError(
                'Celery worker service detected, but "vercel-workers" is not installed. '
                'Install "vercel-workers==0.0.10" and use '
                '"from vercel.workers.celery import Celery", or expose '
                '"app = vercel.workers.celery.get_asgi_app(celery_app)".'
            ) from exc
        raise RuntimeError('Failed to import Celery worker adapter from vercel-workers.') from exc

    return vercel_celery.get_asgi_app(celery_app)


def _bootstrap_generic_worker_app():
    if not VERCEL_WORKERS_AVAILABLE:
        return None

    try:
        import vercel.workers as vercel_workers  # type: ignore[import-not-found]
    except Exception:
        return None

    with contextlib.suppress(Exception):
        if not vercel_workers.has_subscriptions():
            return None

        return vercel_workers.get_asgi_app()

    return None

def bootstrap_worker_service_app(module: object):
    if _find_celery_app(module) is not None:
        try:
            app = _bootstrap_celery_worker_app(module)
            if app is not None:
                return app
        except Exception as exc:
            raise RuntimeError('Celery worker bootstrap failed.') from exc

    if DRAMATIQ_AVAILABLE:
        try:
            app = _bootstrap_dramatiq_worker_app(module)
            if app is not None:
                return app
        except Exception as exc:
            raise RuntimeError('Dramatiq worker bootstrap failed.') from exc

    app = _bootstrap_generic_worker_app()
    if app is not None:
        return app

    if not VERCEL_WORKERS_AVAILABLE:
        raise RuntimeError(
            'Unable to bootstrap worker service because "vercel-workers" is missing. '
            'Install "vercel-workers==0.0.10" and configure an explicit worker integration.'
        )

    raise RuntimeError(
        'Unable to bootstrap worker service. '
        'Export an ASGI/WSGI "app", or configure Celery/Dramatiq via "vercel-workers".'
    )
