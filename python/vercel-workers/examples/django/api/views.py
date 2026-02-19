from django.http import HttpRequest, HttpResponse, JsonResponse
from django.tasks import default_task_backend
from django.tasks.exceptions import TaskResultDoesNotExist

from .tasks import add, add_with_context, multiply


def home(request: HttpRequest) -> HttpResponse:
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Django Tasks</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, sans-serif; background: #111; color: #eee; min-height: 100vh; padding: 2rem; }
            h1 { font-size: 1.5rem; margin-bottom: 2rem; font-weight: 400; }
            .forms { display: flex; gap: 2rem; flex-wrap: wrap; }
            form { background: #1a1a1a; padding: 1.5rem; border-radius: 8px; min-width: 280px; }
            form h2 { font-size: 1rem; margin-bottom: 1rem; color: #888; font-weight: 500; }
            label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #666; }
            input { width: 100%; padding: 0.5rem; margin-bottom: 1rem; background: #222; border: 1px solid #333; border-radius: 4px; color: #eee; font-size: 1rem; }
            input:focus { outline: none; border-color: #555; }
            button { width: 100%; padding: 0.75rem; background: #333; border: none; border-radius: 4px; color: #eee; font-size: 0.875rem; cursor: pointer; }
            button:hover { background: #444; }
        </style>
    </head>
    <body>
        <h1>Django Tasks</h1>
        <div class="forms">
            <form action="/api/tasks/add" method="get">
                <h2>Add</h2>
                <label for="add-x">x</label>
                <input type="number" id="add-x" name="x" value="5">
                <label for="add-y">y</label>
                <input type="number" id="add-y" name="y" value="3">
                <button type="submit">Enqueue</button>
            </form>
            <form action="/api/tasks/multiply" method="get">
                <h2>Multiply</h2>
                <label for="mul-x">x</label>
                <input type="number" id="mul-x" name="x" value="4">
                <label for="mul-y">y</label>
                <input type="number" id="mul-y" name="y" value="7">
                <button type="submit">Enqueue</button>
            </form>
        </div>
    </body>
    </html>
    """
    return HttpResponse(html)


def get_sample_data(request: HttpRequest) -> JsonResponse:
    data = {
        "data": [
            {"id": 1, "name": "Sample Item 1", "value": 100},
            {"id": 2, "name": "Sample Item 2", "value": 200},
            {"id": 3, "name": "Sample Item 3", "value": 300},
        ],
        "total": 3,
        "timestamp": "2024-01-01T00:00:00Z",
    }
    return JsonResponse(data)


def get_item(request: HttpRequest, item_id: int) -> JsonResponse:
    item = {
        "id": item_id,
        "name": f"Sample Item {item_id}",
        "value": item_id * 100,
    }
    data = {
        "item": item,
        "timestamp": "2024-01-01T00:00:00Z",
    }
    return JsonResponse(data)


def enqueue_add(request: HttpRequest) -> JsonResponse:
    """
    Enqueue an add task.

    Example: GET /api/tasks/add?x=5&y=3
    """
    x = int(request.GET.get("x", 1))
    y = int(request.GET.get("y", 2))

    # Enqueue the task - it will be executed by a worker
    result = add.enqueue(x, y)

    return JsonResponse(
        {
            "status": "enqueued",
            "task_id": result.id,
            "task": "add",
            "args": {"x": x, "y": y},
        }
    )


def enqueue_multiply(request: HttpRequest) -> JsonResponse:
    """
    Enqueue a multiply task.

    Example: GET /api/tasks/multiply?x=4&y=7
    """
    x = int(request.GET.get("x", 4))
    y = int(request.GET.get("y", 7))

    result = multiply.enqueue(x, y)

    return JsonResponse(
        {
            "status": "enqueued",
            "task_id": result.id,
            "task": "multiply",
            "args": {"x": x, "y": y},
        }
    )


def enqueue_add_with_context(request: HttpRequest) -> JsonResponse:
    """
    Enqueue an add_with_context task.

    Example: GET /api/tasks/add-context?x=10&y=20
    """
    x = int(request.GET.get("x", 10))
    y = int(request.GET.get("y", 20))

    result = add_with_context.enqueue(x, y)

    return JsonResponse(
        {
            "status": "enqueued",
            "task_id": result.id,
            "task": "add_with_context",
            "args": {"x": x, "y": y},
        }
    )


def get_task_result(request: HttpRequest, task_id: str) -> JsonResponse:
    """
    Get the result of a task by ID.

    Example: GET /api/tasks/result/<task_id>
    """

    try:
        result = default_task_backend.get_result(task_id)
    except TaskResultDoesNotExist:
        return JsonResponse({"error": "Task not found"}, status=404)

    response_data = {
        "task_id": result.id,
        "status": str(result.status),
        "task": result.task.module_path,
        "enqueued_at": result.enqueued_at.isoformat() if result.enqueued_at else None,
        "started_at": result.started_at.isoformat() if result.started_at else None,
        "finished_at": result.finished_at.isoformat() if result.finished_at else None,
    }

    # Include return value if task completed successfully
    if str(result.status) == "SUCCESSFUL":
        response_data["return_value"] = result.return_value

    # Include errors if task failed
    if result.errors:
        response_data["errors"] = [
            {
                "exception_class": e.exception_class_path,
                "traceback": e.traceback,
            }
            for e in result.errors
        ]

    return JsonResponse(response_data)
