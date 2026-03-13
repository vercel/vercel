from django.http import HttpResponse, JsonResponse
from django.urls import path


def root(request):
    return HttpResponse(
        "<!doctype html><html><body>"
        "<h1>Hello from Django web service</h1>"
        "</body></html>"
    )


def health(request):
    return JsonResponse({"status": "ok"})


def enqueue(request):
    from worker.tasks import process_job

    try:
        result = process_job.enqueue()
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)

    return JsonResponse({"ok": True, "taskId": str(result.id)})


def handler404(request, exception):
    return JsonResponse({"detail": "404 from Django web service"}, status=404)


urlpatterns = [
    path("", root),
    path("health", health),
    path("enqueue", enqueue),
]
