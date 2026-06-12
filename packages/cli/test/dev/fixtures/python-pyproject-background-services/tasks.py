import json
import os

from celery import Celery

RESULT_DIR = os.path.join(os.path.dirname(__file__), ".results")

app = Celery(
    "pyproject-background-services",
    broker=os.getenv("CELERY_BROKER_URL", "vercel://"),
)
app.conf.task_default_queue = "celery"


@app.task(bind=True, name="tasks.add")
def add(self, x: int, y: int) -> int:
    result = x + y
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "celery_result.json"), "w") as f:
        json.dump(
            {
                "executed": True,
                "taskId": self.request.id,
                "result": result,
            },
            f,
        )
    return result
