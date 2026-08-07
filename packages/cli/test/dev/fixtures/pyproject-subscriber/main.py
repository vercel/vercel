from fastapi import FastAPI

from worker_a import (  # pyright: ignore[reportImplicitRelativeImport]
    QUEUE_NAME as HIGH_QUEUE,
    process_job as process_high,
)
from worker_b import (  # pyright: ignore[reportImplicitRelativeImport]
    QUEUE_NAME as LOW_QUEUE,
    process_job as process_low,
)


app = FastAPI()


@app.post("/enqueue")
def enqueue():
    process_high.apply_async(args=("dev-celery-high", 19, 23), queue=HIGH_QUEUE)
    process_low.apply_async(args=("dev-celery-low", 20, 22), queue=LOW_QUEUE)
    return {"enqueued": True}
