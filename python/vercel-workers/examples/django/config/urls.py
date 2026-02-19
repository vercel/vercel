from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt

from vercel.workers.django import get_wsgi_app

# WSGI callback app for Vercel Queues to trigger task execution.
# Configure your queue trigger to POST to /api/queue/callback
queue_callback_app = get_wsgi_app()


@csrf_exempt
def queue_callback_view(request):
    """
    Django view wrapper for the Vercel Queues callback WSGI app.

    This is called by Vercel Queues when a task is ready to be executed.
    The @csrf_exempt decorator is required because Vercel Queues POSTs
    CloudEvents without CSRF tokens.
    """
    # Build a minimal WSGI environ from the Django request
    environ = request.META.copy()

    # Capture the response
    status_code = 500
    response_headers = []
    response_body = []

    def start_response(status, headers, exc_info=None):
        nonlocal status_code, response_headers
        status_code = int(status.split(" ", 1)[0])
        response_headers = headers

    # Call the WSGI app
    result = queue_callback_app(environ, start_response)
    for chunk in result:
        response_body.append(chunk)

    # Build Django response
    body = b"".join(response_body)
    response = HttpResponse(body, status=status_code)
    for header, value in response_headers:
        response[header] = value

    return response


urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("api.urls")),
    # Queue callback endpoint - Vercel Queues POSTs CloudEvents here
    path("api/queue/callback", queue_callback_view, name="queue-callback"),
]
