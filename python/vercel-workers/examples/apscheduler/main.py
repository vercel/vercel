from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from tasks import SCHEDULER_ID, WAKEUP_TOPIC, scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cold starts may call this more than once over time; seeding remains safe because
    # wakeup publication uses deterministic idempotency keys for each logical run time.
    scheduler.start()
    yield
    scheduler.shutdown(wait=True)

app = FastAPI(
    title="APScheduler on Vercel Queues (example)",
    description=(
        "Code-defined APScheduler jobs that wake up via Vercel Queues using "
        "vercel-workers."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/")
def root():
    return {
        "message": (
            "The scheduler is bootstrapped during app startup. Each wakeup publishes "
            "the next one onto Vercel Queues."
        ),
        "schedulerId": SCHEDULER_ID,
        "wakeupTopic": WAKEUP_TOPIC,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "nextRunTime": (
                    job.next_run_time.isoformat() if job.next_run_time is not None else None
                ),
            }
            for job in scheduler.get_jobs()
        ],
    }
