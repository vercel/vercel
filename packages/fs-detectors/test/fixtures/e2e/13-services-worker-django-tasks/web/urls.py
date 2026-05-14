import json
import time
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from django.http import HttpResponse, JsonResponse
from django.urls import path
from vercel.cache import get_cache

from worker.tasks import process_job


def root(request):
    return HttpResponse(
        "<!doctype html><html><body>"
        "<h1>Hello from Django web service</h1>"
        "</body></html>"
    )


def health(request):
    return JsonResponse({"status": "ok"})


def enqueue(request):
    body = {}
    if request.body:
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            body = {}

    incoming_request_id = body.get("request_id") if isinstance(body, dict) else None
    request_id = str(incoming_request_id) if incoming_request_id else str(uuid4())

    try:
        result = process_job.enqueue(
            request_id=request_id,
            enqueued_at=datetime.now(UTC),
            priority=Decimal("1.5"),
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)

    return JsonResponse(
        {"ok": True, "taskId": str(result.id), "requestId": request_id}
    )


def status(request, topic: str, request_id: str):
    cache = get_cache(namespace=topic)
    deadline = time.time() + 30
    while time.time() < deadline:
        result = cache.get(request_id)
        if result is not None:
            return JsonResponse(
                {"ok": True, "processed": True, "result": result}
            )
        time.sleep(0.5)
    return JsonResponse(
        {"ok": False, "processed": False, "error": "timeout"},
        status=504,
    )


def handler404(request, exception):
    return JsonResponse({"detail": "404 from Django web service"}, status=404)


urlpatterns = [
    path("", root),
    path("health", health),
    path("enqueue", enqueue),
    path("status/<str:topic>/<str:request_id>", status),
]
